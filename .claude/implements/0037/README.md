# [0037] Testes de widget: editores de território e quadra, e o histórico de trabalho

**Data:** 2026-08-07
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 11

## Solicitação

> Spec 0002 — Task 11: Cubra as três telas restantes do admin. Em
> `admin/test/territory_editor_test.dart`: **(1)** "Salvar" fica desabilitado sem nome, e também com
> menos de 3 pontos no polígono; **(2)** "Desfazer" nasce desabilitado e "Apagar tudo" também,
> enquanto não há ponto; **(3)** com nome e um anel válido, salvar chama `TerritoryRepository.create`
> (tela nova) ou `update` (tela de edição) com os pontos desenhados, e invalida `territoriesProvider`;
> **(4)** um `ApiException` do servidor — o caso real é sobreposição com outro território — aparece no
> banner vermelho com a mensagem dele, e a tela **não** fecha, para o admin poder corrigir o desenho.
> Em `admin/test/block_editor_test.dart`: **(5)** com o campo de número em branco, a chamada leva
> `number: null`, deixando o servidor escolher o menor livre; **(6)** um número menor que 1 ou não
> numérico mostra "Use um número a partir de 1" e bloqueia o salvamento; **(7)** salvar chama
> `BlockRepository.create` numa quadra nova e `update` numa existente. Em
> `admin/test/block_history_test.dart`: **(8)** sem registros, diz que a quadra nunca foi trabalhada;
> **(9)** cada registro mostra o nome do publicador e a data do trabalho, e acrescenta "sincronizado
> em ..." quando `wasSyncedLate` — a diferença entre trabalhar e a fila offline drenar; **(10)**
> remover um registro pede confirmação nomeando quem e quando, chama `WorkLogRepository.delete` e
> invalida **tanto** `workLogsProvider(blockId)` **quanto** `territoriesProvider`, porque o servidor
> recalcula `last_worked_at` e a cor da quadra no mapa muda junto. Os dois editores montam um
> `FlutterMap`: dê tamanho finito com `SizedBox`/`MediaQuery` e, se necessário, interaja com o
> `PolygonEditorController` diretamente para montar o polígono em vez de simular toques no mapa — o
> alvo aqui é a tela, e o editor já tem cobertura própria em `polygon_editor_test.dart`. Termine com
> `dart format lib test`, `flutter analyze` e `flutter test` verdes em `admin/`. Toque apenas em
> `admin/test/` e, se um defeito real exigir, nos arquivos correspondentes de
> `admin/lib/presentation/`; não altere a camada `data/`.

## Contexto

Estas eram as três últimas telas do admin sem teste. As tasks 08–10 cobriram a configuração inicial,
o roteamento, a `HomeScreen` e os publicadores; sobravam os dois editores e a folha de histórico —
justamente as telas onde o admin **escreve** geometria e **apaga** histórico.

O que estava sem rede de proteção:

- **A geometria que sai da tela.** Os dois editores leem o anel de um `PolygonEditorController` que
  eles próprios constroem. O `polygon_editor_test.dart` cobre o controlador; ninguém cobria a ponte
  entre ele e a chamada ao repositório — se o `state.points` virasse `mapPoints` por descuido, a
  ordem lat/lng inverteria em silêncio.
- **`number: null`.** O caminho normal de numeração é deixar o campo em branco para o servidor
  escolher o menor livre. Um `?? 0` ou `?? 1` acidental ali quebraria a numeração de papel que a
  congregação já usa, e nada acusaria.
- **A dupla invalidação do histórico.** Remover um registro muda `last_worked_at` no servidor, e a
  cor da quadra no mapa muda junto. `territoriesProvider` só é invalidado por uma linha
  ([block_history_sheet.dart:132](../../../admin/lib/presentation/block_history_sheet.dart#L132));
  perdê-la deixaria o mapa mostrando uma cor mentirosa até o próximo *reload* manual.
- **A tela não fechar depois de uma recusa.** Sobreposição de território é decisão do PostGIS, e
  chega como `ApiException` depois do `Salvar`. Se a tela fechasse, o desenho — a única coisa que o
  admin não consegue recuperar — iria junto.

## Critérios de aceite

1. "Salvar" fica desabilitado sem nome, e também com menos de 3 pontos no polígono.
2. "Desfazer" e "Apagar tudo" nascem desabilitados enquanto não há ponto.
3. Com nome e um anel válido, salvar chama `TerritoryRepository.create` (tela nova) ou `update`
   (tela de edição) com os pontos desenhados, e invalida `territoriesProvider`.
4. Um `ApiException` de sobreposição aparece no banner vermelho com a mensagem do servidor, e a tela
   **não** fecha.
5. Com o campo de número em branco, a chamada leva `number: null`.
6. Um número menor que 1 ou não numérico mostra "Use um número a partir de 1." e bloqueia o
   salvamento.
7. Salvar chama `BlockRepository.create` numa quadra nova e `update` numa existente.
8. Sem registros, o histórico diz que a quadra nunca foi trabalhada.
9. Cada registro mostra o nome do publicador e a data do trabalho, e acrescenta "sincronizado em ..."
   quando `wasSyncedLate`.
10. Remover um registro pede confirmação nomeando quem e quando, chama `WorkLogRepository.delete` e
    invalida **tanto** `workLogsProvider(blockId)` **quanto** `territoriesProvider`.

## Ciclos TDD

Como nas tasks 08–10, são testes de **caracterização**: a Task 11 é de cobertura, e o comportamento
já existia. Isso remove o RED natural, então o valor de cada teste foi comprovado por **mutação** —
três mutações aplicadas ao código de produção e revertidas depois:

| Mutação em `lib/presentation/` | Testes que ficaram vermelhos |
|---|---|
| `canSave` sem `_name.text.trim().isNotEmpty` | `a nameless territory cannot be saved…` |
| `_numberIsUsable` sempre `true` | os 4 testes de número inválido |
| remover `..invalidate(territoriesProvider)` do histórico | `confirming removes the record and refreshes both…` |

Nenhum teste passou "de graça": os quatro que falharam ao serem escritos apontaram problemas dos
próprios testes — `find.byTooltip` devolve o `Tooltip`, não o `IconButton`, e uma invalidação sem
ouvinte é um no-op, então `territoriesProvider` precisa de um `listen` para que "o mapa **não** foi
recarregado" seja uma observação e não um acaso.

| # | Caso de teste | Arquivo | O que ficou coberto |
|---|---------------|---------|---------------------|
| 1 | a tap on the map is what marks a corner | `territory_editor_test.dart` | `MapOptions.onTap` → `_editor.addPoint`, e o hint de anel inacabado |
| 2 | a nameless territory cannot be saved, however good the drawing | idem | o `_name.text.trim().isNotEmpty` do `canSave` |
| 3 | a named territory with fewer than three points cannot be saved either | idem | o `state.isValid` do `canSave`, nos dois lados do limite de 3 pontos |
| 4 | with nothing drawn there is nothing to undo and nothing to wipe | idem | `_editor.canUndo` e `state.isEmpty` nas duas `IconButton` da `AppBar` |
| 5 | the territory being reshaped is not also drawn as its own neighbour | idem | o filtro `neighbour.id != widget.territory?.id` do `PolygonEditorLayers` |
| 6 | opening an existing boundary has something to wipe but nothing to undo | idem | o construtor com `initial:` e o undo que nasce vazio |
| 7 | a new territory is created with the name and the ring drawn… | idem | `create(name:, boundary:)` com o nome trimado, e a invalidação de `territoriesProvider` |
| 8 | reshaping an existing territory updates it instead of creating a second one | idem | o desvio `widget.isNew` para `update(id, …)` |
| 9 | an overlap refused by the server is shown in its own words… | idem | `catch (ApiException)` → `_error`, sem `pop` |
| 10 | the refusal is drawn as an error, not as a hint | idem | o banner em `colorScheme.errorContainer` |
| 11 | a tap on the map is what marks a corner | `block_editor_test.dart` | `MapOptions.onTap` do editor de quadra |
| 12 | a blank number is left for the server to choose | idem | `_chosenNumber` devolvendo `null`, e o `helperText` da quadra nova |
| 13 | a number below one is refused before it reaches the server | idem | `_numberIsUsable` em `0` |
| 14 | a negative number is refused the same way | idem | `_numberIsUsable` em `-3` |
| 15 | something that is not a number is refused too | idem | `int.tryParse` devolvendo `null` |
| 16 | clearing a bad number puts the save back within reach | idem | o caminho de volta do `errorText` |
| 17 | a new block is created with the number typed… | idem | `create(territoryId:, polygon:, number:)` + invalidação |
| 18 | an existing block is updated instead of created again | idem | `update(id, …)`, o campo pré-preenchido e o `helperText` ausente |
| 19 | a block refused for falling outside its territory keeps the drawing on screen | idem | `catch (ApiException)` do editor de quadra |
| 20 | a block nobody has covered says exactly that | `block_history_test.dart` | o ramo `list.isEmpty` |
| 21 | a refused history is reported in the server's own words | idem | o ramo `error:` do `logs.when` |
| 22 | each record names who covered the block and when | idem | `_LogTile` com `wasSyncedLate` falso |
| 23 | a record that reached the server late says so… | idem | o sufixo "· sincronizado em …" |
| 24 | removing a record asks first, naming who and when | idem | o `AlertDialog` de `_confirmDelete` |
| 25 | confirming removes the record and refreshes both the history and the map | idem | `delete(log.id)` e as **duas** invalidações |
| 26 | cancelling leaves the record alone | idem | o `if (confirmed != true) return` |
| 27 | a refusal to remove is shown and the record stays | idem | `catch (ApiException)` → `SnackBar` |

## O que foi feito

Três arquivos de teste novos, 27 testes. Nenhuma linha de `lib/` mudou: nenhum defeito de produção
apareceu.

## Arquivos criados

- `admin/test/territory_editor_test.dart` — 10 testes do editor de demarcação
- `admin/test/block_editor_test.dart` — 9 testes do editor de quadra e da numeração
- `admin/test/block_history_test.dart` — 8 testes da folha de histórico de trabalho

## Arquivos modificados

Nenhum.

## Decisões técnicas

- **O desenho é feito pelo controlador, não por toques simulados no mapa.** Os editores constroem o
  `PolygonEditorController` internamente, mas o entregam ao `PolygonEditorLayers`, então o teste o
  alcança com `tester.widget<PolygonEditorLayers>(…).controller`. Simular um toque no `FlutterMap`
  testaria o *hit testing* e a projeção da biblioteca, não a tela — e os gestos já têm cobertura
  própria em `polygon_editor_test.dart`. Foi a saída autorizada pela spec.
- **O `onTap` do mapa, ainda assim, é exercitado.** Contornar o mapa deixava descoberta exatamente a
  linha que liga o toque ao `addPoint`. Em vez de um gesto sintético, o teste lê
  `FlutterMap.options.onTap` e o dispara: prova o fio sem depender da projeção.
- **`SizedBox`/`MediaQuery` não foram necessários.** A spec previa o cuidado, mas o `FlutterMap` dos
  dois editores já vive dentro de um `Expanded` numa `Column` dentro do `Scaffold`, então recebe
  tamanho finito da superfície padrão de teste (800×600). Uma tentativa de forçar
  `physicalSizeTestValue` foi removida por não fazer diferença — mexer no tamanho da janela sem
  necessidade é ruído.
- **As telas são abertas por `push` sobre uma rota-placeholder.** "A tela não fecha depois do erro"
  só é uma afirmação verificável se houver para onde fechar; montada como `home`, um `pop` não teria
  efeito observável.
- **`territoriesProvider` recebe um `listen` explícito nos testes.** No app real quem o mantém vivo é
  a `HomeScreen`; num teste isolado ninguém o observa, e `ref.invalidate` sobre provider sem ouvinte
  não dispara releitura. Sem o `listen`, tanto "invalidou" quanto "não invalidou" passariam.
- **Os fakes contam chamadas em vez de usar `MagicMock`-equivalente.** Cada `create`/`update` guarda
  um objeto com os argumentos recebidos, o que deixa a asserção falar do contrato
  (`number` é `null`, `boundary` são estes três pontos) e não da ordem das chamadas.
- **Datas fixas, relógio nunca lido.** Os `WorkLog` do histórico usam `DateTime` literais, e
  `wasSyncedLate` é uma propriedade do modelo — nenhum teste depende do dia em que roda.
- **Deixado deliberadamente sem teste:** a renderização dos *tiles* do OSM (a rede é bloqueada em
  `flutter_test`, e o `TileLayer` é da biblioteca), e o arraste/remoção de vértice por gesto, que
  pertencem a `polygon_editor_test.dart`.

## Observação (não é defeito, não foi alterado)

O texto `'Toque no mapa para marcar os cantos do território.'` de
`_instruction()` ([territory_editor_screen.dart:191](../../../admin/lib/presentation/territory_editor_screen.dart#L191))
— e o equivalente no editor de quadra — é **inalcançável**: `_Hint` mostra `state.hint ?? …`, e
`state.hint` só é `null` quando o anel já é válido, o que exige 3 pontos. Com menos que isso, o que
aparece é sempre `'Toque no mapa para marcar ao menos 3 pontos.'`, vindo do `EditorState`. O admin
continua recebendo uma instrução correta, então não é defeito de comportamento e mudar a cópia da
interface está fora do escopo de uma task de cobertura. Os testes afirmam o texto que **de fato**
aparece, para que a redundância fique registrada em vez de escondida.

## Como validar

```bash
cd admin
flutter test test/territory_editor_test.dart test/block_editor_test.dart test/block_history_test.dart
```

## Resultado da validação

- `flutter test` → **133 testes passando** (106 antes desta task, 27 novos), suíte inteira verde.
- `flutter analyze` → `No issues found!`
- `dart format --output=none --set-exit-if-changed lib test` → `29 files (0 changed)`, o mesmo
  comando que o job `admin` de `core.yml` roda.
- Cobertura de linha das três telas, medida com `flutter test --coverage`:

| Arquivo | Linhas |
|---------|--------|
| `admin/lib/presentation/territory_editor_screen.dart` | 95/95 = **100%** |
| `admin/lib/presentation/block_editor_screen.dart` | 102/102 = **100%** |
| `admin/lib/presentation/block_history_sheet.dart` | 60/60 = **100%** |

O `lcov` do Dart não emite registros `BRDA`, então **não há cobertura de branch medida** — dizer um
número seria inventá-lo. Os desvios foram cobertos à mão, um teste por lado: `isNew` verdadeiro e
falso nos dois editores, `_numberIsUsable` nos quatro casos (vazio, `0`, `-3`, `12a`), o filtro de
vizinho nos dois resultados, `wasSyncedLate` nos dois, e confirmar/cancelar/falhar nas três remoções.
