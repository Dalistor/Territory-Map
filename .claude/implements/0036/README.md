# [0036] Testes de widget: publicadores e código de acesso

**Data:** 2026-08-07
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 10

## Solicitação

> Spec 0002 — Task 10: Cubra `admin/lib/presentation/publishers_screen.dart` em
> `admin/test/publishers_screen_test.dart`, com um fake de `PublisherRepository` sobreposto por
> `ProviderScope(overrides: ...)`. `PublishersScreen` recebe um `now` injetável — use-o para decidir
> se o código ainda está vivo, em vez do relógio real. (…) O código de acesso é credencial: pode ser
> afirmado na tela, mas nenhum teste deve imprimi-lo em log.

## Contexto

`PublishersScreen` é a única tela do admin que **cria uma credencial**: o servidor cunha o
`access_code`, ela o mostra uma vez, e o admin lê o código em voz alta para a pessoa. Errar aqui não
dá erro visível — dá um código entregue a quem não devia, um código que não aparece quando deveria,
ou um "Desativar" que reativa. Era a última tela do admin sem nenhum teste.

Três regras da tela dependem de **tempo**: `hasLiveCode(now)` decide o subtítulo, decide se o item
"Ver código" existe no menu, e decide se o admin ainda tem o que entregar. Sem o `now` injetado, um
teste que monta um código "válido por 20 horas" viraria um teste que falha 20 horas depois. É por
isso que o `now` da `PublishersScreen` existe, e é o que estes testes usam.

## Critérios de aceite

1. Lista vazia mostra "Nenhum publicador cadastrado"; falha do repositório mostra a mensagem do
   servidor.
2. Cadastrar exige nome não vazio — "Gerar código" fica desabilitado sem ele.
3. Cadastrado com sucesso, o código aparece em destaque num diálogo, com o aviso de que vale 24
   horas, serve uma única vez e não poderá ser consultado depois.
4. O subtítulo reflete o estado: revogada ("o histórico de trabalho continua guardado"), com código
   válido aguardando resgate, pendente sem código válido, ou ativa num aparelho.
5. "Ver código" só aparece enquanto `hasLiveCode(now)` é verdadeiro, e some depois de expirado ou
   resgatado.
6. "Gerar novo código" chama `regenerateCode` e exibe o código novo.
7. "Desativar"/"Reativar" chama `setActive` com o **inverso** do estado atual.
8. Um `ApiException` em qualquer uma dessas ações vira `SnackBar` com a mensagem do servidor.

## Ciclos TDD

O código de produção **já existia** (entregue pelas implementações 0027 e 0031): esta task é de
cobertura, então os testes nasceram verdes em vez de vermelhos. Como um teste que passa de primeira
não prova nada, o RED foi obtido por **teste de mutação**: cada comportamento sob teste foi quebrado
no arquivo de produção, a suíte foi executada, e o arquivo restaurado. As seis mutações foram mortas.

| # | Caso de teste | Mutação que o teste matou |
|---|---------------|---------------------------|
| 1 | uma congregação sem ninguém cadastrado diz exatamente isso | — (estado vazio) |
| 2 | uma listagem recusada é relatada nas palavras do servidor | — (mensagem do servidor) |
| 3 | uma falha que não é o servidor falando ganha mensagem simples | — (ramo não-`ApiException`) |
| 4 | enquanto a lista vem, cadastrar continua oferecido | — (estado de carga) |
| 5 | cadastrar é recusado até um nome ser digitado | botão "Gerar código" sempre habilitado |
| 6 | um código recém-cunhado é mostrado grande, com o que ele vale | aviso de 24h/uso único removido; `invalidate` removido |
| 7 | o código pode ser copiado em vez de lido em voz alta | — (`Clipboard.setData`) |
| 8 | o nome pode ser submetido pelo teclado | — (`onSubmitted`) |
| 9 | desistir do formulário não cunha nada | — (Cancelar) |
| 10 | cada subtítulo nomeia o estado em que a pessoa está | ramos `hasLiveCode` e `isPending` trocados |
| 11 | "Ver código" só é oferecido enquanto há código vivo | guarda `hasLiveCode(now)` do item de menu removida |
| 12 | regenerar cunha um código novo e o mostra | — (`regenerateCode` + `invalidate`) |
| 13 | o toggle envia o oposto do estado que encontrou | `setActive(id, isActive)` em vez de `!isActive` |
| 14 | uma inscrição recusada é mostrada e nenhum código é inventado | — (`SnackBar` no `create`) |
| 15 | uma regeneração recusada é mostrada e o estado antigo permanece | — (`SnackBar` no `regenerateCode`) |
| 16 | um toggle recusado é mostrado e o acesso não muda | — (`SnackBar` no `setActive`) |

## O que foi feito

Um único arquivo de teste novo, com 16 testes de widget. Nenhuma linha de produção mudou: **nenhum
defeito real apareceu**. As quatro pessoas de fixture são montadas em torno do `now` fixo
(`DateTime(2026, 8, 7, 12)`), uma por estado que o subtítulo tem de distinguir:

| Fixture | `isActive` | `accessCode` | `accessCodeExpiresAt` | `activatedAt` | Subtítulo esperado |
|---------|-----------|--------------|----------------------|---------------|--------------------|
| Ana | `false` | — | — | — | acesso revogado, histórico guardado |
| Bruno | `true` | sim | `now + 20h` | — | código válido, aguardando uso |
| Carla | `true` | sim | `now - 1h` | — | sem código válido |
| Daniel | `true` | — | — | `now - 5d` | ativo neste aparelho |

Carla é o caso que só o `now` injetado torna possível testar: ela **tem** um `accessCode` na linha,
mas ele já venceu, então a tela precisa tratá-la como se não tivesse nenhum — inclusive escondendo
"Ver código".

## Arquivos criados

- `admin/test/publishers_screen_test.dart` — os 16 testes de widget da tela de publicadores.

## Arquivos modificados

Nenhum. `admin/lib/presentation/publishers_screen.dart` foi lido, mutado temporariamente para
validar os testes e restaurado byte a byte.

## Decisões técnicas

- **Fake de `PublisherRepository`, não mock de HTTP.** É exatamente o que a camada de repositórios
  da Task 04 existe para permitir. O fake grava os argumentos de cada escrita
  (`created`, `regenerated`, `activeCalls`) em vez de só contar chamadas — o critério 7 é sobre o
  **valor** enviado, e um contador não distinguiria `setActive(id, false)` de `setActive(id, true)`.
- **Teste de mutação no lugar do RED.** Cobrir código pronto não produz vermelho natural. Quebrar o
  comportamento e ver a suíte reclamar é a única evidência honesta de que a asserção morde; sem isso,
  16 testes verdes poderiam ser 16 testes vazios. As mutações foram aplicadas por script e o arquivo
  conferido com `diff` no fim.
- **O código de acesso nunca é impresso.** Ele é afirmado com
  `find.byWidgetPredicate((w) => w is SelectableText && w.data == code)` e comparado dentro do
  processo de teste. Não há `print`, `debugPrint` nem `log` no arquivo — verificado por `grep`.
  Os códigos das fixtures são inventados e não correspondem a nada emitido por um servidor real.
- **`SelectableText` em vez de `find.text` para o código.** O predicado prova que o código está no
  widget de destaque do diálogo, e não apenas em algum lugar da tela — a asserção também checa
  `fontSize >= 24` e `FontWeight.bold`, porque "aparece em destaque" é o requisito, e um código
  ilegível a três metros de distância não cumpre a função de ser lido em voz alta.
- **O `Clipboard` foi coberto com um mock do canal de plataforma**, afirmando que o que vai para a
  área de transferência é **só** o código — o admin cola isso numa mensagem, e qualquer texto extra
  viajaria junto com a credencial.
- **Deixado deliberadamente sem teste:** os fallbacks `publisher.accessCode ?? '—'` e `?? ''` em
  `_showCode`. São inalcançáveis pelos dois caminhos que chamam a função — "Ver código" é guardado
  por `hasLiveCode`, que exige `accessCode != null`, e `create`/`regenerateCode` sempre voltam do
  servidor com um código cunhado. Também sem teste o ramo `now ?? DateTime.now()`, que é o default de
  produção e não um comportamento.

## Observação para o backlog (fora do escopo desta task)

O menu de uma pessoa **revogada** ainda oferece "Gerar novo código". O servidor aceita o pedido
(`UserService.regenerate_code` não olha `is_active`), mas o resgate depois falha com
`InactiveUserError` (`app/services/user.py:130`) — o admin cunha um código, lê para a pessoa, e ela
toma erro. O caminho certo é "Reativar" antes. Não é um defeito de correção e mexer nisso mudaria
comportamento fora dos critérios de aceite da Task 10, então ficou registrado em vez de corrigido.

## Como validar

```bash
cd admin && flutter test test/publishers_screen_test.dart
```

## Resultado da validação

- `flutter test test/publishers_screen_test.dart` → **16 testes passando**.
- `flutter test` (suíte inteira do admin) → **106 testes passando**.
- `flutter test --coverage` → `admin/lib/presentation/publishers_screen.dart` com
  **101/101 linhas cobertas (100%)**. Os ramos de decisão foram verificados à mão: os quatro estados
  de `_status()`, os dois lados de `hasLiveCode` no menu, os dois lados de `isActive` no toggle e no
  ícone, e os três estados de `AsyncValue` (`loading`, `error`, `data`) têm teste cada.
- Teste de mutação: **6 mutações aplicadas, 6 mortas**, arquivo de produção restaurado e conferido
  com `diff`.
- `dart format lib test` → 26 arquivos, 0 alterados.
- `flutter analyze` → `No issues found!`.
