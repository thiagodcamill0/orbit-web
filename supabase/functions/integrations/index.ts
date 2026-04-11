/**
 * Edge Function: integrations
 *
 * CRUD seguro de ai_integrations — API key criptografada no backend.
 *
 * Rotas:
 *   POST   /functions/v1/integrations        → criar integração
 *   PATCH  /functions/v1/integrations/:id    → editar integração
 *   DELETE /functions/v1/integrations/:id    → soft delete + limpar encrypted_key
 *
 * Segurança:
 *   - JWT validado via Supabase Auth antes de qualquer operação
 *   - Membership do workspace verificado em todas as rotas
 *   - provider_id validado: apenas globais ou do mesmo workspace são aceitos
 *   - API key nunca retornada; "has_key: boolean" indica se está configurada
 *   - Operações privilegiadas via service_role exclusivamente no backend
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL              — injetada automaticamente pelo Supabase
 *   SUPABASE_ANON_KEY         — injetada automaticamente pelo Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injetada automaticamente pelo Supabase
 *   ENCRYPTION_SECRET         — base64 de 32 bytes; configurar manualmente
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptApiKey } from '../_shared/crypto.ts';

// ─── CORS ────────────────────────────────────────────────────────────────────
// Access-Control-Max-Age reduz preflights repetidos do browser (cache de 24h).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

// ─── Helpers de resposta ─────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

// ─── Shape de integração retornada (sem encrypted_key) ───────────────────────

type IntegrationRow = Record<string, unknown>;

function sanitize(row: IntegrationRow): Record<string, unknown> {
  const { encrypted_key, ...rest } = row;
  return { ...rest, has_key: encrypted_key !== null && encrypted_key !== undefined };
}

// ─── Helpers de banco ────────────────────────────────────────────────────────

const SELECT_FIELDS =
  'id, workspace_id, provider_id, name, secret_ref, encrypted_key, created_at, updated_at';

/** Verifica se userId é membro do workspace. */
async function isMember(
  db: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * Verifica se o provider pode ser usado pelo workspace.
 * Aceita providers globais (workspace_id IS NULL) ou do mesmo workspace.
 * Retorna false tanto para "não existe" quanto para "de outro workspace",
 * evitando vazar informação sobre providers alheios.
 */
async function isProviderAccessible(
  db: SupabaseClient,
  providerId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await db
    .from('ai_providers')
    .select('workspace_id')
    .eq('id', providerId)
    .maybeSingle();

  if (!data) return false;
  return data.workspace_id === null || data.workspace_id === workspaceId;
}

/** Busca integração ativa pelo ID (ignora soft-deleted). */
async function fetchIntegration(
  db: SupabaseClient,
  id: string,
): Promise<IntegrationRow | null> {
  const { data } = await db
    .from('ai_integrations')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCreate(
  req: Request,
  db: SupabaseClient,
  userId: string,
  encryptionSecret: string,
): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errResponse(400, 'Invalid JSON body');

  const { workspace_id, provider_id, name, api_key } = body as Record<string, unknown>;

  if (!workspace_id || typeof workspace_id !== 'string') return errResponse(400, 'workspace_id is required');
  if (!provider_id  || typeof provider_id  !== 'string') return errResponse(400, 'provider_id is required');
  if (!name         || typeof name         !== 'string' || !name.trim()) return errResponse(400, 'name is required');

  if (!(await isMember(db, userId, workspace_id))) {
    return errResponse(403, 'Access denied');
  }

  // Garante que o provider é global ou pertence ao mesmo workspace.
  // Retorna 404 para não expor existência de providers de outros workspaces.
  if (!(await isProviderAccessible(db, provider_id, workspace_id))) {
    return errResponse(404, 'Provider not found');
  }

  const encrypted_key =
    api_key && typeof api_key === 'string' && api_key.trim()
      ? await encryptApiKey(api_key.trim(), encryptionSecret)
      : null;

  const { data, error } = await db
    .from('ai_integrations')
    .insert({ workspace_id, provider_id, name: name.trim(), encrypted_key })
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    console.error('[integrations] create error:', error.message);
    return errResponse(500, 'Failed to create integration');
  }

  return jsonResponse({ data: sanitize(data as IntegrationRow) }, 201);
}

async function handleUpdate(
  req: Request,
  db: SupabaseClient,
  userId: string,
  integrationId: string,
  encryptionSecret: string,
): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errResponse(400, 'Invalid JSON body');

  const integration = await fetchIntegration(db, integrationId);
  if (!integration) return errResponse(404, 'Integration not found');

  if (!(await isMember(db, userId, integration.workspace_id as string))) {
    return errResponse(403, 'Access denied');
  }

  const updates: Record<string, unknown> = {};

  const { name, api_key } = body as Record<string, unknown>;

  if (typeof name === 'string' && name.trim()) {
    updates.name = name.trim();
  }
  if (typeof api_key === 'string' && api_key.trim()) {
    updates.encrypted_key = await encryptApiKey(api_key.trim(), encryptionSecret);
  }

  if (Object.keys(updates).length === 0) {
    return errResponse(400, 'No valid fields to update');
  }

  const { data, error } = await db
    .from('ai_integrations')
    .update(updates)
    .eq('id', integrationId)
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    console.error('[integrations] update error:', error.message);
    return errResponse(500, 'Failed to update integration');
  }

  return jsonResponse({ data: sanitize(data as IntegrationRow) });
}

async function handleDelete(
  db: SupabaseClient,
  userId: string,
  integrationId: string,
): Promise<Response> {
  const integration = await fetchIntegration(db, integrationId);
  if (!integration) return errResponse(404, 'Integration not found');

  if (!(await isMember(db, userId, integration.workspace_id as string))) {
    return errResponse(403, 'Access denied');
  }

  const { error } = await db
    .from('ai_integrations')
    .update({ encrypted_key: null, deleted_at: new Date().toISOString() })
    .eq('id', integrationId);

  if (error) {
    console.error('[integrations] delete error:', error.message);
    return errResponse(500, 'Failed to delete integration');
  }

  // Clear workspace default if this integration was the default.
  // Conditional update — no-op when default_integration_id differs.
  await db
    .from('workspace_settings')
    .update({ default_integration_id: null })
    .eq('workspace_id', integration.workspace_id)
    .eq('default_integration_id', integrationId);

  return jsonResponse({ data: { id: integrationId, deleted: true } });
}

// ─── Helpers: custom provider ────────────────────────────────────────────────

/**
 * Normaliza base_url: exige HTTPS, remove trailing slash.
 * Retorna null se a URL for inválida ou não-HTTPS.
 */
function normalizeBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:') return null;
    // Keep origin + pathname but strip trailing slashes
    const path = url.pathname.replace(/\/+$/, '');
    return url.origin + path;
  } catch {
    return null;
  }
}

/**
 * Gera slug único no formato "custom-<kebab>[-N]".
 * Incrementa sufixo numérico até encontrar um slug livre.
 */
async function generateProviderSlug(db: SupabaseClient, name: string): Promise<string> {
  const base = 'custom-' + name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let slug = base;
  let i    = 2;
  while (true) {
    const { data } = await db
      .from('ai_providers')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i++}`;
  }
}

async function handleCreateProvider(
  req: Request,
  db: SupabaseClient,
  userId: string,
): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errResponse(400, 'Invalid JSON body');

  const { workspace_id, name, base_url } = body as Record<string, unknown>;

  if (!workspace_id || typeof workspace_id !== 'string') return errResponse(400, 'workspace_id is required');
  if (!name         || typeof name         !== 'string' || !name.trim()) return errResponse(400, 'name is required');
  if (!base_url     || typeof base_url     !== 'string') return errResponse(400, 'base_url is required');

  if (!(await isMember(db, userId, workspace_id))) {
    return errResponse(403, 'Access denied');
  }

  const normalizedUrl = normalizeBaseUrl(base_url);
  if (!normalizedUrl) {
    return errResponse(400, 'base_url must be an absolute HTTPS URL (e.g. https://api.example.com/v1)');
  }

  const slug = await generateProviderSlug(db, name.trim());

  const { data, error } = await db
    .from('ai_providers')
    .insert({ workspace_id, name: name.trim(), slug, base_url: normalizedUrl })
    .select('id, name, slug, base_url, workspace_id')
    .single();

  if (error) {
    console.error('[integrations] create provider error:', error.message);
    return errResponse(500, 'Failed to create provider');
  }

  return jsonResponse({ data }, 201);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Preflight CORS — deve retornar 204 (sem conteúdo) com os headers corretos.
  // O browser envia OPTIONS antes de toda requisição cross-origin com credentials.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Extrai o segmento após /integrations, se presente.
  // Ex: /functions/v1/integrations/some-uuid  → segment = "some-uuid"
  //     /functions/v1/integrations/providers  → segment = "providers"
  const match         = new URL(req.url).pathname.match(/\/integrations(?:\/([^/]+))?/);
  const segment       = match?.[1] ?? null;
  const isProviders   = segment === 'providers';
  const integrationId = segment && !isProviders ? segment : null;

  // Valida header de autorização.
  // Aceita "Bearer <token>" (fetch manual) e "<token>" direto (alguns clientes Supabase).
  const rawAuth    = req.headers.get('Authorization') ?? '';
  const authHeader = rawAuth.startsWith('Bearer ') ? rawAuth : rawAuth ? `Bearer ${rawAuth}` : '';

  if (!authHeader) {
    return errResponse(401, 'Missing authorization header');
  }

  // Lê variáveis de ambiente
  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
  const anonKey          = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET');

  if (!encryptionSecret) {
    console.error('[integrations] ENCRYPTION_SECRET is not set');
    return errResponse(500, 'Server misconfiguration');
  }

  // Valida JWT do usuário via client anon.
  // O JWT nunca é usado para operações no banco — apenas para identificar o usuário.
  const userClient = createClient(supabaseUrl, anonKey);
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !user) {
    return errResponse(401, 'Invalid or expired token');
  }

  // Client privilegiado para operações no banco (service_role bypass RLS).
  const db = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method === 'POST' && isProviders) {
      return await handleCreateProvider(req, db, user.id);
    }
    if (req.method === 'POST' && !integrationId && !isProviders) {
      return await handleCreate(req, db, user.id, encryptionSecret);
    }
    if (req.method === 'PATCH' && integrationId) {
      return await handleUpdate(req, db, user.id, integrationId, encryptionSecret);
    }
    if (req.method === 'DELETE' && integrationId) {
      return await handleDelete(db, user.id, integrationId);
    }

    return errResponse(405, 'Method not allowed');
  } catch (e) {
    console.error('[integrations] Unhandled error:', e);
    return errResponse(500, 'Internal server error');
  }
});
