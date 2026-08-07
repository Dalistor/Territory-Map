# [0030] README do admin: como rodar, como configurar o build e o aviso do SmartScreen

**Data:** 2026-08-05
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0002/` — Task 03

## Solicitação

> Spec 0002 — Task 03: `admin/README.md` é o texto padrão gerado pelo `flutter create` ("A new
> Flutter project"). Reescreva-o em português, no tom do `server/README.md`, cobrindo: **(1)** o que
> é o admin (aplicativo desktop do responsável pelos territórios, Windows e Linux, uma congregação
> por instalação, sem tela de login depois da primeira execução); **(2)** como rodar localmente —
> `flutter pub get` e `flutter run -d chrome` (o alvo entregue é Windows/Linux, mas o
> desenvolvimento roda no Chrome porque a máquina de desenvolvimento não tem o Xcode completo),
> incluindo como passar `--dart-define=API_BASE_URL=...` e `--dart-define=APP_KEY=...` para apontar
> para um servidor local; **(3)** os dois valores que precisam estar cadastrados no GitHub para a
> release funcionar — o **secret** `APP_KEY` (mesmo valor do `APP_SECRET` do servidor) e a
> **variable** `API_BASE_URL` (`https://territorymap.dalistor.com.br`) —, com os comandos
> `gh secret set APP_KEY` e `gh variable set API_BASE_URL` e a observação de que sem eles o job de
> release falha de propósito, em vez de publicar um binário que não fala com o servidor; **(4)** como
> sair uma release: `git tag v0.1.0 && git push origin v0.1.0`; **(5)** uma seção **"O Windows vai
> avisar que o programa não é confiável"** explicando que os binários não são assinados (certificado
> custa dinheiro), que na primeira execução o SmartScreen mostra "O Windows protegeu o computador" e
> que o caminho é *Mais informações → Executar assim mesmo*; **(6)** como rodar os testes
> (`flutter test`) e o que o CI checa. Não invente comandos: confira contra
> `.github/workflows/admin-release.yml` e `.github/workflows/core.yml` como eles estão depois da
> Task 02. Toque apenas em `admin/README.md`.

## Contexto

O admin já está implementado (implementações 0026, 0027 e 0029) e, depois da Task 02
(implementação 0028), a tag `v*` passou a produzir binários configurados e publicados numa GitHub
Release. Faltava o texto que diz como operar tudo isso: `admin/README.md` continuava sendo o
boilerplate do `flutter create`.

Dois pontos tornam o documento necessário, e não decorativo:

1. **Os dois `--dart-define` são cadastrados à mão.** Nenhuma task da spec cadastra `APP_KEY` nem
   `API_BASE_URL` — é o usuário quem faz. O workflow falha com a mensagem certa se faltarem, mas a
   mensagem só é útil se existir um lugar que explique o que cadastrar, onde e por quê.
2. **O SmartScreen vai reclamar na primeira execução.** As notas da Release já avisam e apontam para
   este README; o README precisava existir e conter o passo a passo.

## O que foi feito

`admin/README.md` reescrito do zero, em português, seguindo a estrutura do `server/README.md`
(intro com a stack, "Desenvolvimento local" com passos numerados, tabela de comandos do dia a dia,
seção de CI, seção de release, separadores `---`).

Seções entregues:

- **Abertura** — o que é o admin, plataformas alvo, e a explicação de "uma congregação por
  instalação, sem tela de login no dia a dia" (credenciais no keystore, JWT de 12h, reautenticação
  silenciosa no 401).
- **Desenvolvimento local** — `flutter pub get`, `flutter run -d chrome` com o porquê do Chrome, e
  como apontar para um servidor local com os dois `--dart-define`.
- **Comandos do dia a dia** — tabela com testes, cobertura, analyze e as duas formas do
  `dart format` (a de escrever e a que a CI roda).
- **Testes e CI** — os quatro passos do job `admin` de `core.yml`, na ordem, e por que não há build
  ali.
- **Release** — tabela do secret e da variable, os comandos `gh`, o `git tag` / `git push`, os
  quatro passos do `admin-release.yml`, os nomes dos artefatos, o comportamento do
  `workflow_dispatch` e a ausência do macOS.
- **"O Windows vai avisar que o programa não é confiável"** — seção própria, com o caminho
  *Mais informações → Executar assim mesmo*.
- **Estrutura** — a árvore de `admin/lib/` e a regra de camadas.

## Arquivos modificados

- `admin/README.md` — substituído por inteiro; era o boilerplate do `flutter create`

## Arquivos criados

Nenhum arquivo de código.

## Decisões técnicas

- **Cadastro no nível do repositório, não no Environment `production`.** O `server/README.md` usa
  `gh secret set ... --env production` porque o job de deploy declara `environment: production`. O
  job `build` do `admin-release.yml` **não** declara environment, então um valor guardado dentro de
  um Environment chegaria vazio nele. Os comandos do README são explicitamente de repositório
  (`-R Dalistor/Territory-Map`, sem `--env`), e o texto diz o porquê — copiar a forma do outro README
  daria uma release quebrada com a mensagem de erro "está vazio" e nenhuma pista.
- **Documentado o CORS no fluxo do Chrome.** `CORS_ORIGINS` é `[]` por padrão
  (`server/app/core/config.py`), e o middleware só é montado se a lista tiver algo
  (`server/app/main.py:103`). Rodando no Chrome contra `localhost:8000`, portanto, o navegador
  bloqueia tudo até que a origem seja liberada — daí o `--web-port=5000` fixo no exemplo, que evita
  a porta aleatória do Flutter web e torna o valor de `CORS_ORIGINS` previsível. Isso não estava na
  instrução da task, mas sem ele o passo 3 ("apontar para um servidor local") não funciona na
  prática.
- **Dito que `APP_KEY` é opcional em desenvolvimento.** `APP_SECRET` vazio desliga o gate
  (`server/app/core/app_key.py`), e é assim que o `server/.env.example` vem. Mandar cadastrar a
  chave para rodar local seria ritual sem função; o README distingue os dois casos e diz o sintoma
  de errar (401 em todo request).
- **Nada foi afirmado sobre "Sair da congregação".** A ação é a Task 07 e ainda não existe na
  interface. A abertura descreve o retorno à configuração inicial apenas pelo caminho que existe
  hoje — a credencial guardada ser recusada pelo servidor. Documentar uma opção de menu inexistente
  transformaria o README numa promessa.
- **Instrução de instalação insiste na pasta inteira.** O build Windows do Flutter depende das DLLs
  e da pasta `data/` ao lado do `.exe`; extrair só o executável é o erro mais provável de quem
  recebe o `.zip`, e ele se manifesta como "o programa não abre", sem mensagem útil.
- **O aviso do SmartScreen explica que não é alerta de vírus.** É a dúvida real de quem instala: o
  SmartScreen reage à ausência de reputação de um binário não assinado, não a algo detectado no
  arquivo. Sem essa frase, a instrução "clique em Executar assim mesmo" parece pedir para ignorar um
  alerta de segurança.

## Como validar

1. Ler `admin/README.md` e conferir cada comando contra os arquivos citados:
   - job `admin` de `.github/workflows/core.yml` — `flutter pub get`,
     `dart format --output=none --set-exit-if-changed lib test`, `flutter analyze`, `flutter test`;
   - `.github/workflows/admin-release.yml` — gatilho `push` em tags `v*` mais `workflow_dispatch`,
     o passo "Check the build configuration", os dois `--dart-define` no `flutter build`, e o job
     `release` condicionado a `startsWith(github.ref, 'refs/tags/')`;
   - nomes dos artefatos: `territory-map-admin-<tag>-windows.zip` e
     `territory-map-admin-<tag>-linux.tar.gz`, como o passo "Package each build" os monta.
2. Conferir os links relativos a partir de `admin/`: `../CLAUDE.md`, `../packages/core`,
   `lib/config.dart`, `../.github/workflows/core.yml`, `../.github/workflows/admin-release.yml`.
3. `git status --short` deve mostrar apenas `admin/README.md` modificado por esta task.

## Resultado da validação

- Mudança exclusivamente de documentação: nenhum arquivo de `lib/` ou `test/` foi tocado, então
  `flutter analyze`, `flutter test` e o `dart format --check` de `core.yml` não são afetados — o
  check de formatação do job `admin` cobre `lib test`, não Markdown.
- Todos os comandos, nomes de secret/variable, nomes de artefato e passos de workflow foram
  conferidos linha a linha contra `.github/workflows/admin-release.yml` (pós-Task 02),
  `.github/workflows/core.yml`, `admin/lib/config.dart`, `admin/pubspec.yaml` e
  `server/.env.example`. Nada foi escrito de memória.
- `git status --short` confirma `admin/README.md` como o único arquivo alterado por esta task.
