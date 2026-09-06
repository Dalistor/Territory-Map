# [0063] Lista de territórios: um botão "⋮" em vez de três botões sempre visíveis

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (markup + testes)
**Spec:** — (pedido de design do usuário, fora de qualquer spec — sequência imediata de
`implements/0062`)

## Pedido

Cada território na lista lateral mostrava três botões sempre visíveis ("Adicionar quadra",
"Editar demarcação", "Apagar território"), o que o usuário apontou que vai poluir a tela com muitos
territórios. Pediu um botão único que revela as opções.

## Correção

`HomeScreen.tsx`: os três botões viraram um botão `⋮` (`aria-label="Opções de {território}"`) por
território, com estado próprio (`openTerritoryMenuId`) que revela um `role="menu"` com os três
`role="menuitem"` — mesmo padrão já usado no dropdown "Ações" de cada publicador
(`implements/0062`). Os nomes acessíveis dos três itens não mudaram (`Adicionar quadra em X`,
`Editar demarcação de X`, `Apagar território X`); só passaram a existir no DOM apenas quando o menu
está aberto.

## Testes atualizados

Seis clientes de teste em `HomeScreen.test.tsx` que clicavam direto nos três botões (sem abrir
nenhum menu, porque antes eles sempre existiam) precisaram de um passo a mais — abrir o menu do
território primeiro — mais uma correção de `role`: os botões dentro do menu têm `role="menuitem"`,
não `role="button"` (comportamento de acessibilidade correto para itens de menu, mas os testes ainda
buscavam pelo role antigo). Um teste equivalente em `App.test.tsx` (navegação, `implements/0060`)
recebeu o mesmo ajuste.

## Arquivos modificados

- `admin/src/renderer/screens/HomeScreen.tsx`
- `admin/src/renderer/screens/HomeScreen.test.tsx`
- `admin/src/renderer/App.test.tsx`

## Como validar

```bash
cd admin
npm run lint
npm run typecheck
npm test
npm run build
env -u ELECTRON_RUN_AS_NODE npm run dev
```

## Resultado da validação

- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros.
- `npm test` — 294/294 passando.
- `npm run build` — conclui.

## Pendência desta mesma conversa, não resolvida aqui

O usuário também reportou que, na tela de Publicadores, as opções "Ver código"/"Gerar novo código"
não aparecem mais no menu "⋮" de cada linha, depois do redesenho em `implements/0062`. Revisão
completa do código de `PublishersScreen.tsx` (estrutura JSX, condicionais, CSS) não encontrou causa
aparente — a suíte de testes (que já cobre exatamente esse fluxo: abrir o menu, ver "Ver código" e
"Gerar novo código") continua passando, o que sugere um problema de renderização visual real (CSS/
layout) que o jsdom dos testes não captura, não um bug de lógica. Precisa de um screenshot da tela
real para diagnosticar — pedido ao usuário, ainda sem resposta nesta sessão.
