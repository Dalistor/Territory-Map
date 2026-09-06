# [0152] Admin: o status forçado no modelo compartilhado e na regra de cor

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0010/` — Task 06

## Solicitação
> Spec 0010 — Task 06: implemente por TDD em `admin/src/shared/models.ts` e
> `admin/src/renderer/map/blockColor.ts`, com os testes em `admin/src/shared/models.test.ts` e
> `admin/src/renderer/map/blockColor.test.ts` (arquivos existentes; acrescente casos).
>
> `Block` ganha `readonly statusOverride?: 'overdue' | 'never'` — declare o tipo do valor como um
> alias exportado (ex.: `BlockStatusOverride`), porque a tela da Task 09 vai precisar dele.
> Documente no campo que é o status que o admin forçou e que ausente significa "derive dos
> registros". Em `blockColorCategory`, o override passa a ser consultado **antes** do cálculo por
> data: `'never'` devolve `'never'`, `'overdue'` devolve `'overdue'`, ausente cai na regra que já
> existe. Não invente um terceiro valor de override para "recente": forçar uma quadra a parecer
> recém-trabalhada é justamente o que ninguém pediu, e a ausência é o caminho de volta.
>
> Toque apenas em `admin/src/shared/models.ts` e `admin/src/renderer/map/blockColor.ts` (mais os
> testes deles); não modifique main, preload nem telas.

## Contexto
A spec 0010 dá ao admin a possibilidade de **forçar** o status de uma quadra para "vencida"
(laranja) ou "nunca trabalhada" (vermelha), a partir da tabela de quadras da página de
configurações do território. O caminho alternativo — forçar laranja inventando um registro de
trabalho antigo — foi descartado na spec porque exigiria nomear um publicador que nunca esteve ali.

Esta task é a ponta pura desse recurso no admin: o campo no modelo compartilhado e a regra de cor
passando a respeitá-lo. Ela é a base da Task 07 (main/IPC), da Task 09 (`BlockWorkPanel`) e da
Task 10 (tabela de quadras), e tem a gêmea `app/src/domain/blockColor.ts` na Task 11 — os dois
arquivos de cor são deliberadamente idênticos, e mudar um sem o outro faz o mesmo território ter
cores diferentes na mesa do admin e no celular do publicador.

## Critérios de aceite
1. Sem override, o comportamento é idêntico ao de hoje, incluindo o efeito de `rotationDays`.
2. Uma quadra trabalhada ontem com override `'overdue'` é `'overdue'`.
3. A mesma quadra com override `'never'` é `'never'`.
4. Uma quadra nunca trabalhada com override `'overdue'` é `'overdue'` (o caso "está para ser
   trabalhada", que é legítimo).
5. O override vence qualquer `rotationDays`.
6. `statusOverride` ausente e `undefined` se comportam igual.
7. `Block.statusOverride` existe, é opcional, e seu tipo é um alias exportado
   (`BlockStatusOverride`) com exatamente dois valores — sem um terceiro para "recente".

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `carries the status the admin forced for the block` / `leaves statusOverride undefined when the status derives from the work records` / `names both forced statuses, and no third one for "recent"` | `admin/src/shared/models.test.ts` | `export type BlockStatusOverride = 'overdue' \| 'never'` e o campo `Block.statusOverride?` |
| 2 | `is "overdue" for a block worked yesterday when the admin forced "overdue"` / `is "never" for a block worked yesterday when the admin forced "never"` / `is "overdue" for a never-worked block the admin marked as due to be worked` / `beats any rotation the territory configured` / `keeps "never" over a rotation short enough to call the block overdue` / `treats an explicit undefined override the same as an absent one` | `admin/src/renderer/map/blockColor.test.ts` | A consulta ao `statusOverride` no topo de `blockColorCategory`, antes de qualquer leitura de data |

O ciclo 1 é um contrato de **tipo**: o `vitest` roda com os tipos removidos pelo esbuild, então o
RED dele aparece no `tsc --noEmit` (`npm run typecheck`), com seis erros nomeando o alias e o campo
inexistentes. Foi essa a falha observada antes de escrever a implementação. O ciclo 2 falhou pela
asserção, como de praxe (5 dos 6 casos vermelhos; o sexto é guarda de regressão e já passava).

## O que foi feito
- `Block` ganhou `readonly statusOverride?: BlockStatusOverride`, com o alias exportado logo acima
  da interface e um comentário explicando que ausente significa "derive dos registros".
- `blockColorCategory` passou a consultar o override **antes** de chamar `blockTimeSinceWorked`.
  Como `BlockStatusOverride` é subconjunto de `BlockColorCategory`, o valor forçado é devolvido
  direto, sem `switch` nem mapa de tradução.
- O bloco de documentação da função ganhou o parágrafo do override no topo, antes da regra por
  data — na mesma ordem em que o código agora lê as duas coisas.

## Arquivos modificados
- `admin/src/shared/models.ts` — alias `BlockStatusOverride` e o campo `Block.statusOverride`
- `admin/src/shared/models.test.ts` — `describe('Block status override')` com 3 casos
- `admin/src/renderer/map/blockColor.ts` — o override consultado antes do cálculo por data
- `admin/src/renderer/map/blockColor.test.ts` — `describe('blockColorCategory with a status the admin forced')` com 6 casos

## Arquivos criados
Nenhum.

## Decisões técnicas
- **O alias tem só dois valores, e isso é a decisão de design.** Não existe `'recent'` forçado:
  fazer uma quadra parecer recém-trabalhada mentiria sobre trabalho de campo, e o caminho de volta
  ao automático é limpar o campo, não forçar um terceiro valor. Um teste (`names both forced
  statuses, and no third one for "recent"`) fixa isso.
- **O override é lido antes de `blockTimeSinceWorked`, não depois.** Ler a data primeiro e
  sobrescrever no fim daria o mesmo resultado hoje, mas deixaria o cálculo por rotação rodando à
  toa e, mais importante, esconderia no fluxo do código a precedência que a regra afirma. A ordem
  no arquivo é a ordem da regra.
- **A guarda testa `undefined` e `null`.** O tipo não admite `null`, mas os predicados vizinhos do
  próprio `models.ts` (`blockWasNeverWorked`, `assignmentIsOpen`, `publisherIsPending`) já se
  defendem de `null` porque o que chega da API pode trazê-lo antes de o parsing normalizar. Seguir
  a convenção do arquivo custa nada e evita que um `status_override: null` mal parseado pinte a
  quadra de laranja. O ramo `=== null` é o único caminho da mudança sem teste próprio, de
  propósito: ele é inalcançável pelo tipo, e um teste para ele exigiria um cast que testaria o
  cast.
- **Nada de mock.** Os dois arquivos são código puro (sem rede, sem armazenamento, sem relógio
  real): `now` já entra por parâmetro em `blockColorCategory`, então os testes fixam a data e não
  tocam em `Date.now()`.
- **Nenhum consumidor precisou mudar.** `TerritoryMap.tsx` e `HomeScreen.tsx` já chamam
  `blockColorCategory` com o bloco inteiro, então passam a respeitar o override sem uma linha de
  alteração — o que é justamente o motivo de a regra viver numa função pura.

## Como validar
```bash
cd admin && npx vitest run src/shared/models.test.ts src/renderer/map/blockColor.test.ts
cd admin && npx vitest run          # suíte inteira
cd admin && npm run typecheck
```

## Resultado da validação
- `npx vitest run src/shared/models.test.ts src/renderer/map/blockColor.test.ts` — **46 testes
  passando** (30 + 16), 2 arquivos.
- `npx vitest run` (suíte inteira do admin) — **461 testes passando**, 25 arquivos, nenhuma
  regressão.
- Cobertura dos dois arquivos tocados (`--coverage.include` neles): **100% statements (33/33),
  100% branches (40/40), 100% functions (9/9), 100% lines (29/29)**.
- `npm run typecheck` — limpo (`typecheck:node` e `typecheck:web`).
- `npx eslint` nos quatro arquivos — limpo, sem erro nem warning.

> Durante a execução, a suíte completa chegou a acusar 8 falhas em
> `src/renderer/screens/MarkWorkedForm.test.tsx` e o `npm run lint` acusou erros em
> `MarkWorkedForm.tsx`: são arquivos da **Task 08**, rodando em paralelo na mesma árvore de
> trabalho e apanhada em pleno RED. Nenhum dos dois é tocado por esta task, e a re-execução após a
> Task 08 fechar o ciclo dela devolveu 461/461 verdes.
