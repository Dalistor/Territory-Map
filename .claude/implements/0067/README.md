# [0067] Lista de territórios da `HomeScreen` ordenada alfabeticamente e com rolagem própria

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0004/` — Task 02

## Solicitação

Task 02 da spec 0004: a `<ul>` de territórios em `admin/src/renderer/screens/HomeScreen.tsx`
renderiza os territórios na ordem em que `window.api.territories.listWithBlocks()` devolveu, sem
ordem garantida. Pedido: ordenar por `name` em ordem alfabética, insensível a maiúsculas/minúsculas
e a acentos (`localeCompare` com `sensitivity: 'base'`); usar essa mesma lista ordenada — não só na
`<ul>` — também no `<TerritoryMap>` e nos callbacks `onNewTerritory`/`onEditTerritory`, ordenando o
array uma única vez; e envolver a `<ul>` numa `<div>` com uma classe CSS nova (`territory-list`) com
altura máxima e `overflow-y: auto`.

## Contexto

A lista de territórios crescia a página inteira sem limite e não tinha ordem previsível — o admin é
uma pessoa só, sem perfil técnico, e uma lista fora de ordem alfabética (ou que empurra o mapa para
fora da tela conforme cresce) é o tipo de atrito que a spec 0004 nasceu para resolver (achado
testando o app de verdade). A raiz é que `territories.map(...)` sempre usou o array cru do estado,
sem nenhuma derivação — inclusive nos dois lugares que entregam a lista para fora do componente
(`onNewTerritory`, `onEditTerritory`).

## Critérios de aceite

1. Territórios fora de ordem na resposta da API aparecem em ordem alfabética por `name` na tela.
2. A ordenação ignora maiúsculas/minúsculas e acentos (`Árvore` e `arvore` ficam próximas).
3. `<TerritoryMap territories={...} />` recebe a lista já ordenada.
4. `onNewTerritory(territories)` recebe a lista já ordenada.
5. `onEditTerritory(territory, neighbours)` recebe `neighbours` já ordenado.
6. Todo o componente deriva de uma única ordenação (`useMemo`), não uma por consumidor.
7. A `<ul>` fica dentro de uma `<div className="territory-list">` com `max-height` e
   `overflow-y: auto` em `index.css` (sem teste — visual, sem comportamento observável em jsdom).

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|-------------------|------------------------------|
| 1 | `renders territories in alphabetical order by name, regardless of the order the API returned` | `HomeScreen.test.tsx` | `useMemo` `sortedTerritories`, usado na `<ul>` |
| 2 | `sorts ignoring case and accents, so accented and plain variants of a name land next to each other` | `HomeScreen.test.tsx` | comparador com `localeCompare(..., { sensitivity: 'base' })` |
| 3 | `passes the map the territories in sorted order too` | `HomeScreen.test.tsx` | `<TerritoryMap territories={sortedTerritories} .../>` |
| 4 | `"Novo território" hands over the territories in sorted order` | `HomeScreen.test.tsx` | `onNewTerritory?.(sortedTerritories)` |
| 5 | `"Editar demarcação" hands over the neighbours in sorted order` | `HomeScreen.test.tsx` | `onEditTerritory?.(territory, sortedTerritories)` |

Os cinco casos foram escritos juntos (mesmo comportamento — "usar a lista ordenada" — verificado em
cinco pontos de consumo diferentes) e todos falharam no RED antes de qualquer implementação, já que
hoje nada ordena o array; a implementação (um único `useMemo`) satisfez os cinco de uma vez no
GREEN, o que é esperado quando vários pontos de observação compartilham a mesma causa raiz.

Um teste pré-existente (`"Editar demarcação" on a territory row signals that territory and the full
list`) passou a falhar depois do GREEN: ele afirmava que `onEditTerritory` recebia a lista **na
ordem da API** (`[territory, other]`, com `territory = "Bairro Sul"` antes de `other = "Bairro
Norte"`), o que era verdade só porque a ordenação ainda não existia. Corrigi a asserção para o
comportamento correto (`[other, territory]`, alfabético) em vez de afrouxar o novo código — é
exatamente o caso do critério "teste desatualizado pela regra nova", não um teste errado desde o
início.

## O que foi feito

- `HomeScreen.tsx` ganhou `const sortedTerritories = useMemo(() => [...territories].sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [territories])`, logo após o
  `useState` de `territories`.
- Os quatro usos de `territories` dentro do JSX (`<ul>`, `<TerritoryMap>`, `onNewTerritory`,
  `onEditTerritory`) passaram a usar `sortedTerritories`. `territories` (o estado cru) continua
  existindo — é o que `load()`/o efeito de montagem escrevem — só deixou de ser lido diretamente
  fora do `useMemo`.
- A `<ul>` da lista de territórios (não a `<main>` inteira, nem o `<ul role="menu">` interno do menu
  de opções por território) passou a ficar dentro de `<div className="territory-list">`.
- `index.css` ganhou a regra `.territory-list { max-height: 360px; overflow-y: auto; }`, logo depois
  de `.leaflet-container` — 360px por ser um valor razoável para uma barra lateral (o Dart antigo
  usava 300px de **largura** para essa lista, decorativo, não uma medida a bater exatamente).

## Arquivos modificados

- `admin/src/renderer/screens/HomeScreen.tsx` — `useMemo` de ordenação e os quatro pontos de
  consumo trocados para `sortedTerritories`; `<ul>` envolvida por `<div className="territory-list">`.
- `admin/src/renderer/screens/HomeScreen.test.tsx` — cinco testes novos (`describe('HomeScreen
  territory list ordering', ...)`) e a correção da asserção desatualizada em
  `"Editar demarcação" on a territory row signals that territory and the full list`.
- `admin/src/renderer/index.css` — regra `.territory-list`.

## Decisões técnicas

- **Ordenação única em `useMemo`, não uma por consumidor.** Era o próprio critério de aceite: evita
  que `<ul>`, mapa e callbacks divirjam se algum dia um deles esquecer de ordenar. `territories`
  (estado cru) permanece a fonte que `load()`/o efeito de montagem escrevem; `sortedTerritories` é
  puramente derivado, recalculado só quando `territories` muda.
- **`sensitivity: 'base'`** em vez do `localeCompare` default: ignora tanto o caso quanto o acento
  (força secundária e terciária da colação), que é exatamente o que o critério de aceite pediu
  (`"Árvore"` e `"arvore"` próximas). Como o array de entrada já vinha embaralhado propositalmente
  nos testes, não havia necessidade de um ciclo RED separado "sem a opção" — o array não ordenado
  já falhava de forma genuína antes de qualquer implementação, `sensitivity: 'base'` foi escrito
  direto porque é o comportamento pedido, não uma generalização especulativa.
- **`max-height: 360px`** em vez dos 300px do Dart antigo: o valor Dart era uma **largura**, não uma
  altura — não fazia sentido reaproveitar o número para uma dimensão diferente. 360px é um valor
  usual de sidebar-scroll, escolhido sem teste porque é puramente visual.
- **Sem teste para a regra CSS.** jsdom não faz layout real; `max-height`/`overflow-y` não têm
  comportamento observável nos testes existentes (nenhum já testa scroll ou dimensão). Validação é
  visual, via `npm run dev` — consistente com o restante do projeto (`.block-actions-modal`,
  `TerritoryMap.tsx` etc. também não têm teste para CSS/layout puro).
- **Teste pré-existente corrigido, não afrouxado.** A asserção antiga codificava a ordem da API como
  comportamento esperado; era um efeito colateral da ausência de ordenação, não uma regra de
  negócio. Corrigida para o resultado correto (`[other, territory]`), documentado inline no próprio
  teste.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/HomeScreen.test.tsx
npm run typecheck
npm run lint
npm test
```

## Resultado da validação

- `npx vitest run src/renderer/screens/HomeScreen.test.tsx` → **30 testes passando** (25
  pré-existentes + 5 novos, 1 corrigido).
- Cobertura de `HomeScreen.tsx` (`vitest run --coverage`, escopada ao arquivo): **100% statements,
  100% lines, 100% functions, 88.23% branch**. Os ramos não cobertos (linhas 130–136, o guard
  `cancelled` do efeito de montagem, e a linha 232, o toggle de fechar o menu "⋮" já aberto) são
  código pré-existente, não tocado por esta implementação.
- `npm run typecheck` → limpo (node e web).
- `npm run lint` → limpo.
- `npm test` (suíte inteira, 18 arquivos) → **302 de 304 testes passando**. As 2 falhas são em
  `BlockEditorScreen.test.tsx` (`hides the confirmation after a few seconds`, `disables Save and
  shows a saving indicator while the request is in flight`), arquivo que esta implementação não
  toca — `git status` confirma `BlockEditorScreen.tsx`/`.test.tsx` modificados por outra execução em
  andamento no momento da validação (Task 04 da mesma spec 0004, rodando em paralelo via
  `/centaur-driven-run`). Rodar só `HomeScreen.test.tsx` isoladamente (acima) confirma que o escopo
  desta task está inteiramente verde.
