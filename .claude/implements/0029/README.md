# [0029] Camada de repositórios do admin em `data/`

**Data:** 2026-08-05
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 04

## Solicitação

> Crie a camada de repositórios em `admin/lib/data/`, um arquivo por entidade, cada um com uma
> `abstract interface class` e uma implementação sobre `TerritoryMapApi` + `Session`
> (`territory_repository.dart`, `block_repository.dart`, `publisher_repository.dart`,
> `work_log_repository.dart`). **Toda** operação passa por `session.run(...)`. Registre um provider
> por repositório em `admin/lib/data/providers.dart`, mantendo `apiProvider`, `sessionProvider` e
> `isConfiguredProvider` como estão. Não renomeie nem redefina `territoriesProvider`, e não crie
> providers com os nomes `publishersProvider` ou `workLogsProvider`.

## Contexto

As seis telas do admin faziam `ref.read(apiProvider)` e montavam a chamada dentro de
`ref.read(sessionProvider).run(...)`. Isso põe o cliente HTTP dentro da presentation e obriga
qualquer teste de widget a simular um servidor inteiro — que é exatamente o motivo de o admin ainda
não ter nenhum. Com uma interface por entidade, os testes das Tasks 06–11 substituem o repositório
por um fake em três linhas de `ProviderScope(overrides: ...)`.

A interface também é a fronteira que impede a presentation de saber que existe token: quem chama
`session.run` é o repositório, sempre, e nunca a tela.

## Critérios de aceite

1. A primeira chamada de cada repositório dispara o login automático antes da requisição de negócio —
   a sequência de paths começa em `/auth/login`.
2. `listWithBlocks()` faz um `GET /admin/territories` e depois um `GET /admin/territories/{id}` por
   território, devolvendo os detalhes com as quadras.
3. Um 401 no meio de uma operação faz o repositório logar de novo e repetir a chamada uma única vez,
   e o chamador recebe o resultado sem ver o 401.
4. `BlockRepository.delete` emite `DELETE /admin/blocks/{id}`.
5. `PublisherRepository.setActive` envia o valor booleano recebido, sem invertê-lo.
6. Um erro que não é 401 sobe como `ApiException` sem nova tentativa de login.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | signs in by itself, then lists and details each territory | `admin/test/repositories_test.dart` | `TerritoryRepository` + `ApiTerritoryRepository.listWithBlocks` |
| 2 | creates a territory with the name and the drawn ring | idem | `create` |
| 3 | updates only the fields it was given | idem | `update` |
| 4 | deletes a territory | idem | `delete` |
| 5 | signs in by itself before creating a block | idem | `BlockRepository` + `ApiBlockRepository.create` |
| 6 | omits the number so the server picks the lowest free one | idem | `create` com `number` nulo |
| 7 | updates a block by its own id | idem | `update` |
| 8 | deletes a block | idem | `delete` |
| 9 | signs in by itself before listing the publishers | idem | `PublisherRepository` + `ApiPublisherRepository.list` |
| 10 | creates a publisher from the typed name | idem | `create` |
| 11 | asks for a fresh access code | idem | `regenerateCode` |
| 12 | sends the activity it was given, without flipping it | idem | `setActive` |
| 13 | signs in by itself before reading a block history | idem | `WorkLogRepository` + `ApiWorkLogRepository.listFor` |
| 14 | deletes a log by its own id, not by the block | idem | `delete` |
| 15 | the providers hand out repositories over a single session | idem | os quatro providers em `data/providers.dart` |
| 16–19 | os três casos de token expirado e o de erro que não é 401 | idem | *nenhum* — ver "Decisões técnicas" |

## O que foi feito

Quatro arquivos novos em `admin/lib/data/`, cada um com a `abstract interface class` que a
presentation vai ver e a implementação `Api*` sobre `TerritoryMapApi` + `Session`. Nenhum método
toca o cliente da API fora de `session.run(...)`.

Em `data/providers.dart`, quatro providers novos tipados pela **interface**
(`Provider<TerritoryRepository>`, não `Provider<ApiTerritoryRepository>`), para que um override de
teste possa entregar um fake. `apiProvider`, `credentialsStoreProvider`, `sessionProvider`,
`isConfiguredProvider` e `territoriesProvider` ficaram exatamente como estavam — `territoriesProvider`
ainda duplica a lógica de `listWithBlocks`, e é a Task 05 que o reescreve sobre o repositório.

## Arquivos modificados

- `admin/lib/data/providers.dart` — quatro providers novos, tipados pela interface; nada existente
  foi alterado

## Arquivos criados

- `admin/lib/data/territory_repository.dart` — `listWithBlocks`, `create`, `update`, `delete`
- `admin/lib/data/block_repository.dart` — `create`, `update`, `delete`
- `admin/lib/data/publisher_repository.dart` — `list`, `create`, `regenerateCode`, `setActive`
- `admin/lib/data/work_log_repository.dart` — `listFor`, `delete`
- `admin/test/repositories_test.dart` — 19 casos sobre `MockClient`

## Decisões técnicas

- **Teste contra um servidor falso, não contra uma `Session` falsa.** O que precisa valer é que a
  chamada chegue ao endpoint certo *autenticada*; só uma `Session` real sobre uma `TerritoryMapApi`
  real prova isso. O `FakeServer` responde de uma fila e grava método, path e corpo — o corpo é o que
  permite afirmar que `setActive(id, false)` manda `false`.
- **Quatro casos não tiveram RED.** Os três de token expirado e o de erro que não é 401 passaram
  assim que escritos, porque `session.run` já os garante desde o ciclo 1. Estão no arquivo mesmo
  assim: são os critérios 3 e 6 da task e o que vai acusar, nas tasks seguintes, se alguém acrescentar
  um método de repositório chamando `api.x()` direto. Ficam registrados aqui como caracterização, não
  como ciclos TDD de verdade.
- **O retry replaia a operação inteira.** Como `listWithBlocks` é várias requisições dentro de um
  único `run`, um 401 no detalhe repete listagem *e* detalhes. É o comportamento correto — meia
  listagem seria pior que nenhuma — e está pinado por teste, porque não é óbvio ao ler o código.
- **`api` e `session` são campos públicos nas implementações.** Não por gosto: em Dart um nome
  privado não pode ser parâmetro nomeado, e a alternativa (o `// ignore: prefer_initializing_formals`
  que a `Session` usa) fica ilegível quando a lista de parâmetros quebra em várias linhas. A exposição
  é inócua: as telas recebem a **interface**, que não tem esses membros. `flutter analyze` roda no CI
  sem `--fatal-infos`, mas sai com código 1 em qualquer info — então o lint não podia ficar.
- **Sem `listBlocks` no `BlockRepository`.** As quadras chegam no detalhe do território; uma segunda
  fonte para elas seria uma segunda opinião.
- **`territoriesProvider` intocado**, e nenhum provider chamado `publishersProvider` ou
  `workLogsProvider` foi criado — os dois ainda existem dentro de arquivos de `presentation/`, e um
  homônimo aqui quebraria o `analyze`. Quem move os três é a Task 05.

## Como validar

```bash
cd admin && flutter test test/repositories_test.dart
cd admin && dart format lib test && flutter analyze && flutter test
```

## Resultado da validação

- `flutter test test/repositories_test.dart` → **19 testes passando**, estável em 5 execuções
  seguidas (o `Future.wait` de `listWithBlocks` podia deixar a ordem das requisições indeterminada;
  não deixou).
- `flutter test` (suíte inteira do admin) → **46 testes passando** (27 anteriores + 19 novos).
- `flutter analyze` → **No issues found**.
- `dart format lib test` → sem mudança pendente.
- `flutter test --coverage`, linhas dos arquivos tocados:
  `territory_repository.dart` 13/13, `block_repository.dart` 8/8, `publisher_repository.dart` 9/9,
  `work_log_repository.dart` 5/5 — **100%**. Em `providers.dart`, os quatro providers novos estão
  cobertos; as linhas descobertas do arquivo são as pré-existentes (`SecureCredentialsStore`, o corpo
  real de `apiProvider`, `isConfiguredProvider` e `territoriesProvider`), fora do escopo desta task.
