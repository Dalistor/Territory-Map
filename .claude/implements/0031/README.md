# [0031] As telas do admin passam a falar com os repositórios

**Data:** 2026-08-05
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0002/` — Task 05

## Solicitação

> Com os repositórios da Task 04 no lugar, remova o cliente da API de dentro das telas. Em
> `admin/lib/data/providers.dart`: reescreva `territoriesProvider` para chamar
> `ref.watch(territoryRepositoryProvider).listWithBlocks()`, e traga para cá o `publishersProvider`
> (hoje no topo de `presentation/publishers_screen.dart`) e o `workLogsProvider` (hoje no topo de
> `presentation/block_history_sheet.dart`), agora sobre os repositórios correspondentes — mesmos
> nomes, mesmos tipos, para que as telas mudem só o import. Em seguida ajuste as seis telas: troque
> cada `ref.read(apiProvider)` + `session.run(() => api.x(...))` pela chamada direta ao repositório,
> e apague as definições de provider que foram movidas. `SetupScreen` continua usando
> `sessionProvider.configure(...)`. O tratamento de erro fica como está. Nenhuma mudança de
> comportamento visível ao usuário — é rewiring.

## Contexto

A Task 04 criou a camada de repositórios em `admin/lib/data/`, mas nada a consumia: as telas
continuavam pegando `ref.read(apiProvider)` e montando a chamada dentro de
`ref.read(sessionProvider).run(...)`. Isso deixava a presentation conhecendo o cliente HTTP e a
sessão — e, na prática, tornava teste de widget caro, porque cobrir uma tela exigiria simular HTTP
em vez de sobrepor um fake. As Tasks 06 a 11 da spec dependem exatamente disso.

## O que foi feito

Os três providers de leitura passaram a viver em `data/providers.dart`, sobre os repositórios, e as
seis telas passaram a chamar o repositório direto.

- `territoriesProvider` virou uma linha sobre `TerritoryRepository.listWithBlocks()`. A explicação de
  "lista e depois cada detalhe" saiu daqui porque já está no repositório, que é quem faz isso agora.
- `publishersProvider` e `workLogsProvider` foram movidos de dentro dos arquivos de `presentation/`
  para `data/providers.dart`, com o mesmo nome e o mesmo tipo (`FutureProvider<List<Publisher>>` e
  `FutureProvider.family<List<WorkLog>, String>`) — as telas só perderam a definição local; o
  `import` de `data/providers.dart` que elas já tinham resolve a referência.
- `HomeScreen._deleteTerritory` → `territoryRepositoryProvider.delete(id)`.
- `PublishersScreen._create` → `publisherRepositoryProvider.create(name)`;
  `_PublisherTile._act` → `regenerateCode(id)` e `setActive(id, !publisher.isActive)`.
- `TerritoryEditorScreen._save` → `create(...)` ou `update(...)` do `TerritoryRepository`.
- `BlockEditorScreen._save` → `create(...)` ou `update(...)` do `BlockRepository`.
- `_LogTile._confirmDelete` → `workLogRepositoryProvider.delete(log.id)`.
- `SetupScreen` não mudou: continua com `sessionProvider.configure(...)`.

## Arquivos modificados

- `admin/lib/data/providers.dart` — `territoriesProvider` reescrito sobre o repositório;
  `publishersProvider` e `workLogsProvider` trazidos de `presentation/`
- `admin/lib/presentation/home_screen.dart` — apagar território pelo `TerritoryRepository`
- `admin/lib/presentation/publishers_screen.dart` — definição de `publishersProvider` removida;
  cadastrar, gerar novo código e ativar/desativar pelo `PublisherRepository`
- `admin/lib/presentation/territory_editor_screen.dart` — salvar pelo `TerritoryRepository`
- `admin/lib/presentation/block_editor_screen.dart` — salvar pelo `BlockRepository`
- `admin/lib/presentation/block_history_sheet.dart` — definição de `workLogsProvider` removida;
  remover registro pelo `WorkLogRepository`

## Arquivos criados

Nenhum.

## Decisões técnicas

- **O `session.run(...)` sumiu das telas, não do código.** Ele agora está dentro de cada método de
  repositório (Task 04). É o que mantém o login silencioso e o retry único no 401 funcionando sem
  que nenhuma camada acima saiba que existe token.
- **O `if/else` substituiu o `return` dentro do `session.run`.** Nos dois editores o corpo era um
  closure que retornava `createX` ou `updateX` para o `session.run` executar. Sem o wrapper, o
  `await` de cada ramo é direto — o resultado era descartado antes e continua sendo, porque quem
  recarrega a tela é o `invalidate(territoriesProvider)`.
- **`sessionProvider` continua em duas telas, de propósito.** `SetupScreen` chama `configure(...)`,
  que é a configuração inicial e o único ponto que legitimamente conhece as credenciais; `HomeScreen`
  lê `session.congregation` para o título da `AppBar`, que é estado da sessão e não dado de nenhum
  repositório. O que a task pedia para desaparecer da presentation — `apiProvider` — desapareceu.
- **Os providers de leitura foram para `data/`, não ficaram onde estavam com o repositório injetado.**
  Um `publishersProvider` definido dentro de `publishers_screen.dart` obrigaria qualquer outra tela
  que precisasse da lista a importar uma tela. Junto dos repositórios, a sobreposição por
  `ProviderScope(overrides: ...)` num teste atinge todo mundo que observa o mesmo dado.
- **A inversão do `isActive` ficou na tela**, como o comentário do `PublisherRepository` já previa: o
  repositório recebe o estado desejado, e quem sabe o estado atual é quem está desenhando o menu.

## Como validar

Em `admin/`:

```bash
dart format lib test
flutter analyze
flutter test
grep -rn "apiProvider" lib/presentation    # não deve retornar nada
```

Manualmente (`flutter run -d chrome` contra um servidor): apagar território, cadastrar publicador,
gerar novo código, desativar/reativar, salvar território, salvar quadra e remover um registro de
trabalho continuam funcionando exatamente como antes, inclusive as mensagens de erro do servidor no
banner dos editores e no `SnackBar` das listas.

## Resultado da validação

- `dart format lib test` — 20 arquivos, 0 alterados
- `flutter analyze` — "No issues found!"
- `flutter test` — 46 testes passando
- `grep -rn "apiProvider" admin/lib/presentation` — sem resultado

Não há teste novo: a task é rewiring puro, sem comportamento novo. A cobertura das telas é
justamente o que as Tasks 08 a 11 desta spec vão acrescentar, e é esta task que as torna baratas.
