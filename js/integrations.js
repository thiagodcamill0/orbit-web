/* ─── Catalog (tipos disponíveis) ──────────────── */

const CATALOG = [
  {
    id: 'openai',
    name: 'OpenAI',
    initials: 'OA',
    category: 'AI / LLM',
    desc: 'Acesso a modelos GPT-4, DALL-E e Whisper via API',
    fields: [
      { key: 'apiKey', label: 'API Key',         type: 'password', placeholder: 'sk-...' },
      { key: 'orgId',  label: 'Organization ID', type: 'text',     placeholder: 'org-...', optional: true },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    initials: 'AN',
    category: 'AI / LLM',
    desc: 'Modelos Claude Opus, Sonnet e Haiku',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-ant-...' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    initials: 'SL',
    category: 'Comunicação',
    desc: 'Envie mensagens e notificações para canais do Slack',
    fields: [
      { key: 'botToken',      label: 'Bot Token',      type: 'password', placeholder: 'xoxb-...' },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', placeholder: '...' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    initials: 'GH',
    category: 'Desenvolvimento',
    desc: 'Acesso a repositórios, issues e pull requests',
    fields: [
      { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...' },
      { key: 'org',   label: 'Organização',           type: 'text',     placeholder: 'my-org', optional: true },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    initials: 'NT',
    category: 'Produtividade',
    desc: 'Leia e escreva em páginas e databases do Notion',
    fields: [
      { key: 'token',      label: 'Integration Token', type: 'password', placeholder: 'secret_...' },
      { key: 'databaseId', label: 'Database ID',       type: 'text',     placeholder: 'UUID', optional: true },
    ],
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    initials: 'GS',
    category: 'Produtividade',
    desc: 'Leia e escreva em planilhas do Google Sheets',
    fields: [
      { key: 'serviceAccount', label: 'Service Account JSON', type: 'textarea', placeholder: '{"type": "service_account", ...}' },
    ],
  },
];

const AGENTS = [
  { id: 'a1', name: 'Suporte',  model: 'gpt-4o',            initials: 'S' },
  { id: 'a2', name: 'Analista', model: 'claude-3-5-sonnet', initials: 'A' },
  { id: 'a3', name: 'Escritor', model: 'gpt-4o-mini',       initials: 'E' },
  { id: 'a4', name: 'Dev Bot',  model: 'deepseek-r1',       initials: 'D' },
];

/* ─── State ────────────────────────────────────── */

const state = {
  integrations: [],       // vazio — só aparece após conexão real
  filter: 'all',
  search: '',
  panelId: null,
  activeTab: 'info',
  configTargetId: null,
  catalogSelected: null,
  confirmCallback: null,
};

/* ─── Helpers ──────────────────────────────────── */

const getCatalog = id => CATALOG.find(c => c.id === id);
const getInt     = id => state.integrations.find(i => i.id === id);

function relativeTime(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 60000)    return 'agora mesmo';
  if (d < 3600000)  return `${Math.floor(d / 60000)}min atrás`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h atrás`;
  return `${Math.floor(d / 86400000)}d atrás`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(s) {
  return { connected: 'Conectado', error: 'Erro', disconnected: 'Desconectado' }[s] ?? s;
}

function maskKey(v) {
  if (!v) return '—';
  if (v.length <= 8) return '•'.repeat(v.length);
  return v.slice(0, 4) + '••••••••' + v.slice(-4);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── Toast ────────────────────────────────────── */

function toast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    loading: `<svg class="toast-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>`,
  };

  el.innerHTML = `${icons[type] ?? icons.loading}<span class="toast-msg">${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);

  if (duration > 0) {
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 200);
    }, duration);
  }
  return () => el.remove();
}

function toastLoading(msg) { return toast(msg, 'loading', 0); }

/* ─── Render Stats ─────────────────────────────── */

function renderStats() {
  const ints = state.integrations;
  const connected    = ints.filter(i => i.status === 'connected').length;
  const error        = ints.filter(i => i.status === 'error').length;
  const disconnected = ints.filter(i => i.status === 'disconnected').length;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Total</span>
      <div class="stat-body">
        <div class="stat-value">${ints.length}</div>
        <div class="stat-icon-block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
      </div>
    </div>
    <div class="stat-card">
      <span class="stat-label">Conectadas</span>
      <div class="stat-body">
        <div class="stat-value" style="color:#4ade80">${connected}</div>
        <div class="stat-icon-block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg></div>
      </div>
    </div>
    <div class="stat-card">
      <span class="stat-label">Com erro</span>
      <div class="stat-body">
        <div class="stat-value" style="color:#f87171">${error}</div>
        <div class="stat-icon-block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      </div>
    </div>
    <div class="stat-card">
      <span class="stat-label">Desconectadas</span>
      <div class="stat-body">
        <div class="stat-value" style="color:var(--text-muted)">${disconnected}</div>
        <div class="stat-icon-block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg></div>
      </div>
    </div>
  `;
}

/* ─── Render Row ───────────────────────────────── */

function renderRow(intData) {
  const cat = getCatalog(intData.id);
  if (!cat) return '';

  const statusClass = `int-status-${intData.status}`;

  let toggleClass, toggleText, toggleIcon;
  if (intData.status === 'connected') {
    toggleClass = 'int-connect-btn-disconnect';
    toggleText  = 'Desconectar';
    toggleIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg>`;
  } else if (intData.status === 'error') {
    toggleClass = 'int-connect-btn-retry';
    toggleText  = 'Reconectar';
    toggleIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
  } else {
    toggleClass = 'int-connect-btn-connect';
    toggleText  = 'Conectar';
    toggleIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  }

  const panelOpen = state.panelId === intData.id ? 'panel-open' : '';

  return `
    <div class="int-row ${panelOpen}" data-id="${intData.id}">
      <div class="int-row-icon">${cat.initials}</div>
      <div class="int-row-info">
        <div class="int-row-name">${cat.name}</div>
        <div class="int-row-cat">${cat.category}</div>
      </div>
      <div class="int-status ${statusClass}">
        <div class="int-status-dot"></div>
        ${statusLabel(intData.status)}
      </div>
      <div class="int-row-sync">${relativeTime(intData.lastSync)}</div>
      <div class="int-row-actions" onclick="event.stopPropagation()">
        <button class="int-connect-btn ${toggleClass}" data-id="${intData.id}" data-action="toggle">
          ${toggleIcon}${toggleText}
        </button>
        <button class="icon-btn" title="Configurar" data-id="${intData.id}" data-action="config">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/* ─── Render List ──────────────────────────────── */

function renderList() {
  const container = document.getElementById('intList');
  const filtered = state.integrations.filter(i => {
    const cat = getCatalog(i.id);
    if (!cat) return false;
    if (state.filter !== 'all' && i.status !== state.filter) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      if (!cat.name.toLowerCase().includes(q) && !cat.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (state.integrations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <div class="empty-title">Nenhuma integração</div>
        <div class="empty-desc">Clique em "Adicionar" para conectar um serviço externo.</div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <div class="empty-title">Nenhum resultado</div>
        <div class="empty-desc">Tente outro filtro ou termo de busca.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="int-list">${filtered.map(renderRow).join('')}</div>`;
}

function render() {
  renderStats();
  renderList();
  if (state.panelId) renderPanelContent(state.panelId);
}

/* ─── Panel ────────────────────────────────────── */

function openPanel(id) {
  state.panelId = id;
  state.activeTab = 'info';

  const cat     = getCatalog(id);
  const intData = getInt(id);

  document.getElementById('panelIcon').textContent    = cat.initials;
  document.getElementById('panelName').textContent    = cat.name;
  document.getElementById('panelStatus').textContent  = statusLabel(intData.status);

  document.querySelectorAll('.int-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.int-tab-btn[data-tab="info"]').classList.add('active');
  document.querySelectorAll('.int-tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-info').classList.add('active');

  renderPanelContent(id);
  document.getElementById('intPanel').classList.add('open');
  renderList(); // highlight the open row
}

function closePanel() {
  const prev = state.panelId;
  state.panelId = null;
  document.getElementById('intPanel').classList.remove('open');
  if (prev) renderList();
}

function renderPanelContent(id) {
  renderTabInfo(id);
  renderTabLogs(id);
  renderTabAgents(id);
}

function renderTabInfo(id) {
  const cat     = getCatalog(id);
  const intData = getInt(id);

  const configRows = cat.fields.map(f => `
    <div class="info-row">
      <span class="info-label">${f.label}</span>
      <span class="info-value ${f.type === 'password' ? 'masked' : 'plain'}">${
        f.type === 'password' ? maskKey(intData.config[f.key]) : (intData.config[f.key] || '—')
      }</span>
    </div>
  `).join('');

  document.getElementById('tab-info').innerHTML = `
    <div class="info-section">
      <div class="info-section-label">Status</div>
      <div class="info-row">
        <span class="info-label">Estado</span>
        <span class="int-status int-status-${intData.status}" style="display:inline-flex;justify-content:flex-end">
          <span class="int-status-dot"></span>${statusLabel(intData.status)}
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Conectado em</span>
        <span class="info-value plain">${formatTime(intData.connectedAt)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Último sync</span>
        <span class="info-value plain">${relativeTime(intData.lastSync)}</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-section-label">Configuração</div>
      ${configRows}
    </div>
    <div class="info-section">
      <div class="info-section-label">Agentes vinculados</div>
      <div class="info-row">
        <span class="info-value plain" style="text-align:left">${
          intData.linkedAgents.length
            ? intData.linkedAgents.map(aid => AGENTS.find(a => a.id === aid)?.name ?? aid).join(', ')
            : '—'
        }</span>
      </div>
    </div>
  `;
}

function renderTabLogs(id) {
  const intData = getInt(id);
  const pane    = document.getElementById('tab-logs');

  if (!intData.logs.length) {
    pane.innerHTML = `<div class="log-empty">Nenhum log disponível</div>`;
    return;
  }

  const sorted = [...intData.logs].sort((a, b) => b.time - a.time);
  pane.innerHTML = `<div class="log-list">${sorted.map(l => `
    <div class="log-entry">
      <div class="log-dot log-dot-${l.level}"></div>
      <div class="log-content">
        <div class="log-msg">${l.msg}</div>
        <div class="log-time">${formatTime(l.time)}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

function renderTabAgents(id) {
  const intData = getInt(id);
  document.getElementById('tab-agents').innerHTML = `
    <div class="agent-link-list">${AGENTS.map(agent => {
      const linked = intData.linkedAgents.includes(agent.id);
      return `
        <div class="agent-link-row">
          <div class="agent-link-avatar">${agent.initials}</div>
          <div class="agent-link-info">
            <div class="agent-link-name">${agent.name}</div>
            <div class="agent-link-model">${agent.model}</div>
          </div>
          <button class="agent-link-toggle ${linked ? 'agent-link-toggle-linked' : 'agent-link-toggle-unlinked'}"
            data-intid="${id}" data-agentid="${agent.id}">
            ${linked ? 'Vinculado' : 'Vincular'}
          </button>
        </div>
      `;
    }).join('')}</div>
  `;
}

/* ─── Connect / Disconnect ─────────────────────── */

async function toggleConnect(id) {
  const intData = getInt(id);
  if (!intData) return;

  const btn = document.querySelector(`.int-connect-btn[data-id="${id}"]`);

  if (intData.status === 'connected') {
    if (btn) {
      btn.className = 'int-connect-btn int-connect-btn-loading';
      btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Desconectando...`;
    }
    await wait(1200);
    intData.status  = 'disconnected';
    intData.lastSync = Date.now();
    intData.logs.push({ time: Date.now(), level: 'info', msg: 'Desconectado manualmente' });
    toast(`${getCatalog(id).name} desconectado`, 'warning');
  } else {
    const cat = getCatalog(id);
    const hasConfig = cat.fields.some(f => intData.config[f.key]);
    if (!hasConfig) { openConfigModal(id); return; }

    if (btn) {
      btn.className = 'int-connect-btn int-connect-btn-loading';
      btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Conectando...`;
    }
    await wait(1800);
    intData.status       = 'connected';
    intData.connectedAt  = Date.now();
    intData.lastSync     = Date.now();
    intData.logs.push({ time: Date.now(), level: 'success', msg: 'Conexão estabelecida com sucesso' });
    toast(`${cat.name} conectado`, 'success');
  }

  render();
  if (state.panelId === id) {
    document.getElementById('panelStatus').textContent = statusLabel(intData.status);
  }
}

/* ─── Test Connection ──────────────────────────── */

async function testConnection(id) {
  const intData = getInt(id);
  const cat     = getCatalog(id);

  if (!intData || intData.status !== 'connected') {
    toast('A integração precisa estar conectada para testar', 'warning');
    return;
  }

  const dismiss = toastLoading(`Testando conexão com ${cat.name}...`);
  const btn = document.getElementById('panelTestBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Testando...`;
  }

  await wait(2000);
  dismiss();

  const ok = Math.random() > 0.25;
  intData.logs.push({
    time: Date.now(),
    level: ok ? 'success' : 'error',
    msg: ok ? 'Teste de conexão bem-sucedido' : 'Falha no teste de conexão',
  });
  if (ok) {
    intData.lastSync = Date.now();
    toast(`${cat.name}: conexão OK`, 'success');
  } else {
    toast(`${cat.name}: falha no teste`, 'error');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Testar`;
  }

  renderTabLogs(id);
  renderTabInfo(id);
  renderList();
}

/* ─── Config Modal ─────────────────────────────── */

function openConfigModal(id) {
  state.configTargetId = id;
  const cat     = getCatalog(id);
  const intData = getInt(id);

  document.getElementById('configModalTitle').textContent = `Configurar · ${cat.name}`;

  document.getElementById('configForm').innerHTML = cat.fields.map(f => {
    const val = intData?.config[f.key] ?? '';
    const opt = f.optional ? `<span class="form-label-opt">(opcional)</span>` : '';

    if (f.type === 'textarea') {
      return `<div class="form-group">
        <label class="form-label">${f.label}${opt}</label>
        <textarea class="form-textarea-config" data-key="${f.key}" placeholder="${f.placeholder}" rows="4">${val}</textarea>
      </div>`;
    }
    if (f.type === 'password') {
      return `<div class="form-group">
        <label class="form-label">${f.label}${opt}</label>
        <div class="form-input-password-wrap">
          <input class="form-input" type="password" data-key="${f.key}" placeholder="${f.placeholder}" value="${val}" autocomplete="off" />
          <button type="button" class="form-input-eye" onclick="toggleEye(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>`;
    }
    return `<div class="form-group">
      <label class="form-label">${f.label}${opt}</label>
      <input class="form-input" type="text" data-key="${f.key}" placeholder="${f.placeholder}" value="${val}" />
    </div>`;
  }).join('');

  openModal('configModal');
}

window.toggleEye = btn => {
  const input = btn.previousElementSibling;
  input.type = input.type === 'password' ? 'text' : 'password';
};

function saveConfig() {
  const id      = state.configTargetId;
  if (!id) return;
  const intData = getInt(id);
  document.querySelectorAll('#configForm [data-key]').forEach(el => {
    intData.config[el.dataset.key] = el.value.trim();
  });
  closeModal('configModal');
  toast(`Configuração de ${getCatalog(id).name} salva`, 'success');
  render();
}

/* ─── Remove ───────────────────────────────────── */

function confirmRemove(id) {
  const cat = getCatalog(id);
  document.getElementById('confirmTitle').textContent = `Remover ${cat.name}?`;
  document.getElementById('confirmDesc').textContent  =
    `A integração com ${cat.name} será removida e todos os agentes vinculados serão desvinculados.`;

  state.confirmCallback = () => {
    state.integrations = state.integrations.filter(i => i.id !== id);
    if (state.panelId === id) closePanel();
    closeModal('confirmModal');
    toast(`${cat.name} removido`, 'warning');
    render();
  };

  openModal('confirmModal');
}

/* ─── Agent Toggle ─────────────────────────────── */

function toggleAgent(intId, agentId) {
  const intData = getInt(intId);
  const agent   = AGENTS.find(a => a.id === agentId);
  if (!intData || !agent) return;

  const idx = intData.linkedAgents.indexOf(agentId);
  if (idx === -1) {
    intData.linkedAgents.push(agentId);
    toast(`${agent.name} vinculado`, 'success');
  } else {
    intData.linkedAgents.splice(idx, 1);
    toast(`${agent.name} desvinculado`, 'warning');
  }
  renderTabAgents(intId);
  renderTabInfo(intId);
}

/* ─── Catalog Modal ────────────────────────────── */

function openCatalog() {
  state.catalogSelected = null;
  document.getElementById('catalogNextBtn').disabled = true;

  const existing = new Set(state.integrations.map(i => i.id));
  document.getElementById('catalogGrid').innerHTML = CATALOG.map(c => {
    const already = existing.has(c.id);
    return `
      <button class="catalog-item${already ? ' selected' : ''}" data-catalog-id="${c.id}" ${already ? 'disabled' : ''}>
        <div class="catalog-item-icon">${c.initials}</div>
        <div class="catalog-item-name">${c.name}</div>
        <div class="catalog-item-cat">${already ? 'Já adicionado' : c.category}</div>
      </button>
    `;
  }).join('');

  openModal('catalogModal');
}

/* ─── Modal helpers ────────────────────────────── */

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ─── Events ───────────────────────────────────── */

document.addEventListener('click', e => {
  const closeTarget = e.target.closest('[data-close]');
  if (closeTarget) { closeModal(closeTarget.dataset.close); return; }

  // Card action buttons (stop propagation via inline, but handle here too)
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    const { id, action } = actionBtn.dataset;
    if (action === 'toggle') toggleConnect(id);
    if (action === 'config') openConfigModal(id);
    return;
  }

  // Click on row → open panel
  const row = e.target.closest('.int-row');
  if (row) { openPanel(row.dataset.id); return; }

  // Close panel
  if (e.target.closest('#closePanelBtn')) { closePanel(); return; }

  // Panel tabs
  const tabBtn = e.target.closest('.int-tab-btn');
  if (tabBtn) {
    document.querySelectorAll('.int-tab-btn').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
    document.querySelectorAll('.int-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add('active');
    return;
  }

  // Panel footer buttons
  if (e.target.closest('#panelConfigBtn')  && state.panelId) { openConfigModal(state.panelId); return; }
  if (e.target.closest('#panelTestBtn')    && state.panelId) { testConnection(state.panelId); return; }
  if (e.target.closest('#panelRemoveBtn')  && state.panelId) { confirmRemove(state.panelId); return; }

  // Agent link toggle
  const agentToggle = e.target.closest('.agent-link-toggle');
  if (agentToggle) { toggleAgent(agentToggle.dataset.intid, agentToggle.dataset.agentid); return; }

  // Save config
  if (e.target.closest('#saveConfigBtn')) { saveConfig(); return; }

  // Confirm ok
  if (e.target.closest('#confirmOkBtn') && state.confirmCallback) {
    state.confirmCallback();
    state.confirmCallback = null;
    return;
  }

  // Catalog item
  const catalogItem = e.target.closest('.catalog-item:not([disabled])');
  if (catalogItem) {
    document.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('selected'));
    catalogItem.classList.add('selected');
    state.catalogSelected = catalogItem.dataset.catalogId;
    document.getElementById('catalogNextBtn').disabled = false;
    return;
  }

  // Catalog next
  if (e.target.closest('#catalogNextBtn') && state.catalogSelected) {
    closeModal('catalogModal');
    if (!getInt(state.catalogSelected)) {
      const emptyConfig = {};
      getCatalog(state.catalogSelected).fields.forEach(f => { emptyConfig[f.key] = ''; });
      state.integrations.push({
        id: state.catalogSelected,
        status: 'disconnected',
        config: emptyConfig,
        connectedAt: null,
        lastSync: null,
        linkedAgents: [],
        logs: [],
      });
      render();
    }
    openConfigModal(state.catalogSelected);
    return;
  }

  // Add button
  if (e.target.closest('#addIntBtn')) { openCatalog(); return; }

  // Filter chips
  const chip = e.target.closest('.filter-chip');
  if (chip) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.filter = chip.dataset.filter;
    renderList();
    return;
  }

  // Close modal overlay click
  const overlay = e.target.closest('.modal-overlay');
  if (overlay && e.target === overlay) { overlay.classList.remove('open'); return; }
});

document.getElementById('searchInput').addEventListener('input', e => {
  state.search = e.target.value.trim();
  renderList();
});

/* ─── Init ─────────────────────────────────────── */

render();
