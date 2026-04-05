# Orbit

Dashboard para gerenciamento de agentes de inteligência artificial. Interface dark, minimalista e premium, construída com HTML, CSS e JavaScript puro — sem frameworks, sem build step.

## Conceito

Orbit é uma plataforma de controle para sistemas multiagente de IA. A ideia central é que agentes de IA não precisam trabalhar sozinhos — eles podem ser organizados em hierarquias, colaborar entre si, delegar tarefas e operar em conjunto para resolver problemas mais complexos.

O dashboard oferece uma visão clara desse ecossistema: quem são os agentes, como estão conectados, o que estão consumindo e como estão performando.

## Funcionalidades

- **Canvas de agentes** — visualização interativa com drag, zoom e pan. Agentes são representados como nós no canvas e podem ser conectados em estruturas hierárquicas (agente → subagentes)
- **Subagentes** — crie agentes subordinados a partir de qualquer agente existente. As conexões são exibidas com linhas suaves e um indicador de fluxo animado
- **Analytics** — métricas de consumo de tokens, execuções, tempo médio de resposta e erros, com gráfico de linha interativo e seletor de período (hoje, 7 dias, 30 dias, 3 meses)
- **Integrações** — conecte serviços externos e vincule-os aos agentes
- **Perfil** — gerenciamento de nome, foto e senha do usuário
- **Sidebar responsiva** — colapsa com animação fluida, persiste estado via localStorage

## Páginas

| Página | Descrição |
|---|---|
| Home | Visão geral e estatísticas dos agentes |
| Agentes | Canvas interativo para criação e organização de agentes |
| Analytics | Métricas de uso e performance |
| Security | Controle de acesso e logs de auditoria |
| Results | Resultados das execuções |
| Logs | Histórico de eventos do sistema |
| Integrações | Conexão com serviços externos |
| Configurações | Preferências do sistema |
| Billing | Uso e cobranças da conta |
| Perfil | Dados pessoais e segurança |

## Stack

- HTML + CSS + JavaScript — sem dependências de runtime
- TypeScript (compilado para `js/agents.js`) para o engine do canvas
- SVG nativo para gráficos e conexões entre agentes

## Como rodar

```bash
python3 -m http.server 3000
```

Acesse `http://localhost:3000`.
