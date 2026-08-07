# [0026] Admin desktop, primeira fatia: login silencioso e o mapa

**Data:** 2026-08-03
**Status:** Concluído
**Modo:** direto — **registro retroativo**
**Spec:** `.claude/specs/0002/` — Task 01 (a documentação; o código é anterior)

> **Este README foi escrito depois do fato.** O código entrou em `38eccd6`, sem passar por uma skill
> que documentasse na hora. Nada aqui foi reimplementado: o texto descreve o que já está no
> repositório, e os "critérios de aceite" são os comportamentos que os 11 testes de
> `admin/test/session_test.dart` de fato travam — a camada de tela **não** tem teste, e isso está
> dito abaixo em vez de disfarçado.

## Commits cobertos

| Commit | Assunto |
|--------|---------|
| `38eccd6` | `feat(admin): first slice — silent sign-in and the territory map` |

## Solicitação

Primeira fatia do aplicativo desktop do responsável pelos territórios, sobre o `territory_core` da
implementação 0025: **sem tela de login no dia a dia**. Na primeira abertura o app pede nome, cidade
e senha uma única vez, guarda os três no keystore do sistema operacional e se autentica sozinho dali
em diante. Ao final da fatia, os territórios e as quadras da congregação aparecem desenhados sobre
um mapa real.

## Contexto

O `CLAUDE.md` define o admin como instalação de uma congregação só, operada por uma pessoa sem
perfil técnico. Uma tela de login a cada abertura seria atrito puro — não há multiusuário, não há
troca de conta. Mas o JWT do admin dura 12 horas, então **alguém precisa renovar sem perguntar**, e
é isso que obriga o app a guardar a **senha**, não só o token.

Essa é a decisão desconfortável desta fatia e ela está no `CLAUDE.md` como preço declarado: guardar
credencial em disco em troca de nunca mais mostrar a tela de login. O mitigante é o keystore do SO
(DPAPI no Windows, libsecret no Linux), nunca `SharedPreferences`.

A fatia também serve de prova de cadeia: se o mapa carrega, então o `territory_core`, o
`X-App-Key`, o login silencioso e a leitura da API funcionam de ponta a ponta.

## Critérios de aceite

_Comportamentos que os 11 testes de `admin/test/session_test.dart` travam._

1. A primeira chamada de negócio **dispara o login sozinha**, antes da requisição — nenhuma tela
   pede nada
2. O login acontece **uma vez**, não a cada chamada
3. Um 401 no meio de uma operação renova o token e **repete a chamada**; o chamador recebe o
   resultado sem ver o 401
4. A repetição acontece **exatamente uma vez** — o segundo 401 desiste
5. Credencial que o servidor parou de aceitar sobe como `CredentialsRejectedException`, e **não**
   como um 401 cru: é a única falha à qual a UI precisa reagir voltando ao setup
6. Uma falha que **não** é sobre o token (404, 422, rede) sobe direto, sem nova tentativa de login
7. Rodar antes de o app ter sido configurado é recusado com mensagem própria
8. `configure` **só grava** as credenciais depois que o servidor as aceitou
9. Aceitas, ficam gravadas e o token passa a valer
10. `signOut` esquece as credenciais
11. `Credentials.toString()` **nunca** contém a senha

_Sem cobertura automatizada (verificado à mão no Chrome):_ a `SetupScreen`, a `HomeScreen`, o
roteamento do `main.dart` e as cores das quadras no `TerritoryMap`.

## O que foi feito

O projeto Flutter desktop `admin/`, com alvos Windows e Linux (e o alvo web mantido apenas como
ferramenta de desenvolvimento), dependendo de `packages/core` por `path:`.

**`data/` — onde vive tudo que sabe de token e credencial:**

- `credentials_store.dart` — `Credentials` imutável, a interface `CredentialsStore`, a implementação
  `SecureCredentialsStore` sobre `flutter_secure_storage` e uma `InMemoryCredentialsStore` para
  teste.
- `session.dart` — `Session.configure()`, `Session.run()` (a dança inteira do token) e
  `CredentialsRejectedException`.
- `providers.dart` — a raiz de composição: `apiProvider`, `credentialsStoreProvider`,
  `sessionProvider`, `isConfiguredProvider` e `territoriesProvider`.

**`presentation/`:**

- `setup_screen.dart` — os três campos, uma vez na vida (ou de novo, com o motivo, quando o servidor
  recusa o que estava guardado).
- `home_screen.dart` — lista lateral de territórios com contagem de quadras e de quadras nunca
  trabalhadas, mais o mapa; estados de carga, vazio e erro com "Tentar de novo".
- `map/territory_map.dart` — `FlutterMap` sobre tiles do OSM, territórios como contorno e quadras
  preenchidas e numeradas, coloridas por há quanto tempo foram trabalhadas.

**`config.dart`** — `apiBaseUrl` e `appKey` como `String.fromEnvironment`, assados no binário.

**`main.dart`** — decide entre `SetupScreen` e `HomeScreen`, e nada mais.

## Arquivos criados

- `admin/pubspec.yaml`, `admin/pubspec.lock`, `admin/analysis_options.yaml`, `admin/.metadata`,
  `admin/.gitignore`, `admin/README.md` (boilerplate do `flutter create` — a Task 03 da spec 0002
  reescreve)
- `admin/lib/config.dart`
- `admin/lib/main.dart`
- `admin/lib/data/credentials_store.dart`
- `admin/lib/data/session.dart`
- `admin/lib/data/providers.dart`
- `admin/lib/presentation/setup_screen.dart`
- `admin/lib/presentation/home_screen.dart`
- `admin/lib/presentation/map/territory_map.dart`
- `admin/test/session_test.dart` — 11 testes
- `admin/linux/**`, `admin/windows/**`, `admin/web/**` — runners gerados pelo `flutter create`

## Decisões técnicas

**A reautenticação vive em `data/`, não na tela.** `Session.run()` é o único ponto que sabe que
existe token. Nenhum caso de uso e nenhum widget lida com expiração: ela é detalhe de
infraestrutura, e uma feature que precisasse tratá-la já estaria errada.

**O retry é único, e por um motivo.** Repetir uma segunda vez giraria contra uma senha que mudou de
verdade no servidor. A resposta honesta nesse caso é mandar o admin de volta ao setup — daí a
`CredentialsRejectedException` ser um tipo separado do 401 comum. Ela é o sinal de "digitar de novo
conserta, tentar de novo não".

**`configure()` valida antes de gravar.** Gravar primeiro deixaria uma instalação quebrada para trás
num erro de digitação, e o app entraria em laço num login que nunca completaria.

**A senha vai para o keystore, e é o preço admitido do login automático.** O JWT dura 12h e alguém
tem que renová-lo sem perguntar. `SecureCredentialsStore` usa DPAPI no Windows e libsecret no Linux.
`Credentials.toString()` é deliberadamente opaco — uma credencial não pode chegar a um log por
interpolação acidental.

**Ler as três chaves é tudo-ou-nada.** Uma escrita parcial no keystore mandaria o app para um login
que ele nunca conseguiria satisfazer; `read()` devolve `null` se faltar qualquer uma.

**As telas dependem de providers, nunca de construtor.** É o que permite trocar a API por um fake
sem tocar em widget — e é o que a spec 0002 vai explorar para os testes de widget.

**`territoriesProvider` busca a lista e depois cada detalhe.** O endpoint de listagem não traz as
quadras. São dezenas de territórios, o que torna isso aceitável; se um dia deixar de ser, o conserto
é no servidor, não aqui.

**A cor da quadra segue `last_worked_at`.** Vermelho para nunca trabalhada, laranja passados 120
dias (`overdueAfter`), verde no resto. "Última vez trabalhada" é o fato mais útil do sistema no dia
a dia — é o que diz para onde ir hoje —, então é ele que manda na cor.

**`now` é injetável em `HomeScreen` e `TerritoryMap`.** Nenhum dos dois lê o relógio de parede
diretamente quando um teste precisa decidir onde cai "hoje".

**A conversão `core.LatLng` → `map.LatLng` fica numa função só.** As duas são `(lat, lng)`, então
nada é reordenado ali — mas manter a ponte num lugar único é o que impede a conversão de ser
redigitada, que é por onde a troca acabaria entrando.

**Chrome é ferramenta de desenvolvimento, não alvo.** Nada de web é publicado, e o CI constrói
Windows e Linux. O navegador **não alcança a API** (CORS está desligado de propósito no servidor),
então os fluxos de rede foram cobertos por teste, não pelo que aparece na tela.

## Como validar

```
cd admin && flutter pub get && flutter test
flutter analyze
flutter run -d chrome      # verificação visual; a API não responde ao navegador
```

## Resultado da validação

- `flutter test` → **11 passed** (`test/session_test.dart`)
- `flutter analyze` limpo
- Verificação visual no Chrome
- Job `admin` do `.github/workflows/core.yml`: `dart format --set-exit-if-changed lib test`,
  `flutter analyze` e `flutter test` — acrescentado logo depois, em `9165f19` (ver 0027)

## O que ficou sem cobertura

**Nenhuma tela tem teste de widget.** `SetupScreen`, `HomeScreen`, `TerritoryMap` e o roteamento de
`main.dart` foram verificados **só a olho, no Chrome**. Isso significa que não há rede de segurança
para, entre outras coisas:

- validação dos campos do setup, e o fato de a senha ir **exatamente como digitada** (com espaços)
  enquanto nome e cidade são aparados
- o banner de erro do servidor permanecendo com a tela preenchida para o admin corrigir
- o roteamento: sem credenciais → setup; com credenciais → mapa; keystore ilegível → setup com
  aviso; `CredentialsRejectedException` → volta ao setup com a mensagem
- os estados de carga, vazio e falha da `HomeScreen`
- a regra de cor das quadras por `last_worked_at`

A **spec 0002** existe justamente para fechar isso: as Tasks 08 e 09 cobrem estas telas, depois de a
Task 05 tirar o cliente da API de dentro delas.
