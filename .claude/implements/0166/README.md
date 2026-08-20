# [0166] Admin: `publishers.delete` no main e no IPC

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0011/` — Task 06

## Solicitação
> `deletePublisher(publisherId)` no cliente da API, fazendo `DELETE /admin/users/{id}`, no mesmo
> estilo dos `delete` que já existem ali. No contrato de IPC, `publishers.delete(publisherId):
> Promise<void>` com um canal novo em `IPC_CHANNELS`, o handler registrado dentro de `session.run`
> (para herdar a reautenticação silenciosa no 401) e o repasse de uma linha no preload.

## Contexto
A Task 04 abriu `DELETE /admin/users/{id}` no servidor, com 409 quando o publicador ainda tem
designação aberta. Esta task é a ponte: o renderer não fala HTTP, só `window.api`, então a exclusão
precisa atravessar main → preload → contrato antes que a tela (Task 07) possa oferecê-la.

O ponto que exige cuidado é o 409. A tela precisa distinguir "conclua a designação antes" de uma
falha qualquer, e o único carimbo que diz qual é qual é o `code` do erro — que tem que sobreviver à
serialização do IPC, não virar um "algo deu errado" genérico no caminho.

## Critérios de aceite
- `deletePublisher` faz `DELETE` em `/admin/users/{id}` e resolve **sem valor** no 204.
- Um 409 chega ao chamador como `ApiErrorException` com `code` e `statusCode` preservados.
- O handler de IPC repassa o id ao cliente da API, através de `session.run`.
- O handler propaga a recusa como erro serializado, com código e status, como os vizinhos.
- Um 401 dispara a reautenticação silenciosa **uma vez** e repete a chamada.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `deletePublisher DELETEs /admin/users/{id} and resolves with no value` | `admin/src/main/api-client.test.ts` | `deletePublisher` na interface `ApiClient` e sua implementação |
| 2 | `deletePublisher surfaces a 409 with the code and the status preserved` | `admin/src/main/api-client.test.ts` | (nenhum — comprova que o `request` genérico já preserva o erro, sem caso especial) |
| 3 | `forwards the publisher id to the API client, through the session` | `admin/src/main/ipc-handlers.test.ts` | canal `publishersDelete`, `publishers.delete` no contrato, handler dentro de `session.run`, repasse no preload |
| 4 | `propagates a refused deletion as a serialized error, code and status included` | `admin/src/main/ipc-handlers.test.ts` | (nenhum — comprova que o `handle` compartilhado já serializa) |
| 5 | `re-authenticates once and retries when the server answers 401` | `admin/src/main/ipc-handlers.test.ts` | (nenhum — comprova que o handler está mesmo dentro de `session.run`) |

Três dos cinco ciclos não geraram código de produção novo: eles não descrevem funcionalidade a
escrever, e sim **comportamento herdado** que a task promete e que só um teste prova estar de pé —
que o `request` não engole o `code` do 409, que o `handle` serializa o erro, e que o handler não
ficou fora do `session.run` por descuido. São os três critérios de aceite mais fáceis de quebrar
sem ninguém notar.

## O que foi feito
Adicionado `deletePublisher(publisherId)` ao cliente da API, `publishers:delete` a `IPC_CHANNELS`,
`publishers.delete` ao contrato de IPC, o handler correspondente dentro de `session.run` e o repasse
de uma linha no preload.

Como o contrato ficou mais largo, os fakes que o implementam nos testes deixaram de compilar. Foram
atualizados — só os fakes, nenhuma tela.

## Arquivos modificados
- `admin/src/main/api-client.ts` — `deletePublisher` na interface e na implementação
- `admin/src/main/api-client.test.ts` — dois casos: caminho feliz e a preservação do 409
- `admin/src/shared/ipc-contract.ts` — canal `publishersDelete` e `publishers.delete`, documentado
- `admin/src/main/ipc-handlers.ts` — handler de `publishers:delete` dentro de `session.run`
- `admin/src/main/ipc-handlers.test.ts` — três casos: repasse, erro serializado, reautenticação
- `admin/src/preload/index.ts` — repasse de uma linha
- `admin/src/main/session.test.ts` — `deletePublisher` no fake de `ApiClient`
- `admin/src/renderer/screens/PublishersScreen.test.tsx` — `delete` em `FakePublishersApi`, gravando o id
- `admin/src/renderer/App.test.tsx`, `BlockEditorScreen.test.tsx`, `BlockWorkPanel.test.tsx`, `DesignationsScreen.test.tsx`, `HistoryScreen.test.tsx`, `HomeScreen.test.tsx`, `SetupScreen.test.tsx`, `TerritoryEditorScreen.test.tsx`, `TerritorySettingsScreen.test.tsx` — stub `delete: vi.fn()` nos fakes de `window.api.publishers`

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Nenhum tratamento especial para o 409 no cliente.** O `request` genérico já converte qualquer
  status ≥ 400 em `ApiErrorException` com `code`, `statusCode` e `detail`. Interceptar o 409 aqui
  para traduzi-lo seria mover regra para o main sem necessidade — a mensagem que o servidor manda já
  diz o que fazer, e é a tela que decide como mostrá-la. O teste existe para travar isso.
- **Handler dentro de `session.run`, como todos os vizinhos.** É o que faz a exclusão herdar a
  reautenticação silenciosa. O teste do 401 usa a `session` **real** (`createSession`), não o fake
  que só repassa a ação, porque com o fake o teste passaria mesmo se o handler estivesse fora do
  `run` — provaria nada.
- **Os fakes do renderer foram ajustados, as telas não.** A task proíbe mexer em tela, e nenhuma foi
  tocada. Mas um fake que implementa menos que o contrato não compila e deixaria `npm run build`
  quebrado entre a Task 06 e a Task 07 — é o mesmo ajuste mínimo de composição que a Task 03 fez no
  servidor. O de `PublishersScreen` ganhou um `delete` que grava o id em `deleted` e respeita o
  `writeFailure`, em vez de um `vi.fn()` mudo, porque é justamente o fake de que a Task 07 vai
  precisar.
- **Um aviso de `prettier` em `admin/src/renderer/screens/TerritoryEditorScreen.tsx` é anterior a
  esta task** — confirmado rodando o ESLint contra a árvore sem estas mudanças. Fora do escopo,
  deixado como estava.

## Como validar
```bash
cd admin && npx vitest run src/main/api-client.test.ts src/main/ipc-handlers.test.ts
```

## Resultado da validação
- `npx vitest run src/main/api-client.test.ts src/main/ipc-handlers.test.ts` → **78 testes passando**
- `npx vitest run` (suíte inteira do admin) → **507 testes passando, 26 arquivos**
- `npx vitest run --coverage` nos dois arquivos → `api-client.ts` com **100% de linha, 100% de
  statements, 100% de funções e 98,5% de branch** (a única branch descoberta é a linha 281, o
  fallback `options.fetchImpl ?? globalThis.fetch`, que os testes sempre injetam — o outro lado é o
  `fetch` real do Electron, deliberadamente sem teste). As linhas novas de `ipc-handlers.ts` estão
  cobertas pelos três casos acrescentados; o número global do arquivo é baixo porque a maioria dos
  handlers é exercida pelos testes de tela, não por este arquivo.
- `npx tsc --noEmit` nos dois projetos (`tsconfig.node.json` e `tsconfig.web.json`) → **limpo**
- `npx eslint src` → 0 erros; 1 aviso de formatação **pré-existente**, fora do escopo
