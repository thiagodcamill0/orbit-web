/* ─── Integration Icon System ──────────────────── */
// Camada centralizada de ícones para integrações do Orbit.
// Fonte principal: Iconify (simple-icons via CDN).
// Fallback: SVG inline customizado para ícones sem cobertura no Iconify.

// ─── Fallbacks inline ─────────────────────────────

const _xaiSVG = (size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true" style="display:block;flex-shrink:0;">
  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.625L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
</svg>`;

// ─── Icon Map ──────────────────────────────────────
// icon: nome do ícone no Iconify; color: cor de marca para fundo escuro

/**
 * @type {Record<string, {icon: string, color: string} | null>}
 */
export const integrationIconMap = {
  'openai':        { icon: 'simple-icons:openai',       color: '#e5e5e5' },
  'anthropic':     { icon: 'simple-icons:anthropic',    color: '#c96442' },
  'gemini':        { icon: 'simple-icons:googlegemini', color: '#4285f4' },
  'grok':          null,
  'openrouter':    { icon: 'simple-icons:openrouter',   color: '#6366f1' },
  'slack':         { icon: 'simple-icons:slack',        color: '#e01e5a' },
  'github':        { icon: 'simple-icons:github',       color: '#e5e5e5' },
  'notion':        { icon: 'simple-icons:notion',       color: '#e5e5e5' },
  'google-sheets': { icon: 'simple-icons:googlesheets', color: '#34a853' },
};

/** Cores de marca para fallbacks SVG */
const _fallbackColors = {
  'grok': '#e5e5e5',
};

/** Funções de fallback SVG por ID */
const _fallbacks = {
  'grok': _xaiSVG,
};

// ─── API pública ───────────────────────────────────

/**
 * Retorna HTML string com o ícone da integração na cor de marca.
 * Usa Iconify se disponível, SVG inline se necessário,
 * e initials como último recurso.
 *
 * @param {string} id   - ID da integração (ex: 'openai', 'slack')
 * @param {number} size - Tamanho em px (padrão 18)
 * @returns {string} HTML string pronto para innerHTML
 */
export function getIntegrationIcon(id, size = 18) {
  const entry = integrationIconMap[id];

  // Iconify via CDN com cor de marca explícita
  if (entry) {
    return `<span class="iconify" data-icon="${entry.icon}" style="font-size:${size}px;color:${entry.color};line-height:1;display:block;"></span>`;
  }

  // SVG inline customizado (ex: xAI/Grok)
  const fallbackFn = _fallbacks[id];
  if (fallbackFn) return fallbackFn(size, _fallbackColors[id] ?? '#e5e5e5');

  // Último recurso: initials derivadas do ID
  const initials = id.replace(/-/g, ' ').split(' ')
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return `<span style="font-size:10px;font-weight:700;letter-spacing:-0.02em;">${initials}</span>`;
}
