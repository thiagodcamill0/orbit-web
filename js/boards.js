// ─── Boards: visual grouping system ───────────────────────────────────────────

(function () {

  const PRESETS = ['#1e3a5f','#3b2469','#1a4230','#5c3010','#561830','#1e3040'];
  const BOARD_ALPHA = 0.22;
  const MIN_W = 180;
  const MIN_H = 130;
  const DEFAULT_W = 340;
  const DEFAULT_H = 240;

  let activeBoard = null;
  let viewport, world, popover;

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getTransform() {
    const m = new DOMMatrix(getComputedStyle(world).transform);
    return { tx: m.m41, ty: m.m42, scale: m.a };
  }

  function screenToWorld(sx, sy) {
    const { tx, ty, scale } = getTransform();
    return { x: (sx - tx) / scale + 2000, y: (sy - ty) / scale + 2000 };
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ─── Popover position ─────────────────────────────────────────────────────────
  function syncPopover() {
    if (!activeBoard || !popover.classList.contains('open')) return;
    const boardRect = activeBoard.getBoundingClientRect();
    const vpRect    = viewport.getBoundingClientRect();
    const left = boardRect.left - vpRect.left;
    const top  = boardRect.top  - vpRect.top - 52;
    popover.style.left = `${Math.max(4, Math.min(left, vpRect.width - 240))}px`;
    popover.style.top  = `${top < 4 ? boardRect.bottom - vpRect.top + 8 : top}px`;
  }

  // ─── Color ────────────────────────────────────────────────────────────────────
  function applyColor(el, color) {
    el.style.background  = hexToRgba(color, BOARD_ALPHA);
    el.style.borderColor = hexToRgba(color, 0.45);
    el.dataset.color = color;
  }

  // ─── Selection ────────────────────────────────────────────────────────────────
  function select(el) {
    if (activeBoard && activeBoard !== el) activeBoard.classList.remove('selected');
    activeBoard = el;
    el.classList.add('selected');

    const color = el.dataset.color || PRESETS[0];
    popover.querySelectorAll('.board-color-swatch')
      .forEach(s => s.classList.toggle('active', s.dataset.color === color));
    document.getElementById('boardColorCustom').value = color;

    popover.classList.add('open');
    syncPopover();
  }

  function deselect() {
    if (activeBoard) activeBoard.classList.remove('selected');
    activeBoard = null;
    popover.classList.remove('open');
  }

  // ─── DB saves (debounced) ─────────────────────────────────────────────────────
  const saveGeometry = debounce(async (el) => {
    if (!el.dataset.boardId) return;
    await db.from('boards').update({
      x:      Math.round(parseFloat(el.style.left)),
      y:      Math.round(parseFloat(el.style.top)),
      width:  Math.round(parseFloat(el.style.width)),
      height: Math.round(parseFloat(el.style.height)),
    }).eq('id', el.dataset.boardId);
  }, 800);

  const saveColor = debounce(async (el, color) => {
    if (!el.dataset.boardId) return;
    await db.from('boards').update({ color }).eq('id', el.dataset.boardId);
  }, 800);

  // ─── Create board ─────────────────────────────────────────────────────────────
  // opts.dbId   → board already exists in DB (loading phase), skip INSERT
  // opts.name   → board name
  // opts.width  → board width
  // opts.height → board height
  async function createBoard(wx, wy, color, opts = {}) {
    let boardId = opts.dbId ?? null;
    const w     = opts.width  ?? DEFAULT_W;
    const h     = opts.height ?? DEFAULT_H;
    const name  = opts.name   ?? 'Quadro';

    if (!boardId) {
      const { data, error } = await db.from('boards').insert({
        workspace_id: OrbitSession.workspaceId,
        name,
        color,
        x:      Math.round(wx),
        y:      Math.round(wy),
        width:  Math.round(w),
        height: Math.round(h),
      }).select('id').single();
      if (error) { console.error('Board create failed:', error); return null; }
      boardId = data.id;
    }

    const el = document.createElement('div');
    el.className = 'canvas-board';
    el.dataset.boardId = boardId;
    el.style.left   = `${wx}px`;
    el.style.top    = `${wy}px`;
    el.style.width  = `${w}px`;
    el.style.height = `${h}px`;
    applyColor(el, color);

    // Title
    const title = document.createElement('input');
    title.className = 'canvas-board-title';
    title.type = 'text';
    title.value = name;
    title.spellcheck = false;
    title.addEventListener('mousedown',   e => e.stopPropagation());
    title.addEventListener('pointerdown', e => e.stopPropagation());
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Escape') title.blur();
      e.stopPropagation();
    });
    title.addEventListener('blur', () => {
      if (!el.dataset.boardId) return;
      db.from('boards')
        .update({ name: title.value.trim() || 'Quadro' })
        .eq('id', el.dataset.boardId)
        .then(() => {});
    });

    // Delete button
    const del = document.createElement('button');
    del.className = 'canvas-board-delete';
    del.title = 'Remover quadro';
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    del.addEventListener('mousedown',   e => { e.stopPropagation(); e.preventDefault(); });
    del.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); });
    del.addEventListener('click', async e => {
      e.stopPropagation();
      if (el.dataset.boardId) {
        await db.from('boards').delete().eq('id', el.dataset.boardId);
      }
      el.remove();
      deselect();
    });

    // Resize handles
    ['n','s','e','w','ne','nw','se','sw'].forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `board-resize board-resize-${dir}`;
      handle.dataset.dir = dir;
      el.appendChild(handle);
    });

    el.appendChild(title);
    el.appendChild(del);
    bindBoard(el);

    const firstAgent = world.querySelector('.agent-node');
    if (firstAgent) world.insertBefore(el, firstAgent);
    else world.appendChild(el);

    return el;
  }

  // ─── Board interaction ────────────────────────────────────────────────────────
  function bindBoard(el) {
    let drag = null;

    el.addEventListener('mousedown',   e => e.stopPropagation());

    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.canvas-board-title') || e.target.closest('.canvas-board-delete')) return;

      select(el);
      e.stopPropagation();

      const { scale } = getTransform();
      const resizeHandle = e.target.closest('.board-resize');

      drag = {
        type:   resizeHandle ? 'resize' : 'move',
        dir:    resizeHandle?.dataset.dir || '',
        startX: e.clientX,
        startY: e.clientY,
        origX:  parseFloat(el.style.left),
        origY:  parseFloat(el.style.top),
        origW:  parseFloat(el.style.width),
        origH:  parseFloat(el.style.height),
        scale,
      };

      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const { scale } = getTransform();
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;

      if (drag.type === 'move') {
        el.style.left = `${drag.origX + dx}px`;
        el.style.top  = `${drag.origY + dy}px`;
        syncPopover();
        return;
      }

      let x = drag.origX, y = drag.origY, w = drag.origW, h = drag.origH;
      const d = drag.dir;
      if (d.includes('e')) w = Math.max(MIN_W, drag.origW + dx);
      if (d.includes('s')) h = Math.max(MIN_H, drag.origH + dy);
      if (d.includes('w')) { const nw = Math.max(MIN_W, drag.origW - dx); x = drag.origX + (drag.origW - nw); w = nw; }
      if (d.includes('n')) { const nh = Math.max(MIN_H, drag.origH - dy); y = drag.origY + (drag.origH - nh); h = nh; }
      el.style.left   = `${x}px`;
      el.style.top    = `${y}px`;
      el.style.width  = `${w}px`;
      el.style.height = `${h}px`;
      syncPopover();
    });

    el.addEventListener('pointerup', () => {
      if (drag) saveGeometry(el);
      drag = null;
    });
    el.addEventListener('pointercancel', () => { drag = null; });
  }

  // ─── Init (UI only, no DB) ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    viewport = document.getElementById('canvasViewport');
    world    = document.getElementById('canvasWorld');
    popover  = document.getElementById('boardColorPopover');

    // Guard: boards.js só funciona na página do canvas
    if (!viewport || !world || !popover) return;

    // New board button
    document.getElementById('newBoardBtn')?.addEventListener('click', async e => {
      e.stopPropagation();
      const color = PRESETS[Math.floor(Math.random() * PRESETS.length)];
      const rect  = viewport.getBoundingClientRect();
      const wPos  = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      await createBoard(wPos.x - DEFAULT_W / 2, wPos.y - DEFAULT_H / 2, color);
    });

    // Swatches
    popover.querySelectorAll('.board-color-swatch').forEach(sw => {
      sw.addEventListener('pointerdown', e => e.stopPropagation());
      sw.addEventListener('click', e => {
        e.stopPropagation();
        if (!activeBoard) return;
        popover.querySelectorAll('.board-color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        applyColor(activeBoard, sw.dataset.color);
        document.getElementById('boardColorCustom').value = sw.dataset.color;
        saveColor(activeBoard, sw.dataset.color);
      });
    });

    // Custom color picker
    const custom = document.getElementById('boardColorCustom');
    custom?.addEventListener('pointerdown', e => e.stopPropagation());
    custom?.addEventListener('input', e => {
      e.stopPropagation();
      if (!activeBoard) return;
      popover.querySelectorAll('.board-color-swatch').forEach(s => s.classList.remove('active'));
      applyColor(activeBoard, custom.value);
      saveColor(activeBoard, custom.value);
    });

    // Deselect when clicking canvas (not board, not popover)
    viewport.addEventListener('pointerdown', e => {
      if (!e.target.closest('.canvas-board') && !e.target.closest('.board-color-popover')) {
        deselect();
      }
    });

    // Position board button next to new-agent button
    const newAgentBtn = document.getElementById('newAgentBtn');
    const boardBtn    = document.getElementById('newBoardBtn');
    if (newAgentBtn && boardBtn) {
      requestAnimationFrame(() => {
        boardBtn.style.left = `${newAgentBtn.offsetLeft + newAgentBtn.offsetWidth + 10}px`;
      });
    }
  });

  // ─── Public API ───────────────────────────────────────────────────────────────
  // Called by agents.js after orbitSessionReady, BEFORE agents are rendered
  // (ensures boards sit below agents in the DOM = correct z-order)
  window.OrbitBoards = {
    async loadAndRender(workspaceId) {
      const { data, error } = await db
        .from('boards')
        .select('id, name, color, x, y, width, height')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });
      if (error) { console.error('loadBoards error:', error); return; }
      for (const b of (data ?? [])) {
        await createBoard(b.x, b.y, b.color, {
          dbId: b.id, name: b.name, width: b.width, height: b.height,
        });
      }
    },
  };

})();
