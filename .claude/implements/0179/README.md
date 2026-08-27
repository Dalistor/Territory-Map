# [0179] App admin: quadras do território e marcar como trabalhada (spec 0012, Task 12)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0012/` — Task 12

## Solicitação

> Spec 0012 — Task 12: Implemente por TDD `admin-app/src/presentation/screens/BlocksScreen.tsx` e
> `BlocksScreen.test.tsx`. Leia antes a tabela de quadras de
> `admin/src/renderer/screens/TerritorySettingsScreen.tsx`,
> `admin/src/renderer/screens/BlockWorkPanel.tsx` e `admin/src/renderer/screens/MarkWorkedForm.tsx`
> — é o comportamento a espelhar, **menos** apagar registro e **menos** forçar status, que ficam
> fora do escopo desta spec e continuam só no desktop.
>
> A tela recebe um `Territory`, lista as quadras dele **ordenadas por número**, cada uma com o
> número, o status por extenso (use `blockStatusLabel` da Task 03, passando o `rotationDays` do
> território) e a data da última visita. Tocar numa quadra expande o histórico de trabalho dela
> (`listWorkLogs`) e o formulário de marcar: um seletor de publicador (de `listPublishers`) e um
> seletor de data com `@react-native-community/datetimepicker`, começando em hoje. Confirmar chama
> `markWorked(blockId, publisherId, workedAt)` por `session.run`.
>
> Duas regras do servidor que a tela precisa respeitar e explicar: **data no futuro é recusada**, e
> o publicador escolhido **não** precisa ser o dirigente do território. Escreva na tela que um
> registro novo desfaz um status que tenha sido forçado no computador.

## Contexto

O app admin Android (`admin-app/`, spec 0012) existe para o responsável pelos territórios fazer em
campo o que hoje só o desktop faz na mesa. Esta é a tela do único **lançamento de trabalho** que o
app admin permite: o publicador esqueceu de marcar, entregou o cartão em papel, ou não usa o app —
e quem está com o território na frente é o admin.

O comportamento vem de três telas do desktop somadas: a tabela de quadras da
`TerritorySettingsScreen` (número, status por extenso, última visita, e a linha que expande), a
metade de histórico do `BlockWorkPanel`, e o `MarkWorkedForm` (publicador + data). O que **não**
veio, por decisão da spec: apagar registro de trabalho e forçar `status_override`. Ler um status
forçado continua aqui — o rótulo diz "(forçado)" — porque o admin precisa entender a cor que está
vendo.

## Critérios de aceite

- As quadras aparecem ordenadas por número crescente, mesmo que a API devolva fora de ordem.
- Cada quadra mostra o status por extenso; uma sem visita mostra "Nunca trabalhada" e nenhuma data;
  uma com visita mostra a data da última.
- Território sem quadra nenhuma mostra um texto explicando que as quadras são desenhadas no admin do
  computador.
- Tocar numa quadra carrega e mostra o histórico de trabalho dela, com nome e data de cada registro,
  mais recente primeiro; tocar de novo fecha.
- O botão de marcar fica desabilitado enquanto nenhum publicador estiver escolhido.
- A data começa em hoje, e escolher uma data no futuro desabilita o marcar com uma explicação
  visível — sem depender de o servidor recusar.
- Confirmar chama `markWorked` uma vez, com o id da quadra tocada, o publicador escolhido e a data
  escolhida; enquanto pendente, o botão não dispara uma segunda chamada.
- Sucesso recarrega a quadra, e o status e a última visita passam a refletir o registro novo.
- Erro do servidor aparece numa região acessível ao leitor de tela, e o formulário mantém o que foi
  digitado.

## Ciclos TDD

Todos os testes vivem em `admin-app/src/presentation/screens/BlocksScreen.test.tsx`.

| # | Caso de teste | Código que passou a existir |
|---|---------------|------------------------------|
| 1 | lista as quadras em ordem crescente de número, mesmo que a API devolva fora de ordem | `BlocksScreen` com a lista ordenada por `number` |
| 2 | mostra "Nunca trabalhada" e nenhuma data numa quadra que nunca foi visitada | rótulo por `blockStatusLabel` e a data só quando há `lastWorkedAt` |
| 3 | mostra o status por extenso e a data da última visita numa quadra já trabalhada | — (mesma linha do ciclo 2, variação de dado) |
| 4 | usa a rotação do território para decidir o status, não o padrão de 120 dias | — (`rotationDays` já repassado no ciclo 2) |
| 5 | explica onde as quadras são desenhadas quando o território não tem nenhuma | `NO_BLOCKS_MESSAGE` |
| 6 | carrega e mostra o histórico da quadra tocada, mais recente primeiro | `BlockWorkSection` com `listWorkLogs` por `session.run` e ordenação decrescente |
| 7 | fecha o painel ao tocar de novo na mesma quadra | `openBlockId` alternado pela própria linha |
| 8 | mantém o botão de marcar desabilitado enquanto nenhum publicador estiver escolhido | seletor de publicador (`listPublishers`) e o `disabled` do botão |
| 9 | começa a data em hoje | estado `workedAt`, o botão "Data:" e o `DateTimePicker` |
| 10 | desabilita o marcar e explica quando a data escolhida está no futuro | `isInTheFuture` + `FUTURE_DATE_MESSAGE` |
| 11 | aceita uma data anterior a hoje | — (o outro lado do limiar do ciclo 10) |
| 12 | confirma chamando markWorked uma vez, com a quadra, o publicador e a data escolhidos | `markWorked()` no painel e `reloadTerritory` na tela |
| 13 | não dispara uma segunda chamada enquanto a marcação está pendente | — (o `isMarking` do ciclo 12; verificado por mutação, ver abaixo) |
| 14 | recarrega a quadra depois de marcar, e a linha passa a refletir o registro novo | — (o `onMarked`/`refreshed` do ciclo 12; verificado por mutação) |
| 15 | mostra o erro do servidor numa região acessível e preserva o que foi escolhido | — (o `catch` do ciclo 12; verificado por mutação) |
| 16 | diz que o publicador não precisa ser o dirigente e que o registro desfaz o status forçado | `ANY_PUBLISHER_NOTE` e `OVERRIDE_NOTE` |
| 17 | mostra o erro quando o histórico da quadra não carrega | — (cobertura do `catch` de `loadLogs`) |
| 18 | mostra o erro quando a lista de publicadores não carrega | — (cobertura do `catch` do efeito de publicadores) |
| 19 | avisa que o registro foi gravado quando só a recarga da quadra falha | — (cobertura de `RELOAD_ERROR_MESSAGE`) |
| 20 | mantém a data quando o seletor é fechado sem escolher nada | — (cobertura do `picked !== undefined`) |
| 21 | usa o relógio real quando nenhum "hoje" é informado | — (cobertura do `now ?? new Date()`) |
| 22 | não escreve nada depois que o painel é fechado com a carga ainda em voo | — (cobertura da guarda `cancelled`) |
| 23 | não mostra erro de uma carga que falhou depois de o painel ser fechado | — (o outro braço da guarda `cancelled`) |

**Três ciclos passaram sem código novo (13, 14 e 15)**, porque o ciclo 12 já tinha implementado
`isMarking`, o recarregamento e o `catch` junto do caminho feliz. Em vez de aceitar isso, os três
foram **verificados por mutação**: removendo `!isMarking` do `canMark`, removendo `await onMarked()`
e trocando o `accessibilityRole="alert"` por nada, cada um dos três testes falhou — e só ele. Os
ciclos 3, 4 e 11 são variações de dado sobre a mesma linha (o outro lado de um limiar), não testes
vazios.

Os ciclos 17 a 23 nasceram da análise de cobertura do Passo 11, não de um RED: são os caminhos de
erro e as guardas de corrida que a suíte ainda não tocava.

## O que foi feito

- **`BlocksScreen`** recebe `territory`, `session`, `api` e um `now` opcional. Ordena as quadras por
  número, mostra número + status por extenso (`blockStatusLabel`, com o `rotationDays` do
  território) + última visita, e expande uma quadra por vez.
- **`BlockWorkSection`** (componente no mesmo arquivo, não exportado) é o painel que abre sob a
  linha: histórico da quadra (mais recente primeiro), seletor de publicador, seletor de data e o
  botão de marcar, mais as duas notas explicativas e a mensagem de data futura.
- Todas as chamadas passam por `session.run(...)`, então um JWT vencido é renovado em silêncio sem
  que a tela saiba que existe token.
- Depois de uma marcação aceita, a tela relê o território (`getTerritory`) e a linha passa a mostrar
  o status e a data novos — inclusive perdendo o "(forçado)", que o servidor limpa quando chega
  trabalho novo.

## Arquivos criados

- `admin-app/src/presentation/screens/BlocksScreen.tsx` — a tela e o painel de trabalho da quadra.
- `admin-app/src/presentation/screens/BlocksScreen.test.tsx` — 23 testes.

## Arquivos modificados

- `admin-app/src/presentation/screens/index.ts` — passou a reexportar `BlocksScreen`.

## Decisões técnicas

- **Nenhum publicador vem pré-selecionado**, ao contrário do `MarkWorkedForm` do desktop, que começa
  no dirigente do território. Dois motivos: o critério "o botão fica desabilitado enquanto nenhum
  publicador estiver escolhido" viraria letra morta no caso comum, e a regra que a própria tela
  anuncia é que o autor **não** precisa ser o dirigente — um nome já preenchido é o que acaba
  confirmado por engano.
- **A data futura é barrada no cliente, comparando por dia**, não por instante: o `DateTimePicker`
  devolve a meia-noite do dia escolhido, e "hoje" é um dia inteiro. Também há `maximumDate={now}` no
  picker real; a checagem própria existe porque a regra tem de valer mesmo se o picker for trocado.
- **O histórico é ordenado na tela**, diferente do `BlockWorkPanel` do desktop, que confia na ordem
  do servidor. A promessa "mais recente primeiro" é um critério de aceite aqui, e ordenar é o que a
  faz valer independentemente da resposta.
- **O painel é um componente filho, não markup inline**: fechar a linha o desmonta, e é isso que
  descarta um formulário pela metade em vez de carregá-lo para a próxima quadra.
- **Erro de gravação não reseta nada**; erro de recarga tem mensagem própria dizendo que o registro
  **foi** gravado. São falhas diferentes e o admin em campo precisa saber qual das duas aconteceu
  antes de tentar de novo.
- **Cores em literais, sem `theme.ts`.** `admin-app/` ainda não tem um tema compartilhado, e criá-lo
  a partir desta tela decidiria a aparência do app inteiro pela última task. Os valores são os
  mesmos de `app/src/presentation/theme.ts`, então a extração futura é uma substituição direta.
- **Mock do `@react-native-community/datetimepicker` no próprio arquivo de teste**, e não em
  `jest.setup.js`: esta é a única tela que escolhe data, e a task só autoriza mexer na camada
  Presentation. O mock é uma `View` que repassa `onChange`, então
  `fireEvent(picker, 'change', evento, data)` chega à tela como o diálogo real chegaria.
- **`press()` envolve o toque em `act`.** Um `fireEvent.press` cru monta o painel e volta antes de a
  busca resolver, e a atualização de estado cai fora do `act` — React reclama. O toque é o que
  inicia o trabalho, então é o toque que precisa ser aguardado.
- **Sem teste para o `return` defensivo de `markWorked`** (`publisherId === null || !canMark`): o
  botão está `disabled`, então a guarda é inalcançável pela interface — ela existe para o
  estreitamento de tipo do TypeScript. É a única linha descoberta do arquivo.

## Como validar

```bash
cd admin-app
npx jest src/presentation/screens/BlocksScreen.test.tsx
npx jest --coverage --collectCoverageFrom='src/presentation/screens/BlocksScreen.tsx' \
  src/presentation/screens/BlocksScreen.test.tsx
npx eslint src/presentation/screens/BlocksScreen.tsx src/presentation/screens/BlocksScreen.test.tsx
```

## Resultado da validação

- `npx jest src/presentation/screens/BlocksScreen.test.tsx` → **23 testes passando**.
- `npm test` (suíte inteira de `admin-app/`) → **12 suítes, 181 testes passando**.
- Cobertura de `BlocksScreen.tsx`: **100% de linhas, 100% de funções, 98,85% de statements, 97,87%
  de branches**. O que falta é a guarda defensiva descrita acima.
- `npx eslint` nos dois arquivos → limpo, sem warning.
- `npx tsc --noEmit` → nenhum erro nos arquivos desta task. (A execução global acusa erros em
  `src/presentation/screens/AssignmentPanel.tsx`, arquivo da Task 11, que estava sendo escrito em
  paralelo — fora do escopo desta task e não tocado aqui.)
