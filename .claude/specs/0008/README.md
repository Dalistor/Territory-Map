# [0008] Página de histórico de designações e formatação da planilha

**Data:** 2026-08-18
**Status:** Concluída
**Solicitação original:** "Pode criar uma página de histórico de designações separado por
dirigentes e territórios, onde eu possa ver todo o histórico. E a geração do excel está meio
ruim…"

## Decisões já tomadas com o usuário

- **Página nova, com duas visões alternadas**: um seletor "Por dirigente / Por território" na
  mesma página — numa, cada publicador com as designações dele; na outra, cada território com quem
  passou por ele. Mais um campo de busca por nome.
- **A página também apaga registro**, além de consultar: o botão de apagar aparece em cada linha,
  para corrigir um erro antigo sem ter que achar o território no mapa. Designar e concluir
  continuam só na página de Designações, onde o mapa dá o contexto.
- **Excel: só formatação visual.** A estrutura continua sendo uma aba por território (estilo
  S-13); o que muda é deixar cada aba apresentável e impressável. **Sem** aba de resumo e **sem**
  colunas novas — se um dia quiser "Situação" ou uma tabela geral, é outra conversa.

## O que está ruim na planilha hoje (o diagnóstico que motivou a task)

`buildAssignmentsWorkbook` escreve os valores certos e para por aí: colunas na largura padrão
(o cabeçalho "Data de conclusão" fica cortado e uma data pode virar `####`), nenhum negrito,
nenhuma borda, cabeçalho não congelado, e nenhuma configuração de impressão — imprimir hoje sai
desalinhado e sem repetir o cabeçalho nas páginas seguintes.

## Objetivo

Ao final: existe uma seção **Histórico** na sidebar do admin, mostrando todas as designações da
congregação nas duas visões (por dirigente e por território), com busca por nome e com o botão de
apagar em cada linha. E a planilha exportada sai formatada: colunas legíveis, título e cabeçalho
destacados, bordas, cabeçalho congelado e configuração de impressão que repete o cabeçalho a cada
página.

## Contexto técnico

**O que falta no servidor.** Hoje só existe `GET /admin/territories/{id}/assignments` — o
histórico de **um** território. A página nova precisa de todas as designações da congregação numa
chamada, com o território embutido para poder agrupar. Rota nova: `GET /admin/assignments`.

**Arquivos-chave** (spec 0007, já prontos): `server/app/models/territory_assignment.py`,
`server/app/repositories/territory_assignment.py`, `server/app/services/assignment.py`
(cobertura precisa continuar em **100%** — a CI falha se `app/services/` sair disso),
`server/app/routers/admin_assignments.py`, `server/app/schemas/assignment.py`;
`admin/src/shared/ipc-contract.ts`, `admin/src/main/api-client.ts`,
`admin/src/main/ipc-handlers.ts`, `admin/src/main/excel-export.ts`,
`admin/src/renderer/App.tsx` (a sidebar), `admin/src/renderer/screens/DesignationsScreen.tsx`
(referência de tela com painel e apagar).

**Suítes atuais:** servidor 495 testes, admin 369. Ambas verdes, e assim precisam terminar.

**Detalhe da rota de apagar:** `DELETE /admin/territories/{territory_id}/assignments/
{assignment_id}` exige o `territory_id` no caminho, então a tela nova precisa carregar o
território de cada registro — mais uma razão para o `GET /admin/assignments` já devolvê-lo.

## Tasks

### Task 01 — Schema do histórico com território embutido

**Objetivo:** O DTO que a listagem geral devolve, com território e publicador juntos.
**Camadas:** Schemas (servidor)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0008 — Task 01: Em `server/app/schemas/territory.py`, crie `TerritoryBriefOut(OutSchema)`
> com `id: UUID` e `name: str`, espelhando `UserBriefOut` de `server/app/schemas/user.py`
> (docstring curta: o mínimo de um território para nomeá-lo numa listagem de outra coisa). Em
> `server/app/schemas/assignment.py`, crie `AssignmentWithTerritoryOut(AssignmentOut)` — herda os
> campos que já existem (`id`, `user`, `started_at`, `completed_at`) e acrescenta
> `territory: TerritoryBriefOut`, com docstring explicando que é o formato da listagem geral
> (`GET /admin/assignments`), onde cada registro precisa dizer de qual território é, ao contrário
> da listagem por território, em que isso já está na URL. Não altere `AssignmentOut` nem
> `AssignmentCreateIn`. Valide com `uv run ruff check .`, `uv run ruff format --check .` e
> `uv run pytest tests/schemas -q`. Toque apenas `server/app/schemas/territory.py` e
> `server/app/schemas/assignment.py`; não modifique outras camadas.

---

### Task 02 — Repositório: todas as designações da congregação

**Objetivo:** A query que traz o histórico inteiro de uma vez, sem N+1.
**Camadas:** Repositories (servidor)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0008 — Task 02: Em `server/app/repositories/territory_assignment.py`, adicione o método
> `list_by_congregation(congregation_id: UUID) -> list[TerritoryAssignment]`: `join` em
> `Territory` filtrando `Territory.congregation_id` (mesmo raciocínio dos outros métodos da
> classe — dado de outra congregação nunca é carregado), ordenado por `started_at` **decrescente**
> (mais recente primeiro, como `list_by_territory` já faz). Carregue **user e território** junto
> com `joinedload`, seguindo o que a classe já faz para `user`: a listagem geral mostra os dois
> nomes em cada linha, então sem isso seria um SELECT por registro. Docstring explicando o porquê,
> no estilo dos métodos vizinhos. Valide com `uv run ruff check .`, `uv run ruff format --check .`
> e `uv run pytest tests -q` (nada deve regredir). Toque apenas
> `server/app/repositories/territory_assignment.py`; não modifique models, services ou rotas.

---

### Task 03 — Service: listar o histórico da congregação

**Objetivo:** O método de negócio que a rota nova chama, escopado pela congregação.
**Camadas:** Services (servidor)
**Modo:** TDD
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0008 — Task 03: Implemente por TDD. Em `server/app/services/assignment.py`, adicione
> `list_all(congregation_id: UUID) -> list[TerritoryAssignment]` ao `AssignmentService`, delegando
> para o `list_by_congregation` do repositório (Task 02). É um repasse — sem regra própria além do
> escopo por congregação, que a própria query garante. Comportamentos a cobrir com teste, em
> `server/tests/services/test_assignment_service.py` (contra o Postgres real, via a fixture
> `session`, no padrão que o arquivo já usa):
> - Caminho feliz: com designações em dois territórios diferentes da mesma congregação, devolve
>   todas, da mais recente para a mais antiga.
> - Caminho feliz: designações abertas e concluídas aparecem juntas na mesma lista (a listagem é o
>   histórico inteiro, não só o encerrado).
> - Borda: congregação sem designação nenhuma devolve lista vazia.
> - Isolamento: designação de outra congregação **não** aparece na lista.
> A cobertura de `app/services/assignment.py` precisa continuar em **100% linha e branch** —
> confira com `uv run pytest --cov=app --cov-report=term-missing`. Toque apenas
> `server/app/services/assignment.py` e seu arquivo de teste; não modifique repositórios, schemas
> ou rotas.

---

### Task 04 — Rota `GET /admin/assignments`

**Objetivo:** O endpoint que a página de Histórico consome.
**Camadas:** Routers (servidor)
**Modo:** direto
**Depende de:** Task 01, Task 03
**Instrução para o subagente:**
> Spec 0008 — Task 04: Adicione a rota `GET /admin/assignments` devolvendo
> `list[AssignmentWithTerritoryOut]` (Task 01), chamando `AssignmentService.list_all` (Task 03),
> escopada pela congregação do token. **Atenção ao roteamento:** o router existente
> `server/app/routers/admin_assignments.py` tem prefixo
> `/admin/territories/{territory_id}/assignments`, que não serve para esta rota — crie um segundo
> `APIRouter` no mesmo arquivo (ex.: `flat_router = APIRouter(prefix="/admin/assignments",
> tags=["admin: assignments"])`), exporte-o e registre-o em `server/app/main.py` ao lado do outro,
> com um comentário curto explicando por que são dois routers no mesmo arquivo. Monte o
> `AssignmentWithTerritoryOut` a partir do model (o `territory` já vem carregado pelo `joinedload`
> da Task 02). Escreva os testes em `server/tests/routers/test_admin_assignments_routes.py`
> (arquivo já existe — acrescente um bloco): caminho feliz devolvendo os registros com território
> e publicador preenchidos e na ordem certa, lista vazia quando não há designação, 401 sem token
> de admin, e isolamento (o admin de uma congregação não vê designação da outra). Valide com
> `uv run pytest tests -q`, `uv run ruff check .` e `ruff format --check .`. Toque apenas
> `server/app/routers/admin_assignments.py`, `server/app/main.py` (só o include) e
> `server/tests/routers/test_admin_assignments_routes.py`.

---

### Task 05 — Admin: contrato IPC da listagem geral

**Objetivo:** O `shared/` do admin conhece o registro de histórico com território.
**Camadas:** Shared (admin)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0008 — Task 05: Em `admin/src/shared/models.ts`, adicione a interface
> `AssignmentWithTerritory` estendendo `Assignment` com
> `readonly territory: { readonly id: string; readonly name: string }` — comentário curto dizendo
> que é o formato da listagem geral do histórico, em que cada registro precisa nomear seu
> território (na listagem por território isso já estava no contexto). Em
> `admin/src/shared/ipc-contract.ts`, acrescente o canal
> `assignmentsListAll: 'assignments:listAll'` em `IPC_CHANNELS` e o método
> `listAll(): Promise<AssignmentWithTerritory[]>` no namespace `assignments` de `IpcApi`, com
> comentário dizendo que devolve o histórico inteiro da congregação, mais recente primeiro. Não
> remova nem altere nada existente — diferente da spec 0007, esta task só acrescenta, então a
> compilação continua verde. Valide com `npm run typecheck` (deve ficar **limpo**) e
> `npx vitest run src/shared`. Toque apenas `admin/src/shared/models.ts` e
> `admin/src/shared/ipc-contract.ts`.

---

### Task 06 — Admin: cliente da API e handler da listagem geral

**Objetivo:** Ligar o canal novo à rota `GET /admin/assignments`.
**Camadas:** Main, Preload (admin)
**Modo:** direto
**Depende de:** Task 04, Task 05
**Instrução para o subagente:**
> Spec 0008 — Task 06: Em `admin/src/main/api-client.ts`, adicione `listAllAssignments():
> Promise<AssignmentWithTerritory[]>` chamando `GET /admin/assignments`, no padrão dos outros
> métodos (`request()`, token, tratamento de erro), com um `parseAssignmentWithTerritory` que
> reaproveite o `parseAssignment` existente e acrescente o território (`{ id, name }`) — não
> duplique a conversão de datas. Em `admin/src/main/ipc-handlers.ts`, registre o handler de
> `IPC_CHANNELS.assignmentsListAll` via `session.run(...)`, como os demais. Em
> `admin/src/preload/index.ts`, exponha `assignments.listAll` repassando para
> `ipcRenderer.invoke`. Estenda os testes existentes: em `admin/src/main/api-client.test.ts`, um
> caso do caminho feliz (URL/método certos e a conversão de território + datas, incluindo
> `completed_at` nulo); em `admin/src/main/ipc-handlers.test.ts`, um caso do handler novo; e
> acrescente o método ao `fakeApiClient()` de `admin/src/main/session.test.ts` para satisfazer a
> interface. Valide com `npx vitest run src/main`, `npm run typecheck` e `npm run lint`. Toque
> apenas `admin/src/main/api-client.ts`, `admin/src/main/api-client.test.ts`,
> `admin/src/main/ipc-handlers.ts`, `admin/src/main/ipc-handlers.test.ts`,
> `admin/src/main/session.test.ts` e `admin/src/preload/index.ts`.

---

### Task 07 — Admin: a tela de Histórico

**Objetivo:** A página em si — duas visões, busca e apagar registro.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 06
**Instrução para o subagente:**
> Spec 0008 — Task 07: Implemente por TDD. Crie
> `admin/src/renderer/screens/HistoryScreen.tsx` e `HistoryScreen.test.tsx`. A tela carrega
> `window.api.assignments.listAll()` no mount (mesmo padrão de load/loading/erro que
> `DesignationsScreen` usa: estado de carregamento, `role="alert"` com `parseIpcError` na falha, e
> botão "Recarregar") e mostra:
> - Um cabeçalho com o título "Histórico" e um seletor de visão com dois botões, **"Por
>   dirigente"** e **"Por território"** — o ativo com `aria-pressed={true}` (é um toggle, não
>   navegação). "Por dirigente" é a visão inicial.
> - Um campo de busca (`aria-label="Buscar no histórico"`, placeholder "Buscar por nome…") que
>   filtra **pelo nome do agrupador da visão atual** (nome do publicador em "Por dirigente", nome
>   do território em "Por território"), ignorando maiúsculas e acentos — reaproveite a mesma
>   normalização que `PublishersScreen` já usa para isso (`String.prototype.normalize('NFD')`
>   removendo diacríticos); se ela não estiver exportada de um lugar comum, replique a função e
>   comente que é a mesma regra.
> - Os grupos: em "Por dirigente", um bloco por publicador (ordem alfabética) contendo suas
>   designações, mais recente primeiro, cada linha como "{território} — {início} a {conclusão}",
>   com "em andamento" no lugar da conclusão quando a designação está aberta
>   (`assignmentIsOpen`, de `shared/models.ts`). Em "Por território", um bloco por território,
>   ordenado por `compareTerritoriesByNumber` (de `shared/models.ts`), com as linhas dizendo o nome
>   do publicador em vez do território.
> - Um botão **"Apagar"** em cada linha (`aria-label` distinguindo a linha, ex.: `Apagar
>   designação de {publicador} em {território}`), que pede confirmação por `window.confirm` — com
>   a mesma mensagem literal que `DesignationsScreen` já usa ao apagar ("o registro sai do
>   histórico como se não tivesse existido", conferir o texto exato lá e reaproveitá-lo) — e chama
>   `window.api.assignments.delete(entry.territory.id, entry.id)`, recarregando a lista depois.
>   Falha vira `role="alert"`.
> - Estados vazios: sem nenhuma designação, "Nenhuma designação registrada ainda."; com busca sem
>   resultado, "Nenhum resultado para a busca." (mensagens distintas, como `PublishersScreen` faz).
> Comportamentos a cobrir com teste (RTL, `window.api` fabricado como os outros testes de tela
> fazem):
> - Caminho feliz: a visão "Por dirigente" agrupa por publicador, com as designações dele e as
>   datas formatadas.
> - Caminho feliz: alternar para "Por território" reagrupa os mesmos registros por território, na
>   ordem do número do território.
> - Caminho feliz: designação aberta aparece como "em andamento" no lugar da data de conclusão.
> - Caminho feliz: buscar filtra pelo agrupador da visão atual; a busca ignora caixa e acento.
> - Borda: busca sem resultado mostra a mensagem própria, diferente da de "nenhuma designação
>   registrada".
> - Caminho feliz: apagar confirmado chama `assignments.delete` com o par
>   (territoryId, assignmentId) certo e recarrega; recusado na confirmação não chama nada.
> - Erro: falha no carregamento mostra `role="alert"` e "Recarregar" refaz a busca; falha ao
>   apagar mostra `role="alert"`.
> Ajustes de CSS vão em `admin/src/renderer/index.css`, reaproveitando as classes existentes. **Não
> mexa em `App.tsx` nesta task** — a entrada na sidebar é a Task 08. Valide com `npm test`,
> `npm run typecheck` e `npm run lint`. Toque apenas `HistoryScreen.tsx`, `HistoryScreen.test.tsx`
> e `index.css`.

---

### Task 08 — Admin: Histórico na sidebar

**Objetivo:** A seção nova alcançável pela navegação.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0008 — Task 08: Implemente por TDD em `admin/src/renderer/App.tsx` e `App.test.tsx`.
> Acrescente a seção **"Histórico"** à sidebar, entre "Designações" e "Publicadores", seguindo
> exatamente o padrão das que já existem (`sectionButton`, rota nova `history` no tipo `Route`,
> `is-active` + `aria-current="page"` quando ativa), renderizando a `HistoryScreen` (Task 07) na
> área de conteúdo. Comportamentos a cobrir: clicar "Histórico" mostra a tela de histórico; a
> seção fica marcada como ativa; e as outras seções continuam funcionando (adapte os testes de
> navegação existentes se algum deles enumerar os botões da sidebar). O fake de `window.api` do
> `App.test.tsx` vai precisar de `assignments.listAll` — acrescente. Valide com `npm test` (suíte
> inteira verde), `npm run typecheck` e `npm run lint`. Toque apenas `App.tsx` e `App.test.tsx`.

---

### Task 09 — Excel: formatação e configuração de impressão

**Objetivo:** Cada aba sai legível na tela e na impressora.
**Camadas:** Main (admin)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0008 — Task 09: Implemente por TDD em `admin/src/main/excel-export.ts` e
> `excel-export.test.ts`. A estrutura **não muda** (uma aba por território, título, cabeçalho,
> linhas em ordem cronológica, datas como `Date` com `numFmt 'dd/mm/yyyy'`, conclusão vazia quando
> aberta, aba mesmo sem designação, saneamento/desduplicação do nome da aba) — todos os testes
> existentes devem continuar passando sem alteração de expectativa. O que muda é a apresentação:
> - **Larguras de coluna**: `Publicador` larga o bastante para um nome completo (~32), e as duas
>   colunas de data ~18 — hoje tudo fica na largura padrão e "Data de conclusão" aparece cortado.
> - **Linha de título**: negrito e fonte maior (~14), mesclada nas três colunas
>   (`sheet.mergeCells('A1:C1')`).
> - **Linha de cabeçalho**: negrito, fundo cinza-claro (`fill` sólido), e alinhamento centralizado
>   nas colunas de data.
> - **Bordas finas** em todas as células da tabela (cabeçalho e linhas de dados), para o cartão
>   impresso ter grade. Território sem designação tem só o cabeçalho — que também leva borda.
> - **Cabeçalho congelado**: `sheet.views = [{ state: 'frozen', ySplit: 2 }]`, para o nome das
>   colunas não sumir ao rolar um histórico longo.
> - **Impressão**: `sheet.pageSetup` com `fitToPage: true`, `fitToWidth: 1`, `fitToHeight: 0`,
>   orientação retrato, margens razoáveis, e `printTitlesRow: '2:2'` para o cabeçalho repetir em
>   toda página.
> Comportamentos a cobrir com teste (inspecionando o `Workbook` em memória, como o arquivo já faz
> — `sheet.getColumn(n).width`, `cell.font.bold`, `cell.fill`, `cell.border`, `sheet.views`,
> `sheet.pageSetup`):
> - As três colunas têm largura definida (maior que o padrão do ExcelJS).
> - A linha de título está em negrito e mesclada de A1 a C1.
> - A linha de cabeçalho está em negrito e com preenchimento.
> - Uma célula de dado tem borda nos quatro lados.
> - A aba tem o painel congelado abaixo do cabeçalho (`ySplit: 2`).
> - `pageSetup` traz `fitToWidth: 1` e `printTitlesRow` repetindo a linha do cabeçalho.
> - Borda: território sem designação ainda tem título, cabeçalho formatado e nenhuma linha de dado.
> A cobertura de `excel-export.ts` precisa continuar em **100%**. Valide com
> `npx vitest run src/main`, `npm run typecheck` e `npm run lint`. Toque apenas
> `admin/src/main/excel-export.ts` e `admin/src/main/excel-export.test.ts`.

---

### Task 10 — Documentação: `CLAUDE.md`

**Objetivo:** A documentação cita a seção de Histórico e a rota nova.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 01–Task 09
**Instrução para o subagente:**
> Spec 0008 — Task 10: Atualize o `CLAUDE.md` conferindo o código antes de escrever: (1) a
> navegação por sidebar do admin agora tem **quatro** seções (Mapa / Designações / **Histórico** /
> Publicadores) — corrija onde a lista de seções aparece, e descreva a tela de Histórico (duas
> visões alternadas por dirigente e por território, busca por nome, apagar registro); (2)
> acrescente a rota `GET /admin/assignments` (histórico inteiro da congregação, mais recente
> primeiro) onde as rotas de designação estão listadas; (3) atualize a contagem de telas do admin
> cobertas por teste, que sobe com a `HistoryScreen`; (4) mencione que a planilha exportada sai
> formatada (larguras, título e cabeçalho destacados, bordas, cabeçalho congelado e configuração
> de impressão que repete o cabeçalho por página), sem mudar a estrutura de uma aba por
> território. Não invente comportamento: descreva o que existe. Toque apenas `CLAUDE.md`.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0008
```

Ondas: **01, 02, 05 e 09 em paralelo** → **03** → **04** → **06** → **07** → **08** → **10**.
A Task 09 (Excel) é independente de todo o resto e pode terminar bem antes.

Alternativa manual — um subagente por task, com a skill do `Modo` dela:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task, ou pelo `/centaur-driven-run`
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — Schema do histórico com território embutido → implements/0127
- [x] Task 02 — Repositório: todas as designações da congregação → implements/0129
- [x] Task 03 — Service: listar o histórico da congregação → implements/0131
- [x] Task 04 — Rota `GET /admin/assignments` → implements/0132
- [x] Task 05 — Admin: contrato IPC da listagem geral → implements/0128
- [x] Task 06 — Admin: cliente da API e handler da listagem geral → implements/0133
- [x] Task 07 — Admin: a tela de Histórico → implements/0134
- [x] Task 08 — Admin: Histórico na sidebar → implements/0135
- [x] Task 09 — Excel: formatação e configuração de impressão → implements/0130
- [x] Task 10 — Documentação: `CLAUDE.md` → implements/0136
