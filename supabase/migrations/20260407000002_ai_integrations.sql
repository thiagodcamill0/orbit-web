-- supabase/migrations/20260407000002_ai_integrations.sql
-- Domain 2: AI Providers + Integrations
-- Depends on: 000001 (workspaces, is_workspace_member)

-- ============================================================
-- TABLE: ai_providers
-- ============================================================

CREATE TABLE ai_providers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  base_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ai_providers IS 'Global catalog of supported AI providers. Readable by all authenticated users. Managed by service_role.';

CREATE TRIGGER ai_providers_updated_at
  BEFORE UPDATE ON ai_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ai_providers_select_all
  ON ai_providers FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- TABLE: ai_integrations
-- ============================================================
-- No API key stored — secret_ref is a pointer (env var name or
-- future Vault ID). Soft delete via deleted_at.

CREATE TABLE ai_integrations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id)   ON DELETE CASCADE,
  provider_id  UUID        NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
  name         TEXT        NOT NULL,
  secret_ref   TEXT,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_integrations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ai_integrations IS 'Workspace connection to an AI provider. No API key stored — secret_ref is a pointer to an env variable or future Vault secret. Soft delete via deleted_at.';
COMMENT ON COLUMN ai_integrations.secret_ref IS 'Pointer to the API key location (env var name or Vault ID). The actual secret is never stored in the database.';

CREATE TRIGGER ai_integrations_updated_at
  BEFORE UPDATE ON ai_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY ai_integrations_select_own
  ON ai_integrations FOR SELECT
  TO authenticated
  USING (
    is_workspace_member(workspace_id)
    AND deleted_at IS NULL
  );

CREATE POLICY ai_integrations_insert_own
  ON ai_integrations FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY ai_integrations_update_own
  ON ai_integrations FOR UPDATE
  TO authenticated
  USING  (is_workspace_member(workspace_id) AND deleted_at IS NULL)
  WITH CHECK (is_workspace_member(workspace_id));

-- No DELETE policy: soft delete only via UPDATE (deleted_at)

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_ai_integrations_workspace_id ON ai_integrations (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_integrations_provider_id  ON ai_integrations (provider_id);

-- ============================================================
-- SEED: OpenRouter
-- ============================================================

INSERT INTO ai_providers (name, slug, base_url)
VALUES ('OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1');
