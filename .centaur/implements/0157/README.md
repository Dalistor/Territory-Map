# [0157] App: o status forçado no domínio e no cliente HTTP (spec 0010, Task 11)

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0010/` — Task 11

## Solicitação
> Spec 0010 — Task 11: implemente por TDD em `app/src/domain/models.ts`,
> `app/src/domain/blockColor.ts` e `app/src/data/api-client.ts`, com os testes co-localizados já
> existentes. `Block` ganha `readonly statusOverride?: 'overdue' | 'never'`, e `blockColorCategory`
> consulta o override **antes** do cálculo por data, com exatamente a mesma semântica da Task 06 no
> admin — o comentário do topo do arquivo, que afirma ser cópia idêntica à regra do admin, precisa
> continuar verdadeiro depois da mudança. `parseBlock` em `data/api-client.ts` lê `status_override`
> para `statusOverride`, tratando ausente e nulo como `undefined`. Toque apenas em
> `app/src/domain/` e `app/src/data/`; não modifique `app/src/presentation/`.

## Contexto
O servidor já grava e devolve `Block.status_override` (Tasks 01–04) e o admin já o respeita acima do
cálculo por data (Task 06, implementação 0152). Faltava o outro cliente: sem esta task, o celular do
publicador continuaria pintando a quadra pela data enquanto a mesa do admin a mostra forçada — as
duas cópias da regra de cor deixariam de ser idênticas, que é exatamente o que o comentário do topo
de `blockColor.ts` promete que não acontece.

## Critérios de aceite
- Sem override, a cor é idêntica à de hoje, incluindo o efeito de `rotationDays`.
- Quadra trabalhada ontem com override `'overdue'` → `'overdue'`.
- Quadra trabalhada ontem com override `'never'` → `'never'`.
- Quadra nunca trabalhada com override `'overdue'` → `'overdue'`.
- O override vence qualquer rotação (1 dia ou 3650 dias).
- `statusOverride: undefined` explícito se comporta como ausente.
- `status_override: "never"` vindo da API vira `statusOverride: 'never'`; `null` e ausente viram `undefined`.
- O cache local (`territory-cache.ts`) dá a volta completa sem perder o campo novo.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `Block` carrega o status forçado, fica `undefined` sem ele, e o tipo nomeia só os dois valores | `app/src/domain/models.test.ts` | `BlockStatusOverride` e `Block.statusOverride` em `domain/models.ts` |
| 2 | Override vence data e rotação (5 casos), e `undefined` explícito equivale a ausente | `app/src/domain/blockColor.test.ts` | Guarda do override no topo de `blockColorCategory`, antes do cálculo por data |
| 3 | `status_override` presente / `null` / ausente | `app/src/data/api-client.test.ts` | `statusOverride` em `parseBlock` |
| 4 | O campo novo sobrevive ao round trip do cache | `app/src/data/territory-cache.test.ts` | Nenhum — comportamento já existente, coberto como regressão (ver Decisões técnicas) |

## O que foi feito
- `domain/models.ts`: tipo `BlockStatusOverride = 'overdue' | 'never'` (mesmo conjunto e mesma
  justificativa do admin) e o campo opcional `statusOverride` em `Block`.
- `domain/blockColor.ts`: `blockColorCategory` devolve o override direto quando ele existe, antes de
  olhar `lastWorkedAt` ou a rotação. O comentário do topo e o docstring da função foram atualizados
  para que a promessa de "idêntica à regra do admin" continue verdadeira.
- `data/api-client.ts`: `parseBlock` lê `status_override`, com ausente e `null` virando `undefined`.

## Arquivos modificados
- `app/src/domain/models.ts` — `BlockStatusOverride` e `Block.statusOverride`
- `app/src/domain/models.test.ts` — `makeBlock` e o bloco `Block status override`
- `app/src/domain/blockColor.ts` — guarda do override e comentários
- `app/src/domain/blockColor.test.ts` — bloco `blockColorCategory with a status the admin forced`
- `app/src/data/api-client.ts` — `parseBlock` lê `status_override`
- `app/src/data/api-client.test.ts` — três casos de parse do `status_override`
- `app/src/data/territory-cache.test.ts` — round trip do campo novo

## Arquivos criados
Nenhum.

## Decisões técnicas
- **A guarda do override é `!== undefined && !== null`, cópia literal do admin.** O tipo não admite
  `null`, mas o valor vem de JSON e a rota do servidor devolve `null` para "nada forçado"; repetir a
  checagem do admin mantém as duas cópias da regra iguais linha a linha, que é o único jeito de o
  comentário do topo do arquivo continuar sendo verdade.
- **`app/src/presentation/` não foi tocado.** `TerritoryMapView.tsx` foi lido para confirmar: ele já
  chama `blockColorCategory(block, effectiveNow, territory.rotationDays)` com o bloco inteiro, então
  passou a respeitar o override sem nenhuma mudança.
- **O teste do cache passou de primeira, e foi mantido de propósito.** `reviveBlock` espalha
  `...block`, então o campo novo já sobrevivia. Antes de aceitar o verde, a implementação foi
  temporariamente reescrita para enumerar os campos: o teste falhou, provando que ele morde de
  verdade e vale como regressão contra alguém trocar o spread por uma lista de campos. A alteração
  temporária foi revertida.
- **`models.ts` aparece com 0% de cobertura** porque é só tipos — não há statement em runtime.
  Situação pré-existente, não regressão.

## Como validar
```bash
cd app && npm test
npx tsc --noEmit && npm run lint
```

## Resultado da validação
- `npm test`: **107 testes passando**, 12 suítes, tudo verde.
- Cobertura dos arquivos tocados (`npx jest --coverage --collectCoverageFrom='src/data/**/*.ts'` com
  `src/domain`): `blockColor.ts` 100% de linha e 100% de branch; `territory-cache.ts` 100/100;
  `api-client.ts` 100% de linha e 82.5% de branch — os branches descobertos são todos pré-existentes
  (o `?? []` do polígono e o tratamento de erro), e a linha nova do `status_override` tem os dois
  lados cobertos.
- `npx tsc --noEmit`: limpo. `npm run lint`: limpo, sem warning.
