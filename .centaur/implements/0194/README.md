# [0194] Ordem da lista de territórios, rótulos de território sempre visíveis, tocar num território abre as quadras, e mapa embutido na tela de quadras

**Data:** 2026-08-26
**Status:** Concluído
**Modo:** direto

## Solicitação

Relato de campo, junto com uma captura de tela da lista de territórios (5 de 28 designados: "Casarotto -N28",
"Centro - N5", "Centro - N6", ...):

> preciso que essa lista de territórios esteja organizada em ordem crescente, e que no mapa apareça
> os balões de cada território (rollback). E ao clicar nele deve abrir a página de histórico de
> trabalho e as quadras trabalhadas. Só que mostrando no mapa o território junto com as quadras e
> suas numerações

## Contexto

Segundo retorno do app rodando no aparelho, depois de [0193](../0193/README.md). Três pedidos
distintos, todos sobre a `DesignationsScreen` e a `BlocksScreen` do `admin-app/`.

## O que foi feito

### 1. Ordem da lista de territórios

A lista ordenava por `a.name.localeCompare(b.name, {numeric: true})` — alfabética, com o
`numeric: true` só cuidando de não pôr "Território 10" antes de "Território 9". Isso explicava a
captura: "Casarotto -N28" lia antes de "Centro - N5" porque "a" < "e", mesmo o 28 sendo maior que 5
e 6.

O admin desktop já tinha resolvido exatamente este problema — `compareTerritoriesByNumber` em
`admin/src/shared/models.ts`, testado, e usado em quatro lugares (`HomeScreen`, `HistoryScreen`,
`docx-handler.ts`, `excel-export.ts`) desde antes desta spec. Portei a função (e sua companheira
`territoryNumber`) **verbatim** para `admin-app/src/domain/models.ts`, com os mesmos testes, e troquei
a chave de ordenação da `DesignationsScreen` para ela.

A regra: lê o **último** grupo de dígitos do nome ("Cambé 3 - N1" → 1, não 3), ordena por esse
número, e só usa o nome como desempate quando dois territórios têm o mesmo número ou nenhum dos
dois tem número. Territórios sem número vão para o fim, alfabéticos entre si.

### 2. Rótulos de território sempre visíveis no mapa (rollback da spec 0013)

A spec 0013 escondia o balão do nome do território sempre que havia quadra desenhada
(`shouldShowTerritoryLabels`), porque o balão é ancorado no centroide, exatamente onde os números
das quadras ficam. Era a correção para um relato anterior de balão sobrepondo número.

Com 28 territórios na mesma tela, o efeito colateral pesou mais que o problema: sem o rótulo, o
admin não tinha como saber a qual território pertencia cada aglomerado de quadras coloridas.
Removi `shouldShowTerritoryLabels` — função e teste, em vez de deixá-la como um `true` fixo, já que
vira código morto sem uso — e o `AssignmentsMapView` volta a desenhar todos os rótulos
incondicionalmente.

### 3. Tocar num território no mapa abre a tela de Quadras, não o cartão S-13

`onSelectTerritory` no mapa principal levava a `view: 'assignments'` (o `AssignmentPanel`, o cartão
S-13). Passou a levar a `view: 'blocks'` (a `BlocksScreen`) — no mapa o admin já está olhando as
quadras, e a pergunta natural ali é "o que foi trabalhado", não "quem é o responsável".

Designar não ficou mais difícil de alcançar: a **lista** continua abrindo o cartão S-13 pela linha
do território (comportamento inalterado), e a Task 0193 já tinha posto ali mesmo a contagem de
quadras e o "Marcar como concluído". Tocar numa **quadra** no mapa continua abrindo o painel
combinado (`BlockPanel`), sem mudança — só o toque no território (fora de qualquer quadra) mudou de
destino.

### 4. Mapa embutido na tela de Quadras

`BlocksScreen` ganhou um `AssignmentsMapView` no topo, mostrando só o território em vista
(`territories={[current]}`). Como o componente já desenha o que receber — demarcação, quadras
numeradas e coloridas —, isso não exigiu nenhum código de mapa novo: é o mesmo componente do mapa
principal, alimentado com uma lista de um território só. Tocar numa quadra ali abre a mesma
`BlockWorkSection` que tocar na linha dela na lista abre. O mapa só aparece quando o território tem
quadra; sem nenhuma, `NO_BLOCKS_MESSAGE` continua sendo tudo que a tela mostra.

## Arquivos modificados

- `admin-app/src/domain/models.ts` — `territoryNumber` e `compareTerritoriesByNumber`, portadas de
  `admin/src/shared/models.ts`
- `admin-app/src/domain/models.test.ts` — os testes dessas duas funções, portados junto
- `admin-app/src/domain/territoryMap.ts` — `shouldShowTerritoryLabels` removida
- `admin-app/src/domain/territoryMap.test.ts` — o `describe('shouldShowTerritoryLabels', ...)`
  removido, e o import ajustado
- `admin-app/src/presentation/map/AssignmentsMapView.tsx` — rótulos de território sempre
  renderizados; comentário do topo do arquivo reescrito para explicar o rollback
- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — ordenação por
  `compareTerritoriesByNumber`; `onSelectTerritory` do mapa aponta para `view: 'blocks'`;
  `fallbackCenter` repassado ao `BlocksScreen`
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — dois testes existentes
  reescritos para o novo destino do toque no território; um teste novo cobrindo o caso exato da
  captura de tela ("Casarotto -N28" depois de "Centro - N5"/"N6")
- `admin-app/src/presentation/screens/BlocksScreen.tsx` — o mapa embutido, `mapTerritories`,
  `handleSelectBlock`, a prop `fallbackCenter`, o estilo `map`
- `admin-app/src/presentation/screens/BlocksScreen.test.tsx` — mock de `AssignmentsMapView` e três
  testes novos (mapa aparece só com quadra, toque no mapa abre/fecha a mesma seção)
- `AGENTS.md` e `admin-app/README.md` — os três comportamentos revertidos/alterados, com a data e o
  porquê

## Decisões técnicas

**`territoryNumber`/`compareTerritoriesByNumber` portadas, não importadas.** `admin-app/` não
compartilha pacote com `admin/` nem com `app/`, por decisão já registrada no `AGENTS.md` — cada
cliente TypeScript tem sua própria cópia da lógica que só ele usa. É a mesma dinâmica que a regra de
cor da quadra já vive, agora com uma quarta função duplicada de propósito (a desta vez só nos dois
admins, não nos três clientes).

**`shouldShowTerritoryLabels` foi apagada, não deixada como stub `true`.** O `AGENTS.md` do projeto
pede para deletar código confirmadamente morto em vez de deixar vestígio — uma função que sempre
devolve `true` e nunca mais é chamada condicionalmente não ensina nada a quem ler depois.

**O toque na quadra dentro do mapa embutido reusa `openBlockId`**, o mesmo estado que o toque na
linha já usa — não há um segundo mecanismo de abrir/fechar painel. Tocar a mesma quadra duas vezes
(uma no mapa, outra na linha, em qualquer ordem) fecha o que estava aberto, porque os dois caminhos
alteram o mesmo `id`.

**Os dois mapas (principal e o da `BlocksScreen`) ficam montados ao mesmo tempo** quando a tela de
Quadras está aberta, porque a `DesignationsScreen` mantém a lista (e o mapa principal) montada por
baixo do overlay para não perder a posição da câmera. São duas instâncias nativas de MapLibre
simultâneas nesse momento — mais custo de renderização que antes, quando `BlocksScreen` não tinha
mapa nenhum. Não medi o impacto num aparelho real; é a troca que a spec 0013 já fazia entre ter o
mapa sempre pronto e o custo de mantê-lo vivo, agora dobrada.

## Como validar

No aparelho: a lista de territórios deve ler em ordem de número crescente, não alfabética. No mapa
principal, os nomes de todos os territórios devem aparecer, mesmo com quadras à vista. Tocar num
território no mapa (fora de uma quadra) deve abrir a tela de Quadras, com um mapa no topo mostrando
só aquele território e suas quadras numeradas; tocar numa quadra ali deve abrir o histórico de
trabalho dela, igual a tocar na linha da lista abaixo.

## Resultado da validação

- `npm test` → **14 suítes, 266 testes passando** (eram 256; 10 novos)
- `npx tsc --noEmit` e `npm run lint` → limpos, sem warning
- Mutação, ordem da lista: revertendo `compareTerritoriesByNumber` para o `localeCompare` antigo, o
  teste `'ordena a lista pelo número do território...'` falha, e só ele
- Mutação, destino do toque: revertendo `view: 'blocks'` para `view: 'assignments'`, os dois testes
  correspondentes falham, e só eles
- `./gradlew assembleRelease` → APK gerado (log em segundo plano; ver mensagem ao usuário para o
  resultado)
