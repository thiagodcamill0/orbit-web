// ─── dev-tools.js ─────────────────────────────────────────────────────────────
// Utilitários de desenvolvimento — NÃO incluir em produção.
// Carregue este script manualmente pelo console ou temporariamente no HTML.
//
// Pré-requisitos: db (supabase-client.js) e OrbitSession (auth-guard.js) devem
// estar disponíveis globalmente na aba atual.
// ──────────────────────────────────────────────────────────────────────────────

window.OrbitDev = {

  // Limpa todos os agentes do workspace atual (soft-delete via deleted_at).
  // Uso: OrbitDev.clearAgents()
  async clearAgents() {
    const workspaceId = OrbitSession?.workspaceId;
    if (!workspaceId) { console.error('OrbitSession não está pronta.'); return; }

    const confirmed = window.confirm(
      `Remover TODOS os agentes do workspace ${workspaceId}?\nEsta ação usa soft-delete (deleted_at).`
    );
    if (!confirmed) return;

    const { error, count } = await db
      .from('agents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .select('id', { count: 'exact', head: true });

    if (error) { console.error('Erro ao limpar agentes:', error); return; }
    console.log(`✓ Agentes removidos do workspace ${workspaceId}.`);
    window.location.reload();
  },

  // Lista os agentes ativos do workspace atual (sem deleted_at).
  // Uso: OrbitDev.listAgents()
  async listAgents() {
    const workspaceId = OrbitSession?.workspaceId;
    if (!workspaceId) { console.error('OrbitSession não está pronta.'); return; }

    const { data, error } = await db
      .from('agents')
      .select('id, name, model_id, x, y, parent_agent_id, created_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at');

    if (error) { console.error(error); return; }
    console.table(data);
    return data;
  },

};

console.log('%c[OrbitDev] Dev tools carregados. Use OrbitDev.clearAgents() ou OrbitDev.listAgents()', 'color:#818cf8');
