# [0035] Testes de widget: a `HomeScreen` e as cores do mapa

**Data:** 2026-08-07
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 09

## Solicitação

> Spec 0002 — Task 09: Cubra a tela principal do admin em `admin/test/home_screen_test.dart`, com um
> fake de `TerritoryRepository` sobreposto por `ProviderScope(overrides: ...)`. `HomeScreen` e
> `TerritoryMap` já recebem um `now` injetável exatamente para isto — use-o em vez de depender do
> relógio real. (…) Toque apenas em `admin/test/` e, se o critério 7 exigir a extração, em
> `admin/lib/presentation/map/territory_map.dart`; não altere a camada `data/`.

## Contexto

A `HomeScreen` é a tela que o admin abre todo dia: é dela que saem a lista de territórios, o mapa, o
caminho para os dois editores e a remoção de território. Até aqui ela tinha cobertura só de tabela —
`block_delete_test.dart` exercitava `showBlockActions` a partir de um harness, e
`sign_out_test.dart` a montava com a lista vazia justamente para não encostar no mapa. O corpo da
tela (carga, erro, lista lateral, menu, remoção) e a regra de cor do `TerritoryMap` não tinham
nenhum teste.

A regra de cor é a informação mais útil do sistema no dia a dia — é o que diz para onde ir hoje — e
dependia do relógio real para ser observada. Os dois widgets já recebiam `now` injetável desde a
0026, mas ninguém tinha usado.

## Critérios de aceite

1. Enquanto carrega, mostra o indicador de progresso e nenhum FAB.
2. Com a lista vazia, mostra o texto convidando a desenhar o primeiro território e não monta o mapa.
3. Com territórios, a lista lateral traz o nome, a contagem de quadras e, quando houver, quantas
   nunca foram trabalhadas.
4. Quando o repositório falha com `ApiException`, aparece a mensagem do servidor e o botão "Tentar
   de novo", que reinvalida `territoriesProvider`.
5. O menu de um território oferece adicionar quadra, editar demarcação e apagar.
6. Apagar pede confirmação citando quantas quadras e o histórico serão apagados junto, chama
   `TerritoryRepository.delete` só depois de confirmado, e um erro vira `SnackBar`.
7. A cor da quadra segue `last_worked_at`: nunca trabalhada usa a cor de erro do tema, mais de 120
   dias (`overdueAfter`) usa laranja, e recente usa verde.

## Ciclos TDD

Todos os testes são de caracterização de comportamento que já existia — a Task 09 é de cobertura,
não de funcionalidade nova. Nenhum passou "de primeira por acidente": cada um foi rodado logo depois
de escrito, e o único que falhou (o toque na quadra) apontou um defeito da própria fixture, não da
tela. Nenhum defeito de produção apareceu, então nenhum arquivo de `lib/` foi tocado.

| # | Caso de teste | Arquivo de teste | O que ficou coberto |
|---|---------------|------------------|---------------------|
| 1 | while the territories are on their way, there is nothing to add them to | `admin/test/home_screen_test.dart` | `territories.when(loading:)` e o FAB condicionado a `hasValue` |
| 2 | an empty congregation is invited to draw its first territory, and gets no map to look at | idem | `_Empty` e o desvio que não monta o `TerritoryMap` |
| 3 | the side list names each territory, counts its blocks and calls out the ones never worked | idem | `_TerritoryList`, incluindo o sufixo "· N nunca trabalhadas" presente e ausente |
| 4 | a refused listing is reported in the server's own words, and retrying asks again | idem | `_Failure` e o `ref.invalidate(territoriesProvider)` do "Tentar de novo" |
| 5 | a territory offers to gain a block, to be redrawn and to go | idem | os três itens do `PopupMenuButton` do território |
| 6 | deleting a territory says how many blocks and what history go with it, before anything goes | idem | o diálogo de `_deleteTerritory` e o fato de ele não destruir nada sozinho |
| 7 | confirming deletes that territory and refreshes the list | idem | `TerritoryRepository.delete` com o id certo, uma vez, e a reinvalidação |
| 8 | cancelling leaves the territory alone | idem | o `if (confirmed != true) return` |
| 9 | a refusal to delete is shown and the territory stays | idem | o `catch (ApiException)` → `SnackBar` |
| 10 | each menu entry lands on the screen it names | idem | `_editTerritory` e `_openBlockEditor` a partir do menu, com os argumentos certos |
| 11 | the button for a new territory opens an empty editor | idem | o FAB, com `territory: null` e os vizinhos junto |
| 12 | the reload button asks the server again | idem | o `IconButton` de recarregar |
| 13 | tapping a block number on the map opens its actions | idem | o `onBlockTap` do `TerritoryMap` chegando a `showBlockActions` |
| 14 | a block is drawn by how long it has gone unworked | idem | `TerritoryMap._blockColor` nos três casos, lidos da `PolygonLayer` |
| 15 | the overdue line is crossed, not touched | idem | a borda exata de `overdueAfter`: 120 dias cravados ainda é verde |

## O que foi feito

Um arquivo de teste novo, `admin/test/home_screen_test.dart`, com 15 testes de widget sobre um
`FakeTerritoryRepository` sobreposto por `ProviderScope(overrides: ...)`. O fake tem três modos —
responder, pendurar (`Completer` que nunca completa, que é o estado de carga imobilizado) e falhar —
e conta as listagens, que é como a invalidação de `territoriesProvider` fica observável.

Nenhum arquivo de produção foi alterado.

## Arquivos criados

- `admin/test/home_screen_test.dart` — os 15 testes de widget da tela principal e da regra de cor.

## Arquivos modificados

Nenhum.

## Decisões técnicas

**O `FlutterMap` se mostrou estável no ambiente de teste, então a extração autorizada não foi
feita.** A spec permitia promover a regra de cor a uma função pública de nível superior em
`territory_map.dart` se o mapa atrapalhasse. Ele não atrapalhou: com o `MaterialApp` no tamanho
padrão do `flutter_test` (800×600) o `Expanded` da `Row` já dá dimensão finita ao mapa, o
`TileLayer` falha em silêncio sem rede, e `pumpAndSettle` retorna. A cor é lida direto da
`PolygonLayer` renderizada, que é a asserção mais forte disponível — prova o que o admin enxerga, e
não o que uma função isolada devolveria. Preservar `_blockColor` privado também mantém
`territory_map.dart` intocado, que era a preferência da task.

**Três quadras precisaram de anéis distintos.** A primeira versão da fixture dava o mesmo polígono
às três, e o teste do toque falhou: os marcadores caem no centroide, três centroides idênticos
empilham os números e o `tap` bate sempre no de cima. A correção é da fixture, não da tela — cada
quadra ganhou um triângulo próprio, espaçado o bastante (≈0,006° de latitude, ~140 px no zoom 15)
para os marcadores de 34 px não se cobrirem. Vale registrar porque é a armadilha que qualquer teste
futuro sobre marcadores do mapa vai encontrar de novo.

**O relógio é sempre injetado.** `now` é um `DateTime` fixo no topo do arquivo e as datas das
quadras são derivadas dele por subtração. Um teste que usasse `DateTime.now()` passaria hoje e
quebraria 121 dias depois, que é exatamente o tipo de falha que ninguém consegue reproduzir.

**A borda de `overdueAfter` ganhou teste próprio.** `_blockColor` usa `since > overdueAfter`, então
120 dias cravados é verde e 120 dias e um segundo é laranja. Testar só 200 dias e 10 dias deixaria
essa escolha livre para ser invertida sem nada quebrar.

**A confirmação é lida só de dentro do `AlertDialog`.** `_dialogText` restringe a busca aos `Text`
descendentes do diálogo, para que um `expect(body, contains('3 quadras'))` não seja satisfeito pela
lista lateral atrás dele, que diz a mesma coisa.

**O que ficou deliberadamente sem cobertura** em `home_screen.dart` (7 linhas, 95,5% de linha):

- O ramo do título que mostra `nome — cidade` da congregação. Exige um `Session` com
  `congregation` não nulo, o que só acontece depois de um login de verdade; o custo é uma subclasse
  de `Session` inteira para um texto de `AppBar` sem lógica.
- A navegação do botão "Publicadores" — é a tela da Task 10.
- Os ramos `'history'` e `'edit'` de `showBlockActions` — são o `BlockHistorySheet` e o
  `BlockEditorScreen`, ambos da Task 11. O ramo `'delete'` já vinha coberto por
  `block_delete_test.dart`.

## Como validar

```bash
cd admin
flutter test test/home_screen_test.dart
```

Ou tudo, como o CI faz:

```bash
cd admin
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
```

## Resultado da validação

- `flutter test test/home_screen_test.dart` — **15 testes passando**.
- `flutter test` (suíte completa do admin) — **90 testes passando** (eram 75 antes desta task).
- `flutter analyze` — `No issues found!`.
- `dart format lib test` — sem alterações pendentes.
- `flutter test --coverage`, nos arquivos sob teste:
  - `lib/presentation/map/territory_map.dart` — **61/61 linhas, 100%**.
  - `lib/presentation/home_screen.dart` — **149/156 linhas, 95,5%**; as 7 restantes estão
    justificadas acima.
