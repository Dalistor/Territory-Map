# [0145] App: `rotationDays` no domínio e no cliente HTTP

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 11

## Solicitação
> Spec 0009 — Task 11: implemente por TDD em `app/src/domain/models.ts`, `app/src/domain/blockColor.ts` e
> `app/src/data/api-client.ts`, com os testes co-localizados já existentes (`blockColor.test.ts`,
> `api-client.test.ts`; crie `models.test.ts` se não houver). Rode com `cd app && npm test`. Lembre que
> `app/src/domain/` não pode importar nada de `react-native`.
>
> `Territory` ganha `readonly rotationDays?: number`. `blockColorCategory(block, now)` ganha o terceiro
> parâmetro opcional `rotationDays?: number`, com exatamente a mesma semântica da Task 07 no admin —
> limiar `(rotationDays ?? 120)` dias, borda inclusiva no `'recent'` — e o comentário no topo do arquivo,
> que hoje diz que a regra é uma cópia idêntica à do admin, deve continuar verdadeiro depois da mudança.
> `parseTerritory` em `data/api-client.ts` lê `rotation_days` para `rotationDays`, tratando ausente e nulo
> como `undefined`, como já faz com `last_worked_at`.
>
> A árvore de trabalho já tem alterações não commitadas nestes arredores (`app/src/domain/lastWorked.ts` e
> `app/src/presentation/screens/MapScreen.tsx`); construa em cima do que estiver lá, sem reverter nada.
>
> Toque apenas em `app/src/domain/` e `app/src/data/` (mais os testes deles); não modifique
> `app/src/presentation/`.

## Contexto
A spec 0009 dá a cada território um tempo de rotação próprio (`Territory.rotation_days`), que substitui o
limiar fixo de 120 dias no cálculo da cor da quadra. O servidor já expõe o campo (Tasks 01–05) e o admin já
o consome (Task 07, implements/0138). Esta task é o lado do app: o domínio precisa conhecer a rotação e a
regra de cor precisa aceitá-la, para que a Task 12 possa ligar a tela do mapa nela. O comentário no topo de
`blockColor.ts` afirma que a regra é uma cópia idêntica à do admin — manter essa afirmação verdadeira era
parte do critério, e por isso a nomenclatura (`DEFAULT_ROTATION_DAYS`, `DAY_MS`) foi alinhada com a do admin.

## Critérios de aceite
- Sem `rotationDays`, a cor é idêntica à de hoje (120 dias).
- Com `rotationDays: 30`, 45 dias é `'overdue'` e 10 dias é `'recent'`.
- Com `rotationDays: 365`, 200 dias é `'recent'`.
- Exatamente no limiar (com rotação própria) é `'recent'` — borda inclusiva, igual à do default.
- Nunca trabalhada é `'never'` com qualquer rotação.
- Um território vindo da API com `rotation_days: 60` vira `rotationDays: 60`; com `rotation_days` nulo ou
  ausente vira `undefined`.
- O cache local (`territory-cache.ts`) faz a volta completa (gravar e reler) sem perder o campo novo.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `carries the rotation the admin configured, in days` / `leaves rotationDays undefined when the territory uses the default rotation` | `app/src/domain/models.test.ts` (criado) | `Territory.rotationDays?: number` em `domain/models.ts` |
| 2 | `is "overdue" past a shorter rotation the default would still call recent` | `app/src/domain/blockColor.test.ts` | terceiro parâmetro `rotationDays?` e limiar `(rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS` |
| 3 | `is "recent" within a shorter rotation` | `app/src/domain/blockColor.test.ts` | (coberto pelo ciclo 2 — guarda de regressão do critério) |
| 4 | `is "recent" inside a longer rotation the default would already call overdue` | `app/src/domain/blockColor.test.ts` | (idem) |
| 5 | `is "recent" exactly at the territory rotation, the same inclusive boundary as the default` | `app/src/domain/blockColor.test.ts` | (idem) |
| 6 | `is "never" for a block never worked, whatever the rotation` | `app/src/domain/blockColor.test.ts` | (idem) |
| 7 | `falls back to the 120-day default when no rotation is given` | `app/src/domain/blockColor.test.ts` | (idem) |
| 8 | `parses the territory rotation from rotation_days` (+ os casos `null` e ausente) | `app/src/data/api-client.test.ts` | `parseOptionalNumber` e `rotationDays` em `parseTerritory` |
| 9 | `keeps the territory rotation across the round trip` | `app/src/data/territory-cache.test.ts` | (nenhum — o cache serializa por spread; o teste prova que continua verdade) |

## O que foi feito
- `Territory` ganhou `readonly rotationDays?: number`, documentado como "undefined = usa a rotação padrão",
  com o mesmo texto de intenção do campo homônimo em `admin/src/shared/models.ts`.
- `blockColorCategory` ganhou o terceiro parâmetro opcional `rotationDays`. O limiar deixou de ser a
  constante fixa e passou a ser `(rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS`, com a mesma borda
  inclusiva de antes (`>` estrito, então exatamente no limiar é `'recent'`).
- `OVERDUE_AFTER_MS` continua exportado com o mesmo valor (120 dias em ms) — não quebra nenhum chamador nem
  os testes existentes — mas agora é derivado de `DEFAULT_ROTATION_DAYS`, a constante que a regra realmente
  usa como fallback.
- O comentário do topo de `blockColor.ts` foi atualizado para continuar dizendo a verdade: a cópia da regra
  do admin agora inclui o override por território, não só o default de 120 dias.
- `parseTerritory` passou a ler `rotation_days`, através de um `parseOptionalNumber` novo — o gêmeo de
  `parseOptionalDate` para um número anulável.

## Arquivos modificados
- `app/src/domain/models.ts` — `Territory.rotationDays?: number`
- `app/src/domain/blockColor.ts` — parâmetro `rotationDays`, `DEFAULT_ROTATION_DAYS`, comentário do topo
- `app/src/domain/blockColor.test.ts` — seis casos novos de rotação
- `app/src/data/api-client.ts` — `parseOptionalNumber` e `rotationDays` em `parseTerritory`
- `app/src/data/api-client.test.ts` — três casos novos (`rotation_days` preenchido, nulo e ausente)
- `app/src/data/territory-cache.test.ts` — a volta completa do campo pelo cache

## Arquivos criados
- `app/src/domain/models.test.ts` — o espelho de `admin/src/shared/models.test.ts` no app: prova que uma
  `Territory` carrega a rotação configurada e que a ausência dela é `undefined`

## Decisões técnicas
- **`OVERDUE_AFTER_MS` sobreviveu, `DEFAULT_ROTATION_DAYS` nasceu ao lado.** O admin chama a sua
  `DEFAULT_OVERDUE_AFTER_MS`; renomear a do app quebraria os testes existentes sem ganho, então a constante
  antiga ficou como está (é o que `blockColor.test.ts` já usava para expressar o default) e a nova carrega o
  número em dias, que é a unidade em que a rotação chega do servidor. O default continua num lugar só.
- **`parseOptionalNumber` em vez de um cast inline.** `rotation_days` tem exatamente os três estados de
  `last_worked_at` (valor, `null`, ausente) e colapsá-los em `undefined` é a mesma decisão já tomada ali; dar
  um nome à conversão evita que o próximo campo anulável a reescreva de outro jeito.
- **O cache não precisou de código.** `territory-cache.ts` serializa por spread e só revive `Date` nos
  blocos, então um campo escalar novo já dava a volta sozinho. Ainda assim o teste foi acrescentado: o
  critério é sobre o comportamento observável (a rotação sobrevive ao offline), e sem asserção nada impediria
  uma refatoração futura para enumeração campo a campo de derrubar isso em silêncio.
- **Ciclos 3–7 são guardas de regressão, não código novo.** O ciclo 2 já pôs a regra completa de pé; os
  demais critérios de aceite viraram testes que passaram de primeira, e isso está registrado aqui em vez de
  ser maquiado com uma implementação artificialmente parcial.
- **Nada em `presentation/` foi tocado.** `TerritoryMapView.tsx` continua chamando
  `blockColorCategory(block, effectiveNow)` com dois argumentos, o que segue compilando e se comportando
  como antes — ligar a rotação na tela é a Task 12.

## Como validar
```bash
cd app && npm test
cd app && npx jest src/domain/blockColor.test.ts src/domain/models.test.ts src/data/api-client.test.ts src/data/territory-cache.test.ts
cd app && npx tsc --noEmit && npm run lint
```

## Resultado da validação
- `cd app && npm test` → **12 suítes, 94 testes passando** (baseline antes da task: 11 suítes, 82 testes).
- Cobertura das linhas tocadas (`npx jest --coverage`):
  - `src/domain/blockColor.ts` — **100% de linha, 100% de branch** (os dois lados do `??` e os dois do `>`).
  - `src/data/territory-cache.ts` — 100% de linha e de branch.
  - `src/data/api-client.ts` — 100% de linha, 81.6% de branch; `parseOptionalNumber` e a linha nova de
    `parseTerritory` estão com os dois lados cobertos, e os branches descobertos que restam são todos
    pré-existentes (fallbacks `?? []` e defaults de configuração do cliente HTTP).
  - `src/domain/models.ts` aparece com 0% por ser um arquivo só de tipos — não há statement para executar.
- `npx tsc --noEmit` limpo; `npm run lint` (ESLint) limpo.
