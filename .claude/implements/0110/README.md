# [0110] Identidade visual do app mobile: nome, ícone do launcher e logo na ativação

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto

## Solicitação
Aplicar a identidade visual no app mobile React Native (`app/`) usando a logo fornecida em
`assets/logo.jpeg` (pin de mapa roxo com o texto "TERRITORY MAP", 1600×1600, fundo ~#f5f5f5).
Três frentes: (1) nome de exibição do launcher Android como "Territory Map"; (2) ícones do
launcher (`ic_launcher.png` / `ic_launcher_round.png`) em todas as densidades, usando só o pin;
(3) logo completa no lugar do título de texto "Territórios" na tela de ativação. Pedido avulso
do usuário, sem spec. `admin/` estava fora do escopo (outra frente rodando lá).

## Contexto
O app usava o ícone padrão do template React Native e um título de texto na tela de ativação.
A logo oficial passou a existir em `assets/logo.jpeg` e precisava chegar ao launcher e à
primeira tela que o publicador vê.

## O que foi feito
- **Nome do launcher:** nenhuma mudança foi necessária — `app/android/app/src/main/res/values/strings.xml`
  (`app_name`) e o `displayName` de `app/app.json` **já diziam "Territory Map"** no estado
  comitado. Verificado e mantido; o `name` interno (`TerritoryMapApp`) e o pacote
  (`com.territorymapapp`) não foram tocados, conforme pedido.
- **Ícones do launcher:** gerados a partir do pin da logo (o texto fica ilegível em tamanho de
  ícone). O recorte foi calculado por bounding box do conteúdo (região acima de y=1190, onde só
  existe o pin → bbox 458–1142 × 221–1152), com o ruído JPEG do fundo achatado para #f5f5f5
  exato e o pin centrado num canvas quadrado com ~8% de folga. `ic_launcher.png` quadrado e
  `ic_launcher_round.png` com máscara circular (alpha, supersampling 4×) nas cinco densidades
  existentes: mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192. Não existe
  `mipmap-anydpi-v26` no template, então ficou em PNGs diretos, sem adaptive icon.
- **Recorte-fonte:** guardado em `assets/icon-pin.png` (1079×1079), ao lado da logo original —
  é insumo de build, não asset bundlado pelo Metro, então não pertence a `app/src/`.
- **Logo na tela de ativação:** `ActivationScreen.tsx` troca o `<Text>` "Territórios" por um
  `<Image>` (180×210, `resizeMode="contain"`, `accessibilityLabel="Territory Map"`) carregando
  `app/src/presentation/assets/logo.png` (640×749, recorte por bounding box da arte completa com
  60px de respiro). O subtítulo explicativo permanece. O fundo #f5f5f5 da imagem se integra ao
  `colors.background` (#f5f7fa) sem tratamento.
- O lint (`@typescript-eslint/no-require-imports`) proíbe `require()`, então o PNG entra por
  `import` estático, viabilizado por uma declaração `declare module '*.png'` nova.

## Arquivos modificados
- `app/src/presentation/screens/ActivationScreen.tsx` — título de texto substituído pela imagem da logo; estilo `appTitle` virou `logo`
- `app/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` — ícone novo (pin) em cada densidade
- `app/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png` — variante circular

## Arquivos criados
- `assets/icon-pin.png` — recorte-fonte do pin (1079×1079, fundo achatado), origem dos mipmaps
- `app/src/presentation/assets/logo.png` — logo completa (pin + texto) bundlada pelo Metro para a tela de ativação
- `app/src/presentation/assets/images.d.ts` — `declare module '*.png'` para importar imagem sem `require()`

## Decisões técnicas
- **Só o pin no ícone:** "TERRITORY MAP" em 48px é ruído; o pin sozinho é reconhecível.
- **Bounding box calculada, não coordenadas chutadas:** os dois primeiros recortes manuais
  cortaram o texto ou o incluíram no ícone; detectar o conteúdo contra o fundo (#f5f5f5,
  tolerância 24) tornou o recorte determinístico e conferível.
- **PNGs diretos, sem adaptive icon:** o template não tinha `mipmap-anydpi-v26`; criar adaptive
  icon seria mudança maior que o pedido. Consequência conhecida: em launchers com máscara
  agressiva o quadrado pode ser cortado nos cantos — aceitável para distribuição fora da Play
  Store neste estágio.
- **Geração com Pillow** (instalado via `pip --user`; o script ficou no scratchpad da sessão,
  descartável): `sips` não faz máscara circular nem composição. O processo é reproduzível a
  partir de `assets/logo.jpeg` + este README.
- **Frente 1 como no-op:** os dois arquivos de nome já estavam corretos; mudar por mudar criaria
  diff vazio.

## Como validar
- `cd app && npm test` — suíte inteira
- `cd app && npx tsc --noEmit` e `npm run lint`
- `cd app/android && ./gradlew assembleRelease` e instalar
  `app/android/app/build/outputs/apk/release/app-release.apk`: o launcher mostra o pin roxo com
  o nome "Territory Map", e a tela de ativação abre com a logo completa acima do campo de código.

## Resultado da validação
- `npm test`: 10 suites, 63 testes, todos verdes (nenhum teste consultava o título "Territórios").
- `npx tsc --noEmit`: sem erros. `npm run lint`: sem erros e sem warnings.
- `./gradlew assembleRelease`: APK gerado em
  `app/android/app/build/outputs/apk/release/app-release.apk` (~114 MB). Verificado por
  inspeção do APK que o `ic_launcher_round` de 192px embarcado é o pin novo (recursos têm nome
  ofuscado pelo AGP; a conferência foi extraindo o PNG de 192×192 e olhando a imagem).
