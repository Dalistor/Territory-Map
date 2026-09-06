# [0189] App admin: o painel combinado da quadra (spec 0013, Task 05)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0013/` — Task 05

## Solicitação

> Spec 0013 — Task 05: Implemente por TDD `admin-app/src/presentation/screens/BlockPanel.tsx` e
> `BlockPanel.test.tsx`. É o painel que abre ao tocar numa quadra no mapa, e ele reúne dois níveis
> de ação que hoje vivem em telas separadas. […] Leia antes `BlocksScreen.tsx` (de onde vem a
> marcação de trabalho e a lista de registros — **reaproveite o que der, não duplique**) e
> `AssignmentPanel.tsx` (de onde vêm as ações de designação e os textos de confirmação).

## Contexto

Até aqui, no celular, as ações da quadra (`BlocksScreen`) e as do território (`AssignmentPanel`)
eram duas telas alcançadas por dois botões diferentes na lista de territórios. A spec 0013 faz do
toque na quadra o ponto único de ação: o admin em campo está olhando para uma quadra, e é dali que
ele precisa marcar trabalho, apagar um registro errado, designar o território e concluir a
designação — sem navegar.

Apagar registro de trabalho, que a spec 0012 deixara só no desktop, passa a existir aqui (a Task 03
já trouxe `deleteWorkLog` para o cliente HTTP).

## Critérios de aceite

- Número da quadra e status por extenso aparecem; quadra nunca trabalhada mostra "Nunca trabalhada",
  com a rotação do **território dono**.
- Histórico com nome e data de cada registro, mais recente primeiro; sem registro, um texto dizendo
  isso, não uma lista vazia.
- Apagar registro de trabalho pede confirmação; cancelar não chama a API; confirmar chama
  `deleteWorkLog` com o id **daquele** registro e recarrega o histórico.
- Marcar como trabalhada chama `markWorked` com quadra, publicador e data; botão desabilitado sem
  publicador e com data no futuro, esta com explicação visível.
- Seção do território mostra o dirigente atual, ou que não há nenhum, e diz que designar afeta o
  território inteiro.
- "Designar a…" com designação aberta avisa que a atual será encerrada com a data de hoje;
  confirmar chama `designate`.
- "Marcar como concluído" só aparece com designação aberta, e a confirmação diz que o publicador
  perde na hora o acesso.
- Apagar registro da designação pede confirmação dizendo que não há como desfazer, e chama
  `deleteAssignment` com o id daquela linha.
- Erro em qualquer ação aparece em região acessível ao leitor de tela e não fecha o painel.
- Toda escrita passa por `session.run`.
- Mudança bem-sucedida avisa o chamador por callback (Task 06).

## Ciclos TDD

Os 20 casos foram escritos como uma suíte antes de existir qualquer produção — o RED foi o módulo
inexistente (`Cannot find module './BlockPanel'`), e cada caso é um comportamento observável.

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | mostra o número da quadra e o status por extenso de uma quadra nunca trabalhada | `BlockPanel.test.tsx` | cabeçalho do `BlockPanel` com `blockStatusLabel` |
| 2 | usa a rotação do território dono ao dizer o status por extenso | idem | `territory.rotationDays` repassado ao label |
| 3 | lista o histórico da quadra com nome e data, mais recente primeiro | idem | `BlockWorkSection` extraído de `BlocksScreen` |
| 4 | diz que a quadra nunca foi trabalhada em vez de mostrar uma lista vazia | idem | ramo vazio do histórico |
| 5 | apagar um registro pede confirmação, e cancelar não chama a API | idem | `Alert` + `deleteLogConfirmMessage` |
| 6 | confirmar apaga o registro tocado, e não outro, recarrega e avisa o chamador | idem | `onDeleteLog` → `deleteWorkLog` → `loadLogs` → `onChanged` |
| 7 | marca como trabalhada com quadra, publicador e data, e avisa o chamador | idem | formulário reaproveitado |
| 8 | não deixa marcar sem escolher um publicador | idem | `canMark` |
| 9 | recusa data no futuro, com a explicação visível | idem | `isInTheFuture` + `FUTURE_DATE_MESSAGE` |
| 10 | mostra o erro de marcar numa região acessível, sem fechar o painel | idem | `block-work-error` com `accessibilityRole="alert"` |
| 11 | separa a seção do território e mostra que não há dirigente nenhum | idem | `territorySection` + `TERRITORY_SCOPE_NOTE` |
| 12 | mostra o dirigente atual do território | idem | `AssignmentPanel` embutido |
| 13 | avisa que a designação atual será encerrada com a data de hoje, e confirmar designa | idem | textos reaproveitados do `AssignmentPanel` |
| 14 | só oferece concluir quando há designação aberta, e avisa que o acesso se perde na hora | idem | idem |
| 15 | não oferece concluir quando não há designação aberta | idem | idem |
| 16 | apagar registro da designação avisa que não há como desfazer e apaga aquela linha | idem | idem |
| 17 | mostra o erro de uma ação do território numa região acessível, sem fechar o painel | idem | idem |
| 18 | mostra o erro de apagar um registro sem fechar o painel, e não avisa o chamador | idem | `catch` do `deleteLog` |
| 19 | funciona sem `onChanged` e sem `now` | idem | `now ?? new Date()`, `onChanged?.()` |
| 20 | faz toda escrita passar pela sessão | idem | `session.run` em toda chamada |

## O que foi feito

**Reaproveitamento em vez de duplicação**, que era a exigência central da task:

1. A metade de trabalho da `BlocksScreen` (histórico + formulário de marcar) foi **extraída** para
   `BlockWorkSection.tsx`, sem alteração de comportamento — a `BlocksScreen` passou a importá-la e
   seus testes continuaram passando **sem uma linha alterada**. A capacidade de apagar entrou como
   prop opcional `onDeleteLog`: quem a passa ganha o botão, quem não passa não ganha. É capacidade,
   não flag booleana, para o botão existir exatamente quando existe quem cumpra o que ele promete.
2. A metade do território é o próprio `AssignmentPanel`, embutido. Ele ganhou a prop opcional
   `scrollable` (padrão `true`): dentro do `BlockPanel` ele desenha num `View`, para não haver
   scroll vertical dentro de scroll vertical roubando o gesto. Ganhou também `testID`
   `designate-<id>` nas opções, porque no painel combinado as duas listas de publicadores (marcar
   trabalho e designar) mostram os mesmos nomes para coisas diferentes.
3. `BlockPanel.tsx` é a composição: cabeçalho (número + status), `BlockWorkSection` com a
   capacidade de apagar, e a seção do território — com fundo, borda e a frase
   `TERRITORY_SCOPE_NOTE` dizendo que designar afeta o território inteiro, não aquela quadra.

## Arquivos modificados

- `admin-app/src/presentation/screens/BlocksScreen.tsx` — a seção de trabalho saiu para o módulo
  próprio; a tela passou a compô-la. Sem mudança de comportamento.
- `admin-app/src/presentation/screens/AssignmentPanel.tsx` — prop `scrollable` e `testID` nas
  opções de designação.
- `admin-app/src/presentation/screens/index.ts` — exporta os dois módulos novos.

## Arquivos criados

- `admin-app/src/presentation/screens/BlockPanel.tsx` — o painel combinado.
- `admin-app/src/presentation/screens/BlockPanel.test.tsx` — 20 casos.
- `admin-app/src/presentation/screens/BlockWorkSection.tsx` — a metade de trabalho, compartilhada
  pela lista de quadras e pelo painel.

## Decisões técnicas

- **Extrair em vez de copiar.** A alternativa era escrever no `BlockPanel` uma segunda versão do
  formulário de marcar. Duas cópias do mesmo formulário divergem no primeiro ajuste, e a task pedia
  explicitamente o contrário.
- **`onDeleteLog` como capacidade, não `canDeleteLogs` booleano.** A primeira versão tinha a flag e
  um `api.deleteWorkLog?.(…) ?? Promise.resolve()`, que é código defensivo inalcançável — apareceu
  na cobertura como ramo morto. Com a capacidade em prop, o botão e a ação nascem juntos e o ramo
  deixou de existir.
- **`scrollable` no `AssignmentPanel` em vez de extrair o cartão S-13 também.** A mudança é de um
  contêiner; extrair o cartão inteiro mexeria num arquivo coberto por 15 testes sem ganho nenhum
  para esta task.
- **Cores literais preservadas** no `BlockWorkSection` movido: trocá-las por `theme.ts` aqui seria
  a Task 07 feita adiantada e no lugar errado. O `BlockPanel`, sendo novo, já nasce com o tema.
- **Erro de ação não fecha o painel e não dispara `onChanged`** — nada mudou no servidor, e recarregar
  o mapa afirmaria o contrário.
- **Sem teste do `Alert` desenhado:** ele é módulo nativo, então a confirmação é inspecionada como a
  chamada que é (título, mensagem, botões), e "o admin disse sim" é invocar o `onPress` do botão que
  não é o de cancelar — mesmo padrão do `AssignmentPanel.test.tsx`.

## Como validar

```bash
cd admin-app
npx jest src/presentation/screens/BlockPanel.test.tsx
npm test && npx tsc --noEmit && npm run lint
```

## Resultado da validação

- `npm test`: **245 testes passando**, 14 suítes — as 243 anteriores mais as 20 novas, com as
  existentes de `BlocksScreen`, `DesignationsScreen` e `AssignmentPanel` intactas (nenhuma alterada).
- Cobertura dos arquivos tocados: `BlockPanel.tsx` **100% linha e 100% branch**;
  `BlockWorkSection.tsx` 100% linha / 94,6% branch (os ramos restantes são os herdados da
  `BlocksScreen`, cobertos pela suíte dela); `AssignmentPanel.tsx` 97% linha / 85,7% branch,
  inalterado em relação ao que já era.
- `npx tsc --noEmit`: limpo. `npm run lint`: limpo, sem warning.
