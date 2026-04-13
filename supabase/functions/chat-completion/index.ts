/**
 * Edge Function: chat-completion
 *
 * Proxy seguro entre o frontend e o LLM configurado no workspace.
 *
 * Rota:
 *   POST /functions/v1/chat-completion
 *
 * Body:
 *   { conversation_id: string, workspace_id: string }
 *   Nota: agent_id NÃO é passado — é derivado da conversa (conversations.agent_id),
 *   eliminando qualquer risco de usar o contexto de uma conversa com o prompt/modelo
 *   de um agente diferente.
 *
 * Fluxo:
 *   1. Valida JWT e membership do workspace
 *   2. Carrega a conversa (status + agent_id) e valida que pertence ao workspace
 *   3. Carrega o agente a partir de conversations.agent_id
 *   4. Resolve integração via workspace_settings.default_integration_id
 *   4. Decripta a API key server-side (encrypted_key + ENCRYPTION_SECRET)
 *   5. Valida status da conversa antes de gastar a chamada ao LLM
 *   6. Carrega histórico de mensagens (últimas MAX_CONTEXT_MESSAGES)
 *   7. Chama o LLM (formato OpenAI-compatible)
 *   8. Persiste role='assistant' via service_role (contorna a RLS que restringe
 *      authenticated a role='user')
 *   9. Retorna { content }
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL              — injetada automaticamente
 *   SUPABASE_ANON_KEY         — injetada automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY — injetada automaticamente
 *   ENCRYPTION_SECRET         — base64 de 32 bytes; configurar manualmente
 *   APP_URL                   — opcional; usado como HTTP-Referer para o OpenRouter
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptApiKey } from '../_shared/crypto.ts';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

// Número máximo de mensagens enviadas como contexto ao LLM.
// Mantém tokens sob controle; aumentar conforme necessário.
const MAX_CONTEXT_MESSAGES = 20;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function errRes(message: string, status: number): Response {
  return jsonRes({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return errRes('Method not allowed', 405);
  }

  try {
    // ── Variáveis de ambiente ────────────────────────────────────────────────
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey          = Deno.env.get('SUPABASE_ANON_KEY')!;
    const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET');
    const appUrl           = Deno.env.get('APP_URL') ?? '';

    if (!encryptionSecret) {
      console.error('[chat-completion] ENCRYPTION_SECRET is not set');
      return errRes('Server misconfiguration', 500);
    }
    if (!serviceRoleKey) {
      console.error('[chat-completion] SUPABASE_SERVICE_ROLE_KEY is not set');
      return errRes('Server misconfiguration', 500);
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const rawAuth    = req.headers.get('Authorization') ?? '';
    const authHeader = rawAuth.startsWith('Bearer ') ? rawAuth : rawAuth ? `Bearer ${rawAuth}` : '';
    if (!authHeader) return errRes('Missing authorization header', 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return errRes('Unauthorized', 401);

    // Client privilegiado para reads e writes sensíveis
    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return errRes('Invalid JSON body', 400);

    const { conversation_id, workspace_id, agent_id } = body as Record<string, unknown>;
    if (!conversation_id || !workspace_id) {
      return errRes('Missing required fields: conversation_id, workspace_id', 400);
    }

    console.log('[chat-completion] body=', { conversation_id, workspace_id, agent_id });
    console.log('[chat-completion] user.id=', user.id);

    // ── Membership ───────────────────────────────────────────────────────────
    const { data: member, error: memberErr } = await svc
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) {
      console.error('[chat-completion] membership check FAILED — user.id:', user.id, '| workspace_id:', workspace_id, '| db_error:', memberErr?.message ?? null);
      return errRes('Forbidden', 403);
    }
    console.log('[chat-completion] membership OK');

    // ── Conversa — fonte de verdade para agent_id ─────────────────────────────
    // agent_id é derivado aqui, não aceito do body, evitando que o caller
    // misture conversation_id de um agente com agent_id de outro.
    // A validação de status (limit_reached / archived) também fica centralizada aqui,
    // antes de qualquer query adicional.
    const { data: conversation, error: convErr } = await svc
      .from('conversations')
      .select('agent_id, status')
      .eq('id', conversation_id)
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (convErr || !conversation) return errRes('Conversation not found', 404);

    if (conversation.status === 'limit_reached') {
      return errRes('This conversation reached the 200-message limit. Start a new one.', 400);
    }
    if (conversation.status === 'archived') {
      return errRes('This conversation is archived and cannot receive new messages.', 400);
    }

    // ── Agente — carregado a partir de conversations.agent_id ────────────────
    const { data: agent, error: agentErr } = await svc
      .from('agents')
      .select('model_id, system_prompt')
      .eq('id', conversation.agent_id)
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (agentErr || !agent) return errRes('Agent not found', 404);
    if (!agent.model_id)    return errRes('Agent has no model configured', 400);

    // ── Integração — default ou fallback para a primeira ativa do workspace ─────
    // Tenta resolver via workspace_settings.default_integration_id.
    // Se não estiver definido (workspace recém-criado ou nunca configurado),
    // usa a primeira integração ativa com encrypted_key do workspace.
    const { data: wSettings, error: wsErr } = await svc
      .from('workspace_settings')
      .select('default_integration_id')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (wsErr) {
      console.error('[chat-completion] workspace_settings query error:', wsErr.message);
      return errRes('Failed to load workspace settings', 500);
    }

    let integrationId: string | null = wSettings?.default_integration_id ?? null;

    if (!integrationId) {
      // default_integration_id não configurado: tenta a primeira integração ativa
      const { data: fallback } = await svc
        .from('ai_integrations')
        .select('id')
        .eq('workspace_id', workspace_id)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      integrationId = fallback?.id ?? null;
    }

    if (!integrationId) {
      return errRes('No integration configured. Add one in Integrations.', 422);
    }

    const { data: integration, error: intErr } = await svc
      .from('ai_integrations')
      .select('encrypted_key, ai_providers(base_url)')
      .eq('id', integrationId)
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (intErr || !integration) {
      return errRes('Integration not found or was removed', 422);
    }
    if (!integration.encrypted_key) {
      return errRes('Default integration has no API key configured. Add one in Integrations.', 422);
    }

    const provider = integration.ai_providers as { base_url: string | null } | null;
    const baseUrl  = provider?.base_url ?? 'https://openrouter.ai/api/v1';

    // ── Decripta a API key (permanece exclusivamente neste scope) ─────────────
    let apiKey: string;
    try {
      apiKey = await decryptApiKey(integration.encrypted_key, encryptionSecret);
    } catch {
      console.error('[chat-completion] Failed to decrypt API key');
      return errRes('Failed to decrypt API key', 500);
    }

    // ── Histórico de mensagens ────────────────────────────────────────────────
    // Busca as últimas MAX_CONTEXT_MESSAGES em ordem descendente e reverte,
    // preservando a ordem cronológica para o LLM.
    const { data: history } = await svc
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES);

    const messages = [
      ...(agent.system_prompt?.trim()
        ? [{ role: 'system', content: agent.system_prompt.trim() }]
        : []),
      ...(history ?? []).reverse(),
    ];

    // ── Chamada ao LLM (OpenAI-compatible) ────────────────────────────────────
    const llmRes = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(appUrl ? { 'HTTP-Referer': appUrl } : {}),
        'X-Title': 'Orbit',
      },
      body: JSON.stringify({
        model:    agent.model_id,
        messages,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => '');
      console.error(`[chat-completion] LLM error ${llmRes.status}:`, errText);
      return errRes(`LLM provider returned an error (HTTP ${llmRes.status})`, 502);
    }

    const llmJson = await llmRes.json().catch(() => null);
    const content = llmJson?.choices?.[0]?.message?.content ?? null;
    if (!content) {
      console.error('[chat-completion] Unexpected LLM response:', JSON.stringify(llmJson));
      return errRes('LLM returned an unexpected response format', 502);
    }

    // ── Persiste a resposta do assistente ─────────────────────────────────────
    // service_role contorna a policy messages_insert_user (authenticated só
    // pode inserir role='user'). O trigger validate_message_insert ainda corre
    // e bloqueia se a conversa atingiu o limite no intervalo desta chamada.
    const { error: insertErr } = await svc.from('messages').insert({
      conversation_id,
      workspace_id,
      role:    'assistant',
      content,
    });

    if (insertErr) {
      if (insertErr.message?.includes('200-message limit')) {
        return errRes('Conversation reached the 200-message limit.', 400);
      }
      console.error('[chat-completion] Failed to persist assistant message:', insertErr.message);
      return errRes('Failed to save assistant response', 500);
    }

    return jsonRes({ content });

  } catch (err) {
    console.error('[chat-completion] Unhandled error:', err);
    return errRes('Internal server error', 500);
  }
});
