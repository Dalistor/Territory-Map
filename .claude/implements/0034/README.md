# [0034] Testes de widget: configuração inicial e roteamento do admin

**Data:** 2026-08-07
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 08

## Solicitação

> O comentário do `admin-release.yml` afirma que "os testes de widget são o que diz que o app se
> comporta", e não existe um único teste de widget no admin. Cubra a porta de entrada, em
> `admin/test/setup_screen_test.dart`, usando `ProviderScope(overrides: ...)` com um fake de
> `Session`/`CredentialsStore`. Depois, em `admin/test/app_routing_test.dart`, cubra o roteamento de
> `main.dart`. (…) Se um teste revelar um defeito real de comportamento, corrija-o e diga o que era.

## Contexto

A `SetupScreen` é a única tela que o admin vê uma vez e nunca mais, e é onde a senha da congregação
é digitada — a credencial que fica guardada no keystore e sustenta o login silencioso. O roteamento
de `main.dart` é o que decide entre ela e o mapa, incluindo os dois caminhos de volta (keystore
ilegível e credencial recusada pelo servidor). Nada disso tinha cobertura: o CI prometia que "os
testes de widget dizem que o app se comporta" e não havia nenhum.

As Tasks 06 e 07 já haviam introduzido os dois primeiros testes de widget do projeto
(`block_delete_test.dart` e `sign_out_test.dart`); esta task segue o estilo deles.

## Critérios de aceite

`setup_screen_test.dart`:

1. Com nome, cidade ou senha em branco, "Entrar" não dispara chamada nenhuma e o campo vazio mostra
   a mensagem de obrigatório.
2. Nome e cidade são enviados sem espaços nas pontas; a senha vai exatamente como digitada,
   inclusive com espaços.
3. Um `ApiException` do servidor aparece no banner de erro com a mensagem dele, e a tela continua
   preenchida para o admin corrigir.
4. Enquanto a chamada está em curso, o botão fica desabilitado e mostra o indicador de progresso.
5. No sucesso, `isConfiguredProvider` é invalidado.

`app_routing_test.dart`:

6. Sem credenciais guardadas, abre a `SetupScreen`.
7. Com credenciais guardadas, abre a `HomeScreen`.
8. Se a leitura do keystore falhar, abre a `SetupScreen` com o aviso de que os dados guardados não
   puderam ser lidos.
9. Se `territoriesProvider` falhar com `CredentialsRejectedException`, a `SetupScreen` volta
   exibindo a mensagem da exceção.

## Ciclos TDD

O comportamento das duas telas já existia — esta task é de cobertura, não de funcionalidade nova.
Para não confundir "teste escrito" com "teste que pega defeito", cada asserção interessante foi
validada por **mutação**: quebrar o código de produção de propósito, ver o teste falhar, e reverter.
As mutações estão registradas abaixo e **nenhuma ficou no código**.

| # | Caso de teste | Arquivo de teste | Como foi provado que a asserção morde |
|---|---------------|------------------|----------------------------------------|
| 1 | an empty form asks for every field and calls no one | `test/setup_screen_test.dart` | Mutação: trocar `if (!validate()) return;` por `validate();` em `setup_screen.dart` → falha em `requests, isEmpty` |
| 2 | a missing congregation name alone stops the submission | `test/setup_screen_test.dart` | idem (mesma guarda) |
| 3 | a missing city alone stops the submission | `test/setup_screen_test.dart` | idem |
| 4 | a missing password alone stops the submission | `test/setup_screen_test.dart` | idem |
| 5 | a name of nothing but spaces is still a missing name | `test/setup_screen_test.dart` | asserção sobre o `trim()` do `_required` |
| 6 | name and city are trimmed, and the password is sent byte for byte | `test/setup_screen_test.dart` | asserção de igualdade exata sobre o corpo que chegou ao `MockClient` |
| 7 | the credentials that are kept are the ones that were sent | `test/setup_screen_test.dart` | asserção sobre o `Credentials` gravado no store |
| 8 | the server's refusal is shown in the server's own words | `test/setup_screen_test.dart` | asserção sobre a mensagem do 401 e sobre o store continuar vazio |
| 9 | a refusal leaves the form filled in, so correcting it needs no retyping | `test/setup_screen_test.dart` | reenvio sem redigitar prova que os três controllers sobreviveram |
| 10 | while the server is thinking, the button waits with it | `test/setup_screen_test.dart` | `Completer` seguro aberto; `FilledButton.onPressed` é `null` e há `CircularProgressIndicator` |
| 11 | a successful setup makes the app consider itself configured | `test/setup_screen_test.dart` | `isConfiguredProvider` renderizado no harness passa de `false` a `true` |
| 12 | pressing enter in the password field submits, like the button | `test/setup_screen_test.dart` | linha antes descoberta (`onFieldSubmitted`) — ver "Decisões técnicas" |
| 13 | enter on an empty form submits nothing either | `test/setup_screen_test.dart` | o caminho do Enter respeita a mesma validação |
| 14 | the reason for being back here is shown above the form | `test/setup_screen_test.dart` | asserção sobre o `reason` renderizado |
| 15 | a fresh install opens on the setup screen | `test/app_routing_test.dart` | asserção de tipo de tela |
| 16 | an install that already has credentials opens on the map | `test/app_routing_test.dart` | asserção de tipo de tela |
| 17 | a keystore that cannot be read sends the admin back to typing | `test/app_routing_test.dart` | Mutação: ramo `error:` de `_Root` → `_Authenticated()` → falha |
| 18 | credentials the server stops accepting bring the setup screen back | `test/app_routing_test.dart` | Mutação: remover a checagem de `CredentialsRejectedException` em `_Authenticated` → falha |
| 19 | an ordinary server failure is not mistaken for a rejection | `test/app_routing_test.dart` | 500 mantém a `HomeScreen`; é o contraponto que impede o teste 18 de passar por acidente |

## O que foi feito

Dois arquivos de teste novos, nenhuma linha de produção alterada.

**`admin/test/setup_screen_test.dart`** monta a `SetupScreen` com a `Session` **real** sobre um
`InMemoryCredentialsStore` e um `MockClient`. O `apiProvider` é sobreposto por um `TerritoryMapApi`
que fala com esse `MockClient`, e um `FakeServer` grava path e corpo de tudo que chegou à rede.

**`admin/test/app_routing_test.dart`** monta o `TerritoryAdminApp` inteiro e cobre os quatro
destinos possíveis, variando só o `CredentialsStore` e o `TerritoryRepository`.

Nenhum defeito de comportamento foi encontrado. As duas telas se comportam exatamente como os
critérios descrevem — inclusive o ponto mais delicado, o da senha não sofrer `trim()`.

## Arquivos criados

- `admin/test/setup_screen_test.dart` — 14 testes da tela de configuração inicial
- `admin/test/app_routing_test.dart` — 5 testes do roteamento de `main.dart`

## Arquivos modificados

Nenhum. Os arquivos de produção foram tocados apenas de forma temporária, para as mutações de
validação descritas acima, e revertidos.

## Decisões técnicas

- **`Session` real em vez de fake.** A instrução autorizava um fake de `Session`, mas o critério 2
  fala do que é *enviado* — e um fake de `Session` só provaria que a tela chama um método com certos
  argumentos. Com a `Session` real sobre um `MockClient`, a asserção é sobre o JSON que chegou ao
  transporte: `{'name': 'Oeste', 'city': 'Cambé', 'password': '  senha com espaços  '}`. É a única
  forma de o teste falhar de verdade se alguém acrescentar um `.trim()` na senha algum dia.
- **`isConfiguredProvider` observado, não espionado.** Em vez de contar invalidações, o harness
  renderiza `configurado: ${...}`. O teste afirma a transição `false → true`, que é o que o usuário
  percebe (a tela sai do caminho), e não um detalhe interno do Riverpod.
- **O estado "em curso" é um `Completer`, não uma contagem de frames.** O `FakeServer` segura a
  resposta até o teste soltar, então "enquanto a chamada está em curso" é um estado real e estável,
  sem depender de `pump` com duração adivinhada.
- **Validação por mutação.** Como o código já existia, um teste escrito depois pode passar sem
  provar nada. Quebrar o código de propósito e ver o teste ficar vermelho é o substituto honesto do
  RED — é o que separa cobertura real de cobertura de fachada. Todas as mutações foram revertidas e
  `git status` confirma que `main.dart` e `setup_screen.dart` estão intactos.
- **Um teste a mais que os critérios pediam: o 19.** Um `ApiErrorException` 500 tem de manter a
  `HomeScreen`. Sem ele, o teste 18 passaria mesmo que `_Authenticated` mandasse *qualquer* erro para
  a `SetupScreen` — o que jogaria o admin de volta à digitação de senha a cada instabilidade do
  servidor.
- **Os testes 12 e 13 saíram da análise de cobertura**, não da lista de critérios: `onFieldSubmitted`
  era a única linha descoberta da tela. Um admin que digita e aperta Enter é o caso mais provável de
  todos, e essa linha não tinha nenhuma prova de que ainda funcionava.
- **`main.dart` fica em 16/17 linhas de propósito.** A única descoberta é
  `void main() => runApp(...)`, que não tem como ser exercitada por `flutter_test` e não contém
  decisão nenhuma.
- **A senha não aparece em nenhum log.** O `FakeServer` guarda os corpos em memória para asserção e
  nenhum teste os imprime — a mesma regra que `sign_out_test.dart` já segue.

## Como validar

```bash
cd admin
flutter test test/setup_screen_test.dart test/app_routing_test.dart
```

Suíte inteira e portões do CI:

```bash
cd admin
dart format lib test
flutter analyze
flutter test --coverage
```

## Resultado da validação

- `flutter test` → **75 testes passando** (eram 56 antes desta task; +19)
- `flutter analyze` → `No issues found!`
- `dart format lib test` → `24 files (0 changed)`
- Cobertura de linha dos arquivos sob teste:
  - `admin/lib/presentation/setup_screen.dart` → **75/75 (100%)**
  - `admin/lib/main.dart` → **16/17 (94%)**, faltando apenas `runApp`
- Mutação: as três mutações aplicadas derrubaram exatamente os testes previstos, e nenhuma
  permaneceu no código (`git status` não lista `main.dart` nem `setup_screen.dart`).
