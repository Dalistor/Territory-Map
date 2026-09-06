# [0104] CSS do admin: primária azul e classes do shell com sidebar (spec 0006, Task 01)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0006/` — Task 01

## Solicitação
Trocar a identidade primária do admin de verde para azul (`--color-primary: #1565c0`,
`--color-primary-dark: #0d47a1`), revisar os tons derivados que assumiam verde, e adicionar as
classes CSS do novo shell com sidebar (Task 04) e do editor lado a lado (Task 06). Tocar apenas
`admin/src/renderer/index.css`.

## Contexto
A spec 0006 redesenha o admin com sidebar de navegação e identidade azul consistente com o app do
publicador (implements/0101). Esta task é a base visual: paleta azul e as classes de layout que as
tasks seguintes vão consumir — o CSS novo fica inerte até lá, porque nenhum `.tsx` muda aqui.

## O que foi feito
1. **Verde → azul** nas variáveis (`--color-primary: #1565c0`, `--color-primary-dark: #0d47a1`) e
   nos tons derivados: gradient do `.setup-screen` (`#eef4ef` → `#eef3fa`), box-shadow do
   `.setup-card` (`rgba(27, 94, 32, .1)` → `rgba(13, 71, 161, .1)`), fundo do `.setup-mark`
   (`#e8f3e9` → `#e8f0fe`) e do `.avatar` (`#dcebe0` → `#dbe7f5`). `a`, botões primários e
   `.access-code-display` já usavam as variáveis, então herdaram o azul. Nenhum tom de verde
   restou no CSS global (o `#2e7d32` continua só em `TerritoryMap.tsx`, como status de quadra).
2. **Classes do shell com sidebar**: `.app-shell`, `.app-sidebar` (220px, surface, borda direita),
   `.sidebar-header` (com estilos para `h1`/`p` — nome e cidade da congregação),
   `.sidebar-nav` e seus botões (largura total, alinhados à esquerda, `.is-active` com fundo
   `#e8f0fe` e texto `var(--color-primary-dark)`, hover sutil), `.sidebar-footer` (borda superior,
   botão discreto com `--color-danger` no hover) e `.app-content` (flex 1, min-width 0,
   overflow hidden).
3. **Classes do editor lado a lado**: `.editor-split`, `.editor-panel` (300px, coluna, scroll
   próprio) e `.editor-map`, com `.editor-map .leaflet-container { height: 100%; flex: 1; }` para
   o mapa ocupar toda a altura — o seletor existente `main > div:has(> .leaflet-container)` não
   foi alterado, porque continua servindo à Home até a Task 06 migrar o editor.

## Arquivos modificados
- `admin/src/renderer/index.css` — troca verde→azul e classes novas do shell e do split

## Decisões técnicas
- Os tons derivados de azul seguem a mesma família Material do `#1565c0` (blue 800/900), e
  `#e8f0fe` reaproveita o azul-claro que o CSS já usava em `[role='note']` e
  `.status-badge.status-live-code` — a paleta fecha sem introduzir um azul novo por regra.
- As classes novas foram adicionadas em vez de reaproveitar `header`/`main`, porque o shell da
  Task 04 convive com o layout atual até as telas migrarem; nada quebra no meio do caminho.
- `.editor-map` recebeu regra própria para o `.leaflet-container` em vez de mexer no seletor
  `main > div:has(...)`, que a Home ainda usa.

## Como validar
Visual só aparece nas próximas tasks; por ora: `cd admin && npm run lint && npm test`, e conferir
que `grep -i 2e7d32 src/renderer/index.css` não retorna nada.

## Resultado da validação
- `npm run lint` — sem erros.
- `npm test` — 18 arquivos, **318 testes verdes** (a suíte não depende de CSS, como esperado).
- Nenhum tom de verde (`#2e7d32`, `#1b5e20`, `#e8f3e9`, `#dcebe0`, `#eef4ef`) restante no CSS.
