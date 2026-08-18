# [0102] Botão "Abrir mapa" sempre disponível no dashboard do app

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** decorrente da [0005](../../specs/0005/README.md), mas não é uma task dela — pedido
direto do usuário testando o app no aparelho.

## Solicitação

"O usuário precisa ter a opção de abrir o mapa dos territórios e mostrar em tempo real sua
localização." (As demais partes do pedido — designar território no admin, destacar o território
designado, só designado marca quadra — já existiam das implementações 0086–0097; ver "Contexto".)

## Contexto

O mapa do app só era alcançável pelo botão "Ver no mapa", que existe **por território designado**.
Um publicador sem designação não tinha caminho nenhum até o mapa — nem para ver os territórios da
congregação em modo leitura, nem para ver a própria posição. O restante do pedido do usuário já
estava implementado: o admin designa pelo menu "⋮" (implements/0097), "Ver no mapa" abre o mapa
com o filtro no território designado (destaque), e a marcação de quadra só é oferecida em
território designado (MapScreen + regra do servidor).

## Critérios de aceite

- O dashboard sempre mostra um botão "Abrir mapa", mesmo sem território designado e sem quadra
  trabalhada.
- Tocar nele chama o callback de abertura do mapa completo (sem território pré-selecionado — o
  `defaultFilter` da tela de mapa decide o que mostrar: designados se houver, todos senão).
- Os comportamentos existentes do dashboard não mudam.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `always offers "Abrir mapa", even with no assigned territory, and it opens the full map` | `app/src/presentation/screens/DashboardScreen.test.tsx` | Prop obrigatória `onOpenFullMap` e o `PrimaryButton` "Abrir mapa" no topo do `DashboardScreen`; fiação em `App.tsx` (`navigation.navigate('Map', {})`) |

RED confirmado pelo motivo certo (`Unable to find an element with text: Abrir mapa`) antes da
implementação; GREEN com a suíte inteira; sem refactor necessário.

## Arquivos modificados

- `app/src/presentation/screens/DashboardScreen.tsx` — prop `onOpenFullMap` + botão "Abrir mapa"
- `app/src/presentation/screens/DashboardScreen.test.tsx` — teste novo + prop nos testes existentes
- `app/src/presentation/App.tsx` — fiação: `onOpenFullMap` navega para `Map` sem `territoryId`

## Decisões técnicas

- **Prop obrigatória, não opcional** — um dashboard sem caminho para o mapa é exatamente o buraco
  que motivou a mudança; deixar a prop opcional permitiria reintroduzi-lo silenciosamente.
- **Sem `territoryId` na navegação** — o `MapScreen` já resolve o estado inicial via
  `defaultFilter` (designados quando existem, todos quando não), que é o comportamento pedido.

## Como validar

```bash
cd app && npx jest src/presentation/screens/DashboardScreen.test.tsx
npx tsc --noEmit && npm run lint
```

## Resultado da validação

- Suíte completa: 63/63 passando (10 suítes). `tsc --noEmit` e `npm run lint` limpos.
- `./gradlew assembleRelease` → `BUILD SUCCESSFUL`, `app-release.apk` regenerado (109M).
- Verificação no aparelho pendente com o usuário.
