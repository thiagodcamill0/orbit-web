// ─── Premium Canvas Engine ────────────────────────────────────────────────────
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const LERP_PAN = 0.13; // canvas pan smoothing
const LERP_ZOOM = 0.09; // zoom easing
const LERP_NODE = 0.20; // node drag organic lag — the "alive" feeling
const FRICTION = 0.90; // inertia decay (higher = longer glide)
const WHEEL_SENS = 0.0006;
const ZOOM_BTN = 0.15;
const HOLD_MS = 800; // ms to activate drag
// ─── Canvas state ─────────────────────────────────────────────────────────────
const cur = { x: 0, y: 0, scale: 1 };
const tgt = { x: 0, y: 0, scale: 1 };
const vel = { x: 0, y: 0 };
const pan = { active: false, ox: 0, oy: 0 };
// ─── Node drag state ──────────────────────────────────────────────────────────
const NODE_W = 96; // sprite size
const NODE_HX = 1956; // HTML left within world div
const NODE_HY = 1920; // HTML top  within world div
const node = {
    el: null,
    x: NODE_HX,
    y: NODE_HY,
    tx: NODE_HX,
    ty: NODE_HY,
    dragging: false,
    holdTimer: 0,
    ox: 0,
    oy: 0,
};
let editMode = false;
let viewport;
let world;
let label;
// ─── Agent graph ───────────────────────────────────────────────────────────────
const registry = new Map(); // agentId → { id, el, x, y, parentId, childIds }
let nextAgentId = 1; // kept for registerAgent (legacy, used only if called directly)
let connSvg;
// ─── Init ─────────────────────────────────────────────────────────────────────
// DOMContentLoaded: UI bindings only (no DB access needed)
document.addEventListener('DOMContentLoaded', () => {
    try {
        viewport = document.getElementById('canvasViewport');
        world = document.getElementById('canvasWorld');
        label = document.getElementById('zoomLabel');
        console.log('[agents] DOMContentLoaded — viewport:', !!viewport, 'world:', !!world);
        initGraph();
        bindCanvas();
        bindButtons();
        bindPanel();
        bindCreateModal();
        requestAnimationFrame(loop);
        console.log('[agents] DOMContentLoaded OK');
    } catch (err) {
        console.error('[agents] erro no DOMContentLoaded:', err);
    }
});

// orbitSessionReady: load data from DB (boards first for z-order, then agents)
document.addEventListener('orbitSessionReady', async () => {
    console.log('[agents] orbitSessionReady — workspaceId:', OrbitSession.workspaceId);
    try {
        if (window.OrbitBoards) {
            await window.OrbitBoards.loadAndRender(OrbitSession.workspaceId);
            console.log('[agents] boards loaded');
        } else {
            console.warn('[agents] OrbitBoards não disponível — boards ignorados');
        }
        await loadCanvasData();
        console.log('[agents] canvas data loaded');
        restoreViewport();
    } catch (err) {
        console.error('[agents] erro na inicialização do canvas:', err);
    }
    // Auto-open create modal when navigated with ?create=true (from Home or any link)
    if (new URLSearchParams(window.location.search).get('create') === 'true') {
        history.replaceState(null, '', window.location.pathname); // clean URL, no re-open on refresh
        openCreateModal();
    }
});
// ─── Color filters ────────────────────────────────────────────────────────────
const COLOR_FILTERS = {
    none:   'none',
    red:    'hue-rotate(310deg) saturate(4) brightness(0.85)',
    orange: 'hue-rotate(20deg) saturate(4) brightness(0.85)',
    yellow: 'hue-rotate(50deg) saturate(4) brightness(0.9)',
    green:  'hue-rotate(100deg) saturate(4) brightness(0.8)',
    cyan:   'hue-rotate(165deg) saturate(4) brightness(0.85)',
    blue:   'hue-rotate(210deg) saturate(4) brightness(0.85)',
    purple: 'hue-rotate(260deg) saturate(4) brightness(0.85)',
    pink:   'hue-rotate(290deg) saturate(4) brightness(0.9)',
};

function applyColorFilter(el, filterKey) {
    const f = COLOR_FILTERS[filterKey] ?? 'none';
    el.dataset.colorFilter = filterKey || 'none';
    el.querySelectorAll('.agent-node-pokemon').forEach(img => { img.style.filter = f; });
}
// ─── Sprite source ────────────────────────────────────────────────────────────
// 'gif' = local robot gif | 'pokemon' = PokeAPI HOME sprites
function spriteUrl(id, source) {
    const src = source || currentApiSource;
    if (src === 'pokemon') {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;
    }
    return 'assets/images/robot-idle.gif';
}

function loadSprite() {
    const img = document.getElementById('pokemonSprite');
    if (!img) return; // no static sprite element — all agents loaded from DB
    let id = 1;
    if (currentApiSource === 'pokemon') {
        id = Math.floor(Math.random() * 151) + 1;
        currentPokemonId = id;
    }
    img.src = spriteUrl(id);
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.4s ease';
    img.onload = () => { img.style.opacity = '1'; };
    img.onerror = () => {
        if (currentApiSource === 'pokemon') {
            img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
            img.onload = () => { img.style.opacity = '1'; };
        } else {
            img.style.opacity = '1';
        }
    };
}
// ─── Center on node ───────────────────────────────────────────────────────────
// Screen position of a world-HTML point (hx, hy) with scale=1:
//   screen_x = (hx - 2000) * scale + tgt.x
// To have node center at viewport center:
//   vpW/2 = (nodeCX - 2000) + tgt.x  →  tgt.x = vpW/2 - (nodeCX - 2000)
function centerOnNode() {
    const rect = viewport.getBoundingClientRect();
    const nodeCX = node.x + NODE_W / 2; // center of disc in world HTML coords
    const nodeCY = node.y + NODE_W / 2;
    tgt.x = rect.width  / 2 - (nodeCX - 2000);
    tgt.y = rect.height * 0.28 - (nodeCY - 2000);
    cur.x = tgt.x;
    cur.y = tgt.y;
}
// ─── RAF Loop ─────────────────────────────────────────────────────────────────
function loop() {
    requestAnimationFrame(loop);
    // Canvas inertia (after pan release)
    if (!pan.active && !node.dragging) {
        if (Math.abs(vel.x) > 0.01 || Math.abs(vel.y) > 0.01) {
            tgt.x += vel.x;
            tgt.y += vel.y;
            vel.x *= FRICTION;
            vel.y *= FRICTION;
        }
    }
    // Canvas lerp
    const lp = pan.active ? 1 : LERP_PAN;
    cur.x += (tgt.x - cur.x) * lp;
    cur.y += (tgt.y - cur.y) * lp;
    cur.scale += (tgt.scale - cur.scale) * LERP_ZOOM;
    applyTransform();
    // Node drag — snap to mouse precisely (no lag = no ghost trail)
    if (node.dragging) {
        node.x = node.tx;
        node.y = node.ty;
        node.el.style.left = `${node.x}px`;
        node.el.style.top  = `${node.y}px`;
        syncRegistryPos(node.el.dataset.agentId, node.x, node.y);
    }
}
function applyTransform() {
    world.style.transform = `translate(${cur.x}px, ${cur.y}px) scale(${cur.scale})`;
    label.textContent = `${Math.round(cur.scale * 100)}%`;
}
// ─── Canvas pan & zoom ────────────────────────────────────────────────────────
function bindCanvas() {
    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || node.dragging)
            return;
        const onNode = node.el ? node.el.contains(e.target) : false;
        // Click on empty canvas → exit edit mode
        if (editMode && !onNode) {
            exitEditMode();
            // Still allow pan after exiting
        }
        if (!onNode) {
            pan.active = true;
            pan.ox = e.clientX - tgt.x;
            pan.oy = e.clientY - tgt.y;
            vel.x = vel.y = 0;
            viewport.classList.add('dragging');
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!pan.active)
            return;
        const nx = e.clientX - pan.ox;
        const ny = e.clientY - pan.oy;
        vel.x = vel.x * 0.5 + (nx - tgt.x) * 0.5;
        vel.y = vel.y * 0.5 + (ny - tgt.y) * 0.5;
        tgt.x = nx;
        tgt.y = ny;
    });
    window.addEventListener('mouseup', () => {
        if (!pan.active)
            return;
        pan.active = false;
        viewport.classList.remove('dragging');
        saveViewport();
    });
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const wx = (mx - cur.x) / cur.scale;
        const wy = (my - cur.y) / cur.scale;
        const f = Math.pow(2, -e.deltaY * WHEEL_SENS);
        tgt.scale = clamp(tgt.scale * f, MIN_SCALE, MAX_SCALE);
        tgt.x = mx - wx * tgt.scale;
        tgt.y = my - wy * tgt.scale;
        saveViewport();
    }, { passive: false });
}
// ─── Edit mode ────────────────────────────────────────────────────────────────
function enterEditMode() {
    editMode = true;
    node.el.classList.add('editing');
}
function exitEditMode() {
    editMode = false;
    node.el.classList.remove('editing', 'dragging');
    node.dragging = false;
}
function startNodeDrag(e) {
    node.dragging = true;
    node.el.classList.add('dragging');
    vel.x = vel.y = 0;
    node.tx = node.x;
    node.ty = node.y;
    const rect = viewport.getBoundingClientRect();
    const wx = (e.clientX - rect.left - cur.x) / cur.scale;
    const wy = (e.clientY - rect.top - cur.y) / cur.scale;
    node.ox = wx - node.x;
    node.oy = wy - node.y;
}
// ─── Node interaction ─────────────────────────────────────────────────────────
function bindNode() {
    if (!node.el) return; // no static node when agents are loaded from DB
    const el = node.el;
    el.addEventListener('mousedown', (e) => {
        if (e.button !== 0)
            return;
        // Don't drag when clicking an action button
        if (e.target.closest('.agent-action'))
            return;
        e.stopPropagation();
        if (editMode) {
            // In edit mode: drag immediately on mousedown
            startNodeDrag(e);
        }
        else {
            // Out of edit mode: hold to enter
            node.holdTimer = window.setTimeout(() => {
                enterEditMode();
                startNodeDrag(e);
            }, HOLD_MS);
            // Quick click (mouseup before timer) → enter edit mode without drag
            el._quickClick = true;
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!node.dragging)
            return;
        const rect = viewport.getBoundingClientRect();
        node.tx = (e.clientX - rect.left - cur.x) / cur.scale - node.ox;
        node.ty = (e.clientY - rect.top - cur.y) / cur.scale - node.oy;
    });
    window.addEventListener('mouseup', () => {
        clearTimeout(node.holdTimer);
        if (el._quickClick && !editMode) {
            enterEditMode();
            openPanel();
        }
        el._quickClick = false;
        if (node.dragging) {
            node.dragging = false;
            el.classList.remove('dragging');
        }
    });
    // Action buttons
    el.querySelectorAll('.agent-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            handleAction(action);
        });
    });
    el.addEventListener('dragstart',   e => e.preventDefault());
    el.addEventListener('contextmenu', e => e.preventDefault());
}
function handleAction(action) {
    switch (action) {
        case 'name':
            openPanel();
            setTimeout(() => document.getElementById('fieldName')?.focus(), 320);
            break;
        case 'prompt':
            openPanel();
            setTimeout(() => document.getElementById('fieldPrompt')?.focus(), 320);
            break;
        case 'delete':
            deleteAgent(node.el);
            break;
        case 'subagent':
            spawnSubagent(node.el.dataset.agentId);
            break;
    }
}
// ─── Graph: init ──────────────────────────────────────────────────────────────
function initGraph() {
    // SVG overlay inside world (world-space coordinates)
    connSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connSvg.style.cssText = 'position:absolute;top:0;left:0;width:4000px;height:4000px;pointer-events:none;overflow:visible;z-index:0';
    world.prepend(connSvg);
    // No static node — agents are loaded from DB in orbitSessionReady
}

// ─── Graph: registry helpers ───────────────────────────────────────────────────
function registerAgent(el, x, y, parentId) {
    const id = `a${nextAgentId++}`;
    el.dataset.agentId = id;
    registry.set(id, { id, el, x, y, parentId: parentId || null, childIds: [] });
    if (parentId) registry.get(parentId).childIds.push(id);
    return id;
}

function syncRegistryPos(agentId, x, y) {
    const a = registry.get(agentId);
    if (!a) return;
    a.x = x; a.y = y;
    if (a.parentId) updateConn(a.parentId, agentId);
    a.childIds.forEach(cid => updateConn(agentId, cid));
}

// ─── Graph: connections ────────────────────────────────────────────────────────
// Exit point: bottom-center of sprite (below sprite, above shadow+label)
const ACTIONS_H = 30; // agent-actions height + margin-bottom
const SPRITE_H  = 96;
function nodeExit(agentId) {
    const a = registry.get(agentId);
    return { x: a.x + 48, y: a.y + ACTIONS_H + SPRITE_H };
}
// Entry point: top-center of sprite (below action buttons)
function nodeEntry(agentId) {
    const a = registry.get(agentId);
    return { x: a.x + 48, y: a.y + ACTIONS_H };
}

function connPath(p1, p2) {
    const dy  = p2.y - p1.y;
    const cy  = Math.max(Math.abs(dy) * 0.5, 60);
    return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} C ${p1.x.toFixed(1)} ${(p1.y + cy).toFixed(1)} ${p2.x.toFixed(1)} ${(p2.y - cy).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
}

function drawConn(parentId, childId) {
    const NS    = 'http://www.w3.org/2000/svg';
    const XLNS  = 'http://www.w3.org/1999/xlink';
    const gId   = `conn-${parentId}-${childId}`;
    const pathId = `cpath-${parentId}-${childId}`;
    const p1 = nodeExit(parentId);
    const p2 = nodeEntry(childId);
    const d  = connPath(p1, p2);

    const g = document.createElementNS(NS, 'g');
    g.id = gId;

    // Hidden reference path for animateMotion
    const refPath = document.createElementNS(NS, 'path');
    refPath.id = pathId;
    refPath.setAttribute('d', d);
    refPath.setAttribute('fill', 'none');
    refPath.setAttribute('stroke', 'none');

    // Visible line
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', d);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'rgba(99,102,241,0.2)');
    line.setAttribute('stroke-width', '1');

    // Pulse dot
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', 'rgba(99,102,241,0.7)');

    const anim = document.createElementNS(NS, 'animateMotion');
    anim.setAttribute('dur', `${2.2 + Math.random() * 1.2}s`);
    anim.setAttribute('repeatCount', 'indefinite');
    anim.setAttribute('calcMode', 'spline');
    anim.setAttribute('keyTimes', '0;1');
    anim.setAttribute('keySplines', '0.42 0 0.58 1');

    const mpath = document.createElementNS(NS, 'mpath');
    mpath.setAttribute('href', `#${pathId}`);
    mpath.setAttributeNS(XLNS, 'xlink:href', `#${pathId}`);
    anim.appendChild(mpath);
    dot.appendChild(anim);

    g.append(refPath, line, dot);
    connSvg.appendChild(g);
}

function updateConn(parentId, childId) {
    const g = document.getElementById(`conn-${parentId}-${childId}`);
    if (!g) return;
    const p1 = nodeExit(parentId);
    const p2 = nodeEntry(childId);
    const d  = connPath(p1, p2);
    g.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
}

// ─── Graph: subagent ───────────────────────────────────────────────────────────
function addSubagentAction(el) {
    const actions = el.querySelector('.agent-actions');
    if (!actions || el.querySelector('[data-action="subagent"]')) return;
    const btn = document.createElement('button');
    btn.className = 'agent-action';
    btn.dataset.action = 'subagent';
    btn.title = 'Criar subagente';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="4" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="20" r="2"/>
      <path d="M12 6v5M12 11l-6 7M12 11l6 7"/>
    </svg>`;
    actions.appendChild(btn);
    btn.addEventListener('click', e => {
        e.stopPropagation();
        spawnSubagent(el.dataset.agentId);
    });
}

function subagentPos(parentId) {
    const parent = registry.get(parentId);
    const n = parent.childIds.length;
    // Fan: 0, +180, -180, +360, -360 …
    let xOff = 0;
    if (n > 0) {
        const half = Math.ceil(n / 2);
        xOff = n % 2 === 1 ? half * 180 : -(half * 180);
    }
    return { x: parent.x + xOff, y: parent.y + 230 };
}

async function spawnSubagent(parentId) {
    const pos = subagentPos(parentId);

    const { data, error } = await db.from('agents').insert({
        workspace_id:    OrbitSession.workspaceId,
        name:            'subagente',
        model_id:        'openai/gpt-4o-mini',
        parent_agent_id: parentId,
        x:               Math.round(pos.x),
        y:               Math.round(pos.y),
    }).select('id, name, model_id, system_prompt, x, y, parent_agent_id').single();

    if (error) { console.error('spawnSubagent insert error:', error); return; }

    spawnAgentFromDB(data);
    drawConn(parentId, data.id);

    // Pan toward new subagent
    const rect = viewport.getBoundingClientRect();
    tgt.x = rect.width  / 2 - (pos.x + 48 - 2000);
    tgt.y = rect.height * 0.4 - (pos.y + 48 - 2000);
}

// ─── Create agent modal ───────────────────────────────────────────────────────
// openCreateModal is also called from orbitSessionReady (?create=true param)
function openCreateModal() {
    const overlay   = document.getElementById('createOverlay');
    const nameInput = document.getElementById('createName');
    if (!overlay || !nameInput) return;
    overlay.classList.add('open');
    requestAnimationFrame(() => nameInput.focus());
}

function bindCreateModal() {
    const overlay   = document.getElementById('createOverlay');
    const nameInput = document.getElementById('createName');
    const closeBtn  = document.getElementById('createModalClose');
    const cancelBtn = document.getElementById('createCancel');
    const confirmBtn= document.getElementById('createConfirm');
    const newBtn    = document.getElementById('newAgentBtn');

    function closeCreate() {
        overlay.classList.remove('open');
        nameInput.value = '';
    }

    newBtn.addEventListener('click', openCreateModal);
    closeBtn.addEventListener('click', closeCreate);
    cancelBtn.addEventListener('click', closeCreate);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCreate(); });

    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') closeCreate();
    });

    confirmBtn.addEventListener('click', async () => {
        const name  = nameInput.value.trim() || 'agente';
        const model = document.getElementById('createModel').value;

        if (!OrbitSession?.workspaceId) {
            console.error('[agents] OrbitSession não está pronta — workspace_id ausente');
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Criando...';
        try {
            await spawnAgent(name, model);
            closeCreate();
        } catch (err) {
            console.error('[agents] Erro ao criar agente:', err);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Criar agente';
        }
    });
}

async function spawnAgent(name, model) {
    const existingNodes = world.querySelectorAll('.agent-node');
    const hx = NODE_HX + 160 * existingNodes.length;
    const hy = NODE_HY;

    console.log('[agents] INSERT agent:', { workspace_id: OrbitSession.workspaceId, name, model_id: model, x: hx, y: hy });

    const { data, error } = await db.from('agents').insert({
        workspace_id: OrbitSession.workspaceId,
        name,
        model_id: model || null,
        x: Math.round(hx),
        y: Math.round(hy),
    }).select('id, name, model_id, system_prompt, x, y, parent_agent_id').single();

    if (error) {
        console.error('[agents] INSERT error:', error);
        throw new Error(error.message);
    }

    console.log('[agents] INSERT ok:', data);
    spawnAgentFromDB(data);

    const rect = viewport.getBoundingClientRect();
    tgt.x = rect.width  / 2 - (hx + NODE_W / 2 - 2000);
    tgt.y = rect.height * 0.28 - (hy + NODE_W / 2 - 2000);
}

function bindExtraNode(el, initX, initY, agentId) {
    const state = { x: initX, y: initY, tx: initX, ty: initY, dragging: false, holdTimer: 0, ox: 0, oy: 0 };
    let localEdit = false;

    el.addEventListener('mousedown', e => {
        if (e.button !== 0 || e.target.closest('.agent-action')) return;
        e.stopPropagation();

        if (localEdit) {
            state.dragging = true;
            el.classList.add('dragging');
            vel.x = vel.y = 0;
            const rect = viewport.getBoundingClientRect();
            state.ox = (e.clientX - rect.left - cur.x) / cur.scale - state.x;
            state.oy = (e.clientY - rect.top  - cur.y) / cur.scale - state.y;
        } else {
            state.holdTimer = window.setTimeout(() => {
                localEdit = true;
                el.classList.add('editing');
                state.dragging = true;
                el.classList.add('dragging');
                vel.x = vel.y = 0;
                const rect = viewport.getBoundingClientRect();
                state.ox = (e.clientX - rect.left - cur.x) / cur.scale - state.x;
                state.oy = (e.clientY - rect.top  - cur.y) / cur.scale - state.y;
            }, HOLD_MS);
            el._quickClick = true;
        }
    });

    window.addEventListener('mousemove', e => {
        if (!state.dragging) return;
        const rect = viewport.getBoundingClientRect();
        state.x = (e.clientX - rect.left - cur.x) / cur.scale - state.ox;
        state.y = (e.clientY - rect.top  - cur.y) / cur.scale - state.oy;
        el.style.left = `${state.x}px`;
        el.style.top  = `${state.y}px`;
        if (agentId) syncRegistryPos(agentId, state.x, state.y);
    });

    window.addEventListener('mouseup', () => {
        clearTimeout(state.holdTimer);
        if (el._quickClick && !localEdit) {
            localEdit = true;
            el.classList.add('editing');
            openPanelForNode(el, 'settings');
        }
        el._quickClick = false;
        if (state.dragging && agentId) {
            savePosition(agentId, state.x, state.y);
        }
        state.dragging = false;
        el.classList.remove('dragging');
    });

    // Click outside exits edit mode for this node
    viewport.addEventListener('mousedown', e => {
        if (localEdit && !el.contains(e.target)) {
            localEdit = false;
            el.classList.remove('editing', 'dragging');
        }
    });

    // Action buttons — open panel synced to this node
    el.querySelectorAll('.agent-action').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openPanelForNode(el, btn.dataset.action);
        });
    });

    el.addEventListener('dragstart',   e => e.preventDefault());
    el.addEventListener('contextmenu', e => e.preventDefault());
}

function openPanelForNode(el, action) {
    panelTargetEl = el;
    const panel      = document.getElementById('agentPanel');
    const nameInput  = document.getElementById('fieldName');
    const modelSel   = document.getElementById('fieldModel');
    const apiSel     = document.getElementById('fieldApiSource');
    const panelName  = document.getElementById('panelAgentName');
    const miniSprite = document.getElementById('panelPokemonMini');
    const mainSprite = el.querySelector('.agent-node-pokemon');
    const pickerPrev = document.getElementById('pokemonPickerPreview');
    const pokemonInp = document.getElementById('fieldPokemonId');
    const idLabel    = document.getElementById('fieldSpriteIdLabel');
    const labelEl    = el.querySelector('.agent-node-label');

    // Sync panel fields from this node's data
    const agentName  = el.dataset.agentName  || labelEl?.textContent || 'agente';
    const agentModel = el.dataset.agentModel || 'openai/gpt-4o';
    const nodeSource = el.dataset.apiSource  || currentApiSource;
    const pokemonId  = parseInt(el.dataset.pokemonId) || currentPokemonId;

    nameInput.value       = agentName;
    panelName.textContent = agentName;
    modelSel.value        = agentModel;
    if (apiSel) apiSel.value = nodeSource;
    pokemonInp.value      = String(pokemonId);
    miniSprite.src        = mainSprite.src;
    pickerPrev.src        = mainSprite.src;
    pickerPrev.style.opacity = '1';
    currentPokemonId      = pokemonId;
    updateSpriteIdLabel(idLabel, nodeSource);

    function applySprite(id, src) {
        const url = spriteUrl(id, src);
        el.dataset.pokemonId = String(id);
        el.dataset.apiSource = src;
        pickerPrev.style.opacity = '0';
        pickerPrev.src = url;
        pickerPrev.onload = () => { pickerPrev.style.opacity = '1'; };
        mainSprite.style.opacity = '0';
        mainSprite.src = url;
        mainSprite.onload = () => { mainSprite.style.opacity = '1'; };
        miniSprite.src = url;
    }

    // Wire name changes back to this node's label + dataset
    nameInput.oninput = () => {
        panelName.textContent = nameInput.value || 'agente';
        if (labelEl) labelEl.textContent = nameInput.value || 'agente';
        el.dataset.agentName = nameInput.value;
    };
    nameInput.onblur = () => {
        const name = nameInput.value.trim() || 'agente';
        el.dataset.agentName = name;
        if (el.dataset.agentId) saveAgentFields(el.dataset.agentId, { name });
    };

    // Wire model changes back to dataset + DB
    modelSel.onchange = () => {
        el.dataset.agentModel = modelSel.value;
        if (el.dataset.agentId) saveAgentFields(el.dataset.agentId, { model_id: modelSel.value });
    };

    // Wire API source selector
    if (apiSel) {
        apiSel.onchange = () => {
            const src = apiSel.value;
            currentApiSource = src;
            el.dataset.apiSource = src;
            updateSpriteIdLabel(idLabel, src);
            if (src === 'pokemon') {
                const newId = Math.min(parseInt(pokemonInp.value) || 1, 898);
                pokemonInp.max   = '898';
                pokemonInp.value = String(newId);
                currentPokemonId = newId;
                applySprite(newId, src);
            } else {
                applySprite(1, src);
            }
        };
    }

    // Wire sprite ID picker back to this node's sprite
    pokemonInp.oninput = () => {
        const src = (apiSel?.value) || nodeSource;
        if (src !== 'pokemon') return;
        const val = parseInt(pokemonInp.value);
        if (!isNaN(val) && val >= 1 && val <= 898) {
            currentPokemonId = val;
            applySprite(val, src);
        }
    };

    // Wire color filter swatches
    const swatchContainer = document.getElementById('filterSwatches');
    if (swatchContainer) {
        const currentFilter = el.dataset.colorFilter || 'none';
        swatchContainer.querySelectorAll('.filter-swatch').forEach(sw => {
            sw.classList.toggle('active', sw.dataset.filter === currentFilter);
            sw.onclick = () => {
                swatchContainer.querySelectorAll('.filter-swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
                const f = sw.dataset.filter;
                applyColorFilter(el, f);
                miniSprite.style.filter = COLOR_FILTERS[f] ?? 'none';
            };
        });
    }

    // Sync system_prompt textarea
    const promptTextarea = document.getElementById('fieldPrompt');
    if (promptTextarea) {
        promptTextarea.value = el.dataset.systemPrompt || '';
        promptTextarea.onblur = () => {
            el.dataset.systemPrompt = promptTextarea.value;
            if (el.dataset.agentId) saveAgentFields(el.dataset.agentId, { system_prompt: promptTextarea.value || null });
        };
    }

    panel.classList.add('open');

    if (action === 'name')   setTimeout(() => nameInput.focus(), 320);
    if (action === 'prompt') setTimeout(() => document.getElementById('fieldPrompt')?.focus(), 320);
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
function bindButtons() {
    function zoomCenter(step) {
        const rect = viewport.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const wx = (cx - cur.x) / cur.scale;
        const wy = (cy - cur.y) / cur.scale;
        tgt.scale = clamp(tgt.scale * (1 + step), MIN_SCALE, MAX_SCALE);
        tgt.x = cx - wx * tgt.scale;
        tgt.y = cy - wy * tgt.scale;
    }
    document.getElementById('zoomIn')?.addEventListener('click', () => zoomCenter(ZOOM_BTN));
    document.getElementById('zoomOut')?.addEventListener('click', () => zoomCenter(-ZOOM_BTN));
    document.getElementById('zoomReset')?.addEventListener('click', () => {
        tgt.x = 0;
        tgt.y = 0;
        tgt.scale = 1;
        vel.x = 0;
        vel.y = 0;
    });
}
// ─── Panel ────────────────────────────────────────────────────────────────────
let currentPokemonId = 1;
let currentApiSource = 'gif'; // 'gif' | 'pokemon'
let panelTargetEl = null; // which node the panel is currently editing

function updateSpriteIdLabel(labelEl, source) {
    if (!labelEl) return;
    const field = labelEl.closest('.panel-field');
    if (source === 'pokemon') {
        labelEl.textContent = 'Pokémon (1–898)';
        if (field) field.style.display = '';
    } else {
        if (field) field.style.display = 'none';
    }
}

async function deleteAgent(el) {
    if (!el) return;
    const agentId = el.dataset.agentId;
    const panel   = document.getElementById('agentPanel');

    // Soft-delete in DB (agentId is a UUID from DB)
    if (agentId) {
        await db.from('agents')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', agentId)
            .eq('workspace_id', OrbitSession.workspaceId);
    }

    panel.classList.remove('open');

    if (agentId) {
        const entry = registry.get(agentId);
        if (entry) {
            // Remove all connection lines involving this agent
            const allConns = [...(entry.parentId ? [`conn-${entry.parentId}-${agentId}`] : []),
                              ...entry.childIds.map(cid => `conn-${agentId}-${cid}`)];
            allConns.forEach(id => document.getElementById(id)?.remove());

            // Detach from parent's childIds
            if (entry.parentId) {
                const parent = registry.get(entry.parentId);
                if (parent) parent.childIds = parent.childIds.filter(c => c !== agentId);
            }

            // Recursively remove children
            function removeChildren(aid) {
                const a = registry.get(aid);
                if (!a) return;
                a.childIds.forEach(cid => {
                    document.getElementById(`conn-${aid}-${cid}`)?.remove();
                    const childEl = registry.get(cid)?.el;
                    if (childEl) childEl.remove();
                    removeChildren(cid);
                    registry.delete(cid);
                });
            }
            removeChildren(agentId);
            registry.delete(agentId);
        }
    }

    el.remove();
    panelTargetEl = null;
}

function bindPanel() {
    const panel = document.getElementById('agentPanel');
    const closeBtn = document.getElementById('closePanelBtn');
    // Close
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));

    // Delete
    document.getElementById('deleteAgentBtn')?.addEventListener('click', () => {
        deleteAgent(panelTargetEl);
    });

    // Save button: flush any pending debounced saves immediately
    document.getElementById('saveAgentBtn')?.addEventListener('click', () => {
        if (!panelTargetEl || !panelTargetEl.dataset.agentId) return;
        const id = panelTargetEl.dataset.agentId;
        const name        = document.getElementById('fieldName')?.value.trim() || 'agente';
        const model_id    = document.getElementById('fieldModel')?.value;
        const system_prompt = document.getElementById('fieldPrompt')?.value || null;
        // Immediate save (bypasses debounce)
        db.from('agents').update({ name, model_id, system_prompt })
          .eq('id', id).eq('workspace_id', OrbitSession.workspaceId).then(() => {});
    });
    // Name sync → panel header
    const nameInput = document.getElementById('fieldName');
    const panelName = document.getElementById('panelAgentName');
    const nodeLabel = document.querySelector('.agent-node-label');
    nameInput?.addEventListener('input', () => {
        panelName.textContent = nameInput.value || 'agente';
        if (nodeLabel)
            nodeLabel.textContent = nameInput.value || 'agente';
    });
    // Status chips
    document.querySelectorAll('.status-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });
}
function openPanel() {
    if (!node.el) return;
    openPanelForNode(node.el, 'settings');
}
// ─── Utils ────────────────────────────────────────────────────────────────────
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function escapeHTML(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── DB: load canvas data ─────────────────────────────────────────────────────
async function loadCanvasData() {
    const { data, error } = await db
        .from('agents')
        .select('id, name, model_id, system_prompt, x, y, parent_agent_id')
        .eq('workspace_id', OrbitSession.workspaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }); // parents before children

    if (error) { console.error('loadAgents error:', error); return; }

    const agents = data ?? [];
    // First pass: spawn all DOM nodes, register in registry
    agents.forEach(a => spawnAgentFromDB(a));
    // Second pass: draw connections for parent-child pairs
    agents.forEach(a => {
        if (a.parent_agent_id && registry.has(a.parent_agent_id) && registry.has(a.id)) {
            drawConn(a.parent_agent_id, a.id);
        }
    });
}

// ─── DB: spawn agent from DB record ──────────────────────────────────────────
// Visual: always uses robot-idle.gif (default source = 'gif')
// The gif asset loads instantly from cache after first agent — no flash needed.
function spawnAgentFromDB(agent) {
    const gifUrl = 'assets/images/robot-idle.gif';

    const el = document.createElement('div');
    el.className = 'agent-node';
    el.style.left = `${agent.x}px`;
    el.style.top  = `${agent.y}px`;
    el.dataset.agentId      = agent.id;
    el.dataset.agentName    = agent.name || 'agente';
    el.dataset.agentModel   = agent.model_id || 'openai/gpt-4o';
    el.dataset.systemPrompt = agent.system_prompt || '';
    el.dataset.pokemonId    = '1';
    el.dataset.apiSource    = 'gif';
    el.innerHTML = `
      <div class="agent-actions">
        <button class="agent-action" data-action="name" title="Editar nome">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
          </svg>
        </button>
        <button class="agent-action" data-action="prompt" title="Editar prompt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/>
          </svg>
        </button>
        <button class="agent-action" data-action="delete" title="Excluir agente">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
      <img class="agent-node-pokemon" src="${gifUrl}" alt="" draggable="false"
           style="opacity:0;transition:opacity 0.3s ease"/>
      <div class="agent-node-shadow"></div>
      <div class="agent-node-label">${escapeHTML(agent.name || 'agente')}</div>
    `;

    // Reveal gif once loaded (instant from cache after first agent)
    const img = el.querySelector('.agent-node-pokemon');
    img.onload = () => { img.style.opacity = '1'; };
    img.onerror = () => { img.style.opacity = '1'; }; // show even if asset missing

    world.appendChild(el);

    const parentId = agent.parent_agent_id ?? null;
    registry.set(agent.id, { id: agent.id, el, x: agent.x, y: agent.y, parentId, childIds: [] });
    if (parentId && registry.has(parentId)) {
        registry.get(parentId).childIds.push(agent.id);
    }

    addSubagentAction(el);
    bindExtraNode(el, agent.x, agent.y, agent.id);

    return el;
}

// ─── DB: position save (debounced per agent) ──────────────────────────────────
const _savePosTimers = new Map();
function savePosition(agentId, x, y) {
    clearTimeout(_savePosTimers.get(agentId));
    _savePosTimers.set(agentId, setTimeout(async () => {
        await db.from('agents')
            .update({ x: Math.round(x), y: Math.round(y) })
            .eq('id', agentId)
            .eq('workspace_id', OrbitSession.workspaceId);
    }, 600));
}

// ─── DB: agent fields save (debounced per agent) ──────────────────────────────
const _saveFieldTimers = new Map();
function saveAgentFields(agentId, fields) {
    clearTimeout(_saveFieldTimers.get(agentId));
    _saveFieldTimers.set(agentId, setTimeout(async () => {
        await db.from('agents')
            .update(fields)
            .eq('id', agentId)
            .eq('workspace_id', OrbitSession.workspaceId);
    }, 800));
}

// ─── Viewport: persist zoom/pan in localStorage ───────────────────────────────
const saveViewport = (function () {
    let t;
    return function () {
        clearTimeout(t);
        t = setTimeout(() => {
            localStorage.setItem('orbit_canvas_view', JSON.stringify({
                tx: tgt.x, ty: tgt.y, scale: tgt.scale,
            }));
        }, 500);
    };
})();

function restoreViewport() {
    try {
        const saved = JSON.parse(localStorage.getItem('orbit_canvas_view') ?? 'null');
        if (saved && typeof saved.tx === 'number') {
            tgt.x = cur.x = saved.tx;
            tgt.y = cur.y = saved.ty;
            tgt.scale = cur.scale = clamp(saved.scale, MIN_SCALE, MAX_SCALE);
            return;
        }
    } catch { /* ignore */ }
    // No saved viewport — center on first loaded agent
    const first = registry.values().next().value;
    if (first) {
        const rect = viewport.getBoundingClientRect();
        tgt.x = cur.x = rect.width  / 2 - (first.x + NODE_W / 2 - 2000);
        tgt.y = cur.y = rect.height * 0.28 - (first.y + NODE_W / 2 - 2000);
    }
}
