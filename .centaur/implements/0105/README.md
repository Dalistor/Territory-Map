# [0105] Editor de quadras: layout lado a lado e sequência automática de número

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0006/` — Task 06

## Solicitação
Duas mudanças no `BlockEditorScreen`: (1) layout split — painel compacto à esquerda
(`.editor-panel`) e mapa grande à direita (`.editor-map`), usando as classes da Task 01
(implements/0104), removendo o wrapper de `height: '480px'`; (2) sequência de número — depois de
um salvamento em modo de criação, o campo passa a sugerir `String(saved.number + 1)` (editável e
apagável); depois de um salvamento em modo de edição, o campo volta a `''` como antes.

## Contexto
Desenhar várias quadras em sequência é o fluxo normal do admin (a numeração já existe no papel).
Antes, o mapa era uma faixa de 480px sob um formulário empilhado, e a cada quadra salva o número
tinha que ser redigitado. Com o split o mapa ocupa a tela, e a sugestão "salvo + 1" elimina a
digitação no caso comum. Após uma edição a sugestão seria errada — "editado + 1" normalmente
colide com quadra existente — então ali o campo continua voltando vazio.

## Critérios de aceite
- Salvar uma quadra nova (servidor devolve number 7) deixa o campo com "8"; salvar de novo envia
  `number: 8`.
- O admin pode apagar a sugestão e salvar com o campo em branco — o servidor escolhe o número.
- Salvar uma edição de quadra existente volta o campo para vazio, não para "editado + 1".
- O JSX vira `.editor-split` > `.editor-panel` + `.editor-map`, sem mudança de comportamento — os
  testes existentes (spec 0004: tela montada após salvar, contexto de sessão, confirmação
  temporária) seguem verdes sem alteração de expectativa.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `suggests the saved number plus one in the number field after a successful create` | `admin/src/renderer/screens/BlockEditorScreen.test.tsx` | `setNumberText(editingBlock ? '' : String(saved.number + 1))` no sucesso do `handleSave` |
| 2 | `sends the suggested next number on the following save without retyping` | idem | guarda de regressão — verde direto (o campo controlado já alimenta o parse do próximo save) |
| 3 | `lets the admin erase the suggested number and save blank, leaving the choice to the server` | idem | guarda de regressão — verde direto (sugestão é texto comum, apagável) |

O condicional `editingBlock ? '' : …` foi exigido no próprio ciclo 1 pela suíte existente: o teste
`returns to create mode after successfully saving an edit…` já afirma `numberField().value === ''`
após edição, e um `+1` incondicional o quebraria. Esse teste ganhou um comentário explicitando o
porquê (colisão com quadras existentes) e cobre o critério da borda.

## O que foi feito
- `handleSave` passou a preencher o campo de número com `saved.number + 1` após criação e a
  mantê-lo vazio após edição, com comentário explicando a assimetria.
- O JSX do retorno foi reorganizado em `.editor-split` (painel `.editor-panel` com título,
  `role="status"`, toolbar, campo do número e mensagens, `role="alert"`, dica; e `.editor-map` com
  o `MapContainer` a 100% de altura). O wrapper `style={{ height: '480px' }}` foi removido —
  mudança puramente estrutural, nenhuma expectativa de teste alterada por causa dela.

## Arquivos modificados
- `admin/src/renderer/screens/BlockEditorScreen.tsx` — sequência de número no `handleSave` e JSX
  no layout split.
- `admin/src/renderer/screens/BlockEditorScreen.test.tsx` — teste antigo
  `resets the number field to empty after a successful create` substituído pelo do novo
  comportamento (a spec muda deliberadamente esse comportamento — não foi afrouxamento), mais os
  dois guardas de regressão e um comentário no teste da borda de edição.

## Decisões técnicas
- **Substituir, não afrouxar, o teste do reset.** O teste antigo especificava exatamente o
  comportamento que a spec 0006 troca; mantê-lo tornaria a mudança impossível. O novo teste é a
  especificação nova, com RED confirmado pela asserção (`'' !== '8'`).
- **Ciclos 2 e 3 são guardas verdes-direto.** Depois do ciclo 1, o campo controlado já flui para o
  parse do próximo save e já é apagável — os testes existem para prender esses dois critérios da
  spec contra regressão futura (ex.: alguém trocar o campo por estado derivado), não para exigir
  código novo.
- **Layout fora do TDD.** Reorganização de JSX sem comportamento é mudança estrutural; a prova de
  não-regressão é a suíte existente, que consulta por role/label e seguiu verde sem edição.
- Sem mudança de CSS: as classes vêm prontas de implements/0104.

## Como validar
```
cd admin && npx vitest run src/renderer/screens/BlockEditorScreen.test.tsx
npm run typecheck && npm run lint
```

## Resultado da validação
- `npx vitest run src/renderer/screens/BlockEditorScreen.test.tsx` — **31 testes passando** (29
  originais adaptados + 2 novos).
- Cobertura do arquivo tocado (`--coverage` no arquivo de teste): `BlockEditorScreen.tsx`
  **98.21% stmts / 97.77% branch / 100% linhas** — o único branch descoberto é o guard defensivo
  `if (!canSave) return`, inalcançável pela UI (botão desabilitado), pré-existente.
- `npx eslint` nos dois arquivos tocados — limpo. `npx tsc --noEmit` — **zero erros nos arquivos
  desta task**; os erros/falha restantes na suíte global no momento da validação são de
  `DesignationsScreen.tsx` (Task 03) e `PublishersScreen.test.tsx` (Task 07), tasks paralelas em
  andamento fora deste escopo.
