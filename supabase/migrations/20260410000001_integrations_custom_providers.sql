-- supabase/migrations/20260410000001_integrations_custom_providers.sql
-- Etapa 1: suporte a encrypted_key + providers custom por workspace
-- Depends on: 000001 (workspaces, is_workspace_member), 000002 (ai_providers, ai_integrations)

-- ============================================================
-- 1. encrypted_key em ai_integrations
-- ============================================================

ALTER TABLE ai_integrations
  ADD COLUMN encrypted_key TEXT;

COMMENT ON COLUMN ai_integrations.encrypted_key IS
  'AES-256-GCM ciphertext (base64) da API key real. '
  'Criptografado e decriptado exclusivamente pela Edge Function via ENCRYPTION_SECRET. '
  'NULL = key não configurada. secret_ref mantido por compatibilidade.';

-- ============================================================
-- 2. workspace_id em ai_providers
-- ============================================================

ALTER TABLE ai_providers
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

COMMENT ON COLUMN ai_providers.workspace_id IS
  'NULL = provider global (catálogo padrão, gerenciado via service_role). '
  'Preenchido = provider custom criado por um workspace específico.';

CREATE INDEX idx_ai_providers_workspace_id
  ON ai_providers (workspace_id)
  WHERE workspace_id IS NOT NULL;

-- ============================================================
-- 3. Ajuste de RLS em ai_providers
-- ============================================================

-- Remove a policy atual (permitia tudo para autenticados)
DROP POLICY ai_providers_select_all ON ai_providers;

-- Nova policy: globais visíveis para todos; custom só para membros do workspace
CREATE POLICY ai_providers_select
  ON ai_providers FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
  );
