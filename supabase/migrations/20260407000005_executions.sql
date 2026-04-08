-- supabase/migrations/20260407000005_executions.sql
-- Domain 5: Executions + Execution Steps
-- Depends on: 000001 (profiles, workspaces, workspace_members, is_workspace_member)
--             000003 (boards, agents)
--             000004 (conversations)
--             000002 (ai_integrations)

-- ============================================================
-- TABLE: executions
-- ============================================================

CREATE TABLE executions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID          NOT NULL REFERENCES workspaces(id)      ON DELETE CASCADE,
  conversation_id  UUID                   REFERENCES conversations(id)   ON DELETE RESTRICT,
  agent_id         UUID          NOT NULL REFERENCES agents(id)          ON DELETE RESTRICT,
  integration_id   UUID                   REFERENCES ai_integrations(id) ON DELETE RESTRICT,

  status           TEXT          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','running','completed','failed','cancelled')),

  input            JSONB,
  output           JSONB,
  error            TEXT,
  config_snapshot  JSONB,

  duration_ms      INTEGER       CHECK (duration_ms   >= 0),
  tokens_input     INTEGER       CHECK (tokens_input  >= 0),
  tokens_output    INTEGER       CHECK (tokens_output >= 0),
  cost_estimate    NUMERIC(12,6) CHECK (cost_estimate >= 0),

  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE executions IS 'Runs of an agent. Backend writes all fields; authenticated may only cancel (status → cancelled).';
COMMENT ON COLUMN executions.conversation_id IS 'NULL for autonomous executions (no chat session). Immutable after insert.';
COMMENT ON COLUMN executions.integration_id  IS 'NULL when no LLM integration is used or context is fully captured in config_snapshot. Immutable after insert.';
COMMENT ON COLUMN executions.config_snapshot IS 'Snapshot of agent config at execution time. Immutable after insert.';

CREATE TRIGGER executions_updated_at
  BEFORE UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLE: execution_steps
-- ============================================================

CREATE TABLE execution_steps (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID          NOT NULL REFERENCES workspaces(id)  ON DELETE CASCADE,
  execution_id  UUID          NOT NULL REFERENCES executions(id)  ON DELETE CASCADE,
  agent_id      UUID          NOT NULL REFERENCES agents(id)      ON DELETE RESTRICT,

  step_number   INTEGER       NOT NULL,
  type          TEXT          NOT NULL CHECK (type IN ('llm_call','sub_agent_call','tool_call')),

  status        TEXT          NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','running','completed','failed')),

  input         JSONB,
  output        JSONB,
  error         TEXT,

  duration_ms   INTEGER       CHECK (duration_ms   >= 0),
  tokens_input  INTEGER       CHECK (tokens_input  >= 0),
  tokens_output INTEGER       CHECK (tokens_output >= 0),
  cost_estimate NUMERIC(12,6) CHECK (cost_estimate >= 0),

  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (execution_id, step_number)
);

ALTER TABLE execution_steps ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE execution_steps IS 'Internal steps within an execution. Structural fields immutable after insert. Backend may update progress fields; authenticated cannot update at all.';

CREATE TRIGGER execution_steps_updated_at
  BEFORE UPDATE ON execution_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- UNIQUE constraints for cross-workspace FK validation
-- ============================================================

ALTER TABLE executions       ADD CONSTRAINT executions_workspace_id_id      UNIQUE (workspace_id, id);
ALTER TABLE execution_steps  ADD CONSTRAINT execution_steps_workspace_id_id UNIQUE (workspace_id, id);

-- ============================================================
-- TRIGGER: workspace_id immutability
-- ============================================================

CREATE TRIGGER executions_immutable_workspace_id
  BEFORE UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

CREATE TRIGGER execution_steps_immutable_workspace_id
  BEFORE UPDATE ON execution_steps
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

-- ============================================================
-- TRIGGER: executions — cross-workspace integrity on INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION validate_execution_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agents
    WHERE id = NEW.agent_id
      AND workspace_id = NEW.workspace_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'executions.agent_id does not belong to workspace % or agent is deleted', NEW.workspace_id;
  END IF;

  IF NEW.conversation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM conversations
      WHERE id = NEW.conversation_id
        AND workspace_id = NEW.workspace_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'executions.conversation_id does not belong to workspace % or conversation is deleted', NEW.workspace_id;
    END IF;
  END IF;

  IF NEW.integration_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ai_integrations
      WHERE id = NEW.integration_id
        AND workspace_id = NEW.workspace_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'executions.integration_id does not belong to workspace % or integration is deleted', NEW.workspace_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_execution_refs() IS
  'On INSERT, validates that agent_id (required), conversation_id (optional), and integration_id (optional) belong to the same workspace as the execution and are not soft-deleted. SECURITY DEFINER to bypass RLS.';

CREATE TRIGGER executions_validate_refs
  BEFORE INSERT ON executions
  FOR EACH ROW EXECUTE FUNCTION validate_execution_refs();

-- ============================================================
-- TRIGGER: executions — structural fields immutable after insert
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_execution_structural_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    RAISE EXCEPTION 'executions.conversation_id is immutable after insert';
  END IF;
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
    RAISE EXCEPTION 'executions.agent_id is immutable after insert';
  END IF;
  IF NEW.integration_id IS DISTINCT FROM OLD.integration_id THEN
    RAISE EXCEPTION 'executions.integration_id is immutable after insert';
  END IF;
  IF NEW.input IS DISTINCT FROM OLD.input THEN
    RAISE EXCEPTION 'executions.input is immutable after insert';
  END IF;
  IF NEW.config_snapshot IS DISTINCT FROM OLD.config_snapshot THEN
    RAISE EXCEPTION 'executions.config_snapshot is immutable after insert';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'executions.created_at is immutable';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_execution_structural_changes() IS
  'Blocks modification of FK fields, input, config_snapshot, and created_at on executions after insert. Applies to all roles. IS DISTINCT FROM handles NULL correctly.';

CREATE TRIGGER executions_immutable_fields
  BEFORE UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION prevent_execution_structural_changes();

-- ============================================================
-- TRIGGER: execution_steps — structural fields immutable after insert
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_execution_step_structural_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.execution_id IS DISTINCT FROM OLD.execution_id THEN
    RAISE EXCEPTION 'execution_steps.execution_id is immutable after insert';
  END IF;
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
    RAISE EXCEPTION 'execution_steps.agent_id is immutable after insert';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'execution_steps.type is immutable after insert';
  END IF;
  IF NEW.step_number IS DISTINCT FROM OLD.step_number THEN
    RAISE EXCEPTION 'execution_steps.step_number is immutable after insert';
  END IF;
  IF NEW.input IS DISTINCT FROM OLD.input THEN
    RAISE EXCEPTION 'execution_steps.input is immutable after insert';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'execution_steps.created_at is immutable';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_execution_step_structural_changes() IS
  'Blocks modification of structural fields on execution_steps after insert. Applies to all roles including service_role. Mutable fields: status, output, error, metrics, started_at, finished_at, updated_at.';

CREATE TRIGGER execution_steps_immutable_fields
  BEFORE UPDATE ON execution_steps
  FOR EACH ROW EXECUTE FUNCTION prevent_execution_step_structural_changes();

-- ============================================================
-- TRIGGER: executions — status state machine
-- ============================================================
-- Transitions:
--   pending   → running | cancelled
--   running   → completed | failed | cancelled
--   completed, failed, cancelled → terminal
--
-- authenticated: only → cancelled
-- service_role / postgres: all valid transitions

CREATE OR REPLACE FUNCTION validate_execution_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'execution status ''%'' is terminal and cannot be changed', OLD.status;
  END IF;

  IF current_role = 'authenticated' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'authenticated role may only set execution status to ''cancelled''';
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('running', 'cancelled')) OR
    (OLD.status = 'running' AND NEW.status IN ('completed', 'failed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'invalid execution status transition: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_execution_status_transition() IS
  'Enforces execution status state machine. authenticated may only cancel. Terminal states are permanent.';

CREATE TRIGGER executions_status_transition
  BEFORE UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION validate_execution_status_transition();

-- ============================================================
-- TRIGGER: executions — authenticated may ONLY change `status`
-- ============================================================
-- WITH CHECK on the RLS policy guarantees the final committed
-- value of status is 'cancelled'. This trigger closes the gap:
-- rejects any UPDATE where authenticated also modifies any other
-- column in the same statement, even if status ends up correct.
--
-- Excluded: status (allowed), updated_at (trigger-managed).
--
-- Fires first (name starts with 'a_'):
--   1. a_executions_authenticated_field_lock   ← this
--   2. executions_immutable_fields
--   3. executions_immutable_workspace_id
--   4. executions_status_transition
--   5. executions_updated_at

CREATE OR REPLACE FUNCTION restrict_authenticated_execution_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_role <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.id              IS DISTINCT FROM OLD.id              OR
    NEW.workspace_id    IS DISTINCT FROM OLD.workspace_id    OR
    NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
    NEW.agent_id        IS DISTINCT FROM OLD.agent_id        OR
    NEW.integration_id  IS DISTINCT FROM OLD.integration_id  OR
    NEW.input           IS DISTINCT FROM OLD.input           OR
    NEW.output          IS DISTINCT FROM OLD.output          OR
    NEW.error           IS DISTINCT FROM OLD.error           OR
    NEW.config_snapshot IS DISTINCT FROM OLD.config_snapshot OR
    NEW.duration_ms     IS DISTINCT FROM OLD.duration_ms     OR
    NEW.tokens_input    IS DISTINCT FROM OLD.tokens_input    OR
    NEW.tokens_output   IS DISTINCT FROM OLD.tokens_output   OR
    NEW.cost_estimate   IS DISTINCT FROM OLD.cost_estimate   OR
    NEW.started_at      IS DISTINCT FROM OLD.started_at      OR
    NEW.finished_at     IS DISTINCT FROM OLD.finished_at     OR
    NEW.created_at      IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'authenticated role may only update the status field on executions';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION restrict_authenticated_execution_update() IS
  'When current_role = authenticated, rejects any UPDATE that modifies any column other than status and updated_at. Closes the gap left by WITH CHECK, which only validates the final row state.';

CREATE TRIGGER a_executions_authenticated_field_lock
  BEFORE UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION restrict_authenticated_execution_update();

-- ============================================================
-- TRIGGER: execution_steps — append-only for authenticated
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_execution_step_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_role = 'authenticated' THEN
    RAISE EXCEPTION 'execution_steps are append-only for authenticated role';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_execution_step_update() IS
  'Blocks any UPDATE from authenticated role. service_role may update progress fields; structural fields are protected separately by execution_steps_immutable_fields.';

CREATE TRIGGER a_execution_steps_authenticated_lock
  BEFORE UPDATE ON execution_steps
  FOR EACH ROW EXECUTE FUNCTION prevent_execution_step_update();

-- ============================================================
-- TRIGGER: execution_steps — cross-workspace integrity on INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION validate_execution_step_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM executions
    WHERE id = NEW.execution_id
      AND workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'execution_steps.execution_id does not belong to workspace %', NEW.workspace_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM agents
    WHERE id = NEW.agent_id
      AND workspace_id = NEW.workspace_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'execution_steps.agent_id does not belong to workspace % or agent is deleted', NEW.workspace_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_execution_step_refs() IS
  'On INSERT, validates that execution_id and agent_id in execution_steps belong to the same workspace and are not soft-deleted. SECURITY DEFINER to bypass RLS.';

CREATE TRIGGER execution_steps_validate_refs
  BEFORE INSERT ON execution_steps
  FOR EACH ROW EXECUTE FUNCTION validate_execution_step_refs();

-- ============================================================
-- RLS POLICIES — executions
-- ============================================================

CREATE POLICY executions_select_own
  ON executions FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

CREATE POLICY executions_update_cancel
  ON executions FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(workspace_id))
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND status = 'cancelled'
  );

-- ============================================================
-- RLS POLICIES — execution_steps
-- ============================================================

CREATE POLICY execution_steps_select_own
  ON execution_steps FOR SELECT
  TO authenticated
  USING (is_workspace_member(workspace_id));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_executions_workspace_id    ON executions (workspace_id);
CREATE INDEX idx_executions_conversation_id ON executions (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_executions_agent_id        ON executions (agent_id);
CREATE INDEX idx_executions_integration_id  ON executions (integration_id) WHERE integration_id IS NOT NULL;
CREATE INDEX idx_executions_status          ON executions (status)          WHERE status IN ('pending', 'running');
CREATE INDEX idx_executions_created_at      ON executions (created_at DESC);

CREATE INDEX idx_execution_steps_execution_id ON execution_steps (execution_id);
CREATE INDEX idx_execution_steps_workspace_id ON execution_steps (workspace_id);
CREATE INDEX idx_execution_steps_agent_id     ON execution_steps (agent_id);
