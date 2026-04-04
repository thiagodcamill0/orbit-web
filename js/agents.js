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
// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    viewport = document.getElementById('canvasViewport');
    world = document.getElementById('canvasWorld');
    label = document.getElementById('zoomLabel');
    node.el = document.getElementById('agentNode');
    loadPokemon();
    centerOnNode();
    bindCanvas();
    bindNode();
    bindButtons();
    bindPanel();
    requestAnimationFrame(loop);
});
// ─── Pokémon ──────────────────────────────────────────────────────────────────
function loadPokemon() {
    const img = document.getElementById('pokemonSprite');
    if (!img)
        return;
    // Pokémon HOME sprites — 3D renders, transparent PNG
    // IDs 1–898 (gens 1–8, avoids special forms that may be missing)
    const id = Math.floor(Math.random() * 151) + 1;
    currentPokemonId = id;
    const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;
    img.src = url;
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.4s ease';
    img.onload = () => { img.style.opacity = '1'; };
    img.onerror = () => {
        // fallback to official artwork if home sprite missing
        img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
        img.onload = () => { img.style.opacity = '1'; };
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
    tgt.x = rect.width / 2 - (nodeCX - 2000);
    tgt.y = rect.height / 2 - (nodeCY - 2000);
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
    // Node drag — organic lerp (gives the "alive" lag)
    if (node.dragging) {
        node.x += (node.tx - node.x) * LERP_NODE;
        node.y += (node.ty - node.y) * LERP_NODE;
        node.el.style.left = `${node.x}px`;
        node.el.style.top = `${node.y}px`;
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
        const onNode = node.el.contains(e.target);
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
            enterEditMode(); // quick click = select agent, enter edit mode
        }
        el._quickClick = false;
        if (node.dragging) {
            node.dragging = false;
            el.classList.remove('dragging');
            // Stay in edit mode
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
        case 'status': {
            const chips = Array.from(document.querySelectorAll('.status-chip'));
            const active = chips.findIndex(c => c.classList.contains('active'));
            chips.forEach(c => c.classList.remove('active'));
            chips[(active + 1) % chips.length].classList.add('active');
            break;
        }
        case 'settings':
            openPanel();
            break;
    }
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
function bindPanel() {
    const panel = document.getElementById('agentPanel');
    const closeBtn = document.getElementById('closePanelBtn');
    // Close
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));
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
    // Pokémon picker
    const pokemonInput = document.getElementById('fieldPokemonId');
    const pickerPreview = document.getElementById('pokemonPickerPreview');
    const mainSprite = document.getElementById('pokemonSprite');
    const miniSprite = document.getElementById('panelPokemonMini');
    function applyPokemonId(id) {
        id = Math.min(898, Math.max(1, id));
        currentPokemonId = id;
        const url = pokemonUrl(id);
        // Update picker preview
        pickerPreview.style.opacity = '0';
        pickerPreview.src = url;
        pickerPreview.onload = () => { pickerPreview.style.opacity = '1'; };
        // Update canvas sprite
        mainSprite.style.opacity = '0';
        mainSprite.src = url;
        mainSprite.onload = () => { mainSprite.style.opacity = '1'; };
        // Update header mini
        miniSprite.src = url;
    }
    pokemonInput?.addEventListener('input', () => {
        const val = parseInt(pokemonInput.value);
        if (!isNaN(val) && val >= 1 && val <= 898)
            applyPokemonId(val);
    });
}
function openPanel() {
    const panel = document.getElementById('agentPanel');
    const mainSprite = document.getElementById('pokemonSprite');
    const miniSprite = document.getElementById('panelPokemonMini');
    const pickerPreview = document.getElementById('pokemonPickerPreview');
    const pokemonInput = document.getElementById('fieldPokemonId');
    // Sync current pokemon into panel
    miniSprite.src = mainSprite.src;
    pickerPreview.src = mainSprite.src;
    pickerPreview.style.opacity = '1';
    if (pokemonInput)
        pokemonInput.value = String(currentPokemonId);
    panel.classList.add('open');
}
function pokemonUrl(id) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;
}
// ─── Utils ────────────────────────────────────────────────────────────────────
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
export {};
//# sourceMappingURL=agents.js.map