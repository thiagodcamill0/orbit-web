/* ─── Mock data ─────────────────────────────────── */

const PERIODS = {
  'hoje': {
    label: 'hoje',
    data: [
      { label: '00h', tokens:  820, exec:  3, errors: 0, avgMs:  980 },
      { label: '02h', tokens:  340, exec:  1, errors: 0, avgMs: 1020 },
      { label: '04h', tokens:  110, exec:  0, errors: 0, avgMs:    0 },
      { label: '06h', tokens:  490, exec:  2, errors: 0, avgMs:  870 },
      { label: '08h', tokens: 2840, exec: 11, errors: 1, avgMs: 1140 },
      { label: '10h', tokens: 4720, exec: 18, errors: 1, avgMs: 1210 },
      { label: '12h', tokens: 3980, exec: 15, errors: 0, avgMs: 1090 },
      { label: '14h', tokens: 5310, exec: 20, errors: 2, avgMs: 1280 },
      { label: '16h', tokens: 4100, exec: 16, errors: 1, avgMs: 1150 },
      { label: '18h', tokens: 2760, exec: 10, errors: 0, avgMs: 1060 },
      { label: '20h', tokens: 1940, exec:  7, errors: 0, avgMs: 1030 },
      { label: '22h', tokens:  980, exec:  4, errors: 0, avgMs:  990 },
    ],
  },
  '7d': {
    label: 'últimos 7 dias',
    data: [
      { label: 'Seg', tokens: 18400, exec: 72,  errors: 3, avgMs: 1180 },
      { label: 'Ter', tokens: 24100, exec: 89,  errors: 1, avgMs: 1240 },
      { label: 'Qua', tokens: 31200, exec: 114, errors: 5, avgMs: 1090 },
      { label: 'Qui', tokens: 27800, exec: 98,  errors: 2, avgMs: 1320 },
      { label: 'Sex', tokens: 35600, exec: 131, errors: 4, avgMs: 1150 },
      { label: 'Sáb', tokens: 19200, exec: 67,  errors: 1, avgMs:  980 },
      { label: 'Dom', tokens: 22900, exec: 84,  errors: 2, avgMs: 1060 },
    ],
  },
  '30d': {
    label: 'últimos 30 dias',
    data: [
      { label: '5/Mar',  tokens: 15200, exec:  58, errors: 2, avgMs: 1100 },
      { label: '6/Mar',  tokens: 18700, exec:  71, errors: 1, avgMs: 1180 },
      { label: '7/Mar',  tokens: 22400, exec:  84, errors: 3, avgMs: 1250 },
      { label: '8/Mar',  tokens: 19800, exec:  74, errors: 2, avgMs: 1070 },
      { label: '9/Mar',  tokens: 28100, exec: 105, errors: 4, avgMs: 1390 },
      { label: '10/Mar', tokens: 24600, exec:  92, errors: 2, avgMs: 1210 },
      { label: '11/Mar', tokens: 17300, exec:  63, errors: 1, avgMs:  980 },
      { label: '12/Mar', tokens: 20100, exec:  76, errors: 2, avgMs: 1050 },
      { label: '13/Mar', tokens: 26800, exec:  98, errors: 3, avgMs: 1170 },
      { label: '14/Mar', tokens: 31400, exec: 118, errors: 5, avgMs: 1340 },
      { label: '15/Mar', tokens: 29200, exec: 109, errors: 4, avgMs: 1280 },
      { label: '16/Mar', tokens: 34100, exec: 127, errors: 3, avgMs: 1190 },
      { label: '17/Mar', tokens: 27500, exec: 103, errors: 2, avgMs: 1120 },
      { label: '18/Mar', tokens: 21900, exec:  82, errors: 2, avgMs: 1060 },
      { label: '19/Mar', tokens: 19400, exec:  72, errors: 1, avgMs:  990 },
      { label: '20/Mar', tokens: 25300, exec:  95, errors: 3, avgMs: 1230 },
      { label: '21/Mar', tokens: 33700, exec: 126, errors: 5, avgMs: 1410 },
      { label: '22/Mar', tokens: 38200, exec: 143, errors: 6, avgMs: 1360 },
      { label: '23/Mar', tokens: 35100, exec: 131, errors: 4, avgMs: 1290 },
      { label: '24/Mar', tokens: 29800, exec: 112, errors: 3, avgMs: 1180 },
      { label: '25/Mar', tokens: 24100, exec:  90, errors: 2, avgMs: 1100 },
      { label: '26/Mar', tokens: 20700, exec:  78, errors: 2, avgMs: 1040 },
      { label: '27/Mar', tokens: 28400, exec: 106, errors: 3, avgMs: 1200 },
      { label: '28/Mar', tokens: 32600, exec: 122, errors: 4, avgMs: 1310 },
      { label: '29/Mar', tokens: 36900, exec: 138, errors: 5, avgMs: 1370 },
      { label: '30/Mar', tokens: 31200, exec: 117, errors: 4, avgMs: 1250 },
      { label: '31/Mar', tokens: 25800, exec:  97, errors: 2, avgMs: 1160 },
      { label: '1/Abr',  tokens: 22100, exec:  83, errors: 2, avgMs: 1090 },
      { label: '2/Abr',  tokens: 27700, exec: 104, errors: 3, avgMs: 1220 },
      { label: '3/Abr',  tokens: 18400, exec:  72, errors: 3, avgMs: 1180 },
    ],
  },
  '3m': {
    label: 'últimos 3 meses',
    data: [
      { label: 'Sem 1',  tokens:  98400, exec: 374, errors: 12, avgMs: 1120 },
      { label: 'Sem 2',  tokens: 112700, exec: 428, errors: 15, avgMs: 1190 },
      { label: 'Sem 3',  tokens: 134200, exec: 510, errors: 18, avgMs: 1240 },
      { label: 'Sem 4',  tokens: 127800, exec: 485, errors: 16, avgMs: 1180 },
      { label: 'Sem 5',  tokens: 156300, exec: 593, errors: 21, avgMs: 1310 },
      { label: 'Sem 6',  tokens: 143900, exec: 546, errors: 19, avgMs: 1260 },
      { label: 'Sem 7',  tokens: 168400, exec: 639, errors: 23, avgMs: 1350 },
      { label: 'Sem 8',  tokens: 175200, exec: 665, errors: 25, avgMs: 1380 },
      { label: 'Sem 9',  tokens: 161700, exec: 614, errors: 22, avgMs: 1290 },
      { label: 'Sem 10', tokens: 189300, exec: 718, errors: 27, avgMs: 1420 },
      { label: 'Sem 11', tokens: 203800, exec: 774, errors: 30, avgMs: 1460 },
      { label: 'Sem 12', tokens: 179100, exec: 680, errors: 24, avgMs: 1350 },
    ],
  },
};

const AGENTS = [
  { name: 'Atlas Support',    tokens: 89400 },
  { name: 'Hermes Dispatch',  tokens: 67200 },
  { name: 'Nova Research',    tokens: 52800 },
  { name: 'Cronos Scheduler', tokens: 38100 },
  { name: 'Iris Assistant',   tokens: 31600 },
];

/* ─── State ─────────────────────────────────────── */
let currentPeriod = '7d';

/* ─── Helpers ───────────────────────────────────── */
function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}

function fmtMs(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

/* ─── Stats cards ───────────────────────────────── */
function renderStats(period) {
  const data = PERIODS[period].data;
  const totalTokens = data.reduce((s, d) => s + d.tokens, 0);
  const totalExec   = data.reduce((s, d) => s + d.exec,   0);
  const totalErrors = data.reduce((s, d) => s + d.errors, 0);
  const avgMs       = Math.round(data.reduce((s, d) => s + d.avgMs, 0) / data.length);

  document.getElementById('anStats').innerHTML = `
    <div class="an-stat">
      <div class="an-stat-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        Tokens consumidos
      </div>
      <div class="an-stat-value">${fmtTokens(totalTokens)}</div>
      <div class="an-stat-sub">no período selecionado</div>
    </div>

    <div class="an-stat">
      <div class="an-stat-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        Execuções
      </div>
      <div class="an-stat-value">${totalExec.toLocaleString('pt-BR')}</div>
      <div class="an-stat-sub">requisições processadas</div>
    </div>

    <div class="an-stat">
      <div class="an-stat-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Tempo médio
      </div>
      <div class="an-stat-value">${fmtMs(avgMs)}</div>
      <div class="an-stat-sub">por execução</div>
    </div>

    <div class="an-stat">
      <div class="an-stat-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Erros
      </div>
      <div class="an-stat-value">${totalErrors}</div>
      <div class="an-stat-sub">falhas registradas</div>
    </div>
  `;
}

/* ─── Chart ─────────────────────────────────────── */

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function renderChart(period) {
  const svg     = document.getElementById('mainChart');
  const tooltip = document.getElementById('chartTooltip');
  const data    = PERIODS[period].data;

  const W   = svg.clientWidth  || svg.parentElement.clientWidth;
  const H   = svg.clientHeight || 272;
  const PAD = { top: 20, right: 28, bottom: 38, left: 60 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;

  const values = data.map(d => d.tokens);
  const maxV   = Math.max(...values);
  const rawMin = Math.min(...values);
  const minV   = rawMin - (maxV - rawMin) * 0.12;
  const range  = maxV - minV;

  const xScale = i => PAD.left + (i / (data.length - 1)) * cW;
  const yScale = v => PAD.top  + (1 - (v - minV) / range) * cH;

  const pts = data.map((d, i) => ({ x: xScale(i), y: yScale(d.tokens), d }));

  const linePath = smoothPath(pts);
  const last = pts[pts.length - 1];
  const fillPath = `${linePath} L ${last.x.toFixed(2)} ${(PAD.top + cH).toFixed(2)} L ${pts[0].x.toFixed(2)} ${(PAD.top + cH).toFixed(2)} Z`;

  /* ── Grid lines & Y labels ── */
  const TICK_COUNT = 4;
  let gridLines = '';
  let yLabels   = '';
  for (let i = 0; i <= TICK_COUNT; i++) {
    const v = minV + (range * i / TICK_COUNT);
    const y = yScale(v).toFixed(1);
    gridLines += `<line x1="${PAD.left}" y1="${y}" x2="${PAD.left + cW}" y2="${y}" stroke="#1e1e1e" stroke-width="1"/>`;
    if (i > 0) {
      yLabels += `<text x="${PAD.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="#444" font-size="10" font-family="Inter,sans-serif">${fmtTokens(Math.round(v))}</text>`;
    }
  }

  /* ── X labels (max ~8 evenly spaced) ── */
  const step = Math.max(1, Math.ceil(data.length / 8));
  let xLabels = '';
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1) {
      xLabels += `<text x="${xScale(i).toFixed(1)}" y="${PAD.top + cH + 22}" text-anchor="middle" fill="#444" font-size="10" font-family="Inter,sans-serif">${d.label}</text>`;
    }
  });

  /* ── Dot markers ── */
  const dots = pts.map((p, i) =>
    `<circle class="chart-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4"
      fill="var(--bg-surface)" stroke="var(--accent)" stroke-width="2"
      opacity="0" data-i="${i}" style="transition:opacity 0.1s ease"/>`
  ).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="chartGrad${period}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.22"/>
        <stop offset="85%"  stop-color="#6366f1" stop-opacity="0.03"/>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="chartClip${period}">
        <rect x="${PAD.left}" y="${PAD.top}" width="${cW}" height="${cH + 2}"/>
      </clipPath>
    </defs>
    ${gridLines}
    <g clip-path="url(#chartClip${period})">
      <path class="chart-fill" d="${fillPath}" fill="url(#chartGrad${period})"/>
      <path class="chart-line" d="${linePath}" fill="none" stroke="#6366f1" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    ${yLabels}
    ${xLabels}
    ${dots}
    <line class="chart-vline" x1="-200" y1="${PAD.top}" x2="-200" y2="${PAD.top + cH}"
      stroke="#2e2e2e" stroke-width="1" stroke-dasharray="4 3"/>
  `;

  /* ── Draw animation ── */
  const line = svg.querySelector('.chart-line');
  const len  = line.getTotalLength();
  line.style.strokeDasharray  = len;
  line.style.strokeDashoffset = len;
  line.style.transition = 'none';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    line.style.transition     = 'stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)';
    line.style.strokeDashoffset = '0';
  }));

  const fill = svg.querySelector('.chart-fill');
  fill.style.opacity    = '0';
  fill.style.transition = 'none';
  setTimeout(() => {
    fill.style.transition = 'opacity 0.7s ease 0.45s';
    fill.style.opacity    = '1';
  }, 30);

  /* ── Interaction ── */
  const vline = svg.querySelector('.chart-vline');

  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    if (mx < PAD.left || mx > PAD.left + cW) {
      hideCursor();
      return;
    }

    let closest = 0, minDist = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(p.x - mx);
      if (dist < minDist) { minDist = dist; closest = i; }
    });

    const p = pts[closest];
    const d = data[closest];

    vline.setAttribute('x1', p.x.toFixed(2));
    vline.setAttribute('x2', p.x.toFixed(2));

    svg.querySelectorAll('.chart-dot').forEach((dot, i) =>
      dot.setAttribute('opacity', i === closest ? '1' : '0')
    );

    const tooltipW  = 152;
    const tipX = p.x + 14 + tooltipW > W ? p.x - tooltipW - 10 : p.x + 14;
    const tipY = Math.max(4, p.y - 68);
    tooltip.style.transform = `translate(${tipX.toFixed(1)}px, ${tipY.toFixed(1)}px)`;
    tooltip.classList.remove('hidden');
    tooltip.innerHTML = `
      <div class="tooltip-label">${d.label}</div>
      <div class="tooltip-row">
        <span class="tooltip-key">Tokens</span>
        <span class="tooltip-val">${fmtTokens(d.tokens)}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-key">Execuções</span>
        <span class="tooltip-val">${d.exec}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-key">Erros</span>
        <span class="tooltip-val">${d.errors}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-key">T. médio</span>
        <span class="tooltip-val">${fmtMs(d.avgMs)}</span>
      </div>
    `;
  });

  svg.addEventListener('mouseleave', hideCursor);

  function hideCursor() {
    tooltip.classList.add('hidden');
    vline.setAttribute('x1', '-200');
    vline.setAttribute('x2', '-200');
    svg.querySelectorAll('.chart-dot').forEach(dot => dot.setAttribute('opacity', '0'));
  }
}

/* ─── Agents ────────────────────────────────────── */
function renderAgents(period) {
  const scale = period === '7d' ? 1 : period === '30d' ? 4.3 : 12.8;
  const agents = AGENTS.map(a => ({ ...a, total: Math.round(a.tokens * scale) }));
  const sum    = agents.reduce((s, a) => s + a.total, 0);
  const max    = agents[0].total;

  const list = document.getElementById('agentsList');
  list.innerHTML = agents.map(a => `
    <div class="an-agent-row">
      <span class="an-agent-name">${a.name}</span>
      <div class="an-agent-bar-wrap">
        <div class="an-agent-bar" data-w="${(a.total / max * 100).toFixed(1)}"></div>
      </div>
      <span class="an-agent-tokens">${fmtTokens(a.total)}</span>
      <span class="an-agent-pct">${(a.total / sum * 100).toFixed(0)}%</span>
    </div>
  `).join('');

  requestAnimationFrame(() => {
    list.querySelectorAll('.an-agent-bar').forEach((bar, i) => {
      setTimeout(() => { bar.style.width = bar.dataset.w + '%'; }, i * 70);
    });
  });
}

/* ─── Period selector ───────────────────────────── */
document.getElementById('periodTabs').addEventListener('click', e => {
  const btn = e.target.closest('.period-tab');
  if (!btn) return;

  currentPeriod = btn.dataset.period;
  document.querySelectorAll('.period-tab').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  document.getElementById('periodLabel').textContent = PERIODS[currentPeriod].label;

  renderStats(currentPeriod);
  renderChart(currentPeriod);
  renderAgents(currentPeriod);
});

/* ─── Init ──────────────────────────────────────── */
function init() {
  renderStats(currentPeriod);
  renderAgents(currentPeriod);

  requestAnimationFrame(() => {
    renderChart(currentPeriod);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderChart(currentPeriod), 120);
  });
}

init();
