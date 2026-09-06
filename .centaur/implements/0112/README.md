# [0112] Identidade visual do admin: ícone do app, logo no Setup e pin na sidebar

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto

## Solicitação
Aplicar a identidade visual no admin Electron usando `assets/logo.jpeg` (logo completa, pin roxo +
"TERRITORY MAP", 1600×1600, fundo `#f5f5f5`) e `assets/icon-pin.png` (recorte só do pin, gerado na
implementação 0110 para o app mobile). Três frentes: ícone da janela/instalador (electron-builder),
logo na `SetupScreen` e pin no topo da sidebar. Pedido avulso do usuário — a metade mobile foi a
implementação 0110.

## Contexto
O admin ainda usava os ícones padrão do scaffold electron-vite (`build/icon.{png,icns,ico}`,
`resources/icon.png`) e um emoji 📍 como marca na tela de configuração inicial. A sidebar mostrava
só texto. Com a logo do projeto já existente (e o recorte do pin já feito na 0110), faltava aplicar
a identidade nos três pontos visíveis do desktop.

## O que foi feito
1. **Ícone do app/instalador**: `admin/build/icon.png` regenerado em 1024×1024 a partir de
   `assets/icon-pin.png` (`sips`). Os `icon.icns`/`icon.ico` do scaffold foram **removidos** — o
   electron-builder gera icns/ico a partir do `icon.png` quando eles não existem, e mantê-los faria
   o ícone antigo do Electron vencer o novo. `admin/resources/icon.png` (o que a `BrowserWindow`
   usa) também foi trocado pelo pin em 512×512.
2. **Janela em desenvolvimento**: a condição do `icon` na `BrowserWindow` mudou de
   `platform === 'linux'` para `platform !== 'darwin'` — agora cobre também o Windows em dev.
   No macOS `BrowserWindow.icon` não tem efeito: o dock em dev mostra o ícone do Electron e o app
   empacotado pega o ícone do electron-builder. Limitação conhecida, registrada em comentário no
   código em vez de contornada.
3. **SetupScreen**: o `.setup-mark` (círculo com emoji) e o `<h1>Territory Map</h1>` foram
   substituídos por `<img className="setup-logo" alt="Territory Map">` com a logo completa
   (`admin/src/renderer/assets/logo.png`, 512×512 convertida do jpeg). O `h1` saiu porque a logo já
   carrega o wordmark "TERRITORY MAP" — mantê-lo imprimiria o nome duas vezes, empilhado. Contra o
   fundo `#f5f5f5` da imagem vs. o branco do card, a logo virou um "tile": 140px, cantos
   arredondados (20px) e borda `--color-border`.
4. **Sidebar**: o `.sidebar-header` virou flex row com o pin pequeno
   (`admin/src/renderer/assets/icon-pin.png`, 128×128 exibido a 32px, cantos arredondados,
   `alt=""` decorativa) ao lado do nome/cidade da congregação, com `min-width: 0` no bloco de texto
   para nomes longos não estourarem a sidebar de 220px.

Nenhum `.d.ts` novo foi necessário: `admin/src/renderer/env.d.ts` já referencia `vite/client`, que
declara os módulos `*.png` (diferente do app mobile, que precisou de `images.d.ts` na 0110).

## Arquivos modificados
- `admin/build/icon.png` — pin em 1024×1024 (era o ícone padrão do electron-vite em 512)
- `admin/resources/icon.png` — pin em 512×512 (ícone da janela em Linux/Windows)
- `admin/src/main/index.ts` — `icon` na `BrowserWindow` para toda plataforma exceto macOS, com a limitação do dock documentada
- `admin/src/renderer/screens/SetupScreen.tsx` — logo no lugar do emoji e do `h1`
- `admin/src/renderer/App.tsx` — pin no `.sidebar-header`, texto embrulhado em `.sidebar-header-text`
- `admin/src/renderer/index.css` — `.setup-mark` → `.setup-logo`; `.sidebar-header` em flex com o ícone

## Arquivos criados
- `admin/src/renderer/assets/logo.png` — logo completa (512×512, PNG) importada pela `SetupScreen`
- `admin/src/renderer/assets/icon-pin.png` — recorte do pin (128×128) importado pelo `App.tsx`

## Arquivos removidos
- `admin/build/icon.icns`, `admin/build/icon.ico` — ícones stale do scaffold; sem eles o
  electron-builder gera os dois formatos a partir do novo `build/icon.png`

## Decisões técnicas
- **Reutilizar `assets/icon-pin.png` da 0110** em vez de recortar de novo — mesma fonte, mesmo
  recorte, consistência entre mobile e desktop.
- **Apagar icns/ico em vez de regenerá-los à mão**: o caminho documentado do electron-builder é
  derivá-los do `build/icon.png`; gerar `.ico` localmente exigiria ferramenta extra sem ganho.
- **Sem gambiarra para o dock do macOS em dev** — `app.dock.setIcon()` existiria, mas o pedido foi
  explícito em registrar a limitação em vez de contornar.
- **Imagens redimensionadas no repo** (512/128) em vez de embutir os originais de 1600px: o bundle
  do renderer carrega só o que a tela usa (logo exibida a 140px, pin a 32px).

## Como validar
- `cd admin && npm test` — suíte inteira
- `npm run typecheck`, `npm run lint`, `npm run build`
- Visual: `npm run dev` — logo no card do Setup, pin na sidebar; em Linux/Windows, ícone da janela
- **Verificação manual pendente**: `npm run build:mac` (ou `build:win`/`build:linux`) para conferir
  o ícone gerado no dmg/instalador — pulado por ser demorado; o empacotamento do ícone segue o
  caminho padrão do electron-builder (`build/icon.png`)

## Resultado da validação
- `npx vitest run`: **333 testes verdes** (19 arquivos). Uma rodada isolada teve 1 flake de timing
  de efeito assíncrono do React, sem relação com a mudança; duas rodadas seguintes 100% verdes.
- `npm run typecheck`: sem erros (node e web)
- `npm run lint`: sem erros
- `npm run build`: compila; `logo.png` e `icon-pin.png` aparecem no bundle do renderer
- Empacotamento (`build:mac`) não executado — registrado acima como verificação manual pendente
