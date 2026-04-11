-- supabase/migrations/20260410000002_integrations_safe_view.sql
-- View segura de ai_integrations: expõe has_key (boolean) em vez de encrypted_key.
-- O ciphertext nunca é enviado ao cliente — a avaliação IS NOT NULL ocorre no banco.
-- Depends on: 000002 (ai_integrations), 000007 (encrypted_key column)

-- ============================================================
-- VIEW: ai_integrations_safe
-- ============================================================
-- security_invoker = true: o RLS da tabela ai_integrations
-- continua sendo aplicado para o role que executa a query
-- (authenticated), sem necessidade de policies na view.

CREATE VIEW ai_integrations_safe
  WITH (security_invoker = true)
AS
SELECT
  id,
  workspace_id,
  provider_id,
  name,
  secret_ref,
  (encrypted_key IS NOT NULL) AS has_key,
  deleted_at,
  created_at,
  updated_at
FROM ai_integrations;

COMMENT ON VIEW ai_integrations_safe IS
  'View segura de ai_integrations. Expõe has_key (boolean) derivado de encrypted_key IS NOT NULL. '
  'A chave criptografada nunca é enviada ao cliente. '
  'Use esta view para leituras; writes continuam indo para ai_integrations via Edge Function.';

-- Garante que o role authenticated pode fazer SELECT pela view.
-- O RLS da tabela subjacente ainda se aplica (security_invoker).
GRANT SELECT ON ai_integrations_safe TO authenticated;
