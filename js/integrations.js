/**
 * integrations.js — Orbit
 *
 * Conecta integrations.html ao banco Supabase.
 *
 * Tabelas usadas:
 *   ai_providers    → catálogo global de providers (leitura)
 *   ai_integrations → integrações do workspace (CRUD + soft delete)
 *
 * Sobre secret_ref:
 *   Armazena apenas um identificador (ex: "GROK_API_KEY"), nunca a
 *   chave real. A chave real fica em variável de ambiente no backend.
 *   A UI exibe um campo para o usuário registrar esse identificador.
 *
 * Depende de: supabase-client.js (db), auth-guard.js (OrbitSession)
 */

import { getIntegrationIcon } from './integration-icons.js';

/* ─── Catálogo local de metadados de UI ──────────────────────────────────────
 * Define campos do formulário e descrição para cada provider pelo slug.
 * Mapeado contra ai_providers.slug do banco.
 */
const PROVIDER_UI = {
  openai: {
    category: 'AI / LLM',
    desc: 'Acesso a modelos GPT-4o, DALL-E e Whisper via API',
    fields: [
      { key: 'org_id', label: 'Organization ID', type: 'text', placeholder: 'org-...', optional: true },
    ],
  },
  anthropic: {
    category: 'AI / LLM',
    desc: 'Modelos Claude Opus, Sonnet e Haiku',
    fields: [],
  },
  gemini: {
    category: 'AI / LLM',
    desc: 'Modelos Gemini Pro e Flash via Google AI Studio',
    fields: [
      { key: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-project', optional: true },
    ],
  },
  grok: {
    category: 'AI / LLM',
    desc: 'Modelos Grok da xAI com acesso a dados em tempo real',
    fields: [],
  },
  openrouter: {
    category: 'AI / LLM',
    desc: 'Gateway unificado para centenas de modelos de IA via uma única API',
    fields: [
      { key: 'site_url',  label: 'Site URL',  type: 'text', placeholder: 'https://meusite.com', optional: true },
      { key: 'site_name', label: 'Site Name', type: 'text', placeholder: 'Meu App', optional: true },
    ],
  },
  slack: {
    category: 'Comunicação',
    desc: 'Envie mensagens e notificações para canais do Slack',
    fields: [
      { key: 'signing_secret', label: 'Signing Secret', type: 'password', placeholder: '...' },
    ],
  },
  github: {
    category: 'Desenvolvimento',
    desc: 'Acesso a repositórios, issues e pull requests',
    fields: [
      { key: 'org', label: 'Organização', type: 'text', placeholder: 'my-org', optional: true },
    ],
  },
  notion: {
    category: 'Produtividade',
    desc: 'Leia e escreva em páginas e databases do Notion',
    fields: [
      { key: 'database_id', label: 'Database ID', type: 'text', placeholder: 'UUID', optional: true },
    ],
  },
  'google-sheets': {
    category: 'Produtividade',
    desc: 'Leia e escreva em planilhas do Google Sheets',
    fields: [],
  },
};

/* ─── State ──────────────────────────────────────────────────────────────────
 * integrations: rows de ai_integrations com join de ai_providers
 * providers: rows de ai_providers (catálogo)
 */
const state = {
  integrations:    [],
  providers:       [],
  filter:          'all',
  search:          '',
  panelId:         null,   // UUID da integração aberta no panel
  activeTab:       'info',
  configTargetId:  null,   // UUID da integração sendo configurada
  catalogSelected: null,   // slug do provider selecionado no catálogo
  confirmCallback: null,
};

/* ─── Helpers locais ─────────────────────────────────────────────────────────*/

/** Retorna a integração pelo UUID */
const getInt = id => state.integrations.find(i => i.id === id);

/** Retorna o provider pelo slug */
const getProvider = slug => state.providers.find(p => p.slug === slug);

/** Retorna metadados de UI do provider */
const getUI = slug => PROVIDER_UI[slug] ?? { category: 'Outro', desc: '', fields: [] };

/** Status derivado: tem secret_ref preenchido = connected, senão disconnected */
function deriveStatus(integration) {
  return integration.secret_ref ? 'connected' : 'disconnected';
}

function relativeTime(ts) {
  if (!ts) return '—';
  const d = Date.now() - new Date(ts).getTime();
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

function maskRef(v) {
  if (!v) return '—';
  if (v.length <= 6) return v;
  return v.slice(0, 3) + '•••' + v.slice(-3);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── Toast ──────────────────────────────────────────────────────────────────*/

function toast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    loading: `<svg class="toast-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };
  el.innerHTML = `${icons[type] ?? icons.info}<span class="toast-msg">${msg}</span>`;
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

/* ─── Banco: carregar dados ──────────────────────────────────────────────────*/

async function loadProviders() {
  const { data, error } = await db
    .from('ai_providers')
    .select('id, name, slug, base_url')
    .order('name');

  if (error) {
    console.error('Erro ao carregar ai_providers:', error.message);
    return;
  }
  state.providers = data ?? [];
}

async function loadIntegrations() {
  const { workspaceId } = OrbitSession;

  const { data, error } = await db
    .from('ai_integrations')
    .select('id, workspace_id, provider_id, name, secret_ref, deleted_at, created_at, updated_at, ai_providers(id, name, slug, base_url)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar ai_integrations:', error.message);
    return;
  }
  state.integrations = data ?? [];
}

/* ─── Banco: criar integração ────────────────────────────────────────────────*/

async function createIntegration(providerSlug, name, secretRef) {
  const { workspaceId } = OrbitSession;
  const provider = getProvider(providerSlug);
  if (!provider) return null;

  const { data, error } = await db
    .from('ai_integrations')
    .insert({
      workspace_id: workspaceId,
      provider_id:  provider.id,
      name:         name || provider.name,
      secret_ref:   secretRef || null,
    })
    .select('id, workspace_id, provider_id, name, secret_ref, deleted_at, created_at, updated_at, ai_providers(id, name, slug, base_url)')
    .single();

  if (error) {
    console.error('Erro ao criar integração:', error.message);
    return null;
  }
  return data;
}

/* ─── Banco: atualizar integração ────────────────────────────────────────────*/

async function updateIntegration(id, fields) {
  const { error } = await db
    .from('ai_integrations')
    .update(fields)
    .eq('id', id)
    .eq('workspace_id', OrbitSession.workspaceId);

  if (error) {
    console.error('Erro ao atualizar integração:', error.message);
    return false;
  }
  return true;
}

/* ─── Banco: soft-delete ─────────────────────────────────────────────────────*/

async function softDeleteIntegration(id) {
  return updateIntegration(id, { deleted_at: new Date().toISOString() });
}

/* ─── Render Stats ───────────────────────────────────────────────────────────*/

function renderStats() {
  const ints      = state.integrations;
  const connected = ints.filter(i => deriveStatus(i) === 'connected').length;
  const total     = ints.length;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Total</span>
      <div class="stat-body">
        <div class="stat-value">${total}</div>
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
      <span class="stat-label">Desconectadas</span>
      <div class="stat-body">
        <div class="stat-value" style="color:var(--text-muted)">${total - connected}</div>
        <div class="stat-icon-block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg></div>
      </div>
    </div>
  `;
}

/* ─── Render Row ─────────────────────────────────────────────────────────────*/

function renderRow(intData) {
  const provider = intData.ai_providers;
  if (!provider) return '';

  const status      = deriveStatus(intData);
  const statusClass = `int-status-${status}`;
  const panelOpen   = state.panelId === intData.id ? 'panel-open' : '';

  const toggleClass = status === 'connected' ? 'int-connect-btn-disconnect' : 'int-connect-btn-connect';
  const toggleText  = status === 'connected' ? 'Desconectar' : 'Configurar';
  const toggleIcon  = status === 'connected'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

  return `
    <div class="int-row ${panelOpen}" data-id="${intData.id}">
      <div class="int-row-icon">${getIntegrationIcon(provider.slug, 16)}</div>
      <div class="int-row-info">
        <div class="int-row-name">${escapeHTML(intData.name)}</div>
        <div class="int-row-cat">${getUI(provider.slug).category}</div>
      </div>
      <div class="int-status ${statusClass}">
        <div class="int-status-dot"></div>
        ${statusLabel(status)}
      </div>
      <div class="int-row-sync">${relativeTime(intData.updated_at)}</div>
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

function escapeHTML(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Render List ────────────────────────────────────────────────────────────*/

function renderList() {
  const container = document.getElementById('intList');
  const filtered  = state.integrations.filter(i => {
    const provider = i.ai_providers;
    if (!provider) return false;
    if (state.filter === 'connected'    && deriveStatus(i) !== 'connected')    return false;
    if (state.filter === 'disconnected' && deriveStatus(i) !== 'disconnected') return false;
    if (state.filter === 'error')       return false; // sem status 'error' neste modelo
    if (state.search) {
      const q = state.search.toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !provider.name.toLowerCase().includes(q)) return false;
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
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
        <div class="empty-title">Nenhum resultado</div>
        <div class="empty-desc">Tente outro filtro ou termo de busca.</div>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="int-list">${filtered.map(renderRow).join('')}</div>`;
}

function render() {
  renderStats();
  renderList();
  if (state.panelId) renderPanelContent(state.panelId);
}

/* ─── Panel ──────────────────────────────────────────────────────────────────*/

function openPanel(id) {
  state.panelId  = id;
  state.activeTab = 'info';

  const intData  = getInt(id);
  const provider = intData?.ai_providers;
  if (!intData || !provider) return;

  document.getElementById('panelIcon').innerHTML      = getIntegrationIcon(provider.slug, 16);
  document.getElementById('panelName').textContent    = intData.name;
  document.getElementById('panelStatus').textContent  = statusLabel(deriveStatus(intData));

  document.querySelectorAll('.int-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.int-tab-btn[data-tab="info"]').classList.add('active');
  document.querySelectorAll('.int-tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-info').classList.add('active');

  renderPanelContent(id);
  document.getElementById('intPanel').classList.add('open');
  renderList();
}

function closePanel() {
  const prev    = state.panelId;
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
  const intData  = getInt(id);
  const provider = intData?.ai_providers;
  if (!intData || !provider) return;

  const ui = getUI(provider.slug);

  const extraFields = ui.fields.map(f => {
    // Campos extras ficam em localStorage (ephemeral), não no banco
    const val = localStorage.getItem(`orbit_int_${id}_${f.key}`) ?? '';
    return `
      <div class="info-row">
        <span class="info-label">${f.label}</span>
        <span class="info-value plain">${val || '—'}</span>
      </div>`;
  }).join('');

  document.getElementById('tab-info').innerHTML = `
    <div class="info-section">
      <div class="info-section-label">Status</div>
      <div class="info-row">
        <span class="info-label">Estado</span>
        <span class="int-status int-status-${deriveStatus(intData)}" style="display:inline-flex;justify-content:flex-end">
          <span class="int-status-dot"></span>${statusLabel(deriveStatus(intData))}
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Criado em</span>
        <span class="info-value plain">${formatTime(intData.created_at)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Atualizado</span>
        <span class="info-value plain">${relativeTime(intData.updated_at)}</span>
      </div>
    </div>
    <div class="info-section">
      <div class="info-section-label">Configuração</div>
      <div class="info-row">
        <span class="info-label">Nome</span>
        <span class="info-value plain">${escapeHTML(intData.name)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Provider</span>
        <span class="info-value plain">${escapeHTML(provider.name)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Secret Ref</span>
        <span class="info-value masked">${maskRef(intData.secret_ref)}</span>
      </div>
      ${extraFields}
    </div>
  `;
}

function renderTabLogs(id) {
  // Logs de execuções serão conectados futuramente via tabela executions.
  document.getElementById('tab-logs').innerHTML =
    `<div class="log-empty">Logs disponíveis após execuções reais.</div>`;
}

function renderTabAgents(id) {
  // Vínculo com agentes será conectado futuramente via tabela agents.
  document.getElementById('tab-agents').innerHTML =
    `<div class="log-empty">Vínculo com agentes disponível em breve.</div>`;
}

/* ─── Desconectar (limpa secret_ref no banco) ────────────────────────────────*/

async function disconnectIntegration(id) {
  const intData  = getInt(id);
  const provider = intData?.ai_providers;
  if (!intData) return;

  const btn = document.querySelector(`.int-connect-btn[data-id="${id}"]`);
  if (btn) {
    btn.className = 'int-connect-btn int-connect-btn-loading';
    btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Desconectando...`;
  }

  const ok = await updateIntegration(id, { secret_ref: null });
  if (ok) {
    intData.secret_ref = null;
    toast(`${provider?.name ?? 'Integração'} desconectada`, 'warning');
  } else {
    toast('Erro ao desconectar', 'error');
  }

  render();
  if (state.panelId === id) {
    document.getElementById('panelStatus').textContent = statusLabel(deriveStatus(intData));
  }
}

/* ─── Testar conexão ─────────────────────────────────────────────────────────
 * Por ora apenas simula — a chamada real à API do provider
 * deve ir para Edge Function quando o backend existir.
 */
async function testConnection(id) {
  const intData  = getInt(id);
  const provider = intData?.ai_providers;

  if (!intData || deriveStatus(intData) !== 'connected') {
    toast('Configure um secret_ref antes de testar', 'warning');
    return;
  }

  const dismiss = toastLoading(`Testando conexão com ${provider?.name ?? 'provider'}...`);
  const btn = document.getElementById('panelTestBtn');
  if (btn) { btn.disabled = true; }

  await wait(1500);
  dismiss();
  toast(`Teste simulado — backend necessário para teste real`, 'info');

  if (btn) { btn.disabled = false; }
}

/* ─── Config Modal ───────────────────────────────────────────────────────────*/

function openConfigModal(id) {
  state.configTargetId = id;
  const intData  = getInt(id);
  const provider = intData?.ai_providers;
  if (!intData || !provider) return;

  const ui = getUI(provider.slug);

  document.getElementById('configModalTitle').textContent = `Configurar · ${intData.name}`;

  // secret_ref: identificador da key (ex: "GROK_API_KEY"), não a key em si
  const secretRef = intData.secret_ref ?? '';

  const extraFields = ui.fields.map(f => {
    const val = localStorage.getItem(`orbit_int_${id}_${f.key}`) ?? '';
    const opt = f.optional ? `<span class="form-label-opt">(opcional)</span>` : '';
    return `<div class="form-group">
      <label class="form-label">${f.label}${opt}</label>
      <input class="form-input" type="text" data-extra-key="${f.key}" placeholder="${f.placeholder}" value="${escapeHTML(val)}" />
    </div>`;
  }).join('');

  document.getElementById('configForm').innerHTML = `
    <div class="form-group">
      <label class="form-label">Nome da integração</label>
      <input class="form-input" type="text" id="configName" placeholder="${provider.name}" value="${escapeHTML(intData.name)}" />
    </div>
    <div class="form-group">
      <label class="form-label">Secret Ref
        <span class="form-label-opt" title="Identificador da chave no backend (ex: GROK_API_KEY). A chave real nunca é armazenada aqui.">(identificador da key)</span>
      </label>
      <input class="form-input" type="text" id="configSecretRef" placeholder="NOME_DA_VARIAVEL_NO_BACKEND" value="${escapeHTML(secretRef)}" autocomplete="off" />
      <span style="font-size:11px;color:var(--text-muted);margin-top:4px;display:block;">
        Informe o nome da variável de ambiente que contém a API key no backend. Ex: <code>OPENROUTER_API_KEY</code>
      </span>
    </div>
    ${extraFields}
  `;

  openModal('configModal');
}

async function saveConfig() {
  const id = state.configTargetId;
  if (!id) return;

  const intData = getInt(id);
  if (!intData) return;

  const name      = document.getElementById('configName')?.value.trim()      || intData.name;
  const secretRef = document.getElementById('configSecretRef')?.value.trim() || null;

  // Salva campos extras em localStorage (não são críticos para o banco)
  document.querySelectorAll('#configForm [data-extra-key]').forEach(el => {
    const k = el.dataset.extraKey;
    const v = el.value.trim();
    if (v) localStorage.setItem(`orbit_int_${id}_${k}`, v);
    else   localStorage.removeItem(`orbit_int_${id}_${k}`);
  });

  const dismiss = toastLoading('Salvando...');
  const ok = await updateIntegration(id, { name, secret_ref: secretRef });
  dismiss();

  if (ok) {
    intData.name       = name;
    intData.secret_ref = secretRef;
    closeModal('configModal');
    toast(`Configuração salva`, 'success');
    render();
    if (state.panelId === id) {
      document.getElementById('panelName').textContent   = name;
      document.getElementById('panelStatus').textContent = statusLabel(deriveStatus(intData));
    }
  } else {
    toast('Erro ao salvar. Tente novamente.', 'error');
  }
}

/* ─── Remove ─────────────────────────────────────────────────────────────────*/

function confirmRemove(id) {
  const intData  = getInt(id);
  const provider = intData?.ai_providers;

  document.getElementById('confirmTitle').textContent = `Remover ${intData?.name ?? 'integração'}?`;
  document.getElementById('confirmDesc').textContent  =
    `A integração com ${provider?.name ?? 'o provider'} será removida do workspace.`;

  state.confirmCallback = async () => {
    closeModal('confirmModal');
    const dismiss = toastLoading('Removendo...');
    const ok = await softDeleteIntegration(id);
    dismiss();

    if (ok) {
      state.integrations = state.integrations.filter(i => i.id !== id);
      if (state.panelId === id) closePanel();
      toast(`Integração removida`, 'warning');
      render();
    } else {
      toast('Erro ao remover. Tente novamente.', 'error');
    }
    state.confirmCallback = null;
  };

  openModal('confirmModal');
}

/* ─── Catálogo Modal ─────────────────────────────────────────────────────────*/

function openCatalog() {
  state.catalogSelected = null;
  document.getElementById('catalogNextBtn').disabled = true;

  // providers que já têm integração ativa no workspace
  const existingSlugs = new Set(
    state.integrations.map(i => i.ai_providers?.slug).filter(Boolean)
  );

  // Mostra providers do banco + fallback para os que têm UI definida localmente
  const allSlugs = new Set([
    ...state.providers.map(p => p.slug),
    ...Object.keys(PROVIDER_UI),
  ]);

  document.getElementById('catalogGrid').innerHTML = [...allSlugs].map(slug => {
    const provider = getProvider(slug);
    const ui       = getUI(slug);
    const name     = provider?.name ?? slug;
    const already  = existingSlugs.has(slug);
    return `
      <button class="catalog-item${already ? ' selected' : ''}" data-catalog-slug="${slug}" ${already ? 'disabled' : ''}>
        <div class="catalog-item-icon">${getIntegrationIcon(slug, 18)}</div>
        <div class="catalog-item-name">${name}</div>
        <div class="catalog-item-cat">${already ? 'Já adicionado' : ui.category}</div>
      </button>`;
  }).join('');

  openModal('catalogModal');
}

/* ─── Modal helpers ──────────────────────────────────────────────────────────*/

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ─── Events ─────────────────────────────────────────────────────────────────*/

document.addEventListener('click', async e => {
  const closeTarget = e.target.closest('[data-close]');
  if (closeTarget) { closeModal(closeTarget.dataset.close); return; }

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    const { id, action } = actionBtn.dataset;
    if (action === 'toggle') {
      const intData = getInt(id);
      if (intData && deriveStatus(intData) === 'connected') disconnectIntegration(id);
      else openConfigModal(id);
    }
    if (action === 'config') openConfigModal(id);
    return;
  }

  const row = e.target.closest('.int-row');
  if (row) { openPanel(row.dataset.id); return; }

  if (e.target.closest('#closePanelBtn')) { closePanel(); return; }

  const tabBtn = e.target.closest('.int-tab-btn');
  if (tabBtn) {
    document.querySelectorAll('.int-tab-btn').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
    document.querySelectorAll('.int-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tabBtn.dataset.tab}`).classList.add('active');
    return;
  }

  if (e.target.closest('#panelConfigBtn') && state.panelId) { openConfigModal(state.panelId); return; }
  if (e.target.closest('#panelTestBtn')   && state.panelId) { testConnection(state.panelId);  return; }
  if (e.target.closest('#panelRemoveBtn') && state.panelId) { confirmRemove(state.panelId);   return; }

  if (e.target.closest('#saveConfigBtn')) { saveConfig(); return; }

  if (e.target.closest('#confirmOkBtn') && state.confirmCallback) {
    await state.confirmCallback();
    return;
  }

  const catalogItem = e.target.closest('.catalog-item:not([disabled])');
  if (catalogItem) {
    document.querySelectorAll('.catalog-item').forEach(i => i.classList.remove('selected'));
    catalogItem.classList.add('selected');
    state.catalogSelected = catalogItem.dataset.catalogSlug;
    document.getElementById('catalogNextBtn').disabled = false;
    return;
  }

  if (e.target.closest('#catalogNextBtn') && state.catalogSelected) {
    const slug     = state.catalogSelected;
    const provider = getProvider(slug);
    if (!provider) {
      toast(`Provider "${slug}" não encontrado no banco. Adicione-o em ai_providers.`, 'error');
      return;
    }

    closeModal('catalogModal');

    const dismiss = toastLoading('Criando integração...');
    const created = await createIntegration(slug, provider.name, null);
    dismiss();

    if (created) {
      state.integrations.unshift(created);
      render();
      openConfigModal(created.id);
    } else {
      toast('Erro ao criar integração. Tente novamente.', 'error');
    }
    return;
  }

  if (e.target.closest('#addIntBtn')) { openCatalog(); return; }

  const chip = e.target.closest('.filter-chip');
  if (chip) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.filter = chip.dataset.filter;
    renderList();
    return;
  }

  const overlay = e.target.closest('.modal-overlay');
  if (overlay && e.target === overlay) { overlay.classList.remove('open'); return; }
});

document.getElementById('searchInput').addEventListener('input', e => {
  state.search = e.target.value.trim();
  renderList();
});

window.toggleEye = btn => {
  const input = btn.previousElementSibling;
  input.type = input.type === 'password' ? 'text' : 'password';
};

/* ─── Init ───────────────────────────────────────────────────────────────────
 * Aguarda auth-guard sinalizar que OrbitSession está pronto,
 * depois carrega providers e integrações do banco.
 */
document.addEventListener('orbitSessionReady', async () => {
  const dismiss = toastLoading('Carregando integrações...');
  await Promise.all([loadProviders(), loadIntegrations()]);
  dismiss();
  render();
});
