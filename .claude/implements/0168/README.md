# [0168] Admin: apagar publicador pela tela

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0011/` — Task 07

## Solicitação

> Spec 0011 — Task 07: implemente por TDD a ação de apagar publicador em
> `admin/src/renderer/screens/PublishersScreen.tsx`, com os casos no teste co-localizado que já
> existe. Cada publicador ganha a ação de apagar, ao lado de "Desativar"/"Reativar" que já existem.
> A confirmação precisa deixar claro o que acontece e o que **não** acontece: a pessoa sai da lista
> e perde o acesso ao aplicativo, mas o histórico de trabalho e as designações dela **continuam no
> sistema com o nome preservado**. Quando o servidor recusar por designação aberta (409), mostre a
> mensagem que ele mandou. Toque apenas em `admin/src/renderer/`.

## Contexto

As Tasks 01–06 da spec 0011 já entregaram tudo que fica atrás da tela: o histórico guarda
`user_name` e não depende mais de uma FK para `users`, `UserService.delete` recusa quem tem
designação aberta, `DELETE /admin/users/{id}` existe e responde 409 nesse caso, e
`window.api.publishers.delete` já atravessa o IPC. Faltava o único ponto por onde o admin alcança
isso — a tela de Publicadores, onde até agora só existia "Desativar".

A confirmação é a peça que essa task precisava acertar: apagar e desativar passam a conviver no
mesmo menu, e a diferença entre as duas não se lê nos nomes. Um admin que não sabe se apagar leva o
histórico junto vai escolher desativar por medo — que é o comportamento errado pelo motivo errado.
Dizer na própria confirmação que o histórico fica, com o nome preservado, é o que torna a escolha
informada.

## Critérios de aceite

1. Cada linha de publicador oferece a ação de apagar.
2. Confirmar chama `window.api.publishers.delete` com o id daquela pessoa e recarrega a lista.
3. Cancelar não chama nada — nem a exclusão, nem a recarga.
4. A mensagem de confirmação menciona que o histórico e as designações são preservados, com o nome.
5. Uma recusa por designação aberta (409) aparece na tela **com a mensagem do servidor**, e a lista
   **não** é recarregada.
6. Um erro qualquer também aparece, em vez de sumir.
7. As ações que já existiam (criar, gerar novo código, desativar/reativar, busca por nome,
   contadores por situação) continuam funcionando, com os testes que as cobrem intactos.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `every publisher row offers deleting that person` | `admin/src/renderer/screens/PublishersScreen.test.tsx` | O item "Apagar" no menu "⋮" de cada linha, com `aria-label={'Apagar <nome>'}` e a classe `block-action-danger` |
| 2 | `confirming the deletion removes that person and asks the list again` | idem | `deletePublisher()`: fecha o menu, pede confirmação, chama `window.api.publishers.delete(id)` e recarrega via `load()`, tudo dentro de `runWrite` |
| 3 | `backing out of the confirmation deletes nobody` | idem | (verde na chegada — o portão de `window.confirm` entrou no ciclo 2; ver Decisões técnicas) |
| 4 | `the confirmation says the history survives, which is what separates it from "Desativar"` | idem | `deletePublisherConfirmMessage()` (verde na chegada, mesmo motivo) |
| 5 | `a deletion refused for an open assignment is reported in the server's own words` | idem | (verde na chegada — `runWrite` já era a via de erro; ver Decisões técnicas) |
| 6 | `a deletion that fails for any other reason is shown instead of passing silently` | idem | (verde na chegada, mesmo motivo) |

## O que foi feito

- **`PublishersScreen.tsx`**: novo item "Apagar" no menu de ações de cada publicador, abaixo de
  "Desativar"/"Reativar", em vermelho (`block-action-danger`, a classe que os outros destrutivos do
  admin já usam). O clique chama `deletePublisher()`, que fecha o menu, passa por
  `window.confirm(deletePublisherConfirmMessage(publisher))` e, no sim, executa a exclusão e
  recarrega a lista dentro de `runWrite` — a mesma via de erro das demais escritas da tela.
- **`deletePublisherConfirmMessage()`**: função de módulo, ao lado dos outros helpers puros do
  arquivo, com o texto que separa apagar de desativar — o que vai (a pessoa e o acesso ao
  aplicativo) e o que fica (histórico de trabalho e designações, com o nome preservado).
- **`PublishersScreen.test.tsx`**: seis casos novos; o `FakePublishersApi` ganhou o campo
  `deleteFailure`, para a recusa do servidor poder ser um `{message, code, statusCode}` serializado
  e não um `Error` qualquer. Nenhum teste existente foi reescrito.

## Arquivos modificados

- `admin/src/renderer/screens/PublishersScreen.tsx` — a ação de apagar, o handler e a mensagem de
  confirmação
- `admin/src/renderer/screens/PublishersScreen.test.tsx` — seis casos novos, o `confirmSpy` no
  `beforeEach`/`afterEach` e o campo `deleteFailure` no fake

## Arquivos criados

Nenhum.

## Decisões técnicas

- **`window.confirm`, não um modal próprio.** É o que `HomeScreen`, `HistoryScreen`,
  `DesignationsScreen` e `TerritorySettingsScreen` já usam para todo destrutivo do admin. Um segundo
  padrão de confirmação nesta tela só criaria divergência visual sem ganho.
- **A mensagem mora no próprio arquivo, não em `confirmMessages.ts`.** Aquele módulo existe porque
  duas telas fazem a mesma pergunta sobre território/quadra e a cópia divergiria. Apagar publicador
  é perguntado num lugar só; mover o texto para lá seria antecipar um segundo chamador que não
  existe.
- **A classe `block-action-danger` foi reaproveitada**, então `index.css` não precisou de nada. Uma
  classe nova com a mesma regra (`color: var(--color-danger)`) seria duplicação.
- **O 409 não ganhou tratamento especial.** `runWrite` → `parseIpcError` já recupera a `message` que
  atravessou o IPC, e a mensagem do `PublisherHasOpenAssignmentError` foi escrita (Task 03) dizendo
  o que fazer. Um `if (statusCode === 409)` na tela substituiria um texto bom por outro pior e
  duplicaria no cliente uma regra que é do servidor. O teste do ciclo 5 é o que trava esse desvio:
  ele exige a frase do servidor, palavra por palavra, na tela.
- **Ciclos 3–6 ficaram verdes na chegada.** O mínimo do ciclo 2 já embutiu o portão de confirmação e
  o `runWrite`, porque separá-los teria produzido um passo intermediário artificial (um botão que
  apaga sem perguntar). Para não deixar teste passando de graça sem prova, cada um dos quatro foi
  verificado por mutação: quebrando o portão de `window.confirm`, os ciclos 3 e 4 falham; tirando o
  `runWrite` de volta do `deletePublisher`, os ciclos 5 e 6 falham. Nenhum dos quatro passa por
  acidente.
- **A lista não é recarregada quando a exclusão falha** — não por um caso especial, mas porque o
  `await load()` está depois do `await delete()` dentro do mesmo bloco. É o mesmo desenho de
  `toggleActive` e `regenerate`, e o teste do ciclo 5 fixa a consequência (`listCalls === 1`).
- **`deleteFailure` separado de `writeFailure` no fake**: o `writeFailure` existente é tipado
  `Error | null` e é lançado por todas as escritas. A recusa do servidor precisa carregar `code` e
  `statusCode`, que um `Error` não tem, e precisa atingir só o `delete` — dois motivos para um campo
  próprio em vez de afrouxar o tipo do que já existe.
- **Sem teste para os `?? '—'`**: continuam deliberadamente descobertos, pelo motivo já registrado
  no docblock do arquivo (forçar essa branch exige um fixture que mente sobre a resposta da API).

## Como validar

```bash
cd admin && npx vitest run src/renderer/screens/PublishersScreen.test.tsx
```

Suíte inteira do admin:

```bash
cd admin && npx vitest run
```

## Resultado da validação

- `npx vitest run src/renderer/screens/PublishersScreen.test.tsx` → **30 testes passando** (24 já
  existiam e não foram tocados, 6 novos).
- `npx vitest run` (admin inteiro) → **26 arquivos, 513 testes passando**.
- Cobertura de `PublishersScreen.tsx`
  (`npx vitest run --coverage --coverage.include='src/renderer/screens/PublishersScreen.tsx'`):
  **100% de statements, 100% de linhas, 100% de funções, 96,25% de branches**. As branches
  descobertas são as três `?? '—'` pré-existentes (linhas 186–195 e 222), fora do escopo desta task
  e justificadas no próprio arquivo. Todo o código novo está coberto de linha e de branch.
- `npx tsc --noEmit -p tsconfig.web.json` → limpo.
- `npm run lint` → 0 erros. Resta **1 warning pré-existente de formatação** em
  `src/renderer/screens/TerritoryEditorScreen.tsx:103` (`prettier/prettier`), de outra task; não foi
  tocado porque está fora do escopo declarado desta.
