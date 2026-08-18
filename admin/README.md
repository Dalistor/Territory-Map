# Territory Map — Admin

App desktop (Electron + React + TypeScript) para quem é responsável pelos territórios de uma
congregação: desenha as demarcações no mapa, marca, numera e apaga as quadras, cadastra
publicadores e acompanha o histórico de trabalho. Fala direto com o servidor da API. Veja o
`CLAUDE.md` na raiz do monorepo para a visão geral do projeto inteiro.

## Instalar

```bash
npm install
```

## Configurar (`admin/.env`)

O app lê duas variáveis de ambiente no **main process**, via `dotenv` — o mesmo propósito que os
antigos `--dart-define` do admin em Flutter tinham, só que agora resolvido em tempo de execução em
vez de compilado no binário:

```bash
cp .env.example .env
```

Depois preencha `admin/.env`:

| Variável | Para que serve |
|----------|-----------------|
| `API_BASE_URL` | URL base do servidor da Territory Map (ex. `http://localhost:8000` em desenvolvimento, ou o domínio de produção). |
| `APP_KEY` | O mesmo valor de `APP_SECRET` do servidor. Vai em toda requisição como o header `X-App-Key` — ver "Chave de aplicação" no `CLAUDE.md` da raiz. |

`.env` está no `.gitignore` — nunca commitar as duas chaves preenchidas.

## Rodar em desenvolvimento

```bash
npm run dev
```

Sobe uma janela Electron de verdade com hot reload: o `main`/`preload` recompilam e a janela
reinicia quando o código deles muda, e o `renderer` (React) atualiza via HMR do Vite sem perder o
estado da tela sempre que possível.

## Testes, lint e tipos

```bash
npm test          # Vitest, com React Testing Library para os componentes
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit para o main/preload (Node) e o renderer (DOM), em dois tsconfig separados
```

## Build local (empacotamento)

Não existe mais build por CI — a Task 01 da spec 0003 removeu
`.github/workflows/admin-release.yml` junto com o admin em Flutter que ele compilava. Empacotar o
app é sempre local, via [`electron-builder`](https://www.electron.build/), configurado em
`electron-builder.yml`. Cada comando roda o `build` do `electron-vite` (que inclui `typecheck`) e
em seguida empacota para o alvo:

```bash
npm run build:mac    # gera .dmg e .zip em dist/
npm run build:win    # gera o instalador NSIS em dist/
npm run build:linux  # gera .AppImage e .tar.gz em dist/
```

Os binários saem em `dist/` (fora do controle de versão — está no `.gitignore`).

**O `.env` viaja dentro do app empacotado.** `electron-builder.yml` copia `admin/.env` para
`Contents/Resources/.env` (`extraResources`), e o main process lê de lá quando `app.isPackaged` é
verdadeiro — em desenvolvimento continua lendo `admin/.env` da pasta do projeto. Duas consequências
práticas: **preencher o `.env` antes de empacotar não é opcional** (sem ele o build falha, o que é
melhor do que entregar um app que morre no primeiro clique), e uma instalação já feita pode ser
apontada para outro servidor editando esse arquivo de texto dentro do `.app`, sem recompilar. Como
já vale para o `APP_KEY` em geral, o valor é extraível de quem tiver o binário — a chave é uma
persiana contra varredura automática, nunca autenticação.

**Compilar Windows/Linux a partir do macOS pode não funcionar sem ferramentas extra.** O
`electron-builder` cross-compila os três alvos a partir de qualquer SO na maioria dos casos, mas o
instalador NSIS do Windows depende do Wine para rodar o `makensis` fora do Windows, e não há
garantia de que o Wine esteja instalado (ou funcionando) nesta máquina. Se `npm run build:win` ou
`npm run build:linux` falharem por causa disso, o caminho é compilar **Windows num Windows e Linux
num Linux** — não há mais CI cobrindo isso, então é local em cada SO mesmo: `npm install` e o
comando de build correspondente na máquina de destino. `npm run build:mac` só funciona num macOS,
de qualquer forma (o `electron-builder` não empacota `.dmg` fora do macOS).

Os binários não são assinados (sem certificado de desenvolvedor). O Windows SmartScreen e o
Gatekeeper do macOS vão avisar "desenvolvedor não identificado" na primeira execução — é esperado;
oriente quem for abrir a usar "abrir mesmo assim" em vez de tentar contornar o aviso.
