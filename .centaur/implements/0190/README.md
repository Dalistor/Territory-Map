# [0190] UX do app admin: paleta única na BlocksScreen e área segura no overlay

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0013/` — Task 07

## Solicitação

> Spec 0013 — Task 07: Duas correções de UX, e **apenas estas duas** — leia a seção "Escopo das
> correções de UX" da spec 0013 antes de começar: quem escreveu a spec nunca viu este app rodando,
> então não invente melhorias visuais que não estejam aqui. Não altere layout, tamanho ou
> hierarquia de nenhum elemento além do que estas duas correções exigem.
>
> **(a) Paleta única.** `admin-app/src/presentation/screens/BlocksScreen.tsx` ficou com cerca de 21
> cores literais em hexadecimal, enquanto `SetupScreen.tsx` e `AssignmentPanel.tsx` usam
> `admin-app/src/presentation/theme.ts`. Substitua cada literal pelo token equivalente de `colors`,
> `spacing` e `radius`. (…) **Exceção explícita:** as cores de status da quadra (`#c62828`,
> `#ef6c00`, `#2e7d32`) **não** entram no tema.
>
> **(b) Área segura.** O overlay de painéis de `DesignationsScreen.tsx` desenha sobre a tela inteira
> sem respeitar os recortes do aparelho. Envolva-o com o `SafeAreaView` de
> `react-native-safe-area-context`.

## Contexto

A `BlocksScreen` foi escrita antes de o `theme.ts` do `admin-app` existir — o comentário no topo do
seu `StyleSheet` dizia isso com todas as letras ("`admin-app/` has no `theme.ts` yet"). Desde então
`SetupScreen`, `AssignmentPanel` e a própria `DesignationsScreen` passaram a consumir o tema, e a
`BlocksScreen` ficou como a única tela com a paleta duplicada em hexadecimal — mesma cor, fonte
diferente, que é exatamente o jeito de as telas passarem a destoar no primeiro ajuste de paleta.

O overlay da `DesignationsScreen` é `position: 'absolute'` com `top/bottom/left/right: 0`, ou seja,
desenha sobre a tela inteira, inclusive sob a barra de status e sob a barra de gestos — o botão
"← Voltar", que fica no topo do overlay, era o mais afetado.

## O que foi feito

**(a)** Trocados os 21 literais de cor da `BlocksScreen` pelos tokens de `../theme`, e os valores
numéricos de espaçamento/raio que têm token exato pelos tokens correspondentes. Nenhuma cor nova
foi acrescentada ao tema, e as cores de status da quadra não entraram nele — elas continuam vindo
de `BLOCK_CATEGORY_COLOR` em `domain/territoryMap.ts`, e a `BlocksScreen` nem as usa (mostra o
status por extenso, via `blockStatusLabel`). O comentário do `StyleSheet`, que afirmava que o tema
não existia, foi reescrito.

**(b)** O overlay da `DesignationsScreen` passou de `View` para o `SafeAreaView` de
`react-native-safe-area-context`, com o mesmo estilo `styles.overlay`. O comentário que já explicava
por que o overlay cobre a lista em vez de substituí-la ganhou a razão do `SafeAreaView`.

## Arquivos modificados

- `admin-app/src/presentation/screens/BlocksScreen.tsx` — `import { colors, radius, spacing } from
  '../theme'`; todos os literais de cor do `StyleSheet` trocados por tokens; `8`/`16`/`4` de
  espaçamento viraram `spacing.sm`/`spacing.md`/`spacing.xs` e `8`/`12` de raio viraram
  `radius.sm`/`radius.md`; comentário do `StyleSheet` reescrito.
- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — `import { SafeAreaView } from
  'react-native-safe-area-context'`; o overlay do detalhe passou a ser um `SafeAreaView`; comentário
  do overlay complementado.

## Arquivos criados

Nenhum.

## Decisões técnicas

- **Só os números que têm token exato viraram token.** `spacing` só nomeia 4/8/16/24/32/40 e
  `radius` 4/8/12/16/24; paddings de 12, 14, 10 e margens de 6 ficaram como número. Arredondá-los
  para o token mais próximo mudaria o tamanho dos elementos, e a task proíbe alterar layout e
  tamanho. A instrução de "usar o token mais próximo" foi lida como valendo para **cor** — onde
  aproximar é imperceptível e o ganho é a paleta única —, não para medida, onde aproximar é
  justamente a mudança de layout vedada.
- **Nenhum estilo morto foi removido.** A `BlocksScreen` ainda declara estilos que hoje só o
  `BlockWorkSection` usaria (`dateButton`, `markButton`, `logRow`, `error`, `note`, `publisherRow`
  etc.). Apagá-los seria uma limpeza correta, mas é outra mudança, fora do escopo desta task; eles
  foram tokenizados junto com o resto para não deixar meia paleta no arquivo.
- **`SafeAreaView` só no overlay.** A tela de baixo não foi envolvida: ela não é a que sobrepõe os
  recortes, e mexer nela alteraria o layout do mapa e da lista, que a task proíbe.

## Como validar

Abrir a tela Designações, tocar num território (ou em "Quadras") e conferir, num aparelho com
notch/barra de gestos, que o "← Voltar" não fica sob a barra de status e o fim do painel não fica
sob a barra de gestos. Na lista de quadras, conferir que as cores continuam as mesmas — a mudança é
de origem do valor, não de valor.

## Resultado da validação

Rodado em `admin-app/`, logo após as duas mudanças:

- `npx tsc --noEmit` — sem erro.
- `npm test` — **14 suítes, 245 testes, todos passando**. Nenhum teste foi alterado, como a task
  exigia.
- `npx eslint` nos dois arquivos tocados — limpo.

`npm run lint` no projeto inteiro acusou, no momento da execução, dois `no-unused-vars` em
`DesignationsScreen.test.tsx` (`TERRITORY_SCOPE_NOTE`, `makeBlock`) e depois mais dois em
`DesignationsScreen.tsx` (`Block`, `BlockPanel`). **Nenhum deles vem desta task**: são a Task 06
("Ligar o toque na quadra ao painel"), que roda em paralelo e estava com os imports e o teste já
escritos e a ligação ainda não. Os arquivos desta task estão limpos; corrigir aqueles quatro seria
desfazer o trabalho em andamento da Task 06.
