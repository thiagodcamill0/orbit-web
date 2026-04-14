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

  stopScene();

  const filtered = filterAgents();

  // Always render the cyberpunk scene as background
  initScene(container, filtered);

  // No agents: overlay the empty state on top of the scene
  if (filtered.length === 0) {
    const overlay = document.createElement('div');
    overlay.className = 'scene-empty';
    overlay.innerHTML = emptyStateHTML();
    container.appendChild(overlay);
  }
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
        <div class="agent-icon ${cls}"><img src="assets/images/robot-idle.gif" alt="" /></div>
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
      <div class="agent-icon ${cls}"><img src="assets/images/robot-idle.gif" alt="" /></div>
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
      <div class="chat-empty-icon">
        <img src="assets/images/robot-idle.gif" alt="" />
      </div>
      <div class="empty-title">Seu workspace está vazio</div>
      <div class="empty-desc">Crie um agente!</div>
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

// ─── Agent Scene ──────────────────────────────────────────────────────────────

let _sceneRaf = null;

const SCENE = {
  w:        64,    // robot element width  (px)
  h:        64,    // robot element height (px)
  labelH:   24,    // label height above robot (px)
  spdMin:   0.10,  // min movement speed (px/frame)
  spdMax:   0.28,  // max movement speed (px/frame)
dirMin:   4000,  // min ms between direction changes
  dirMax:   9500,  // max ms between direction changes
};

// ── Background image natural dimensions (cyber.png) ──────────────────────────
const BG_W = 2555;
const BG_H = 1536;

// ── Walk zone in IMAGE-space coordinates (0–1 fraction of image dimensions) ──
// The sidewalk band where agents are allowed to exist and move.
// top/bottom are fractions of BG_H; left/right are fractions of BG_W.
const WALK_ZONE = {
  top:    0.74,   // upper edge of the walkable strip
  bottom: 0.95,   // lower edge  (sprite bottom touches here = "ground")
  left:   0.05,   // horizontal margin — agents won't hug the very edge
  right:  0.95,
};

// Compute how CSS `background-size:cover; background-position:center bottom`
// renders the background image inside the container.
function _bgCoverBounds(cW, cH) {
  const scale = Math.max(cW / BG_W, cH / BG_H);
  const rW    = BG_W * scale;
  const rH    = BG_H * scale;
  const ox    = (cW - rW) / 2;  // negative when image is wider than container
  const oy    = cH - rH;        // negative when image is taller (top is cropped)
  return { ox, oy, rW, rH };
}

// Convert WALK_ZONE image-space fractions → absolute pixel bounds in the container.
function _zonePx(cW, cH) {
  const { ox, oy, rW, rH } = _bgCoverBounds(cW, cH);

  const rawXMin = ox + WALK_ZONE.left   * rW;
  const rawXMax = ox + WALK_ZONE.right  * rW;
  const rawYMin = oy + WALK_ZONE.top    * rH;
  const rawYMax = oy + WALK_ZONE.bottom * rH;

  // Sprite occupies [x, x+w] × [y, y+h+labelH], so shift max by sprite size
  const xMin = Math.max(0, rawXMin);
  const xMax = Math.min(cW - SCENE.w, rawXMax - SCENE.w);
  const yMin = Math.max(0, rawYMin);
  const yMax = Math.min(cH - SCENE.h - SCENE.labelH, rawYMax - SCENE.h - SCENE.labelH);

  return {
    xMin,
    xMax: Math.max(xMin, xMax),
    yMin,
    yMax: Math.max(yMin, yMax),
  };
}

function stopScene() {
  if (_sceneRaf !== null) {
    cancelAnimationFrame(_sceneRaf);
    _sceneRaf = null;
  }
  if (window._sceneResizeObserver) {
    window._sceneResizeObserver.disconnect();
    window._sceneResizeObserver = null;
  }
}

function initScene(container, agents) {
  container.className = 'agent-scene';
  container.innerHTML = '';

  const cW0   = container.clientWidth  || 800;
  const cH0   = container.clientHeight || 440;
  const zone0 = _zonePx(cW0, cH0);

  // ── Build robot elements ───────────────────────────────
  const robots = agents.map(agent => {
    const wrap = document.createElement('div');
    wrap.className = 'scene-robot';

    const img = document.createElement('img');
    img.src       = 'assets/images/robot-run.gif';
    img.alt       = agent.name;
    img.draggable = false;

    const lbl = document.createElement('div');
    lbl.className   = 'scene-robot-label';
    lbl.textContent = agent.name;

    wrap.appendChild(lbl);
    wrap.appendChild(img);
    container.appendChild(wrap);

    // Agents enter from outside left or right edge, staggered
    const fromLeft = Math.random() < 0.5;
    const x  = fromLeft ? -SCENE.w : cW0 + SCENE.w;
    const y  = zone0.yMin + Math.random() * Math.max(1, zone0.yMax - zone0.yMin);
    const s  = SCENE.spdMin + Math.random() * (SCENE.spdMax - SCENE.spdMin);

    const robot = {
      wrap, img,
      x, y,
      baseY: y,
      vx: fromLeft ? s : -s,   // always walk inward on entry
      vy: (Math.random() * 0.03 + 0.01) * (Math.random() < 0.5 ? 1 : -1),
      nextDir: Date.now() + SCENE.dirMin + Math.random() * (SCENE.dirMax - SCENE.dirMin),
      frozen: false,
      entering: true,           // skip bounce until inside the zone
    };

    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', () => {
      robot.frozen = !robot.frozen;
      wrap.classList.toggle('frozen', robot.frozen);
    });

    return robot;
  });

  // ── Animation loop ─────────────────────────────────────
  function tick() {
    const now = Date.now();
    const cW  = container.clientWidth;
    const cH  = container.clientHeight;
    const { xMin, xMax, yMin, yMax } = _zonePx(cW, cH);

    for (let i = 0; i < robots.length; i++) {
      const r = robots[i];

      if (r.frozen) continue;

      // Scheduled direction change
      if (now >= r.nextDir) {
        const s = SCENE.spdMin + Math.random() * (SCENE.spdMax - SCENE.spdMin);
        r.vx      = Math.random() < 0.5 ? s : -s;
        r.nextDir = now + SCENE.dirMin + Math.random() * (SCENE.dirMax - SCENE.dirMin);
      }

      // Speed clamp
      if (Math.abs(r.vx) > SCENE.spdMax) r.vx = Math.sign(r.vx) * SCENE.spdMax;

      // Move
      r.x += r.vx;
      r.y += r.vy;

      // Once the agent crosses into the zone, stop the entry phase
      if (r.entering && r.x >= xMin && r.x <= xMax) r.entering = false;

      // Bounce against image-based zone walls (only after fully entered)
      if (!r.entering) {
        if (r.x < xMin) { r.x = xMin; r.vx =  Math.abs(r.vx); }
        if (r.x > xMax) { r.x = xMax; r.vx = -Math.abs(r.vx); }
      }

      // Vertical micro-bob within ±5px of baseY, clamped to zone
      const bMin = Math.max(yMin, r.baseY - 5);
      const bMax = Math.min(yMax, r.baseY + 5);
      if (r.y < bMin) { r.y = bMin; r.vy =  Math.abs(r.vy); }
      if (r.y > bMax) { r.y = bMax; r.vy = -Math.abs(r.vy); }

      r.wrap.style.transform = `translate(${r.x}px, ${r.y}px)`;
      r.img.style.transform  = r.vx < -0.05 ? 'scaleX(-1)' : 'scaleX(1)';
    }

    _sceneRaf = requestAnimationFrame(tick);
  }

  _sceneRaf = requestAnimationFrame(tick);

  // ── Snap agents back into the zone on every resize ───────────────────────
  if (window._sceneResizeObserver) window._sceneResizeObserver.disconnect();
  window._sceneResizeObserver = new ResizeObserver(() => {
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    if (!cW || !cH) return;
    const { xMin, xMax, yMin, yMax } = _zonePx(cW, cH);
    for (const r of robots) {
      if (r.x < xMin) { r.x = xMin; r.vx =  Math.abs(r.vx); }
      if (r.x > xMax) { r.x = xMax; r.vx = -Math.abs(r.vx); }
      r.baseY = Math.max(yMin, Math.min(yMax, r.baseY));
      r.y     = Math.max(yMin, Math.min(yMax, r.y));
    }
  });
  window._sceneResizeObserver.observe(container);
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
