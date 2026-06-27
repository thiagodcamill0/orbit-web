/**
 * Edge Function: chat-completion
 *
 * Proxy seguro entre o frontend e o LLM configurado no workspace.
 * Registra cada execução real em `executions` + `execution_steps` para Analytics.
 *
 * Rota:
 *   POST /functions/v1/chat-completion
 *
 * Body:
 *   { conversation_id: string, workspace_id: string }
 *
 * Fluxo:
 *   1.  Valida JWT e membership do workspace
 *   2.  Carrega a conversa (status + agent_id)
 *   3.  Carrega o agente
 *   4.  Resolve integração
 *   5.  Decripta a API key
 *   6.  Carrega histórico de mensagens
 *   7.  Insere executions (status='running') + execution_steps (type='llm_call')
 *   8.  Chama o LLM
 *   9.  Persiste role='assistant'
 *   10. Atualiza executions + execution_steps com métricas reais
 *   11. Retorna { content }
 *
 * Analytics (best-effort):
 *   Falhas em executions/execution_steps são logadas mas não bloqueiam o chat.
 *   Todos os writes usam service_role — authenticated só pode cancelar executions.
 *
 * Nota sobre crypto:
 *   A lógica de decryptApiKey está inline neste arquivo para compatibilidade com
 *   o deploy via Supabase Management API (que não resolve imports relativos como
 *   '../_shared/crypto.ts'). A versão canonical do módulo continua em
 *   supabase/functions/_shared/crypto.ts e é usada por functions/integrations.
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL              — injetada automaticamente
 *   SUPABASE_ANON_KEY         — injetada automaticamente
 *   SUPABASE_SERVICE_ROLE_KEY — injetada automaticamente
 *   ENCRYPTION_SECRET         — base64 de 32 bytes
 *   APP_URL                   — opcional; HTTP-Referer para o OpenRouter
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Crypto inline (AES-256-GCM) ─────────────────────────────────────────────
// Cópia de _shared/crypto.ts inline para deploy via Management API.

const _ALGO     = 'AES-GCM';
const _IV_BYTES = 12; // eslint-disable-line @typescript-eslint/no-unused-vars

function _b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function _importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    _b64ToBytes(secret),
    { name: _ALGO, length: 256 },
    false,
    ['decrypt'],
  );
}

async function decryptApiKey(stored: string, secret: string): Promise<string> {
  const sep = stored.indexOf(':');
  if (sep === -1) throw new Error('Invalid ciphertext format');
  const iv         = _b64ToBytes(stored.slice(0, sep));
  const ciphertext = _b64ToBytes(stored.slice(sep + 1));
  const key        = await _importKey(secret);
  const plaintext  = await crypto.subtle.decrypt({ name: _ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ─── CORS + helpers ───────────────────────────────────────────────────────────

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

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SvcClient  = ReturnType<typeof createClient>;
type LlmMessage = { role: string; content: string };

interface ExecIds {
  executionId: string;
  stepId:      string | null;
}

interface FinishParams {
  status:        'completed' | 'failed';
  finishedAt:    Date;
  startedAt:     Date;
  tokensInput:   number | null;
  tokensOutput:  number | null;
  output:        unknown;
  error:         string | null;
}

// ─── Rastreamento de execuções ────────────────────────────────────────────────

/**
 * Insere executions (status='running') + execution_steps (type='llm_call').
 * Retorna IDs ou null se falhar. Nunca lança.
 *
 * Status 'running' é inserido diretamente: o trigger de state machine só dispara
 * em UPDATE, não em INSERT. Campos imutáveis (input, config_snapshot, FKs) são
 * definidos aqui — não podem ser alterados após o insert.
 */
async function startExecution(
  svc: SvcClient,
  p: {
    workspaceId:    string;
    conversationId: string;
    agentId:        string;
    integrationId:  string;
    messages:       LlmMessage[];
    modelId:        string;
    systemPrompt:   string | null;
    startedAt:      Date;
  },
): Promise<ExecIds | null> {
  try {
    const { data: execRow, error: execErr } = await svc
      .from('executions')
      .insert({
        workspace_id:    p.workspaceId,
        conversation_id: p.conversationId,
        agent_id:        p.agentId,
        integration_id:  p.integrationId,
        status:          'running',
        started_at:      p.startedAt.toISOString(),
        input:           { messages: p.messages },
        config_snapshot: { model_id: p.modelId, system_prompt: p.systemPrompt },
      })
      .select('id')
      .single();

    if (execErr || !execRow) {
      console.error('[chat-completion] executions INSERT failed:', execErr?.message);
      return null;
    }

    const { data: stepRow, error: stepErr } = await svc
      .from('execution_steps')
      .insert({
        workspace_id: p.workspaceId,
        execution_id: execRow.id,
        agent_id:     p.agentId,
        step_number:  1,
        type:         'llm_call',
        status:       'running',
        started_at:   p.startedAt.toISOString(),
        input:        { messages: p.messages },
      })
      .select('id')
      .single();

    if (stepErr) {
      console.error('[chat-completion] execution_steps INSERT failed:', stepErr.message);
      // Continua com executionId registrado; stepId fica nulo
      return { executionId: execRow.id, stepId: null };
    }

    return { executionId: execRow.id, stepId: stepRow?.id ?? null };
  } catch (e) {
    console.error('[chat-completion] startExecution error:', e);
    return null;
  }
}

/**
 * Atualiza executions e execution_steps com o resultado final.
 * Nunca lança — erros são apenas logados.
 *
 * Campos mutáveis em executions: status, output, error, métricas, timestamps.
 * execution_steps: mesmo conjunto + service_role pode atualizar; authenticated não.
 */
async function finishExecution(
  svc:    SvcClient,
  ids:    ExecIds,
  params: FinishParams,
): Promise<void> {
  const duration_ms = params.finishedAt.getTime() - params.startedAt.getTime();

  const { error: execErr } = await svc
    .from('executions')
    .update({
      status:        params.status,
      finished_at:   params.finishedAt.toISOString(),
      duration_ms,
      tokens_input:  params.tokensInput,
      tokens_output: params.tokensOutput,
      output:        params.output ?? null,
      error:         params.error,
    })
    .eq('id', ids.executionId);
  if (execErr) console.error('[chat-completion] executions UPDATE failed:', execErr.message);

  if (!ids.stepId) return;

  const { error: stepErr } = await svc
    .from('execution_steps')
    .update({
      status:        params.status,
      finished_at:   params.finishedAt.toISOString(),
      duration_ms,
      tokens_input:  params.tokensInput,
      tokens_output: params.tokensOutput,
      output:        params.output ?? null,
      error:         params.error,
    })
    .eq('id', ids.stepId);
  if (stepErr) console.error('[chat-completion] execution_steps UPDATE failed:', stepErr.message);
}

// ─── Handler principal ────────────────────────────────────────────────────────

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errRes('Missing authorization header', 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
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
      console.error('[chat-completion] membership FAILED — user:', user.id, 'workspace:', workspace_id, 'err:', memberErr?.message ?? null);
      return errRes('Forbidden', 403);
    }
    console.log('[chat-completion] membership OK');

    // ── Conversa — fonte de verdade para agent_id ─────────────────────────────
    // agent_id é derivado aqui, não aceito do body, evitando que o caller
    // misture conversation_id de um agente com agent_id de outro.
    const { data: conversation, error: convErr } = await svc
      .from('conversations')
      .select('agent_id, status')
      .eq('id', conversation_id)
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (convErr || !conversation) return errRes('Conversation not found', 404);
    if (conversation.status === 'limit_reached') return errRes('This conversation reached the 200-message limit. Start a new one.', 400);
    if (conversation.status === 'archived')      return errRes('This conversation is archived and cannot receive new messages.', 400);

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

    // ── Integração — default ou fallback para a primeira ativa do workspace ───
    const { data: wSettings, error: wsErr } = await svc
      .from('workspace_settings')
      .select('default_integration_id')
      .eq('workspace_id', workspace_id)
      .maybeSingle();

    if (wsErr) {
      console.error('[chat-completion] workspace_settings error:', wsErr.message);
      return errRes('Failed to load workspace settings', 500);
    }

    let integrationId: string | null = wSettings?.default_integration_id ?? null;

    if (!integrationId) {
      const { data: fallback } = await svc
        .from('ai_integrations')
        .select('id')
        .eq('workspace_id', workspace_id)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      integrationId = fallback?.id ?? null;
    }

    if (!integrationId) return errRes('No integration configured. Add one in Integrations.', 422);

    const { data: integration, error: intErr } = await svc
      .from('ai_integrations')
      .select('encrypted_key, ai_providers(base_url)')
      .eq('id', integrationId)
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (intErr || !integration)     return errRes('Integration not found or was removed', 422);
    if (!integration.encrypted_key) return errRes('Default integration has no API key configured. Add one in Integrations.', 422);

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

    const messages: LlmMessage[] = [
      ...(agent.system_prompt?.trim() ? [{ role: 'system', content: agent.system_prompt.trim() }] : []),
      ...(history ?? []).reverse(),
    ];

    // ── Registrar início da execução (best-effort) ────────────────────────────
    const execStartedAt = new Date();
    const execIds = await startExecution(svc, {
      workspaceId:    workspace_id as string,
      conversationId: conversation_id as string,
      agentId:        conversation.agent_id,
      integrationId,
      messages,
      modelId:        agent.model_id,
      systemPrompt:   agent.system_prompt ?? null,
      startedAt:      execStartedAt,
    });

    // ── Chamada ao LLM (OpenAI-compatible) ────────────────────────────────────
    const llmRes = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(appUrl ? { 'HTTP-Referer': appUrl } : {}),
        'X-Title': 'Orbit',
      },
      body: JSON.stringify({ model: agent.model_id, messages }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => '');
      console.error(`[chat-completion] LLM error ${llmRes.status}:`, errText);
      const errMsg = `LLM provider error HTTP ${llmRes.status}`;
      if (execIds) await finishExecution(svc, execIds, { status: 'failed', finishedAt: new Date(), startedAt: execStartedAt, tokensInput: null, tokensOutput: null, output: null, error: errMsg });
      return errRes(`LLM provider returned an error (HTTP ${llmRes.status})`, 502);
    }

    const llmJson = await llmRes.json().catch(() => null);
    const content = llmJson?.choices?.[0]?.message?.content ?? null;
    if (!content) {
      console.error('[chat-completion] Unexpected LLM response:', JSON.stringify(llmJson));
      if (execIds) await finishExecution(svc, execIds, { status: 'failed', finishedAt: new Date(), startedAt: execStartedAt, tokensInput: null, tokensOutput: null, output: null, error: 'LLM returned unexpected response format' });
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
        if (execIds) await finishExecution(svc, execIds, { status: 'failed', finishedAt: new Date(), startedAt: execStartedAt, tokensInput: null, tokensOutput: null, output: null, error: 'Conversation reached 200-message limit' });
        return errRes('Conversation reached the 200-message limit.', 400);
      }
      console.error('[chat-completion] Failed to persist assistant message:', insertErr.message);
      if (execIds) await finishExecution(svc, execIds, { status: 'failed', finishedAt: new Date(), startedAt: execStartedAt, tokensInput: null, tokensOutput: null, output: null, error: 'Failed to save assistant response' });
      return errRes('Failed to save assistant response', 500);
    }

    // ── Finalizar execução como completed ─────────────────────────────────────
    // usage vem do body da resposta LLM: { prompt_tokens, completion_tokens, total_tokens }
    const usage = llmJson?.usage as Record<string, number> | undefined;
    if (execIds) {
      await finishExecution(svc, execIds, {
        status:       'completed',
        finishedAt:   new Date(),
        startedAt:    execStartedAt,
        tokensInput:  typeof usage?.prompt_tokens     === 'number' ? usage.prompt_tokens     : null,
        tokensOutput: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
        output:       { content },
        error:        null,
      });
    }

    console.log('[chat-completion] done — exec:', execIds?.executionId ?? 'not tracked');
    return jsonRes({ content });

  } catch (err) {
    console.error('[chat-completion] Unhandled error:', err);
    return errRes('Internal server error', 500);
  }
});
