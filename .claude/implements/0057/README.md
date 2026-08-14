# [0057] Empacotamento local do admin com `electron-builder` e README novo

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0003/` — Task 19

## Solicitação

Configurar `electron-builder` em `admin/` com alvos para macOS (`dmg`+`zip`), Windows (`nsis` ou
`zip`) e Linux (`AppImage`+`tar.gz`), scripts `build:mac`/`build:win`/`build:linux` em
`package.json`, reescrever `admin/README.md` cobrindo instalação, `npm run dev`, configuração do
`.env` e os três builds locais (com nota sobre cross-compilar Windows/Linux a partir do macOS), e
confirmar que `.github/workflows/admin-release.yml` já não existe, sem criar um substituto nem
tocar em nada fora de `admin/`.

## Contexto

Última task de build/config da spec 0003 (migração do admin de Flutter para Electron). As tasks
01–18 já entregaram o app Electron completo (main, preload, renderer, as seis telas, testado). O
scaffold da Task 01 (implements/0039) já tinha deixado um `electron-builder.yml` e scripts
`build:*` gerados pelo template `electron-vite`, mas com alvos e documentação que não batiam com o
que a spec pede: Linux incluía `snap`/`deb` (dependências extras: `snapcraft`, ferramentas Debian)
em vez de só `AppImage`+`tar.gz`; macOS/Windows não declaravam os alvos por extenso; havia um bloco
`publish` apontando para uma URL de exemplo (`https://example.com/auto-updates`) — resquício de
auto-update que este projeto não usa; e o `README.md` ainda era o boilerplate genérico do template
`electron-vite`, sem nada específico deste projeto (não mencionava `.env`, `API_BASE_URL`,
`APP_KEY`, nem o fato de não haver mais CI).

## O que foi feito

- **`admin/electron-builder.yml`**: declarados explicitamente os alvos por plataforma —
  `mac.target: [dmg, zip]`, `win.target: [nsis]`, `linux.target: [AppImage, tar.gz]` (removidos
  `snap` e `deb`, que exigem ferramental extra e não foram pedidos). Removido o bloco `publish`
  (auto-update apontando para uma URL de exemplo que nunca existiu de verdade — nada no projeto usa
  isso).
- **`admin/package.json`**: os três scripts (`build:mac`, `build:win`, `build:linux`) já existiam
  do scaffold da Task 01, mas `build:mac`/`build:linux` chamavam `electron-vite build` direto
  enquanto `build:win` chamava `npm run build` (que roda `typecheck` antes). Padronizados os três
  para `npm run build && electron-builder --<alvo>`, para que nenhum dos três empacote um build com
  erro de tipo sem avisar.
- **`admin/README.md`**: reescrito do zero. Cobre `npm install`; como preencher `admin/.env` a
  partir de `admin/.env.example` (tabela com `API_BASE_URL` e `APP_KEY`, explicando que agora são
  lidas pelo main process via `dotenv` em vez de `--dart-define`); `npm run dev` (janela Electron
  real com hot reload); `npm test`/`lint`/`typecheck`; os três comandos de build local, com o aviso
  de que compilar Windows a partir do macOS depende do Wine para o instalador NSIS e que, se isso
  não funcionar nesta máquina, o caminho é compilar Windows num Windows e Linux num Linux — não há
  mais CI fazendo isso; e o aviso de binário não assinado (SmartScreen/Gatekeeper).

Nenhum arquivo fora de `admin/` foi tocado. Confirmado que `.github/workflows/admin-release.yml`
não existe (só `core.yml` e `server.yml` estão em `.github/workflows/`) — a Task 01 já o removeu, e
nenhum substituto foi criado.

## Arquivos modificados

- `admin/electron-builder.yml` — alvos explícitos por plataforma (mac: dmg+zip, win: nsis, linux:
  AppImage+tar.gz, removendo snap/deb) e remoção do bloco `publish` de auto-update não usado.
- `admin/package.json` — `build:mac` e `build:linux` passam a rodar `npm run build` (com
  `typecheck`) em vez de `electron-vite build` direto, igualando `build:win`.
- `admin/README.md` — reescrito do zero (era o boilerplate genérico do template `electron-vite`).

## Decisões técnicas

- **Linux só com `AppImage`+`tar.gz`**, removendo `snap` e `deb` do scaffold original: são os dois
  alvos pedidos pela task, e evitam dependências extra (`snapcraft`, empacotamento Debian) que essa
  máquina não tem e que não foram solicitadas.
- **Remoção do bloco `publish`**: era um resquício do template `electron-vite` apontando para uma
  URL de exemplo que nunca serviria de verdade. Este projeto não tem (nem planeja, pelo `CLAUDE.md`)
  um mecanismo de auto-update — deixar o bloco ali seria documentação enganosa sobre uma capacidade
  que não existe.
- **`build:mac`/`build:linux` passam a rodar `typecheck` antes de empacotar**, como `build:win` já
  fazia: um binário com erro de tipo empacotado silenciosamente é pior do que a build falhar um
  pouco mais devagar.
- **README novo em vez de editar o antigo**: o `admin/README.md` era ainda o boilerplate do
  template `electron-vite` (link para VSCode/ESLint, sem nada específico do projeto) — reescrever do
  zero era mais direto que remendar.

## Como validar

```bash
cd admin
npm install
npm run build:mac   # empacota de verdade nesta máquina (macOS); gera dist/*.dmg e dist/*.zip
npm run lint
npm run typecheck
npm test
```

## Resultado da validação

- `npm run build:mac` rodou até o fim nesta máquina (macOS): `typecheck` passou, o `electron-vite
  build` gerou `out/main`, `out/preload`, `out/renderer`, e o `electron-builder --mac` empacotou
  com sucesso `dist/admin-1.0.0-mac.zip` (117 MB) e `dist/territory-map-admin-1.0.0.dmg` (117 MB) —
  a assinatura de código foi pulada por não haver identidade "Developer ID Application" instalada
  (esperado, sem certificado pago; documentado no README).
- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros (`typecheck:node` e `typecheck:web`).
- `npm test` — 262 testes, 16 arquivos, todos passando.
- `build:win`/`build:linux` **não foram executados** nesta validação (a task só pede confirmar
  `build:mac` até o fim nesta máquina); a configuração dos três alvos foi revisada por leitura do
  `electron-builder.yml` resultante.
