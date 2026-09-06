# [0183] App admin: a tela de Designações, mapa e lista (spec 0012, Task 10)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0012/` — Task 10

## Solicitação

> Spec 0012 — Task 10: Implemente por TDD
> `admin-app/src/presentation/screens/DesignationsScreen.tsx` e `DesignationsScreen.test.tsx`, e
> substitua nela o placeholder que a Task 08 deixou em `App.tsx`. Leia antes
> `admin/src/renderer/screens/DesignationsScreen.tsx` — é o comportamento a espelhar, menos a
> exportação para Excel e menos o import/export S-13, que ficam fora do escopo desta spec.
>
> A tela carrega os territórios com `session.run(() => api.listTerritoriesWithBlocks())` (as duas
> recebidas por prop ou contexto, para o teste injetar fakes), mostra no topo um resumo de quantos
> territórios têm dirigente, o `AssignmentsMapView` da Task 09 e, abaixo, a lista de territórios com
> nome e dirigente atual. Tocar num território — no mapa ou na lista — abre o painel S-13 da Task
> 11. Há um "Recarregar" e um caminho para a tela de quadras da Task 12.

## Contexto

Era a última peça de tela da spec 0012: a Task 08 deixou `App.tsx` renderizando um placeholder
("Territórios e designações aparecem aqui.") exatamente para esta task substituir. As três coisas
que ela costura já existiam prontas — o mapa (`AssignmentsMapView`, Task 09), o painel S-13
(`AssignmentPanel`, Task 11) e a tela de quadras (`BlocksScreen`, Task 12) —, mas nenhuma delas
tinha quem as abrisse: sem esta tela, o app admin instalado no celular abria numa frase e não
chegava a nenhuma das outras.

O comportamento espelha a página Designações do admin desktop, menos a exportação para Excel e o
import/export S-13/T, que a spec 0012 deixou fora de escopo de propósito (continuam só no
computador).

## Critérios de aceite

- Enquanto carrega, aparece o indicador de carregando e nenhuma lista.
- Carregado, cada território aparece na lista com seu nome e o nome do dirigente; um sem designação
  aparece como "Sem dirigente".
- O resumo do topo diz quantos dos quantos têm dirigente, e bate com os dados carregados.
- Sem território nenhum, aparece um texto explicando que os territórios são criados no admin do
  computador — e não uma lista vazia sem explicação.
- Falha ao carregar mostra a mensagem do erro numa região acessível ao leitor de tela e oferece
  "Recarregar"; tocar em "Recarregar" chama a API de novo.
- Tocar num território da lista abre o painel daquele território, e não de outro.
- Depois de uma ação do painel que muda a designação, a lista reflete o novo dirigente sem precisar
  sair e voltar da tela.

Derivados durante a implementação, além da lista acima:

- Tocar num território **no mapa** abre o mesmo painel que a linha da lista abre.
- Existe um caminho para as quadras do território, e ele não abre o cartão S-13 junto.
- "Voltar" fecha o detalhe e devolve a lista.
- Uma falha sem mensagem própria (uma string lançada, um `undefined` rejeitado) ainda diz alguma
  coisa legível.
- Um território que sumiu da lista recarregada fecha o próprio detalhe em vez de exibir um cartão do
  que não existe mais.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | shows only the loading indicator while the territories have not arrived | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | O esqueleto da tela, a leitura por `session.run` e o estado de carregando |
| 2 | lists every territory with its name and the publisher holding it | idem | A lista ordenada por nome, com `NO_LEADER_LABEL` para quem não tem dirigente |
| 3 | summarises how many of the territories have a publisher on them | idem | O resumo "N de M territórios designados" no cabeçalho |
| 4 | explains where territories come from instead of showing a bare empty list | idem | `NO_TERRITORIES_MESSAGE` |
| 5 | reports a failed load to the screen reader and offers to try again | idem | `loadError` em `accessibilityRole="alert"` e o botão "Recarregar" |
| 6 | asks the API again when "Recarregar" is tapped, and clears the failure it succeeded past | idem | (verde na primeira execução — ver "Decisões técnicas") |
| 7 | opens the S-13 panel of the territory that was tapped, and not of another | idem | A linha virou botão e abriu o `AssignmentPanel` num overlay |
| 8 | shows the new leader in the list as soon as the panel designates one | idem | (verde na primeira execução — ver "Decisões técnicas") |
| 9 | hands the loaded territories to the map and opens the panel of one tapped there | idem | O `AssignmentsMapView` na tela, com `onSelectTerritory` |
| 10 | opens the blocks of a territory from its own row | idem | O estado `TerritoryDetail` (`assignments`/`blocks`) e a `BlocksScreen` no overlay |
| 11 | comes back to the list from a territory that was open | idem | (verde na primeira execução — o "← Voltar" já existia do ciclo 7) |
| 12 | says something readable when the failure carries no message of its own | idem | (cobre o fallback de `errorMessage`) |
| 13 | closes the detail of a territory that is no longer in the reloaded list | idem | (cobre a guarda que resolve o detalhe pela lista atual) |

## O que foi feito

- **`DesignationsScreen`**: cabeçalho com o resumo e "Recarregar"; o `AssignmentsMapView` com os
  territórios carregados; abaixo, a lista, cada linha com nome, dirigente (ou "Sem dirigente") e um
  botão "Quadras". Tocar na linha ou no território no mapa abre o cartão S-13; tocar em "Quadras"
  abre a `BlocksScreen`. O detalhe abre num **overlay** sobre a lista, com "← Voltar".
- **`App.tsx`**: o placeholder da Task 08 foi trocado pela tela de verdade
  (`renderDesignationsScreen`), que recebe a sessão **guardada** por `withCredentialsGuard` — uma
  credencial recusada dentro do painel ou das quadras continua devolvendo o app ao setup.
- **`App.test.tsx`**: passou a reconhecer a home pela mensagem de congregação vazia da tela nova
  (`NO_TERRITORIES_MESSAGE`) e a injetar um `api` fake em cada render, porque o default de `App` é
  um `createApiClient()` de verdade e a tela agora faz uma requisição ao montar.
- **`jest.setup.js`**: o mock global do MapLibre estava na superfície da v10 (`MapView`,
  `ShapeSource`, `FillLayer`…) enquanto `AssignmentsMapView` importa a da v11 (`Map`, `Layer`,
  `GeoJSONSource`, `Marker`, `TransformRequestManager`). Enquanto ninguém renderizava o mapa num
  teste, isso não aparecia; com a tela nova dentro de `App.test.tsx`, os componentes ausentes viravam
  `undefined` e derrubavam seis testes. O mock foi reescrito para os nomes que o código usa, com
  `forwardRef` no `Camera` (o mapa segura um ref e chama `fitBounds` nele).

## Arquivos modificados

- `admin-app/src/presentation/App.tsx` — o placeholder da Task 08 deu lugar à `DesignationsScreen`
- `admin-app/src/presentation/App.test.tsx` — `api` fake em cada render e a home reconhecida pela
  mensagem da tela nova
- `admin-app/src/presentation/screens/index.ts` — reexporta a tela e seus tipos
- `admin-app/jest.setup.js` — mock do MapLibre atualizado para a superfície v11 realmente importada

## Arquivos criados

- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — a tela principal do app admin
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — os treze casos acima

## Decisões técnicas

- **O detalhe é um overlay sobre a lista, não uma troca de tela.** A lista continua montada por
  baixo, e é isso que faz o critério "a lista reflete o novo dirigente sem sair e voltar" ser
  verificável de verdade: o teste observa a linha mudar enquanto o painel ainda está aberto. De
  quebra, o mapa não desmonta e não refaz o enquadramento da câmera quando o admin fecha o painel.
- **O território aberto é guardado por `id`, não por objeto.** Toda ação do painel recarrega a lista,
  e segurar o objeto deixaria o painel preso à cópia buscada antes da mudança. O objeto é resolvido
  na lista corrente a cada render — e é essa resolução que fecha o detalhe sozinho quando o
  território some.
- **Um único estado `TerritoryDetail` com `view: 'assignments' | 'blocks'`.** São duas perguntas
  sobre o mesmo território; dois estados separados permitiriam empilhar as duas telas.
- **O mapa é substituído por um stub no teste da tela.** `AssignmentsMapView` é a exceção sem teste
  automatizado já registrada no `AGENTS.md` (view nativa do MapLibre). O stub é **tipado com as props
  reais**, então renomear uma prop do mapa quebra o teste em tempo de compilação em vez de
  silenciosamente. Que o mapa de verdade monta continua sendo provado por `App.test.tsx`, que o
  renderiza sem stub.
- **`session.run` embrulha só a leitura desta tela.** O painel e a tela de quadras recebem `session`
  e `api` e fazem as próprias chamadas — a tela não centraliza requisição de ninguém, só passa os
  dois colaboradores adiante.
- **Três testes ficaram verdes na primeira execução** (ciclos 6, 8 e 11), porque o GREEN do ciclo
  anterior já tinha trazido o botão "Recarregar", o `onChanged={load}` e o "← Voltar" junto com o
  mínimo que aquele ciclo exigia. Cada um foi verificado por mutação antes de ser aceito — removendo
  `onChanged={load}` do código, o teste do ciclo 8 falha (confirmado rodando a suíte com a linha
  removida). São testes de comportamento real, não asserções vazias.
- **Fora de teste, de propósito:** os quatro ramos `pressed && styles.pressed` dos `Pressable`
  (realce visual ao toque). São aparência, e um teste sobre eles afirmaria só que o `StyleSheet` foi
  aplicado.

## Como validar

```bash
cd admin-app
npx jest src/presentation/screens/DesignationsScreen.test.tsx src/presentation/App.test.tsx
npm test           # suíte inteira
npx tsc --noEmit
npm run lint
```

## Resultado da validação

- `npx jest` → **13 suítes, 208 testes, todos passando** (eram 12 suítes e 195 testes antes desta
  task; 13 vieram da tela nova).
- `npx jest --coverage` nos arquivos tocados:
  - `DesignationsScreen.tsx` — **100%** de statements, linhas e funções; **88,88%** de branch (os
    quatro ramos descobertos são os `pressed && styles.pressed`).
  - `App.tsx` — 100% de statements, linhas e funções; 85% de branch, inalterado por esta task.
- `npx tsc --noEmit` → sem erro.
- `npm run lint` → sem warning.
