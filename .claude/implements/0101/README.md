# [0101] Safe area e estilização das telas do app, com correções de UX encontradas na revisão

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (mudança de UI/estilo; os comportamentos existentes seguem cobertos pelos testes
que já existiam)
**Spec:** decorrente da [0005](../../specs/0005/README.md), mas não é uma task dela — pedido
direto do usuário após instalar o APK num aparelho real.

## Solicitação

"A renderização do app precisa ser corrigida, pode dar uma estilizada no app também e checar as
funcionalidades?" — acompanhado de um screenshot da `ActivationScreen` num Samsung: texto "Código
de acesso" sobreposto à status bar, campo de texto invisível, "Confirmar" parecendo texto solto,
nenhum estilo.

## Contexto

As telas da spec 0005 foram construídas por TDD com markup mínimo — funcionais, mas sem
`StyleSheet` na Activation e sem tratamento de safe area em lugar nenhum. O RN 0.87 é
edge-to-edge por padrão no Android, então a tela sem header (`Activation`, `headerShown: false`)
desenhava por baixo da status bar. As telas com header nativo (Dashboard/Mapa) não tinham esse
problema no topo, mas nenhuma cuidava da borda inferior.

## O que foi feito

**Infra de tema e safe area:**
- `app/src/presentation/theme.ts` (novo) — paleta única do app. Primária `#1565c0`, o mesmo azul
  do contorno de território que o admin usa, para os dois clientes lerem como o mesmo produto. As
  cores de status das quadras (vermelho/laranja/verde) ficam fora de propósito: são do domínio.
- `app/src/presentation/components/PrimaryButton.tsx` (novo) — o botão preenchido padrão, com
  estados desabilitado/pressionado/ocupado (spinner), mantendo `accessibilityRole="button"`.
- `App.tsx` — `SafeAreaProvider` na raiz, `StatusBar` dark-content global (a Activation é clara),
  e tema do stack navigator: header azul primário com texto branco, `statusBarStyle: 'light'` nas
  telas com header e `'dark'` na Activation, `contentStyle` com o fundo padrão.
- `jest.setup.js` (novo) + `setupFiles` no `jest.config.js` — mock oficial do
  `react-native-safe-area-context` (o export é o `.default` do módulo `jest/mock`), global porque
  tanto as telas quanto os internals do React Navigation o tocam.

**Telas:**
- `ActivationScreen` — reescrita visual: `SafeAreaView`, título "Territórios", subtítulo
  explicando o que é o código, campo centralizado com letra espaçada e placeholder, erro em cartão
  vermelho-claro, `PrimaryButton`. Ganhou também estado `busy`: o botão trava e mostra spinner
  durante a chamada ao servidor (antes, dois toques rápidos disparavam duas ativações).
- `DashboardScreen` — seções em cartões brancos com divisores, data em texto secundário, "Ver no
  mapa" como botão pill primário. Ganhou tratamento de erro de carregamento: as duas buscas agora
  têm `.catch` mostrando um banner ("Não foi possível carregar os dados...") em vez de rejeição
  não tratada e dashboard silenciosamente vazio.
- `MapScreen` — dois bugs reais corrigidos: (1) o chip ativo do filtro ficava azul escuro com
  texto preto, ilegível — o texto agora vira branco no estado ativo (chips extraídos num
  componente `FilterChip`, com `accessibilityState.selected`); (2) `listTerritories` sem `.catch`
  — falha agora aparece no banner já existente da tela. Botões dos modais estilizados (Confirmar/
  Fechar preenchidos, Cancelar como botão de texto), cartões com canto arredondado, container em
  `SafeAreaView edges={['bottom']}` para a borda inferior edge-to-edge.
- `.eslintrc.js` — `ignorePatterns: ['coverage/']`, que era a única fonte de warnings do
  `npm run lint`.

## Arquivos modificados

- `app/src/presentation/App.tsx` — SafeAreaProvider, StatusBar, tema de navegação
- `app/src/presentation/screens/ActivationScreen.tsx` — estilização completa + estado busy
- `app/src/presentation/screens/DashboardScreen.tsx` — estilização + tratamento de erro de fetch
- `app/src/presentation/screens/MapScreen.tsx` — chip ativo legível, botões de modal, catch de
  fetch, safe area inferior
- `app/jest.config.js` — `setupFiles`
- `app/.eslintrc.js` — ignora `coverage/`

## Arquivos criados

- `app/src/presentation/theme.ts` — paleta e espaçamentos compartilhados
- `app/src/presentation/components/PrimaryButton.tsx` — botão padrão do app
- `app/jest.setup.js` — mock global do safe-area-context

## Decisões técnicas

- **`react-native-safe-area-context` em vez de padding manual com `StatusBar.currentHeight`** — a
  lib já estava instalada (dependência do React Navigation), resolve as duas bordas e reage a
  rotação/recortes; padding manual só cobriria o topo.
- **O `busy` da Activation e os `.catch` do Dashboard/Map são mudanças de comportamento pequenas
  embutidas numa task de estilo**, registradas aqui em vez de virarem ciclos TDD próprios: os
  testes existentes continuam passando sem alteração (nenhum exercitava duplo-toque nem fetch
  rejeitado nessas telas), e o custo de um ciclo dedicado não se pagava no tamanho da mudança.
- **Limitação conhecida, deixada de fora do escopo:** o Dashboard não recarrega ao voltar do mapa
  — uma quadra marcada só aparece em "Territórios trabalhados" na próxima abertura do app.
  Corrigir exige recarregar no foco da navegação (`useIsFocused`/listener), que mexe no contrato
  de teste das telas; fica anotado como melhoria futura.

## Como validar

```bash
cd app
npm test           # 62 testes, 10 suítes
npx tsc --noEmit
npm run lint
cd android && ./gradlew assembleRelease
```

Depois, reinstalar `app/android/app/build/outputs/apk/release/app-release.apk` no aparelho e
conferir visualmente: status bar respeitada na Activation, campo e botão visíveis, Dashboard em
cartões, chips do filtro legíveis no estado ativo.

## Resultado da validação

- `npx jest` → 62/62 passando (10 suítes), nenhum teste alterado.
- `npx tsc --noEmit` → limpo (o RN 0.87 removeu `backgroundColor`/`translucent` do `StatusBar`;
  o código usa só `barStyle`, que é o que resta no Android edge-to-edge).
- `npm run lint` → zero erros e zero warnings.
- `./gradlew assembleRelease` → `BUILD SUCCESSFUL`, `app-release.apk` (109M) regenerado.
- Verificação visual no aparelho: **pendente com o usuário** — é o passo que motiva o APK novo.
