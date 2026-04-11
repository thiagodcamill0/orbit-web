// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  agents: [],   // each agent: DB fields + { status } from localStorage
  view: localStorage.getItem('orbit_agents_view') ?? 'grid',
  filter: 'all',
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('orbitSessionReady', async () => {
  const dismiss = toastLoading('Carregando agentes...');
  await loadAgents();
  dismiss();
  bindFilters();
  bindViewToggle();
  render();
  if (state.view === 'list') {
    document.getElementById('listView')?.classList.add('active');
    document.getElementById('gridView')?.classList.remove('active');
  }
});

// ─── Status (localStorage) ────────────────────────────────────────────────────
// Status is not stored in the DB — it lives in localStorage, keyed by agent ID.
// This keeps the schema stable while allowing filter/stat functionality in the UI.

function getStatusMap() {
  try { return JSON.parse(localStorage.getItem('orbit_agent_status') ?? '{}'); }
  catch { return {}; }
}

function saveStatus(id, status) {
  const map = getStatusMap();
  map[id] = status;
  localStorage.setItem('orbit_agent_status', JSON.stringify(map));
}

function removeStatus(id) {
  const map = getStatusMap();
  delete map[id];
  localStorage.setItem('orbit_agent_status', JSON.stringify(map));
}

function enrichWithStatus(agents) {
  const map = getStatusMap();
  return agents.map(a => ({ ...a, status: map[a.id] ?? 'inactive' }));
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
async function loadAgents() {
  const { data, error } = await db
    .from('agents')
    .select('id, name, model_id, system_prompt, description, created_at')
    .eq('workspace_id', OrbitSession.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    toast('Erro ao carregar agentes', 'error');
    return;
  }
  state.agents = enrichWithStatus(data ?? []);
}


// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  renderStats();
  renderAgents();
  updateBadge();
}

function renderStats() {
  const total = state.agents.length;
  const active = state.agents.filter(a => a.status === 'active').length;
  const inactive = state.agents.filter(a => a.status === 'inactive').length;
  const models = new Set(state.agents.map(a => a.model_id).filter(Boolean)).size;
  setText('statTotal', total.toString());
  setText('statActive', active.toString());
  setText('statInactive', inactive.toString());
  setText('statModels', models.toString());
}

function renderAgents() {
  const container = document.getElementById('agentContainer');
  if (!container) return;
  const filtered = filterAgents();
  if (filtered.length === 0) {
    container.innerHTML = emptyStateHTML();
    return;
  }
  if (state.view === 'grid') {
    container.className = 'agent-grid';
    container.innerHTML = filtered.map(agentCardHTML).join('');
  } else {
    container.className = 'agent-list';
    container.innerHTML = filtered.map(agentRowHTML).join('');
  }
  bindAgentActions();
}

function filterAgents() {
  if (state.filter === 'all') return state.agents;
  return state.agents.filter(a => a.status === state.filter);
}

function updateBadge() {
  const badge = document.getElementById('agentCount');
  if (badge) badge.textContent = state.agents.length.toString();
}

// ─── HTML Templates ───────────────────────────────────────────────────────────
const ICONS = [
  { emoji: '🤖', cls: 'agent-icon-indigo' },
  { emoji: '⚡', cls: 'agent-icon-violet' },
  { emoji: '🔮', cls: 'agent-icon-cyan' },
  { emoji: '🧠', cls: 'agent-icon-rose' },
  { emoji: '🛠️', cls: 'agent-icon-amber' },
  { emoji: '✨', cls: 'agent-icon-emerald' },
];

function agentIcon(id) {
  const seed = id.slice(-8).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ICONS[seed % ICONS.length];
}

function agentCardHTML(agent) {
  const statusLabel = { active: 'Ativo', idle: 'Em espera', inactive: 'Inativo' }[agent.status] ?? agent.status;
  const modelShort = (agent.model_id ?? '').split('/').pop() || '—';
  const { emoji, cls } = agentIcon(agent.id);
  return `
    <div class="agent-card" data-id="${agent.id}">
      <div class="agent-card-top">
        <div class="agent-icon ${cls}">${emoji}</div>
        <div class="agent-status status-${agent.status}">
          <span class="agent-status-dot"></span>
          ${statusLabel}
        </div>
      </div>
      <div class="agent-name">${escapeHTML(agent.name)}</div>
      <div class="agent-model">${escapeHTML(modelShort)}</div>
      <div class="agent-meta">
        <div class="agent-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          ${timeAgo(new Date(agent.created_at))}
        </div>
        <div class="agent-card-actions">
          <a class="icon-btn" href="agents.html" title="Abrir no canvas">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  `;
}

function agentRowHTML(agent) {
  const statusLabel = { active: 'Ativo', idle: 'Em espera', inactive: 'Inativo' }[agent.status] ?? agent.status;
  const modelShort = (agent.model_id ?? '').split('/').pop() || '—';
  const { emoji, cls } = agentIcon(agent.id);
  return `
    <div class="agent-row" data-id="${agent.id}">
      <div class="agent-icon ${cls}">${emoji}</div>
      <div class="agent-row-info">
        <div class="agent-row-name">${escapeHTML(agent.name)}</div>
        <div class="agent-row-model">${escapeHTML(modelShort)}</div>
      </div>
      <div class="agent-status status-${agent.status}" style="margin-right:8px">
        <span class="agent-status-dot"></span>
        ${statusLabel}
      </div>
      <div class="agent-row-meta">
        <div class="agent-row-stat">
          <span class="agent-row-stat-val">${timeAgo(new Date(agent.created_at))}</span>
          <span class="agent-row-stat-label">criado</span>
        </div>
      </div>
      <div class="agent-card-actions">
        <a class="icon-btn" href="agents.html" title="Abrir no canvas">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </a>
      </div>
    </div>
  `;
}

function emptyStateHTML() {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          <circle cx="19" cy="9" r="2.5"/>
          <path d="M21.5 14c1.5.5 2.5 1.7 2.5 3"/>
        </svg>
      </div>
      <div class="empty-title">Nenhum agente encontrado</div>
      <div class="empty-desc">Crie seu primeiro agente de IA clicando em "Novo Agente"</div>
    </div>
  `;
}

// ─── Bindings ─────────────────────────────────────────────────────────────────
function bindFilters() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.getAttribute('data-filter');
      renderAgents();
    });
  });
}

function bindViewToggle() {
  document.getElementById('gridView')?.addEventListener('click', () => {
    state.view = 'grid';
    localStorage.setItem('orbit_agents_view', 'grid');
    document.getElementById('gridView')?.classList.add('active');
    document.getElementById('listView')?.classList.remove('active');
    renderAgents();
  });
  document.getElementById('listView')?.addEventListener('click', () => {
    state.view = 'list';
    localStorage.setItem('orbit_agents_view', 'list');
    document.getElementById('listView')?.classList.add('active');
    document.getElementById('gridView')?.classList.remove('active');
    renderAgents();
  });
}

function bindAgentActions() {
  // Deletion happens exclusively on the canvas (agents.html). No delete actions here.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:9999';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  const colors = { success: '#22c55e', error: '#ef4444', info: '#6366f1', loading: '#a78bfa' };
  t.style.cssText = `background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);color:#e2e8f0;padding:10px 16px;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:8px;min-width:220px;box-shadow:0 4px 24px rgba(0,0,0,0.4);border-left:3px solid ${colors[type] ?? colors.info}`;
  t.textContent = msg;
  container.appendChild(t);
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.2s';
    setTimeout(() => t.remove(), 200);
  };
  if (duration > 0) setTimeout(dismiss, duration);
  return dismiss;
}

function toastLoading(msg) { return toast(msg, 'loading', 0); }
