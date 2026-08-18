# [0113] Conserto do layout do shell, seletor de dirigente redesenhado, ordenação numérica e número obrigatório no território

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto (layout/CSS) + TDD (ordenação numérica e número obrigatório)
**Spec:** decorrente da [0006](../../specs/0006/README.md), mas não é uma task dela — iteração
guiada por screenshots do usuário rodando o admin de verdade.

## Solicitação

1. "o layout esta bem quebrado, na página de designações n tem como designar e o design do app
   está básico dms" (com screenshots: sidebar empilhada sobre o conteúdo, página de Designações
   em branco).
2. Em seguida: "Melhore o design da seleção de dirigentes, estes radio box fica feio. E cada nome
   de território tem um número (deve ser obrigatório inclusive), precisam estar ordenados em
   ordem crescente".

## Causa raiz do layout quebrado

O seletor genérico `#root > div` (que dá `display:flex; flex-direction: column` a qualquer tela
raiz) carrega um **ID** na especificidade — `(1,0,1)` — e por isso vencia a classe `.app-shell`
`(0,1,0)` da spec 0006, anulando o `flex-direction: row` do shell: a sidebar empilhava sobre o
conteúdo. Além disso, as telas roteadas dentro de `.app-content` eram `<div>` sem flex, então o
mapa da página de Designações colapsava para nada (tela branca — e sem mapa, sem como designar).
Nenhum teste pega CSS, por isso a spec passou verde com o layout quebrado.

## O que foi feito

**Layout (correção):**
- `#root > .app-shell { flex-direction: row; }` — especificidade `(1,1,0)` vence o genérico.
- `.app-content > div { display:flex; flex:1; flex-direction:column; min-height:0; }` — telas
  roteadas esticam e o mapa ganha altura real.

**Design (polish geral):**
- Home em duas colunas: painel de territórios (320px, rolagem própria, "Novo território" como
  botão primário) + mapa dominando o resto (`.home-split`/`.home-panel`/`.home-map`).
- "Designado a {nome}" virou pill azul-claro na linha do território; linhas com hover.
- `--radius` global de 6px para 8px.
- Dica visível na página de Designações (`role="note"`): clique no mapa designa; contorno azul =
  com dirigente, tracejado = sem.

**Seletor de dirigente (redesign):** os radios crus viraram cartões selecionáveis — avatar com a
inicial (ou "—" para "Nenhum"), nome, estado selecionado com borda/fundo azul, hover, subtítulo
"Quem vai cuidar deste território?". O `<input type="radio">` real continua no DOM (escondido com
a técnica de visually-hidden, nunca `display:none`), preservando teclado, leitores de tela e os
testes que consultam `getByRole('radio')`; o foco de teclado é pintado no cartão via
`label:has(input:focus-visible)`.

**Ordenação numérica (TDD):** `sortedTerritories` da Home passou a comparar com
`localeCompare(..., { sensitivity: 'base', numeric: true })` — "Santa Helena - N 10" ordena depois
de "N 9", não depois de "N 1". Teste novo com N 7/N 9/N 10 fora de ordem; os testes de ordem
alfabética existentes continuam passando.

**Número obrigatório no nome do território (TDD):** `TerritoryEditorScreen` só habilita Salvar
quando o nome contém pelo menos um dígito (`/\d/`), com mensagem "O nome precisa incluir o número
do território (ex.: Centro - N5)." enquanto faltar (e só quando o campo não está vazio), e
placeholder de exemplo no campo. **Regra só no cliente**: o servidor continua aceitando qualquer
nome — o editor é o único lugar onde nomes são digitados, e formalizar isso como coluna própria no
servidor seria uma mudança de modelo de dados que fica registrada como possível evolução futura.
Dois testes novos + fixtures existentes atualizadas para nomes numerados.

## Arquivos modificados

- `admin/src/renderer/index.css` — override de especificidade do shell, flex das telas roteadas,
  `.home-split`, pill de designação, cartões do seletor de dirigente, radius 8px
- `admin/src/renderer/screens/HomeScreen.tsx` — split painel+mapa; `numeric: true` no sort
- `admin/src/renderer/screens/HomeScreen.test.tsx` — teste da ordenação numérica
- `admin/src/renderer/screens/DesignationsScreen.tsx` — dica `role="note"`; seletor em cartões
- `admin/src/renderer/screens/TerritoryEditorScreen.tsx` — validação do número no nome
- `admin/src/renderer/screens/TerritoryEditorScreen.test.tsx` — 3 testes novos + fixtures
  numeradas

## Como validar

```bash
cd admin && npm test && npm run typecheck && npm run lint
env -u ELECTRON_RUN_AS_NODE npm run dev   # conferir visualmente
```

## Resultado da validação

- `npm test` → **336 verdes** (333 + 3 novos), 19 arquivos.
- `npm run typecheck` e `npm run lint` limpos.
- Verificação visual por screenshot do app rodando (`npm run dev`): sidebar em altura total,
  Designações com o mapa cheio, rótulos território+dirigente, resumo "1 de 13 territórios
  designados" — o usuário designou um território pela própria tela durante a sessão, confirmando o
  fluxo de ponta a ponta contra o servidor já atualizado.
