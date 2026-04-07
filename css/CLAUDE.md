# Orbit — Contexto do Projeto

## Visão geral

Orbit é um dashboard de gerenciamento de agentes de IA. Interface dark, minimalista e premium. Construído com HTML, CSS e JavaScript puro — sem frameworks, sem build step, sem dependências de runtime.

## Objetivo

Visualizar e organizar sistemas multiagente: criar agentes, conectá-los em hierarquias, configurar modelos e prompts, agrupar por quadros no canvas.

## Estilo visual

- Dark theme absoluto: fundos `#0a0a0f`, `#0f0f17`, `#13131e`
- Accent: roxo-índigo `#6366f1` com hover `#818cf8`
- Sem cores vivas. Tudo muted, pastéis escuros, sem branco puro
- Bordas sutis: `rgba(255,255,255,0.06)`
- Glassmorphism leve em cards: `backdrop-filter: blur`
- Tipografia: Inter, tamanhos 11–15px, peso 400–600

## Princípios de UX

- Feedback visual imediato: opacidade, scale, transitions 0.15–0.25s ease
- Sem modais desnecessários: ações inline quando possível
- Estado do sidebar persiste via localStorage
- Canvas: drag fluido, zoom com wheel, inércia após pan

## Arquitetura

```
orbit-web/
├── index.html          # Home
├── agents.html         # Canvas de agentes (página principal)
├── analytics.html      # Métricas
├── security.html       # Controle de acesso
├── results.html        # Resultados de execuções
├── logs.html           # Histórico de eventos
├── integrations.html   # Serviços externos
├── settings.html       # Preferências
├── billing.html        # Cobranças
├── profile.html        # Perfil do usuário
├── css/
│   ├── global.css      # Reset, variáveis CSS, tipografia base
│   ├── dashboard.css   # Sidebar, nav, layout geral
│   ├── canvas.css      # Canvas de agentes e sistema de quadros
│   ├── panel.css       # Painel lateral de edição de agente
│   └── analytics.css   # Página de analytics
└── js/
    ├── agents.js       # Engine do canvas (TypeScript compilado)
    ├── boards.js       # Sistema de quadros (IIFE puro)
    ├── analytics.js    # Gráficos e métricas
    └── sidebar.js      # Toggle e persistência do sidebar
```

## Canvas

- `canvas-world` é um div de 4000×4000px posicionado em `top: -2000; left: -2000`
- Coordenadas de mundo (world-HTML) começam em ~1956, ~1920 para o agente padrão
- Transform: `translate(tx, ty) scale(s)` aplicado ao world
- Conversão screen → world: `x = (sx - tx) / scale + 2000`
- Agentes têm `z-index` maior que quadros; quadros ficam inseridos antes dos nós no DOM

## Sistema de quadros (Boards)

- Criados com cor aleatória dos PRESETS, sem abrir popover
- Clique no quadro → abre popover de cor posicionado com `getBoundingClientRect()`
- Popover segue o quadro durante drag via `syncPopover()`
- Resize em 8 direções com handles CSS
- Bloqueiam pan do canvas via `mousedown stopPropagation`

## Aparência dos agentes

- **Padrão**: DiceBear Pixel Art RPG — `https://api.dicebear.com/9.x/pixel-art/svg?seed=ID`
- **Alternativa**: Pokémon HOME sprites via PokeAPI
- Configurável por agente no painel (campo "Fonte de aparência")
- `currentApiSource` global controla o padrão para novos agentes

## Conexões entre agentes

- SVG overlay de 4000×4000 dentro do world
- Curvas cúbicas Bezier com ponto de saída na base do sprite e entrada no topo
- Dot animado via `<animateMotion>` + `<mpath>`
- `nodeExit(id)` → `y + 30 (actions) + 96 (sprite)` = base do sprite
- `nodeEntry(id)` → `y + 30` = topo do sprite (abaixo dos botões)

## O que evitar

- Nunca adicionar frameworks (React, Vue, etc.)
- Nunca usar cores claras ou saturadas no tema
- Nunca abrir modais/popovers sem interação explícita do usuário
- Nunca criar arquivos de build ou configuração de bundler
- Nunca adicionar dependências npm ao projeto
