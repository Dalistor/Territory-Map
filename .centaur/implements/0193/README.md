# [0193] Números das quadras vazando para o header, e concluir designação pela linha

**Data:** 2026-08-26
**Status:** Concluído
**Modo:** direto

## Solicitação

Relato do usuário depois de rodar o app no aparelho:

> 1 - Os icones das quadras estão aparecendo no header.
> 2 - Deve aparecer o numero das quadras de cada territorio e marcaar como concluido
> 3 - A list ade quadras deve ser enumerada crescentemente pelos numeros, igual ao admin atualmente.

Esclarecido: o item 2 é a **quantidade** de quadras na linha do território, mais um
"Marcar como concluído" ali mesmo. O item 3 ficou **em aberto** — ver abaixo.

## Contexto

Primeiro retorno de alguém que de fato viu o app rodando. Até aqui o `admin-app/` tinha sido
escrito inteiro contra testes de Jest, sem nenhuma tela verificada em aparelho (falta de JDK na
máquina, registrada nas specs 0012 e 0013). Os dois primeiros itens são exatamente o tipo de coisa
que teste de unidade não pega: um é recorte de view nativa, o outro é uma ação que faltava.

## O que foi feito

### 1. Os números das quadras vazando para o header

`styles.map` da `DesignationsScreen` era `{ height: 260 }`, sem `overflow: 'hidden'`. Os números
das quadras são `Marker` do MapLibre, que em React Native são **views nativas posicionadas sobre o
mapa** — e o Android **não recorta filhos aos limites do pai** por conta própria. Quadra cuja
coordenada caía acima da borda superior do mapa era desenhada para fora dele, em cima do header.

Corrigido com `overflow: 'hidden'` no contêiner do mapa, com o porquê comentado no próprio estilo.
Era o único contêiner do projeto que hospedava views absolutamente posicionadas sem recorte.

### 2. Quantidade de quadras e "Marcar como concluído" na linha

Cada linha da lista de territórios passou a mostrar quantas quadras o território tem, por
`blockCountLabel`: `"Sem quadras"`, `"1 quadra"`, `"N quadras"` — as três formas, porque "1 quadras"
seria ruído numa lista que é percorrida inteira.

E ganhou um **"Marcar como concluído"**, que encerra a designação em vigor sem passar pelo cartão
S-13. Só aparece onde há designação a encerrar (`assignedPublisher !== null`): oferecer o botão num
território que ninguém tem convidaria a um toque que não faz nada. A confirmação usa **a mesma
frase, palavra por palavra**, que o `AssignmentPanel` já mostra para o mesmo evento — concluir pela
linha e concluir pelo cartão são o mesmo fato e devem avisar da mesma consequência.

## Arquivos modificados

- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — `overflow: 'hidden'` no mapa;
  `blockCountLabel` (exportada); `completeConfirmMessage`; `requestComplete`; a contagem e o botão
  na linha; o estilo `blockCount`
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — 5 casos novos, mais os helpers
  `lastAlert`/`confirmLastAlert` e o mock de `Alert`, espelhados de `AssignmentPanel.test.tsx`

## Decisões técnicas

**A contagem vem de `territory.blocks.length`, não de uma chamada nova.** `listTerritoriesWithBlocks`
já traz as quadras de cada território — é o que alimenta o mapa. Buscar de novo só para contar seria
uma requisição por território sem nada em troca.

**O botão não recarrega quando a escrita falha.** Uma conclusão recusada não mudou nada no servidor,
e recarregar apagaria da tela o aviso antes de o admin lê-lo. Há teste para isso.

**Testes escritos depois do código, não por TDD.** São duas correções pequenas vindas de um relato
de campo, e o rigor foi calibrado por isso. Os casos foram verificados **por mutação**: removida a
guarda `assignedPublisher !== null`, o teste correspondente falha.

## O que ficou em aberto

**O item 3 do relato não foi resolvido, e não foi por falta de tentativa.** O usuário confirmou que
a lista fora de ordem é a que abre pelo botão "Quadras" — a `BlocksScreen`. Mas ela **já ordena**
por número crescente (`BlocksScreen.tsx`, `[...current.blocks].sort((a, b) => a.number - b.number)`),
o render usa a lista ordenada, e existe teste passando (`'lista as quadras em ordem crescente de
número, mesmo que a API devolva fora de ordem'`). Também conferido: `parseBlock` não converte
`number`, mas o servidor o serializa como inteiro, e comparação numérica de strings numéricas daria
o mesmo resultado.

Ou seja: não há defeito localizável por leitura. Falta o dado que só quem está com o aparelho tem —
**qual ordem aparece na tela**. Enquanto isso não vier, mexer no código seria adivinhar.

## Como validar

No aparelho: abrir o app, aproximar o mapa até os números das quadras chegarem à borda superior —
eles devem ser cortados pela borda do mapa, sem invadir o header. Na lista, cada território deve
dizer quantas quadras tem, e os que têm dirigente devem oferecer "Marcar como concluído".

## Resultado da validação

- `npm test` → **14 suítes, 256 testes passando** (eram 251; 5 novos)
- `npx tsc --noEmit` e `npm run lint` → limpos, sem warning
- Mutação: trocando a guarda do botão por `true`, o teste
  `'só oferece "Marcar como concluído" na linha de território que tem dirigente'` falha, e só ele
- `./gradlew assembleRelease` → APK gerado
