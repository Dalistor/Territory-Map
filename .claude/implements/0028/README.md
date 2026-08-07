# [0028] Build do admin com dart-defines e GitHub Release de verdade

**Data:** 2026-08-05
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0002/` — Task 02

## Solicitação

> Spec 0002 — Task 02: `.github/workflows/admin-release.yml` tem dois defeitos. **(a)** roda
> `flutter build ${{ matrix.target }} --release` sem nenhum `--dart-define`, e as duas constantes de
> `admin/lib/config.dart` são `String.fromEnvironment` — o binário publicado sai com `appKey` vazio,
> e com `APP_SECRET` configurado no servidor todo request dele toma 401. **(b)** o workflow se chama
> `admin-release`, o comentário no topo promete anexar os binários a uma GitHub Release e tem
> `permissions: contents: write`, mas o último passo é `actions/upload-artifact` — artefato de
> Actions expira em 90 dias e exige estar logado no GitHub.
>
> Corrija os dois. No job `build`: passe
> `--dart-define=APP_KEY=${{ secrets.APP_KEY }} --dart-define=API_BASE_URL=${{ vars.API_BASE_URL }}`
> no `flutter build`, e **antes dele** um passo que falha se qualquer um dos dois estiver vazio, com
> mensagem dizendo exatamente o que cadastrar e onde. Acrescente um job `release` com `needs: build`,
> condicionado a `startsWith(github.ref, 'refs/tags/')`, que baixa os dois artefatos com
> `actions/download-artifact`, compacta cada um (`zip -r` para Windows, `tar -czf` para Linux) e cria
> a Release com o `gh` CLI já presente no runner, usando `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
> Nada de action de terceiro para isso. O corpo da release deve avisar que os binários **não são
> assinados** e que o Windows SmartScreen vai reclamar na primeira execução, apontando para
> `admin/README.md`. Atualize o comentário do topo do arquivo. **Não cadastre secret nem variable.**

## Contexto

O workflow prometia mais do que entregava, nas duas pontas:

1. **Binário sem configuração.** `admin/lib/config.dart` define `apiBaseUrl` e `appKey` como
   `String.fromEnvironment`, resolvidos em tempo de compilação. Sem `--dart-define` no build de
   release, `appKey` saía **vazio** — e o gate `X-App-Key` do servidor (`server/app/core/app_key.py`)
   responde 401 a header ausente. Um binário assim é instalável e completamente inútil: nem a tela de
   configuração inicial passa. O `apiBaseUrl` tinha default no código, então esse sobrevivia; a chave
   não.
2. **Entrega errada.** O nome do workflow, o comentário do topo e o `permissions: contents: write`
   descreviam uma GitHub Release, mas o passo final era `actions/upload-artifact`. Artefato de
   Actions expira em 90 dias, exige login no GitHub e não tem link estável — não é canal de
   distribuição para o responsável pelos territórios da congregação.

## O que foi feito

Job `build`:

- Novo passo **"Check the build configuration"**, antes do build, que falha com `::error::` se
  `secrets.APP_KEY` ou `vars.API_BASE_URL` estiverem vazios. Cada mensagem diz o comando exato
  (`gh secret set APP_KEY`, `gh variable set API_BASE_URL`), o caminho na interface do GitHub e o que
  o valor significa (o `APP_KEY` é o mesmo `APP_SECRET` do servidor). Os dois são checados no mesmo
  passo antes de sair, para o admin descobrir os dois problemas de uma vez.
- O `flutter build` passou a receber `--dart-define=APP_KEY=...` e `--dart-define=API_BASE_URL=...`.

Novo job `release`:

- `needs: build`, `if: startsWith(github.ref, 'refs/tags/')` — `workflow_dispatch` continua
  produzindo só os artefatos, porque não há tag para anexar.
- `actions/download-artifact@v4` com `pattern: territory-map-admin-*` em `dist/`.
- Empacotamento: `chmod +x` no executável Linux, renomeação das pastas para
  `territory-map-admin-<tag>-<plataforma>`, `zip -qr` para Windows e `tar -czf` para Linux.
- `gh release create "$GITHUB_REF_NAME" --title "Admin <tag>" --notes-file release-notes.md
  --generate-notes <arquivos>`, com `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- O corpo da release (em português, porque quem lê é o admin da congregação) traz como instalar cada
  plataforma e a seção sobre o SmartScreen — "Mais informações → Executar assim mesmo" —, com link
  para `admin/README.md` na própria tag.

Permissões: o workflow passou a ser `contents: read` por padrão, com `contents: write` apenas no job
`release` — o job `build` não precisa escrever nada.

## Arquivos modificados

- `.github/workflows/admin-release.yml` — passo de checagem dos dois valores, `--dart-define` no
  build, job `release` com empacotamento e `gh release create`, permissões por job e comentário do
  topo reescrito descrevendo o que o workflow faz e quais secret/variable ele exige.

## Arquivos criados

Nenhum.

## Decisões técnicas

- **`--dart-define` interpolado com `${{ }}` em vez de vir por `env:`.** O `server.yml` estabelece a
  convenção oposta (secret entra por `env:`, nunca interpolado no `run:`), e ela é a certa quando o
  script é bash. Aqui o mesmo comando roda em **pwsh no Windows e bash no Linux**, e não existe
  sintaxe de variável comum às duas — `$env:APP_KEY` e `"$APP_KEY"` são incompatíveis. `${{ }}` é
  substituído antes de qualquer shell ver a linha, então funciona igual nos dois runners. Um comentário
  no arquivo registra o porquê. O passo de checagem, que é só bash, segue a convenção e recebe os
  valores por `env:`.
- **`shell: bash` explícito no passo de checagem.** O runner Windows usaria pwsh, onde `[ -z ... ]`
  não existe. Bash está disponível nos dois runners e o passo não toca no Flutter.
- **Falhar antes de compilar, não depois.** A checagem vem antes do `flutter build` porque um build
  de release do Flutter leva minutos; falhar cedo com a instrução do que cadastrar é mais útil do que
  falhar tarde — e muito melhor do que passar e publicar um binário que toma 401 em todo request.
- **`chmod +x` antes de empacotar o Linux.** `actions/upload-artifact` **não preserva o bit de
  execução** (ele zipa e o download perde a permissão). Sem isso o `territory_admin` sairia do
  `tar.gz` sem permissão de execução. As `.so` em `lib/` não precisam do bit, porque o loader só
  exige leitura.
- **Renomear a pasta antes de compactar.** `zip -r x.zip pasta` embute o nome da pasta; renomear para
  `territory-map-admin-<tag>-<plataforma>` faz o arquivo extrair numa pasta só, com o nome da versão,
  em vez de espalhar dezenas de arquivos no diretório de downloads.
- **`gh` CLI em vez de action de terceiro.** O `gh` já vem no runner e o `GITHUB_TOKEN` não passa por
  código de terceiro. `--notes-file` junto de `--generate-notes` é suportado: a API do GitHub
  antepõe o `body` enviado às notas geradas automaticamente.
- **Corpo da release em português.** É conteúdo voltado ao usuário final (o responsável pelos
  territórios, sem perfil técnico), não código. Os comentários do YAML seguem em inglês, como manda o
  `CLAUDE.md`.
- **`workflow_dispatch` não cria Release.** Não há tag para anexar; a condição
  `startsWith(github.ref, 'refs/tags/')` mantém o disparo manual útil como "compila e me dá os
  binários" sem poluir a lista de releases.
- **Nenhum secret ou variable foi cadastrado.** A Task 03 documenta o passo a passo em
  `admin/README.md`; o cadastro é do usuário.

## Como validar

1. Cadastrar os dois valores: `gh secret set APP_KEY` (mesmo valor do `APP_SECRET` do servidor) e
   `gh variable set API_BASE_URL` (`https://territorymap.dalistor.com.br`).
2. `git tag v0.1.0 && git push origin v0.1.0`.
3. Acompanhar o run: os dois jobs de build passam pelo "Check the build configuration", compilam com
   os dart-defines e sobem os artefatos; o job `release` baixa, compacta e publica.
4. A Release `v0.1.0` deve aparecer com `territory-map-admin-v0.1.0-windows.zip` e
   `territory-map-admin-v0.1.0-linux.tar.gz` anexados, e o corpo com o aviso do SmartScreen.
5. Para ver a falha proposital: remover o secret `APP_KEY` e disparar o workflow manualmente — o job
   deve falhar no passo de checagem com a mensagem do que cadastrar.

## Resultado da validação

- `actionlint` **não está disponível** nesta máquina (não instalado e sem Homebrew), então a
  validação foi feita à mão, como a instrução da task autoriza:
  - o YAML foi carregado e inspecionado com o parser do Ruby — dois jobs (`build`, `release`), a
    condição do `release` correta e o escalar dobrado do `flutter build` colapsando numa linha só com
    os dois `--dart-define`;
  - os oito corpos de `run:` foram extraídos e passaram em `bash -n` (sintaxe válida, incluindo o
    heredoc das notas da release);
  - releitura do arquivo conferindo `needs`, `permissions` por job, nomes de artefato batendo entre
    `upload-artifact` e o `pattern` do `download-artifact`, e o `GH_TOKEN` por `env:`.
- Nenhum teste automatizado cobre workflow neste projeto; a prova real é o primeiro run por tag.
- Nada além de `.github/workflows/admin-release.yml` foi tocado.
