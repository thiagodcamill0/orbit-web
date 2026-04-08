-- supabase/migrations/20260407000003_boards_agents.sql
-- Domain 3: Boards + Agents
-- Depends on: 000001 (workspaces, is_workspace_member)
--             000002 (ai_integrations — adds UNIQUE constraint in preamble)

-- ============================================================
-- PREAMBLE: ai_integrations — composite unique for cross-workspace validation
-- ============================================================

ALTER TABLE ai_integrations
  ADD CONSTRAINT ai_integrations_workspace_id_id UNIQUE (workspace_id, id);

-- ============================================================
-- SHARED TRIGGER FUNCTION: prevent_workspace_id_change
-- ============================================================
-- Defined here, before the first trigger that uses it.
-- Reused in migrations 4 and 5.

CREATE OR REPLACE FUNCTION prevent_workspace_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'workspace_id is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_workspace_id_change() IS
  'Generic trigger function: prevents workspace_id from being changed after insert. Applied to all workspace-scoped tables. Defined in migration 3; reused in migrations 4 and 5.';

-- Apply retroactively to ai_integrations
CREATE TRIGGER ai_integrations_immutable_workspace_id
  BEFORE UPDATE ON ai_integrations
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

-- ============================================================
-- TABLE: boards
-- ============================================================

CREATE TABLE boards (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT          NOT NULL DEFAULT 'New Board',
  color        TEXT          NOT NULL DEFAULT '#6366f1',
  x            NUMERIC       NOT NULL DEFAULT 0,
  y            NUMERIC       NOT NULL DEFAULT 0,
  width        NUMERIC       NOT NULL DEFAULT 400,
  height       NUMERIC       NOT NULL DEFAULT 300,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE boards IS 'Visual grouping containers on the canvas. Hard delete allowed — board_id on agents is ON DELETE SET NULL.';

CREATE TRIGGER boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLE: agents
-- ============================================================

CREATE TABLE agents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  board_id        UUID        REFERENCES boards(id) ON DELETE SET NULL,
  parent_agent_id UUID        REFERENCES agents(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL DEFAULT 'New Agent',
  description     TEXT,
  model_id        TEXT,
  system_prompt   TEXT,
  avatar_url      TEXT,
  x               NUMERIC     NOT NULL DEFAULT 0,
  y               NUMERIC     NOT NULL DEFAULT 0,
  metadata        JSONB,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE agents IS 'Agent definitions. Soft delete via deleted_at. parent_agent_id enables hierarchy; board_id places the agent on a canvas board.';
COMMENT ON COLUMN agents.model_id IS 'OpenRouter model identifier (e.g. openai/gpt-4o). NULL means no model configured yet.';

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- UNIQUE constraints for cross-workspace FK validation
-- ============================================================

ALTER TABLE boards ADD CONSTRAINT boards_workspace_id_id UNIQUE (workspace_id, id);
ALTER TABLE agents ADD CONSTRAINT agents_workspace_id_id UNIQUE (workspace_id, id);

-- ============================================================
-- TRIGGER: workspace_id immutability
-- ============================================================

CREATE TRIGGER boards_immutable_workspace_id
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

CREATE TRIGGER agents_immutable_workspace_id
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

-- ============================================================
-- TRIGGER: agents — validate board_id and parent_agent_id
--          belong to the same workspace
-- ============================================================

CREATE OR REPLACE FUNCTION validate_agent_workspace_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.board_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM boards
      WHERE id = NEW.board_id
        AND workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION 'agents.board_id does not belong to workspace %', NEW.workspace_id;
    END IF;
  END IF;

  IF NEW.parent_agent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM agents
      WHERE id = NEW.parent_agent_id
        AND workspace_id = NEW.workspace_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'agents.parent_agent_id does not belong to workspace % or parent agent is deleted', NEW.workspace_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_agent_workspace_refs() IS
  'On INSERT or UPDATE, validates that board_id and parent_agent_id belong to the same workspace as the agent. SECURITY DEFINER to bypass RLS.';

CREATE TRIGGER agents_validate_workspace_refs
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION validate_agent_workspace_refs();

-- ============================================================
-- TRIGGER: agents — prevent circular parent references
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_agent_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current UUID;
  v_depth   INT := 0;
  v_limit   CONSTANT INT := 100;
BEGIN
  IF NEW.parent_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_agent_id = NEW.id THEN
    RAISE EXCEPTION 'agent cannot be its own parent';
  END IF;

  v_current := NEW.parent_agent_id;

  LOOP
    EXIT WHEN v_current IS NULL;

    v_depth := v_depth + 1;
    IF v_depth > v_limit THEN
      RAISE EXCEPTION 'agent hierarchy depth limit (%) exceeded', v_limit;
    END IF;

    IF v_current = NEW.id THEN
      RAISE EXCEPTION 'circular reference detected in agent hierarchy';
    END IF;

    SELECT parent_agent_id INTO v_current
    FROM agents
    WHERE id = v_current;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_agent_cycle() IS
  'Prevents circular parent_agent_id references in agent hierarchy. Depth-limited to 100 levels.';

CREATE TRIGGER agents_no_cycle
  BEFORE INSERT OR UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_cycle();

-- ============================================================
-- RLS POLICIES — boards
-- ============================================================

CREATE POLICY boards_select_own
  ON boards FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY boards_insert_own
  ON boards FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY boards_update_own
  ON boards FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(workspace_id))
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY boards_delete_own
  ON boards FOR DELETE
  TO authenticated
  USING (is_workspace_member(workspace_id));

-- ============================================================
-- RLS POLICIES — agents
-- ============================================================

CREATE POLICY agents_select_own
  ON agents FOR SELECT
  TO authenticated
  USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );

CREATE POLICY agents_insert_own
  ON agents FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY agents_update_own
  ON agents FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(workspace_id) AND deleted_at IS NULL)
  WITH CHECK (is_workspace_member(workspace_id));

-- No DELETE policy: soft delete only via UPDATE (deleted_at)

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_boards_workspace_id    ON boards (workspace_id);
CREATE INDEX idx_agents_workspace_id    ON agents (workspace_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_agents_board_id        ON agents (board_id)        WHERE board_id IS NOT NULL;
CREATE INDEX idx_agents_parent_agent_id ON agents (parent_agent_id) WHERE parent_agent_id IS NOT NULL;
