# [0185] Logo e ícone do produto no app admin

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0013/` — Task 01

## Solicitação
> Traga a logo do produto para o `admin-app/`, em duas frentes. (a) Ícone do app: copiar os
> `ic_launcher.png` e `ic_launcher_round.png` das cinco densidades do `app/` para o `admin-app/`,
> sobrescrevendo os default do template do React Native. (b) Logo dentro do app: copiar
> `logo.png` e criar `images.d.ts`, exibindo a logo na `SetupScreen` acima do título, como a
> `ActivationScreen` do `app/` faz.

## Contexto
O `admin-app/` nasceu do template do React Native e ficou com o ícone genérico dele, enquanto o
`app/` do publicador já usa o ícone do produto. Nas telas, a `SetupScreen` — a primeira e única
tela onde o admin digita credencial — abria direto no título, sem nada que dissesse que este app
é o mesmo produto que o do publicador.

## O que foi feito
- Copiados os 10 arquivos de ícone (`ic_launcher.png` e `ic_launcher_round.png` × 5 densidades) de
  `app/android/app/src/main/res/mipmap-*/` para os diretórios de mesmo nome do `admin-app/`,
  sobrescrevendo os do template. Conferidos com `sips -g pixelWidth`: 48/72/96/144/192 px,
  exatamente como no `app/`. Nenhuma imagem foi gerada ou redimensionada.
- Copiado `app/src/presentation/assets/logo.png` (640×749) para
  `admin-app/src/presentation/assets/logo.png`, e o `images.d.ts` que declara o módulo `*.png`.
- `SetupScreen.tsx` passou a importar a logo e a renderizá-la num `<Image>` acima do título, com
  `resizeMode="contain"` e o mesmo estilo (140×160, centrado) da `ActivationScreen`.

## Arquivos modificados
- `admin-app/src/presentation/screens/SetupScreen.tsx` — `import { Image }`, `import logo`,
  o `<Image>` acima do `<Text style={styles.title}>` e o estilo `logo`
- `admin-app/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` —
  substituídos pelos do produto
- `admin-app/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png` —
  idem

## Arquivos criados
- `admin-app/src/presentation/assets/logo.png` — a logo do produto, 640×749
- `admin-app/src/presentation/assets/images.d.ts` — declara `*.png` como `number`, sem o que o
  TypeScript recusa o `import` do asset (o lint proíbe `require()`)

## Decisões técnicas
- **Cópia, não geração.** Os arquivos corretos já existem no `app/`; gerar ou redimensionar
  produziria um ícone parecido mas diferente do produto, e é justamente o "parecer outro app" que
  a task existe para corrigir.
- **`resizeMode="contain"` e proporção 140×160.** A imagem é mais alta que larga (640×749); uma
  caixa quadrada com `cover` a cortaria. Os mesmos números da `ActivationScreen`, para as duas
  telas de primeira abertura terem o mesmo peso visual.
- **`accessibilityLabel="Territory Map"`** na `<Image>`, como no `app/` — a logo é conteúdo, não
  decoração, e é o único elemento acima do título.
- **Nenhum teste novo.** A mudança é de apresentação; a `SetupScreen` já tem 17 testes de
  comportamento, todos verdes sem nenhuma alteração.

## Como validar
Rodar o app (`npm run android` em `admin-app/`): a tela de configuração inicial abre com a logo
acima de "Territory Map Admin", e o ícone na gaveta de apps é o do produto, não o do template.
O Gradle não foi rodado nesta task, por instrução da spec.

## Resultado da validação
- `npx tsc --noEmit` — sem erros.
- `npx jest src/presentation/screens/SetupScreen.test.tsx` — 17 testes passando, **sem nenhuma
  alteração no arquivo de teste**.
- `npm test` completo e `npm run lint` acusam falhas **apenas** em `src/domain/territoryMap.test.ts`,
  arquivo da Task 02 da mesma spec, que rodava em paralelo em fase red de TDD. Nenhuma das 12
  outras suítes falhou e nenhum erro de lint tocou arquivo desta task.
- Densidades conferidas com `sips -g pixelWidth`: 48/72/96/144/192 px nos dez arquivos.
