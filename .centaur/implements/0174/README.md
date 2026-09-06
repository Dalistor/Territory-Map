# [0174] App admin: regras puras da designação e do status da quadra

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0012/` — Task 03

## Solicitação

> Spec 0012 — Task 03: Implemente por TDD, em `admin-app/src/domain/`, três arquivos com seus
> testes co-localizados. **`assignment.ts`** — `assignmentIsOpen`, `openAssignment` e
> `sortAssignments` (nova lista, `startedAt` decrescente, aberta no topo no empate).
> **`blockColor.ts`** — porte idêntico em comportamento ao de `app/src/domain/blockColor.ts`:
> `DEFAULT_ROTATION_DAYS = 120`, `BlockColorCategory` e `blockColorCategory(block, now,
> rotationDays?)`, com o `statusOverride` consultado antes do cálculo por data.
> **`blockStatusLabel.ts`** — o status por extenso derivado de `blockColorCategory`, com o sufixo
> " (forçado)" quando vem de um `statusOverride`. Os três são código puro.

## Contexto

São as funções que as telas das Tasks 10, 11 e 12 vão usar para decidir o que mostrar — o painel
S-13 (qual designação está em vigor, em que ordem listar o cartão) e a lista de quadras (o status
por extenso de cada uma). Postas na camada Domain, elas ficam testáveis sem renderizar nada e sem
emulador, que é a razão de `admin-app/src/domain/` existir separado de `presentation/`.

`blockColor.ts` é a **terceira cópia deliberada** da regra de cor no monorepo — decisão 3 do
"Contexto técnico" da spec 0012. As outras duas são `admin/src/renderer/map/blockColor.ts` e
`app/src/domain/blockColor.ts`, e as três precisam concordar: se divergirem, o mesmo território
aparece com cores diferentes na mesa do admin, no celular dele e no celular do publicador.

## Critérios de aceite

**`assignment.ts`**

- `assignmentIsOpen` é verdadeiro exatamente quando `completedAt === null`.
- `openAssignment` devolve a única aberta de um cartão que também tem histórico.
- `openAssignment` de uma lista só com concluídas devolve `null`; de uma lista vazia, também.
- `sortAssignments([])` devolve `[]`.
- Com uma aberta e duas concluídas, a aberta vem primeiro e as concluídas em ordem decrescente de
  `startedAt`.
- Empate de `startedAt` põe a aberta na frente.
- A lista devolvida é nova e a original não é mutada.

**`blockColor.ts`**

- Quadra sem `lastWorkedAt` e sem override é `'never'`.
- Visita há 10 dias com rotação 120 é `'recent'`; há 200 dias é `'overdue'`.
- **Exatamente** no limiar ainda é `'recent'`; um milissegundo acima vira `'overdue'`.
- A rotação do território manda: 60 dias num território de 30 é `'overdue'`; 200 dias num de 365 é
  `'recent'`.
- `rotationDays` nulo ou ausente usa `DEFAULT_ROTATION_DAYS`, que é 120.
- `statusOverride: 'never'` numa quadra trabalhada ontem devolve `'never'`; `'overdue'`, idem — e
  vence também a rotação, não só a data.

**`blockStatusLabel.ts`**

- Sem override: `'never'` → "Nunca trabalhada", `'overdue'` → "Vencida", `'recent'` → "Em dia",
  todos sem sufixo.
- Com override: "Nunca trabalhada (forçado)" e "Vencida (forçado)".
- Respeita o `rotationDays` recebido, porque lê o status pelo `blockColorCategory`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | aberta enquanto não tem data de conclusão / fechada quando tem | `admin-app/src/domain/assignment.test.ts` | `assignmentIsOpen` |
| 2 | acha a aberta entre as concluídas; `null` num cartão só de concluídas e num vazio | `admin-app/src/domain/assignment.test.ts` | `openAssignment` |
| 3 | cartão vazio; aberta no topo e concluídas decrescentes; empate a favor da aberta; lista nova sem mutar a original | `admin-app/src/domain/assignment.test.ts` | `sortAssignments` |
| 4 | nunca trabalhada sem visita; recente aos 10 dias; vencida aos 200 | `admin-app/src/domain/blockColor.test.ts` | `blockColorCategory` com o limiar fixo de 120 e `DEFAULT_ROTATION_DAYS` |
| 5 | rotação mais curta e mais longa do território; nulo e ausente caem no padrão | `admin-app/src/domain/blockColor.test.ts` | o parâmetro `rotationDays?: number \| null` |
| 6 | override `'never'`/`'overdue'` vencem a visita de ontem e a rotação; ausente deixa a data mandar | `admin-app/src/domain/blockColor.test.ts` | a leitura do `statusOverride` antes do cálculo por data |
| 7 | os três rótulos derivados, e a rotação recebida chegando ao rótulo | `admin-app/src/domain/blockStatusLabel.test.ts` | `blockStatusLabel` sobre `blockColorCategory`, com a tabela `CATEGORY_LABEL` |
| 8 | forçado sai com " (forçado)"; derivado sai sem sufixo | `admin-app/src/domain/blockStatusLabel.test.ts` | o sufixo condicionado ao `statusOverride` |

Os testes de limiar do ciclo 5 (exatamente no limite e um milissegundo acima) passaram já no
primeiro `run` porque o ciclo 4 tinha implementado a comparação com `>`. Foram mantidos de
propósito: a asserção é significativa — trocar `>` por `>=` os derruba —, e o limiar é critério de
aceite explícito da task, não detalhe de implementação.

## O que foi feito

Três módulos novos na camada Domain de `admin-app/`, cada um com seu teste ao lado, e nada fora
dela. `blockStatusLabel` chama `blockColorCategory` em vez de reimplementar a decisão, de modo que
a lista de quadras e o mapa não possam discordar sobre a mesma quadra.

## Arquivos criados

- `admin-app/src/domain/assignment.ts` — as três regras de leitura do cartão S-13.
- `admin-app/src/domain/assignment.test.ts` — 9 testes.
- `admin-app/src/domain/blockColor.ts` — a terceira cópia da regra de cor da quadra.
- `admin-app/src/domain/blockColor.test.ts` — 14 testes.
- `admin-app/src/domain/blockStatusLabel.ts` — o status por extenso, com o "(forçado)".
- `admin-app/src/domain/blockStatusLabel.test.ts` — 7 testes.

## Arquivos modificados

Nenhum. A task só acrescenta arquivos.

## Decisões técnicas

- **`rotationDays?: number | null`, e não `rotationDays?: number` como em `app/`.** Em
  `admin-app/src/domain/models.ts` (Task 02) `Territory.rotationDays` é `number | null`, uma
  diferença já registrada lá: neste app um valor ausente é `null`, não `undefined`. Aceitar os dois
  deixa o chamador passar `territory.rotationDays` direto, em vez de traduzir `null` para
  `undefined` em cada tela — e é justamente esse tipo de tradução repetida que produz a divergência
  que a cópia tripla da regra existe para evitar. O comportamento é o mesmo dos outros dois
  arquivos: nulo e ausente caem em `DEFAULT_ROTATION_DAYS`.
- **`block.statusOverride === null` em vez do `!== undefined && !== null` do `app/`.** Mesma razão:
  o modelo deste app não tem o caso `undefined`, e o `tsc` garante isso. A checagem dupla lá existe
  porque o modelo de `app/` admite os dois; reproduzi-la aqui seria copiar a forma em vez do
  comportamento.
- **"Em dia" para `'recent'`, onde o desktop diz "Recente".** É o texto que a task pede, e a razão
  está registrada no próprio arquivo: no celular o rótulo aparece sozinho na linha, sem a legenda
  de cores ao lado, e "em dia" responde a pergunta que o admin faz em campo — se a quadra ainda
  precisa de visita neste ciclo. A categoria é a mesma; o que muda é só a palavra.
- **O desempate de `sortAssignments` não é hipotético.** Designar alguém encerra a designação
  anterior com a data de hoje e abre a nova na mesma chamada, então duas linhas podem compartilhar
  o instante de início. Nesse caso a aberta vai para cima, porque é ela que responde "quem está com
  este território agora".
- **`sortAssignments` copia antes de ordenar.** `Array.prototype.sort` ordena no lugar; a lista que
  chega é estado de uma tela React, e ordená-la no lugar mutaria o que o React recebeu.
- **`blockStatusLabel` deriva de `blockColorCategory`, não repete a regra.** É o que impede a
  tabela de quadras e o mapa de discordarem — mesma decisão que
  `admin/src/renderer/screens/TerritorySettingsScreen.tsx` tomou no desktop.
- **Nada foi deixado sem teste.** Os três arquivos são funções puras, sem relógio real (todo caso
  fixa um `NOW` e calcula a partir dele), sem rede e sem armazenamento — não há dependência para
  mockar.

## Como validar

```bash
cd admin-app
npx jest src/domain/assignment.test.ts src/domain/blockColor.test.ts src/domain/blockStatusLabel.test.ts
npx jest src/domain/assignment.test.ts src/domain/blockColor.test.ts src/domain/blockStatusLabel.test.ts \
  --coverage --collectCoverageFrom='src/domain/assignment.ts' \
  --collectCoverageFrom='src/domain/blockColor.ts' \
  --collectCoverageFrom='src/domain/blockStatusLabel.ts'
npx tsc --noEmit && npx eslint src/domain
```

## Resultado da validação

- `npx jest` (suíte inteira de `admin-app/`): **8 suítes, 89 testes passando**, incluindo as 3
  suítes e os 30 testes desta task.
- Cobertura dos três arquivos tocados: **100% de statements, branches, funções e linhas** — sem
  linha nem ramo descoberto.
- `npx tsc --noEmit`: limpo. `npx eslint src/domain`: limpo. `npx prettier --check`: limpo depois de
  formatar.
