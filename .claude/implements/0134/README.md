# [0134] Admin: a tela de Histórico de designações

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0008/` — Task 07

## Solicitação
> Spec 0008 — Task 07: Implemente por TDD. Crie `admin/src/renderer/screens/HistoryScreen.tsx` e
> `HistoryScreen.test.tsx`. A tela carrega `window.api.assignments.listAll()` no mount (mesmo
> padrão de load/loading/erro que `DesignationsScreen` usa), com cabeçalho "Histórico" e seletor de
> visão ("Por dirigente" / "Por território", `aria-pressed`), campo de busca que ignora caixa e
> acento, grupos por publicador (alfabético) ou por território (`compareTerritoriesByNumber`),
> botão "Apagar" por linha com `window.confirm` e `assignments.delete(territoryId, assignmentId)`,
> e mensagens de vazio distintas para "nenhum registro" e "busca sem resultado". CSS em
> `index.css`. Não mexer em `App.tsx` (Task 08).

## Contexto
A spec 0008 pediu uma página só para consultar o histórico inteiro de designações da congregação,
separado por dirigente e por território — o que a `DesignationsScreen` não faz, porque lá o
histórico só aparece por território, um de cada vez, ao clicar no mapa. As Tasks 01–06 já
entregaram a rota `GET /admin/assignments` e o canal `window.api.assignments.listAll`; esta task é
a tela que os consome. O botão de apagar veio junto de propósito: corrigir um registro antigo sem
ter que achar o território no mapa é justamente o que a página de Designações torna trabalhoso.

## Critérios de aceite
- Carrega `assignments.listAll()` no mount, com estado de carregamento, `role="alert"` na falha e
  botão "Recarregar".
- Cabeçalho "Histórico" e seletor de duas visões, com `aria-pressed` marcando a ativa; "Por
  dirigente" é a inicial.
- "Por dirigente": um bloco por publicador, em ordem alfabética, cada linha
  "{território} — {início} a {conclusão}".
- "Por território": um bloco por território, ordenado por `compareTerritoriesByNumber`, cada linha
  nomeando o publicador.
- Designação aberta (`assignmentIsOpen`) lê "em andamento" no lugar da data de conclusão.
- Busca (`aria-label="Buscar no histórico"`) filtra pelo nome do agrupador da visão atual,
  ignorando caixa e acento.
- Sem nenhum registro: "Nenhuma designação registrada ainda."; busca sem resultado: "Nenhum
  resultado para a busca." — mensagens distintas.
- "Apagar" por linha, com `window.confirm` reaproveitando a frase de `DesignationsScreen`, chamando
  `assignments.delete(territoryId, assignmentId)` e recarregando; falha vira `role="alert"`.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | agrupa por publicador, alfabeticamente, cada linha com território e as duas datas | `admin/src/renderer/screens/HistoryScreen.test.tsx` | `HistoryScreen` com load no mount, `groupByLeader` e as linhas |
| 2 | reagrupa por território, na ordem do número, nomeando o publicador na linha | idem | `View`, `groupBy` genérico com `compareTerritoriesByNumber`, `entryLabel` |
| 3 | `aria-pressed` marca a visão ativa, começando em "Por dirigente" (e volta ao clicar) | idem | o seletor `.history-views` com os dois botões |
| 4 | designação aberta lê "em andamento" | idem | `assignmentIsCompleted` + `formatPeriod` |
| 5 | busca filtra pelo publicador, ignorando caixa e acento | idem | `searchable` e o filtro sobre os grupos |
| 6 | busca filtra pelo território depois de trocar a visão | idem | (mesmo filtro, agora sobre o outro agrupador) |
| 7 | busca sem resultado tem mensagem própria, diferente da de histórico vazio | idem | os dois estados vazios separados |
| 8 | histórico vazio diz "Nenhuma designação registrada ainda." | idem | idem |
| 9 | apagar confirmado chama `delete('t1','a9')` e recarrega; recusado não chama nada | idem | `deleteConfirmMessage` + `deleteEntry` |
| 10 | falha ao apagar vira `role="alert"` | idem | `actionError` |
| 11 | falha no carregamento mostra alerta e "Recarregar" refaz a busca | idem | (já coberto pelo `load` do ciclo 1 — passou de primeira) |
| 12 | "Recarregar" falhando de novo mantém o alerta | idem | (fecha o `catch` do `load`, que o ciclo 11 não alcançava) |
| 13 | duas designações do mesmo publicador ficam no mesmo bloco, na ordem recebida | idem | (fecha o ramo "grupo já existe" do `groupBy`) |

Os ciclos 11, 12 e 13 passaram sem código novo: são critérios de aceite que a implementação dos
ciclos anteriores já satisfazia, e cujos ramos estavam descobertos. Estão registrados como tais em
vez de apresentados como RED de verdade.

## O que foi feito
- **`HistoryScreen.tsx`** — a tela nova. Carrega o histórico inteiro no mount pelo mesmo desenho da
  `DesignationsScreen` (efeito com guarda de `cancelled`, `load` separado para o "Recarregar").
  `groupBy` é uma função só, parametrizada pela visão: escolhe de qual lado do registro agrupar e
  qual comparador usar na ordem dos blocos (alfabético para pessoas, `compareTerritoriesByNumber`
  para territórios), mantendo dentro de cada bloco a ordem que `listAll` já entrega — mais recente
  primeiro. `entryLabel` diz o *outro* lado do registro em cada linha.
- **Busca** — `searchable` replicada de `PublishersScreen` (NFD + remoção de diacríticos +
  lowercase), com comentário dizendo que é a mesma regra e por que ainda não virou módulo
  compartilhado. Ela roda sobre os **grupos**, não sobre os registros: filtra pelo nome que o admin
  está lendo na tela.
- **Apagar** — `window.confirm` com a segunda frase idêntica à de `DesignationsScreen` ("O registro
  sai do histórico como se não tivesse existido. Não há como desfazer."), e a primeira nomeando
  também o território, já que aqui o registro é lido fora do contexto dele.
- **`index.css`** — `.history-list` (reusa `.assignment-history` e só solta o teto de rolagem, que
  existe para o painel de Designações não crescer além do diálogo), `.history-group`,
  `.history-views` (com `is-active` acompanhando o `aria-pressed`) e `.history-search`, espelhando
  `.publishers-search`.
- **Cinco fakes de `window.api` de outros testes de tela** ganharam `assignments.listAll` — a Task
  05 tornou o método obrigatório em `IpcApi` e deixou o `typecheck` vermelho. Estava explicitamente
  autorizado pela instrução da task quando trivial. Sobrou `App.test.tsx`, que é escopo da Task 08.

## Arquivos criados
- `admin/src/renderer/screens/HistoryScreen.tsx` — a página de Histórico.
- `admin/src/renderer/screens/HistoryScreen.test.tsx` — 13 testes cobrindo os critérios acima.

## Arquivos modificados
- `admin/src/renderer/index.css` — as quatro classes da tela nova.
- `admin/src/renderer/screens/BlockEditorScreen.test.tsx`, `DesignationsScreen.test.tsx`
  (dois fakes), `HomeScreen.test.tsx`, `SetupScreen.test.tsx`, `TerritoryEditorScreen.test.tsx` —
  só `listAll: vi.fn().mockResolvedValue([])` nos fakes, para o `typecheck` parar de acusá-los.

## Decisões técnicas
- **Um `groupBy` parametrizado, não dois agrupadores.** As duas visões diferem em exatamente duas
  coisas — de qual lado do registro se agrupa e como os blocos se ordenam. Duplicar a função para
  espelhar a duplicação da UI custaria manutenção sem esclarecer nada.
- **A busca filtra grupos, não registros.** Filtrar registros faria a visão "Por território"
  responder ao nome do publicador, que é justamente o que a task pediu para não acontecer: a busca
  é sobre o rótulo do bloco, que é o que está na tela.
- **`aria-pressed` em vez de `aria-current`.** É um toggle entre duas leituras dos mesmos dados, não
  navegação — a distinção veio da própria task, e a sidebar (Task 08) é que usa `aria-current`.
- **`searchable` replicada em vez de extraída.** Duas telas não fazem um módulo compartilhado; a
  regra está comentada nos dois lugares e o comentário diz onde ela deve morar se aparecer uma
  terceira.
- **`assignmentIsCompleted` como type guard**, copiado de `DesignationsScreen`: evita um ramo
  defensivo "e se não houver data de conclusão?" que nunca poderia rodar.
- **Deixado sem teste de propósito:** as três guardas de `cancelled` do efeito de mount (a corrida
  de desmontagem entre o `render` e a resposta do IPC). Forçá-las exigiria desmontar a tela no meio
  de uma promessa pendente, o que testa o agendador do React, não esta tela — mesma escolha que a
  `DesignationsScreen` já fez com o efeito idêntico.

## Como validar
```bash
cd admin
npx vitest run src/renderer/screens/HistoryScreen.test.tsx
npm test && npm run typecheck && npm run lint
```

## Resultado da validação
- `npx vitest run src/renderer/screens/HistoryScreen.test.tsx` — 13 testes passando.
- `npm test` — **391 testes em 22 arquivos, todos verdes** (era 378 em 21 antes da task).
- Cobertura de `HistoryScreen.tsx`: **100% de statements, linhas e funções; 93,33% de branch**
  (42/45). Os três ramos descobertos são as guardas de `cancelled` descritas acima.
- `npm run lint` — 0 erros. Sobrou 1 warning de formatação **pré-existente** em
  `TerritoryEditorScreen.tsx:103`, fora do escopo desta task e não introduzido por ela.
- `npm run typecheck` — os arquivos desta task compilam limpos; resta **um** erro, em
  `App.test.tsx`, que é escopo da Task 08 (eram seis antes desta task).
