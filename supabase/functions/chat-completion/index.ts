// ─── chat-completion/index.ts ─────────────────────────────────────────────────
// Edge Function: recebe mensagem do frontend, chama LLM via OpenRouter,
// persiste a resposta como role='assistant' com service role.
//
// Env vars necessárias (supabase secrets set / .env.local):
//   SUPABASE_URL              — automático no runtime Supabase
//   SUPABASE_SERVICE_ROLE_KEY — automático no runtime Supabase
//   SUPABASE_ANON_KEY         — automático no runtime Supabase
//   <secret_ref>              — nome do secret definido em ai_integrations.secret_ref
//                               ex: OPENROUTER_API_KEY=sk-or-...
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400',
};

const MAX_CONTEXT_MESSAGES = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorRes('Missing authorization header', 401);

    const supabaseUrl            = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey         = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey                = Deno.env.get('SUPABASE_ANON_KEY')!;

    // User client — verifies JWT and respects RLS
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return errorRes('Unauthorized', 401);

    // Service role client — for privileged reads and assistant INSERT
    const svc = createClient(supabaseUrl, serviceRoleKey);

    // ── Body ────────────────────────────────────────────────────────────────
    const { conversation_id, agent_id, workspace_id } = await req.json();
    if (!conversation_id || !agent_id || !workspace_id) {
      return errorRes('Missing required fields: conversation_id, agent_id, workspace_id', 400);
    }

    // ── Verify user belongs to workspace ────────────────────────────────────
    const { data: member } = await svc
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) return errorRes('Forbidden', 403);

    // ── Fetch agent ──────────────────────────────────────────────────────────
    const { data: agent, error: agentErr } = await svc
      .from('agents')
      .select('model_id, system_prompt')
      .eq('id', agent_id)
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .single();
    if (agentErr || !agent) return errorRes('Agent not found', 404);

    // ── Fetch active integration for workspace ───────────────────────────────
    const { data: integration, error: intErr } = await svc
      .from('ai_integrations')
      .select('secret_ref, ai_providers(base_url)')
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intErr || !integration) {
      return errorRes('No active integration found for this workspace. Add one in Integrations.', 422);
    }

    const secretRef = integration.secret_ref;
    if (!secretRef) return errorRes('Integration has no secret_ref configured.', 422);

    const apiKey = Deno.env.get(secretRef);
    if (!apiKey) return errorRes(`Secret "${secretRef}" not found in environment.`, 500);

    const provider  = integration.ai_providers as { base_url: string | null };
    const baseUrl   = provider?.base_url ?? 'https://openrouter.ai/api/v1';
    const modelId   = agent.model_id ?? 'openai/gpt-4o-mini';

    // ── Fetch conversation history ───────────────────────────────────────────
    const { data: history } = await svc
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_MESSAGES);

    const messages = [
      ...(agent.system_prompt
        ? [{ role: 'system', content: agent.system_prompt }]
        : []),
      ...(history ?? []).reverse(),
    ];

    // ── Call LLM (OpenAI-compatible) ─────────────────────────────────────────
    const llmRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':  supabaseUrl,
        'X-Title':       'Orbit',
      },
      body: JSON.stringify({ model: modelId, messages }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      console.error('LLM error:', llmRes.status, errText);
      return errorRes(`LLM call failed: ${llmRes.status}`, 502);
    }

    const llmJson  = await llmRes.json();
    const content  = llmJson.choices?.[0]?.message?.content;
    if (!content) return errorRes('Empty response from LLM', 502);

    // ── Persist assistant message (service role — bypasses RLS) ─────────────
    const { error: insertErr } = await svc.from('messages').insert({
      conversation_id,
      workspace_id,
      role:    'assistant',
      content,
    });
    if (insertErr) {
      console.error('Insert assistant message error:', insertErr);
      return errorRes('Failed to persist assistant message', 500);
    }

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('Unhandled error:', err);
    return errorRes('Internal server error', 500);
  }
});

function errorRes(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
}
