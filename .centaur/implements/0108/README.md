# [0108] Sidebar: o novo shell de navegação no `App.tsx`

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0006/` — Task 04

## Solicitação
Reestruturar `AuthenticatedApp` para o layout de shell: sidebar fixa à esquerda (`.app-sidebar`)
com o nome da congregação no topo, os botões "Mapa" / "Designações" / "Publicadores" (ativo com
`is-active` + `aria-current="page"`) e "Sair da congregação" no rodapé (mesma confirmação literal
do `HomeScreen`); rotas renderizando em `.app-content` à direita; telas empurradas continuam com
`PushedScreen`/"← Voltar" dentro da área de conteúdo, com a sidebar visível.

## Contexto
Spec 0006 muda a navegação do admin de botões no header da Home para uma sidebar permanente. A
Task 01 já criou o CSS (`.app-shell`, `.app-sidebar`, etc.) e a Task 03 a `DesignationsScreen`;
esta task liga tudo no roteador manual do `App.tsx`. A Task 05 removerá do `HomeScreen` os botões
que ficaram duplicados (os props `onOpenPublishers`/`onSignedOut` são opcionais, então parar de
passá-los compila).

## Critérios de aceite
- Sidebar com header da congregação (nome + cidade; "Territory Map" quando `congregation` é null),
  três seções e "Sair da congregação"; "Mapa" inicialmente ativa (`is-active` + `aria-current`).
- "Designações" → `DesignationsScreen` (com `fallbackCenter`); "Publicadores" → `PublishersScreen`
  (sem `PushedScreen`); "Mapa" volta à Home. O estado ativo acompanha.
- Sign-out: confirmação aceita chama `window.api.session.signOut()` e `onSignedOut()`; recusada
  não chama nada; falha vira `role="alert"` na área de conteúdo, permanecendo autenticado.
- Editores/histórico continuam empurrados com "← Voltar" voltando à Home, renderizados dentro de
  `.app-content` com a sidebar visível. `mapView` e `fallbackCenter` preservados.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | shows the sidebar with the congregation, the three sections, and "Mapa" initially active | `admin/src/renderer/App.test.tsx` | O shell inteiro: `.app-shell`/`.app-sidebar`/`.app-content`, `Section`/`sectionOf`, rota `designations`, `SIGN_OUT_CONFIRM_MESSAGE` copiada, handler de sign-out |
| 2 | returns to SetupScreen after signing out from the sidebar's "Sair da congregação" (adaptado do teste antigo via menu da Home) | idem | — (verifica o handler do ciclo 1, agora com a asserção da mensagem literal do confirm) |
| 3 | opens the publishers screen from the sidebar and returns home from "Mapa" (adaptado) | idem | Publishers como seção da sidebar, sem `PushedScreen` |
| 4 | falls back to "Territory Map" in the sidebar header when the congregation is unknown | idem | — (branch do header) |
| 5 | shows the Designations screen when "Designações" is clicked, and "Mapa" returns home | idem | — (rota `designations` real, `DesignationsScreen` de verdade com fakes de `window.api`) |
| 6 | does not sign out when the confirmation is declined | idem | — (early-return do confirm) |
| 7 | shows a sign-out failure as an alert in the content area and stays signed in | idem | — (catch → `role="alert"`) |
| 8 | asserção nova no teste do editor de território: sidebar visível durante tela empurrada | idem | — (pushed screens dentro de `.app-content`) |

O shell foi implementado como unidade no GREEN do ciclo 1 (markup fatiado produziria estados
intermediários sem sentido); os ciclos 4–8 são a verificação branch a branch desse código, escrita
e executada na sequência — todos com asserções específicas que falhariam sem o branch respectivo.

## O que foi feito
- `AuthenticatedApp` reescrito para o layout de shell com sidebar permanente e área de conteúdo.
- Rota nova `{ kind: 'designations' }` → `DesignationsScreen` com `fallbackCenter`.
- `publishers` deixou de ser tela empurrada: é seção da sidebar, sem "← Voltar".
- Sign-out migrado do `HomeScreen` para a sidebar: `SIGN_OUT_CONFIRM_MESSAGE` copiada literalmente,
  `window.confirm` → `signOut()` → `onSignedOut()`; falha exibida como `role="alert"` no conteúdo.
- `HomeScreen` deixou de receber `onOpenPublishers`/`onSignedOut` (props opcionais; remoção deles
  do componente é a Task 05).
- `mapView` e `fallbackCenter` intactos no nível de `AuthenticatedApp`.
- Testes adaptados: sign-out via sidebar (antes via menu "Mais opções" da Home) e Publicadores via
  sidebar (antes botão do header da Home, com volta por "Mapa" em vez de "← Voltar").

## Arquivos modificados
- `admin/src/renderer/App.tsx` — shell com sidebar, rota `designations`, sign-out, comentário de
  navegação atualizado
- `admin/src/renderer/App.test.tsx` — 5 testes novos, 2 adaptados, 1 asserção nova (sidebar
  visível em tela empurrada), helper `authedApi`

## Decisões técnicas
- **Seção ativa por derivação (`sectionOf`)**: telas empurradas (editores, histórico) mantêm
  "Mapa" aceso, porque abrem a partir da Home — nenhum estado extra além do `route` existente.
- **`DesignationsScreen` real nos testes do App** (como a task pediu), com os fakes de
  `window.api` já usados no arquivo; o mock existente de `react-leaflet` bastou porque os testes
  de navegação usam lista vazia de territórios (Polygon/Marker nunca renderizam).
- **Sem teste próprio para `onEditTerritory`/`onEditBlock`** (linhas 299/302 descobertas):
  fiação pré-existente, já sem cobertura antes desta task e fora do escopo dela.

## Como validar
```
cd admin && npx vitest run src/renderer/App.test.tsx
npm test && npm run typecheck && npm run lint
```

## Resultado da validação
- `npm test`: 19 arquivos, **340 testes verdes** (eram 318 no início da spec; 21 neste arquivo).
- Cobertura de `App.tsx` (via `--coverage`): 97.4% linhas, 88.37% branches — os descobertos são
  fiação pré-existente de editores e o `mapView ?? undefined`, não código novo desta task.
- `npm run typecheck`: limpo. `npm run lint`: limpo (1 warning de prettier corrigido com `--fix`).
