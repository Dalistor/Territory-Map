# [0032] Apagar quadra pela interface do admin

**Data:** 2026-08-05
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 06

## Solicitação

> Spec 0002 — Task 06: Implemente por TDD. `deleteBlock` existe em `packages/core` e no
> `BlockRepository`, mas nenhuma tela do admin chama: dá para apagar um território
> (`home_screen.dart`, `_deleteTerritory`) e um registro de trabalho (`block_history_sheet.dart`),
> mas não uma quadra — desenhou errado, fica lá para sempre. Acrescente a opção ao bottom sheet que
> já abre ao tocar no número de uma quadra no mapa (`_blockActions` em
> `admin/lib/presentation/home_screen.dart`), abaixo de "Ver histórico" e "Editar contorno ou
> número", e siga o padrão de confirmação já usado em `_deleteTerritory`.

## Contexto

O admin desenha as quadras à mão sobre o mapa. Um contorno errado ou uma quadra duplicada não tinham
saída pela interface: `TerritoryMapApi.deleteBlock` e `BlockRepository.delete` já existiam, com o
endpoint `DELETE /admin/blocks/{id}` pronto no servidor, mas nenhum chamador. O único jeito de
remover uma quadra era apagar o território inteiro — e com ele todas as outras quadras.

Apagar uma quadra apaga o histórico dela: `block_work_logs.block_id` é `ON DELETE CASCADE`
(`server/app/models/block_work_log.py`). A confirmação precisa dizer isso, porque é uma perda
irreversível de registro de quem trabalhou onde.

## Critérios de aceite

1. O bottom sheet de uma quadra oferece "Apagar quadra".
2. Escolher a opção abre um diálogo que nomeia o número da quadra e avisa que o histórico de
   trabalho dela será apagado junto.
3. Confirmar chama `BlockRepository.delete` com o id daquela quadra, exatamente uma vez, e invalida
   `territoriesProvider` para o mapa refletir a remoção.
4. Cancelar não chama o repositório.
5. Um `ApiException` vindo do repositório aparece como `SnackBar` com a `error.message` do servidor,
   e a quadra continua na tela.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 0 | — (pré-requisito estrutural, sem novo teste; os 46 testes existentes seguraram) | — | `_blockActions` e `_editBlock` promovidos a `showBlockActions` (pública) e `_openBlockEditor` (privada) no nível superior de `home_screen.dart` |
| 1 | `the block sheet offers to delete the block` | `admin/test/block_delete_test.dart` | O `ListTile` "Apagar quadra", que devolve `'delete'` do bottom sheet |
| 2 | `confirming names the block and warns the history goes too` | `admin/test/block_delete_test.dart` | `_deleteBlock` com o `AlertDialog` de confirmação (título com o número, corpo com o aviso do cascade) e o `case 'delete'` do switch |
| 3 | `confirming deletes that block once and refreshes the map` | `admin/test/block_delete_test.dart` | A chamada a `blockRepositoryProvider.delete(block.id)` e o `ref.invalidate(territoriesProvider)` |
| 4 | `cancelling leaves the block alone` | `admin/test/block_delete_test.dart` | — (guarda do `if (confirmed != true) return`, já existente do ciclo 2) |
| 5 | `a refusal from the server is shown and the block stays` | `admin/test/block_delete_test.dart` | O `try/catch` de `ApiException` com o `SnackBar` da mensagem do servidor |

## O que foi feito

O bottom sheet que abre ao tocar no número de uma quadra ganhou uma terceira opção, "Apagar quadra",
abaixo de "Ver histórico" e "Editar contorno ou número". Escolher abre um `AlertDialog` no mesmo
formato de `_deleteTerritory` — "Apagar a quadra 7?", com o corpo dizendo que a quadra sai do mapa e
que todo o histórico de trabalho dela é apagado junto. Confirmado, chama
`BlockRepository.delete(block.id)` e invalida `territoriesProvider`; o mapa e a lista lateral se
redesenham sem a quadra. Recusa do servidor vira `SnackBar` com a mensagem dele, e nada muda na tela.

Como pré-requisito, `_blockActions` deixou de ser método privado de `HomeScreen` e virou a função de
nível superior `showBlockActions(context, ref, territory, block)` — mesmo padrão de
`showBlockHistory` em `block_history_sheet.dart`. `_editBlock` virou `_openBlockEditor` pela mesma
razão. Isso não mudou comportamento nenhum: os 46 testes existentes continuaram passando antes do
primeiro ciclo vermelho.

## Arquivos modificados

- `admin/lib/presentation/home_screen.dart` — `showBlockActions` pública no nível superior com a
  opção "Apagar quadra"; nova `_deleteBlock` com confirmação, chamada ao repositório, invalidação e
  tratamento de erro; `_editBlock` virou `_openBlockEditor` no nível superior.

## Arquivos criados

- `admin/test/block_delete_test.dart` — os cinco testes de widget do fluxo, com
  `FakeBlockRepository` e `FakeTerritoryRepository` sobrepostos por `ProviderScope(overrides:)`.

## Decisões técnicas

- **`showBlockActions` pública em vez de método privado.** O teste precisa exercitar a ação sem
  montar o `FlutterMap` do `TerritoryMap` — a spec autoriza isso explicitamente. Um método privado
  de `HomeScreen` não é alcançável de outro arquivo, então a saída foi promovê-lo a função de nível
  superior, exatamente como `showBlockHistory` já era. A extração foi feita **antes** do primeiro
  ciclo e sem mudar comportamento, para que o RED do ciclo 1 falhasse na asserção e não na
  compilação.
- **A invalidação é observada pelo seu efeito, não pela chamada.** Em vez de espionar
  `ref.invalidate`, o `FakeTerritoryRepository` conta as listagens e devolve o que o teste mandar;
  depois do delete, o harness renderiza os blocos que sobraram. "A quadra sumiu da tela" é o que o
  admin vê, e é a única prova de que o provider foi invalidado — asserção sobre comportamento, não
  sobre implementação.
- **O harness renderiza só a lista de quadras.** O que está sob teste é a ação; o mapa tem os seus
  próprios problemas de tamanho finito em `flutter_test` e cobertura própria prevista na Task 09.
- **Fakes das interfaces, não `MagicMock` solto.** `FakeBlockRepository` e `FakeTerritoryRepository`
  implementam `BlockRepository` e `TerritoryRepository`; os métodos fora do escopo lançam
  `UnimplementedError`, o que faz um uso acidental aparecer em vez de retornar `null` em silêncio.
- **A mensagem cita o número e o território.** "a quadra 12 ficou fora da nova demarcação" é o tom
  que o `CLAUDE.md` pede: dizer o que vai acontecer, não só que algo será apagado.
- **Deixado deliberadamente sem teste:** o ramo "Última vez trabalhada em dd/mm/aaaa" do subtítulo
  do sheet e os caminhos `'history'` / `'edit'` do switch. São comportamento pré-existente, não
  tocado por esta task, e caem nas Tasks 09 e 11 da spec 0002.

## Como validar

```bash
cd admin
flutter test test/block_delete_test.dart
```

Suíte inteira e portões do CI:

```bash
cd admin
dart format lib test
flutter analyze
flutter test
```

## Resultado da validação

- `flutter test test/block_delete_test.dart` → 5 testes passando.
- `flutter test` (suíte inteira do admin) → **51 testes passando**, ante 46 antes desta task.
- `flutter analyze` → `No issues found!`.
- `dart format lib test` → sem alteração pendente.
- Cobertura de `admin/lib/presentation/home_screen.dart` (`flutter test --coverage`): **todas as
  linhas adicionadas por esta implementação estão cobertas** — o `ListTile` de apagar, o
  `case 'delete'` e as 39 linhas de `_deleteBlock`, incluindo os dois ramos da confirmação
  (confirmado/cancelado) e os dois desfechos da chamada (sucesso/`ApiException`). As linhas
  descobertas do arquivo são todas anteriores a esta task (o corpo da `HomeScreen`, `_TerritoryList`,
  `_Failure`), cobertas pelas Tasks 09 e 11 da spec.
