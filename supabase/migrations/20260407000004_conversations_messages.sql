-- supabase/migrations/20260407000004_conversations_messages.sql
-- Domain 4: Conversations + Messages
-- Depends on: 000001 (workspaces, is_workspace_member)
--             000003 (agents, prevent_workspace_id_change)

-- ============================================================
-- TABLE: conversations
-- ============================================================

CREATE TABLE conversations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id      UUID        NOT NULL REFERENCES agents(id)     ON DELETE RESTRICT,
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'archived', 'limit_reached')),
  message_count INTEGER     NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE conversations IS 'Chat sessions between a user and an agent. Soft delete via deleted_at. message_count managed exclusively by trigger.';
COMMENT ON COLUMN conversations.status IS 'active: normal; archived: read-only (manual); limit_reached: terminal, 200-message limit hit.';
COMMENT ON COLUMN conversations.message_count IS 'Total message count. Managed by handle_message_insert trigger. Direct writes blocked via REVOKE + protect_message_count trigger.';

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLE: messages
-- ============================================================

CREATE TABLE messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL,  -- denormalized for RLS efficiency; no FK
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE messages IS 'Individual messages within a conversation. workspace_id is denormalized for RLS efficiency. role=''user'' only for authenticated inserts; all other roles written by service_role.';
COMMENT ON COLUMN messages.workspace_id IS 'Denormalized from conversations.workspace_id. Validated against conversation by validate_message_insert trigger.';

CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- UNIQUE constraint for cross-workspace FK validation
-- ============================================================

ALTER TABLE conversations ADD CONSTRAINT conversations_workspace_id_id UNIQUE (workspace_id, id);

-- ============================================================
-- TRIGGER: workspace_id immutability
-- ============================================================

CREATE TRIGGER conversations_immutable_workspace_id
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

CREATE TRIGGER messages_immutable_workspace_id
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION prevent_workspace_id_change();

-- ============================================================
-- TRIGGER: conversations — agent_id immutable after insert
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_conversation_agent_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
    RAISE EXCEPTION 'conversations.agent_id is immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_conversation_agent_change() IS
  'Prevents agent_id from being changed after a conversation is created.';

CREATE TRIGGER conversations_immutable_agent_id
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION prevent_conversation_agent_change();

-- ============================================================
-- TRIGGER: conversations — cross-workspace integrity on INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION validate_conversation_refs()
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
    RAISE EXCEPTION 'conversations.agent_id does not belong to workspace % or agent is deleted', NEW.workspace_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_conversation_refs() IS
  'On INSERT, validates that agent_id belongs to the same workspace as the conversation and is not soft-deleted. SECURITY DEFINER to bypass RLS.';

CREATE TRIGGER conversations_validate_refs
  BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION validate_conversation_refs();

-- ============================================================
-- PROTECT: message_count — block direct writes
-- ============================================================

REVOKE UPDATE (message_count) ON conversations FROM authenticated;

-- Session flag (transaction-local) used to authorize internal writes:
-- orbit.internal_message_count_update = 'true'

CREATE OR REPLACE FUNCTION increment_message_count(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('orbit.internal_message_count_update', 'true', true);

  UPDATE conversations
  SET
    message_count = message_count + 1,
    status = CASE
      WHEN message_count + 1 >= 200 THEN 'limit_reached'
      ELSE status
    END
  WHERE id = p_conversation_id;
END;
$$;

COMMENT ON FUNCTION increment_message_count(UUID) IS
  'SECURITY DEFINER: atomically increments message_count and sets status = ''limit_reached'' when the 200-message threshold is reached. Sets orbit.internal_message_count_update session flag to pass the protect_message_count trigger guard.';

CREATE OR REPLACE FUNCTION protect_message_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message_count IS DISTINCT FROM OLD.message_count
     AND current_setting('orbit.internal_message_count_update', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'message_count is managed by the system and cannot be modified directly';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION protect_message_count() IS
  'Blocks direct updates to message_count unless the orbit.internal_message_count_update session flag is set. IS DISTINCT FROM used for NULL-safe comparison — avoids the NULL <> ''true'' = NULL pitfall.';

CREATE TRIGGER conversations_protect_message_count
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION protect_message_count();

-- ============================================================
-- TRIGGER: conversations — limit_reached is terminal
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_limit_reached_revert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'limit_reached' THEN
    RAISE EXCEPTION 'conversation status ''limit_reached'' is terminal and cannot be changed';
  END IF;

  IF NEW.status = 'limit_reached'
     AND current_setting('orbit.internal_message_count_update', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'conversation status ''limit_reached'' can only be set by the system';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_limit_reached_revert() IS
  'Blocks reverting from limit_reached (terminal state) and blocks manually entering limit_reached without the internal session flag.';

CREATE TRIGGER conversations_prevent_limit_reached_revert
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION prevent_limit_reached_revert();

-- ============================================================
-- TRIGGER: messages — validate on INSERT
-- ============================================================
-- SECURITY DEFINER + FOR UPDATE serializes concurrent inserts,
-- preventing the race condition where two concurrent inserts both
-- read message_count = 199 and both succeed.

CREATE OR REPLACE FUNCTION validate_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conv
  FROM conversations
  WHERE id = NEW.conversation_id
    AND workspace_id = NEW.workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation does not exist or does not belong to workspace %', NEW.workspace_id;
  END IF;

  IF v_conv.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'cannot insert message into a deleted conversation';
  END IF;

  IF v_conv.status = 'limit_reached' THEN
    RAISE EXCEPTION 'conversation has reached the 200-message limit';
  END IF;

  IF v_conv.status = 'archived' THEN
    RAISE EXCEPTION 'conversation is archived and cannot receive new messages';
  END IF;

  IF v_conv.message_count >= 200 THEN
    RAISE EXCEPTION 'conversation has reached the 200-message limit';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_message_insert() IS
  'BEFORE INSERT on messages: locks the conversation row (FOR UPDATE) to prevent race conditions on the 200-message limit. Validates workspace consistency, deletion, archive, and limit status.';

CREATE TRIGGER messages_validate_insert
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION validate_message_insert();

-- ============================================================
-- TRIGGER: messages — increment count AFTER INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION handle_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM increment_message_count(NEW.conversation_id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION handle_message_insert() IS
  'AFTER INSERT on messages: calls increment_message_count to update message_count and set limit_reached when the 200-message threshold is hit.';

CREATE TRIGGER messages_after_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION handle_message_insert();

-- ============================================================
-- RLS POLICIES — conversations
-- ============================================================

CREATE POLICY conversations_select_own
  ON conversations FOR SELECT
  TO authenticated
  USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );

CREATE POLICY conversations_insert_own
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY conversations_update_own
  ON conversations FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(workspace_id) AND deleted_at IS NULL)
  WITH CHECK (is_workspace_member(workspace_id));

-- No DELETE policy: soft delete only via UPDATE (deleted_at)

-- ============================================================
-- RLS POLICIES — messages
-- ============================================================

-- SELECT: hide messages from soft-deleted conversations
CREATE POLICY messages_select_own
  ON messages FOR SELECT
  TO authenticated
  USING (
    is_workspace_member(workspace_id)
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.deleted_at IS NULL
    )
  );

-- INSERT: authenticated may only send role='user' messages
CREATE POLICY messages_insert_user
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    role = 'user'
    AND is_workspace_member(workspace_id)
  );

-- No UPDATE or DELETE policies for authenticated
-- assistant / system / tool messages written by service_role

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_conversations_workspace_id ON conversations (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_agent_id     ON conversations (agent_id);
CREATE INDEX idx_conversations_status       ON conversations (status)       WHERE status = 'active';
CREATE INDEX idx_messages_conversation_id   ON messages (conversation_id);
CREATE INDEX idx_messages_workspace_id      ON messages (workspace_id);
CREATE INDEX idx_messages_created_at        ON messages (created_at DESC);
