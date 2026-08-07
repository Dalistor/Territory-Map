# [0027] Admin desktop, segunda fatia: editor de polígono, quadras, publicadores e histórico

**Data:** 2026-08-03
**Status:** Concluído
**Modo:** direto — **registro retroativo**
**Spec:** `.claude/specs/0002/` — Task 01 (a documentação; o código é anterior)

> **Este README foi escrito depois do fato.** O código entrou em `12c95fe` e `9165f19`, sem passar
> por uma skill que documentasse na hora. Nada aqui foi reimplementado: o texto descreve o que já
> está no repositório, e os "critérios de aceite" são os comportamentos que os 16 testes de
> `admin/test/polygon_editor_test.dart` de fato travam. As quatro telas desta fatia **não têm teste
> de widget** — está dito abaixo, e é o que a spec 0002 resolve.

## Commits cobertos

| Commit | Assunto |
|--------|---------|
| `12c95fe` | `feat(admin): polygon editor, blocks, publishers and work history` |
| `9165f19` | `ci: check the admin on every push, not only at release` |

## Solicitação

Completar o admin: desenhar a demarcação de um território, desenhar e numerar as quadras dentro
dele, cadastrar publicadores com seus códigos de acesso, e ler ou corrigir o histórico de trabalho
de uma quadra.

## Contexto

A implementação 0026 provou a cadeia — login silencioso, leitura da API, mapa desenhado — mas o
admin ainda era **somente leitura**. Tudo que o `CLAUDE.md` descreve como o trabalho do responsável
pelos territórios (desenhar, numerar, cadastrar, corrigir) estava ausente.

O ponto duro era o desenho. O `CLAUDE.md` já tinha escolhido `flutter_map_line_editor` sobre
`flutter_map_dragmarker`, e já tinha registrado o risco: pacotes pequenos, sem release recente, MIT
e vendorizáveis se pararem. A contrapartida assumida foi confinar tudo que os importa em **um único
arquivo**.

O "Ponto em Aberto" do `CLAUDE.md` — *"o `flutter_map_line_editor` não traz pilha de undo. Definir se
o admin precisa de undo/redo real ou se apagar vértice por long-press basta"* — foi resolvido aqui
pelo undo real, e a resolução custou mais do que parecia (ver decisões).

## Critérios de aceite

_Comportamentos que os 16 testes de `admin/test/polygon_editor_test.dart` travam._

1. O editor nasce vazio e não salvável
2. Abre sobre uma demarcação existente, pronta para ser reformada
3. Torna-se salvável no terceiro ponto
4. Uma forma inacabada **pede pontos** em vez de reportar erro — "faltam pontos" não é uma falha
   enquanto se desenha, e gritar isso a cada toque seria ruído
5. Um contorno que se cruza diz **como consertar**, não só que está errado
6. Uma forma válida não tem nada a dizer
7. `undo` remove o último ponto
8. `undo` caminha de volta até o vazio
9. `undo` num editor intocado não faz nada
10. `clear` limpa o anel mas continua desfazível
11. Limpar um editor já vazio **não** empilha um passo de undo
12. Toda mutação notifica — é o que repinta o mapa
13. Os pontos voltam na ordem em que foram desenhados
14. **Arrastar um vértice é desfazível, e o undo não come o ponto junto**
15. **Remover um vértice por long-press também é desfazível**
16. A lista exposta não pode ser mutada de fora

_Sem cobertura automatizada (verificado à mão no Chrome):_ `TerritoryEditorScreen`,
`BlockEditorScreen`, `PublishersScreen` e o histórico de trabalho.

## O que foi feito

**`presentation/map/polygon_editor.dart`** — o único arquivo que conhece
`flutter_map_line_editor` e `flutter_map_dragmarker`. Sobre o que eles dão (tocar para adicionar,
arrastar vértice, arrastar ponto intermediário para inserir, long-press para remover), acrescenta
**undo** e **validade ao vivo**: `PolygonEditorController` (com `EditorState`, `hint` e pilha de
snapshots limitada a 50) e `PolygonEditorLayers`, que desenha o contorno em vermelho enquanto a
forma não pode ser salva.

**`presentation/territory_editor_screen.dart`** — desenhar ou reformar uma demarcação, com os
territórios vizinhos desenhados por baixo, em cinza, para o admin ver o que evitar.

**`presentation/block_editor_screen.dart`** — desenhar uma quadra com a demarcação do território
desenhada por baixo, e numerá-la; campo de número em branco deixa o servidor escolher o menor livre.

**`presentation/publishers_screen.dart`** — cadastrar publicadores, exibir o código gerado em
destaque, gerar código novo, desativar e reativar. O código aparece enquanto está vivo e some depois
de resgatado ou vencido.

**`presentation/block_history_sheet.dart`** — os registros de trabalho de uma quadra, com quem e
quando, e a remoção de um registro errado.

**`presentation/home_screen.dart`** — passou a ser a porta de entrada de tudo isso: FAB de novo
território, menu por território (adicionar quadra, editar demarcação, apagar), bottom sheet ao tocar
no número de uma quadra (ver histórico, editar contorno ou número) e o atalho para os publicadores.

**`.github/workflows/core.yml`** — o job `admin`, para que `admin/` deixe de ser checado só na tag.

## Arquivos criados

- `admin/lib/presentation/map/polygon_editor.dart`
- `admin/lib/presentation/territory_editor_screen.dart`
- `admin/lib/presentation/block_editor_screen.dart`
- `admin/lib/presentation/publishers_screen.dart`
- `admin/lib/presentation/block_history_sheet.dart`
- `admin/test/polygon_editor_test.dart` — 16 testes

## Arquivos modificados

- `admin/lib/presentation/home_screen.dart` — de tela de leitura a porta de entrada das ações
- `admin/pubspec.yaml`, `admin/pubspec.lock` — `flutter_map_line_editor` e `flutter_map_dragmarker`
- `.github/workflows/core.yml` — job `admin` (formato, análise e teste em todo push e PR)

## Decisões técnicas

**O undo precisou envolver a biblioteca — e não dá para mexer nisso sem rodar o teste.** O
`PolyEditor` não expõe gancho para o **início de um arraste** nem para uma **remoção**: a lista é
mutada no lugar e o único aviso é o `callbackRefresh`, que chega tarde demais para tirar um
snapshot. A saída foi reconstruir cada `DragMarker` que ele produz, encadeando `_snapshot()` antes
do callback original em `onDragStart` e `onLongPress`. Sem isso, desfazer depois de arrastar pulava
para antes do último ponto **adicionado**, perdendo o arraste e um vértice junto. O defeito foi
encontrado arrastando um vértice no navegador e apertando desfazer — não por leitura de código —,
e os critérios 14 e 15 existem para travá-lo. Isto está registrado no `CLAUDE.md`.

**A pilha de undo é limitada a 50 entradas.** Cada entrada é um anel inteiro, e uma sessão de edição
dura minutos. O limite é barato e evita crescimento indefinido.

**Limpar um editor vazio não empilha snapshot.** Caso contrário, "Apagar tudo" duas vezes seguidas
exigiria dois undos para voltar ao mesmo lugar.

**"Faltam pontos" não é erro enquanto se desenha.** `EditorState.hint` trata
`tooFewPoints` como convite ("toque no mapa para marcar ao menos 3 pontos") e só
`selfIntersecting` e `offGlobe` como problema. A interface precisa ser tolerante: quem usa não tem
perfil técnico.

**O contorno fica vermelho enquanto não pode ser salvo.** A recusa aparece **no mapa**, onde o
desenho está acontecendo, e não só numa mensagem em outro canto da tela.

**Pré-validação local, autoridade no servidor — e a mensagem dele mostrada como veio.** O
`validateRing` de `packages/core` recusa um anel impossível antes de sair da máquina, mas
sobreposição, contenção (`ST_Within`) e numeração continuam sendo do PostGIS: só ele sabe onde estão
as outras formas. Por isso a recusa do servidor é exibida **como escrita**, inclusive a que nomeia
as quadras que uma demarcação encolhida deixaria de fora — é a mensagem mais útil do sistema, e
reescrevê-la aqui só a deixaria mais vaga.

**O editor não fecha quando o servidor recusa.** O banner vermelho aparece e o desenho continua na
tela, porque o que o admin precisa fazer em seguida é **corrigir o desenho**.

**O território vizinho e a demarcação do pai são desenhados por baixo.** "A quadra tem que estar
inteiramente dentro" e "territórios não se sobrepõem" são as duas regras mais fáceis de quebrar sem
querer; mostrar o contexto é mais barato do que explicar a recusa depois.

**Número em branco significa "escolha por mim".** O corpo omite o campo e o servidor devolve o menor
inteiro livre do território. A numeração das quadras frequentemente já existe em papel, então o
campo continua editável.

**O código de acesso é tratado como credencial na tela.** Aparece em destaque enquanto vale, com o
aviso de que dura 24 horas, serve uma vez só e não poderá ser consultado depois; some quando
resgatado ou vencido. Nunca vai para log nem para URL. "Gerar novo código" é a resposta para
aparelho trocado, reinstalação ou código perdido — e invalida o anterior na hora.

**Remover um registro de trabalho invalida o mapa também.** O servidor recalcula `last_worked_at` a
partir do log restante, então a cor da quadra muda junto; invalidar só a lista deixaria a tela
mentindo.

**O job `admin` no CI de todo push, não só na tag.** `admin/` estava fora de todos os filtros de
`paths`, então o commit que o criou não disparou run nenhum: `analyze` e `test` só aconteciam numa
tag `v*`, que é quando um erro custa mais caro. Sem passo de build aqui — produzir binário continua
sendo assunto do job de release, e `flutter test` roda na Dart VM, sem toolchain de desktop.

## Como validar

```
cd admin && flutter pub get && flutter test
flutter analyze
flutter run -d chrome      # verificação visual; a API não responde ao navegador
```

## Resultado da validação

- `flutter test` → **27 passed** (11 de `session_test.dart` + 16 de `polygon_editor_test.dart`)
- `flutter analyze` limpo
- Verificação visual no Chrome — foi ela que revelou o defeito do undo após arraste
- Job `admin` do `.github/workflows/core.yml` verde

## O que ficou sem cobertura

**As quatro telas desta fatia não têm teste de widget.** O `polygon_editor_test.dart` cobre o
controlador do editor, que é a peça com lógica própria; tudo que está acima dele foi verificado
**só a olho, no Chrome**. Não há rede de segurança para:

- `TerritoryEditorScreen` — "Salvar" desabilitado sem nome ou com menos de 3 pontos; `create` na
  tela nova e `update` na de edição; o banner de sobreposição sem fechar a tela
- `BlockEditorScreen` — número em branco virando `number: null`; número inválido bloqueando o
  salvamento; `create` versus `update`
- `PublishersScreen` — os quatro estados do subtítulo (revogada, código válido aguardando resgate,
  pendente sem código, ativa num aparelho); "Ver código" só enquanto o código vive; `setActive`
  recebendo o **inverso** do estado atual
- `block_history_sheet.dart` — o "sincronizado em..." de um registro que veio da fila offline; a
  remoção invalidando **os dois** providers

**Ainda não dá para apagar uma quadra pela interface.** `deleteBlock` existe em `packages/core` e
não tem nenhum chamador: desenhou errado, fica lá. Dá para apagar território e registro de trabalho,
mas não quadra.

**Também não dá para sair da congregação.** `Session.signOut()` existe e só é chamado pelo teste; o
único caminho de volta à `SetupScreen` é o servidor recusar a credencial guardada.

A **spec 0002** cobre os três buracos: Tasks 10 e 11 (testes de widget), Task 06 (apagar quadra) e
Task 07 (sair da congregação).
