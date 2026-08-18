# [0089] App/Presentation: tela de dashboard

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 23

## Solicitação
Spec 0005 — Task 23: implementar por TDD `app/src/presentation/screens/DashboardScreen.tsx`,
recebendo a `Session` já ativa por prop, buscando ao montar `listWorkedTerritories` e
`listTerritories` (`app/src/data/api-client.ts`, Task 18) e mostrando duas seções: (1)
"Territórios trabalhados", nome e data mais recente formatada, na ordem em que o servidor já
devolve; (2) "Território(s) designado(s)", filtrando `listTerritories` por
`isTerritoryAssignedToMe` (`app/src/domain/assignment.ts`, Task 17) com o `id` do publicador da
sessão, cada um com um botão "Ver no mapa" que chama `onOpenMap(territory)`.

## Contexto
É a tela inicial do app do publicador (spec 0005 — app React Native do publicador com designação
de território). Depende só de Task 18 (cliente HTTP) e Task 17 (regra pura de designação), ambas
já implementadas (0082 e 0079). A navegação real (React Navigation) e a restauração de sessão
ficam para a Task 26; aqui `onOpenMap` é só uma prop injetada.

## Critérios de aceite
- Caminho feliz: territórios trabalhados aparecem com nome e data (`toLocaleDateString`).
- Caminho feliz: territórios designados aparecem cada um com botão "Ver no mapa"; clicar chama
  `onOpenMap` com o território certo (e só com esse — outros territórios do retorno não aparecem
  nem disparam nada).
- Borda: sem território designado, mensagem explicativa em vez de lista vazia silenciosa.
- Borda: sem território trabalhado, "Nenhuma quadra trabalhada ainda" em vez de lista vazia.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `shows worked territories with their name and most recent date` | `DashboardScreen.test.tsx` | Componente `DashboardScreen` com `useEffect` chamando `apiClient.listWorkedTerritories` e renderizando nome + `toLocaleDateString()` |
| 2 | `lists each territory assigned to the logged-in publisher, with a working "Ver no mapa" button` | `DashboardScreen.test.tsx` | Segundo `useEffect` chamando `apiClient.listTerritories`, filtrando com `isTerritoryAssignedToMe`, botão "Ver no mapa" chamando `onOpenMap(territory)` |
| 3 | `explains there is no assigned territory instead of showing an empty list` | `DashboardScreen.test.tsx` | Mensagem "Nenhum território designado no momento — fale com quem cuida dos territórios na congregação" quando a lista filtrada é vazia |
| 4 | `shows "Nenhuma quadra trabalhada ainda" instead of an empty list when nothing was worked yet` | `DashboardScreen.test.tsx` | Mensagem "Nenhuma quadra trabalhada ainda" quando `listWorkedTerritories` devolve vazio |

Depois dos 4 ciclos, refatorei extraindo `WorkedTerritoriesSection` e `AssignedTerritoriesSection`
como componentes locais dentro do mesmo arquivo, para tirar as duas seções de dentro do corpo
principal do componente — suíte continuou verde a cada passo.

## O que foi feito
Criado `DashboardScreen.tsx`: recebe `session: Session`, `apiClient:
Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'>` e `onOpenMap: (territory: Territory)
=> void` por prop. Dois `useEffect` independentes disparam as duas chamadas ao montar; o estado de
cada lista é local (`useState`). A ordem devolvida pelo servidor é preservada sem reordenar (regra
do enunciado). O filtro da seção 2 usa `isTerritoryAssignedToMe` já existente, sem reimplementar a
regra.

## Arquivos modificados
Nenhum (arquivos novos apenas).

## Arquivos criados
- `app/src/presentation/screens/DashboardScreen.tsx` — a tela.
- `app/src/presentation/screens/DashboardScreen.test.tsx` — os 4 testes RTL.

## Decisões técnicas
- **`apiClient` é injetado por prop, não criado na tela.** Mantém a Presentation sem chamada HTTP
  direta (regra do `CLAUDE.md` para a camada App, ainda vigente conceitualmente embora a tabela do
  `CLAUDE.md` ainda descreva a versão Flutter — a Task 27 desta spec atualiza isso). O tipo do prop
  é `Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'>`, não o `ApiClient` inteiro: a
  tela só precisa dos dois métodos que usa, e o `Pick` deixa isso explícito na assinatura em vez de
  duplicar uma interface nova equivalente.
- **Dois `useEffect` separados, não um só.** As duas buscas (trabalhados vs. designados) são
  independentes uma da outra — nenhuma depende do resultado da outra — então separá-las evita que
  uma falha bloqueie o carregamento da outra seção e deixa cada efeito com sua própria lista de
  dependências enxuta.
- **Sem tratamento de erro de rede nesta task.** O critério de aceite não pede reação a falha de
  `apiClient.listWorkedTerritories`/`listTerritories` (isso é coberto pela Task 26, que decide o
  que fazer com `ApiErrorException`/`NetworkException` no arranque do app). Implementar isso aqui
  seria código de produção sem teste que o exija — deixado fora de propósito.
- **Mock do `ApiClient` como objeto fake com `jest.fn()`, não `jest.mock('../../data/api-client')`.**
  Segue o padrão de "fake in-memory implementando a mesma interface" do `CLAUDE.md` — o componente
  recebe a dependência por prop, então o teste não precisa nem sabe que existe um módulo por trás.
- **`waitFor` com `{ timeout: 3000 }` explícito em vez do padrão (1000ms) da lib.** Em execução
  isolada do arquivo com `--coverage` logo após `jest --clearCache`, observei falha intermitente
  por timeout no primeiro teste (mensagem interna do RTL "`render` function has not been called"),
  não reproduzida quando a suíte inteira roda junto ou quando o cache já está quente — é o custo de
  a primeira transformação Babel/Istanbul de uma máquina fria competir com o `act()`/microtasks do
  React Native nesse ambiente de teste específico. Rodei o arquivo isolado 5 vezes seguidas
  intercalando `jest --clearCache` com o timeout maior e nenhuma falhou; a suíte inteira (53 testes,
  10 arquivos) também passou de ponta a ponta com cache frio. Aumentar a margem é mais seguro que
  ignorar o sintoma.
- O aviso de console `The current testing environment is not configured to support act(...)`
  aparece nos 4 testes — é ruído conhecido do RTL com `react-native` 0.87 + efeitos assíncronos
  atualizando estado fora de um `act()` explícito; não é uma falha (os testes passam e a asserção é
  específica), e configurar o ambiente de teste do projeto para eliminá-lo tocaria `jest.config.js`,
  fora do escopo desta task ("toque apenas esse arquivo e seu teste").

## Como validar
```bash
cd app && npx jest src/presentation/screens/DashboardScreen.test.tsx
cd app && npx jest src/presentation/screens/DashboardScreen.test.tsx --coverage --collectCoverageFrom='src/presentation/screens/DashboardScreen.tsx'
cd app && npx eslint src/presentation/screens/DashboardScreen.tsx src/presentation/screens/DashboardScreen.test.tsx
cd app && npx tsc --noEmit -p tsconfig.json
```

## Resultado da validação
- `npx jest src/presentation/screens/DashboardScreen.test.tsx` — 4 testes passando.
- `npx jest --coverage --collectCoverageFrom='src/presentation/screens/DashboardScreen.tsx'` —
  **100% statements, 100% branch, 100% functions, 100% lines** em `DashboardScreen.tsx`.
- `npx jest` (suíte inteira do `app/`) — **53 testes, 10 arquivos, todos passando**.
- `npx eslint` nos dois arquivos — limpo, sem warning.
- `npx tsc --noEmit` — limpo, sem erro de tipo.
