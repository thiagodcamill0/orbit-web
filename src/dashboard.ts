// ─── Dashboard ────────────────────────────────────────────────────────────────
export {};

interface Agent {
  id: string;
  name: string;
  model: string;
  status: 'active' | 'idle' | 'inactive';
  prompt: string;
  emoji: string;
  iconClass: string;
  calls: number;
  createdAt: Date;
}

type ViewMode = 'grid' | 'list';
type FilterMode = 'all' | 'active' | 'idle' | 'inactive';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  agents: [] as Agent[],
  view: 'grid' as ViewMode,
  filter: 'all' as FilterMode,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadAgentsFromStorage();
  bindNav();
  bindTopbar();
  bindFilters();
  bindViewToggle();
  bindModal();
  render();
});

// ─── Storage ──────────────────────────────────────────────────────────────────

function loadAgentsFromStorage(): void {
  try {
    const raw = localStorage.getItem('agenthub_agents');
    if (raw) state.agents = JSON.parse(raw);
  } catch {
    state.agents = [];
  }
}

function saveAgentsToStorage(): void {
  localStorage.setItem('agenthub_agents', JSON.stringify(state.agents));
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render(): void {
  renderStats();
  renderAgents();
  updateBadge();
}

function renderStats(): void {
  const total    = state.agents.length;
  const active   = state.agents.filter(a => a.status === 'active').length;
  const inactive = state.agents.filter(a => a.status === 'inactive').length;
  const models   = new Set(state.agents.map(a => a.model)).size;

  setText('statTotal',    total.toString());
  setText('statActive',   active.toString());
  setText('statInactive', inactive.toString());
  setText('statModels',   models.toString());
}

function renderAgents(): void {
  const container = document.getElementById('agentContainer')!;
  const filtered  = filterAgents();

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

function filterAgents(): Agent[] {
  if (state.filter === 'all') return state.agents;
  return state.agents.filter(a => a.status === state.filter);
}

function updateBadge(): void {
  const badge = document.getElementById('agentCount');
  if (badge) badge.textContent = state.agents.length.toString();
}

// ─── HTML Templates ───────────────────────────────────────────────────────────

function agentCardHTML(agent: Agent): string {
  const statusLabel = { active: 'Ativo', idle: 'Em espera', inactive: 'Inativo' }[agent.status];
  const modelShort  = agent.model.split('/').pop() ?? agent.model;

  return `
    <div class="agent-card" data-id="${agent.id}">
      <div class="agent-card-top">
        <div class="agent-icon ${agent.iconClass}">${agent.emoji}</div>
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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${agent.calls}
        </div>
        <div class="agent-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          ${timeAgo(new Date(agent.createdAt))}
        </div>
        <div class="agent-card-actions">
          <button class="icon-btn" data-action="edit" data-id="${agent.id}" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="delete" data-id="${agent.id}" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function agentRowHTML(agent: Agent): string {
  const statusLabel = { active: 'Ativo', idle: 'Em espera', inactive: 'Inativo' }[agent.status];
  const modelShort  = agent.model.split('/').pop() ?? agent.model;

  return `
    <div class="agent-row" data-id="${agent.id}">
      <div class="agent-icon ${agent.iconClass}">${agent.emoji}</div>
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
          <span class="agent-row-stat-val">${agent.calls}</span>
          <span class="agent-row-stat-label">chamadas</span>
        </div>
        <div class="agent-row-stat">
          <span class="agent-row-stat-val">${timeAgo(new Date(agent.createdAt))}</span>
          <span class="agent-row-stat-label">criado</span>
        </div>
      </div>
      <div class="agent-card-actions">
        <button class="icon-btn" data-action="edit" data-id="${agent.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn" data-action="delete" data-id="${agent.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function emptyStateHTML(): string {
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

function bindNav(): void {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function bindTopbar(): void {
  document.getElementById('newAgentBtn')?.addEventListener('click', openModal);
}

function bindFilters(): void {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.getAttribute('data-filter') as FilterMode;
      renderAgents();
    });
  });
}

function bindViewToggle(): void {
  document.getElementById('gridView')?.addEventListener('click', () => {
    state.view = 'grid';
    document.getElementById('gridView')?.classList.add('active');
    document.getElementById('listView')?.classList.remove('active');
    renderAgents();
  });

  document.getElementById('listView')?.addEventListener('click', () => {
    state.view = 'list';
    document.getElementById('listView')?.classList.add('active');
    document.getElementById('gridView')?.classList.remove('active');
    renderAgents();
  });
}

function bindModal(): void {
  document.getElementById('closeModal')?.addEventListener('click', closeModal);
  document.getElementById('cancelBtn')?.addEventListener('click', closeModal);
  document.getElementById('createAgentBtn')?.addEventListener('click', createAgent);

  document.getElementById('newAgentModal')?.addEventListener('click', (e) => {
    if ((e.target as Element).id === 'newAgentModal') closeModal();
  });
}

function bindAgentActions(): void {
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.id!;
      state.agents = state.agents.filter(a => a.id !== id);
      saveAgentsToStorage();
      render();
    });
  });

  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Edit flow — to be expanded
    });
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(): void {
  document.getElementById('newAgentModal')?.classList.add('open');
}

function closeModal(): void {
  document.getElementById('newAgentModal')?.classList.remove('open');
  resetForm();
}

function resetForm(): void {
  (document.getElementById('agentName') as HTMLInputElement).value = '';
  (document.getElementById('agentPrompt') as HTMLTextAreaElement).value = '';
  (document.getElementById('agentModel') as HTMLSelectElement).selectedIndex = 0;
  (document.getElementById('agentStatus') as HTMLSelectElement).selectedIndex = 0;
}

function createAgent(): void {
  const name   = (document.getElementById('agentName') as HTMLInputElement).value.trim();
  const model  = (document.getElementById('agentModel') as HTMLSelectElement).value;
  const prompt = (document.getElementById('agentPrompt') as HTMLTextAreaElement).value.trim();
  const status = (document.getElementById('agentStatus') as HTMLSelectElement).value as Agent['status'];

  if (!name) return;

  const icons = [
    { emoji: '🤖', cls: 'agent-icon-indigo' },
    { emoji: '⚡', cls: 'agent-icon-violet' },
    { emoji: '🔮', cls: 'agent-icon-cyan'   },
    { emoji: '🧠', cls: 'agent-icon-rose'   },
    { emoji: '🛠️', cls: 'agent-icon-amber'  },
    { emoji: '✨', cls: 'agent-icon-emerald' },
  ];
  const icon = icons[state.agents.length % icons.length];

  const agent: Agent = {
    id:        crypto.randomUUID(),
    name,
    model,
    status,
    prompt,
    emoji:     icon.emoji,
    iconClass: icon.cls,
    calls:     0,
    createdAt: new Date(),
  };

  state.agents.unshift(agent);
  saveAgentsToStorage();
  closeModal();
  render();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'agora';
  if (mins < 60)  return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}
