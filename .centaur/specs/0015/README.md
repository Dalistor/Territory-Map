# [0015] Consultas administrativas e redesign dos admins

**Data:** 2026-09-19
**Status:** Em andamento
**Solicitação original:** “Melhore o layout do app admin desktop e admin mobile. Gostaria que o modo de apresentação de informações mudasse também. Algo semelhante ao app ‘Territórios’ disponível na Play Store, podendo ter uma lista e mudar o tipo de visualização. Publicadores > Histórico de saída de campo; Territórios > Histórico de publicadores / quadras; Histórico completo > Tabela de todos os territórios, mostrando a data de início e fim de cada publicador separado pela data selecionada.”

## Objetivo

Reorganizar o admin Electron e o admin Android em torno de três consultas coerentes —
**Publicadores**, **Territórios** e **Histórico completo** — e aplicar uma linguagem visual de admin
contemporâneo, com comparação em lista/tabela como superfície principal e detalhe contextual. Em
Publicadores, o histórico é o de territórios retirados e devolvidos; em Territórios, o detalhe reúne
o cartão de designações e as quadras; no Histórico completo, um intervalo inclui toda designação
que tenha qualquer sobreposição com o período escolhido.

As três consultas existem nos dois admins. A gestão de publicadores, o desenho de territórios e
quadras, o status forçado e o import/export continuam exclusivos do desktop conforme `AGENTS.md`.
No desktop, o detalhe permanece à direita da tabela; no Android, ele é empilhado em um stack. A
referência “Territórios da Congregação”, de Simão Lúcio, orienta a arquitetura da informação e o
nível de acabamento, não uma cópia de seu visual antigo.

## Contexto técnico

O trabalho parte da spec `0014`, atualmente em andamento, e não deve desfazer suas melhorias de
acessibilidade, estados ocupados, legenda, seleção pesquisável ou último trabalho do território.
Antes de executar esta spec, conclua ou consolide a Task 13 da `0014` para que a base visual e os
testes estejam estáveis.

A direção visual foi escolhida por um round comp-first do Impeccable. A fonte de verdade da
composição é `.impeccable/mocks/admin-table-detail.webp`, marcada como aprovada em seu sidecar. O
contrato de superfície está em `.impeccable/surfaces/admin-src-renderer-app-tsx.md`; `PRODUCT.md`
registra público, fronteiras e compromisso visual. O comp governa proporção e hierarquia, mas suas
funções inventadas não são requisitos: não criar Relatórios, Planejamento, Recursos, observações,
tipos de atividade ministerial ou qualquer outra capacidade ausente de `AGENTS.md`/`PRODUCT.md`.

O histórico completo existente usa `GET /admin/assignments`, devolve uma lista sem paginação e é
consumido apenas pelo desktop. Esta spec transforma esse contrato em consulta paginada e filtrável,
atualizando os dois clientes no mesmo lote. O filtro de período é um intervalo de instantes
semiaberto `[from, to)`: uma designação sobrepõe o período quando `started_at < to` e
`completed_at IS NULL OR completed_at >= from`. Assim, uma linha iniciada antes do período e
concluída dentro/depois dele aparece; uma designação aberta também aparece. Os clientes convertem
as datas escolhidas para início local do primeiro dia e início local do dia seguinte ao último,
enviando ISO-8601 com offset/UTC; o servidor não inventa um fuso da congregação.

A resposta paginada terá `items`, `total`, `page` e `page_size`. A consulta aceita ainda
`publisher_id` e `territory_id`, sempre restritos à congregação do token. Página começa em 1,
`page_size` padrão é 50 e o máximo é 100. O histórico de uma pessoa usa `publisher_id`; o histórico
completo usa o intervalo; o cartão de um território pode continuar usando a rota existente sob o
território quando precisa editar/concluir/apagar.

Arquitetura obrigatória: servidor `router → service → repository → model`; app admin
`presentation → domain ← data`; Electron Renderer fala somente com `window.api`, passando por
Preload/IPC/Main. Não criar pacote compartilhado entre `admin/` e `admin-app/`; a convergência vive
em `DESIGN.md`, `UX-CONTRACT.md` e em contratos equivalentes implementados em cada stack.

## Tasks

### Task 01 — Consulta paginada e sobreposição no repositório

**Objetivo:** O repositório consulta designações da congregação por período, publicador e território, com paginação e total.
**Camadas:** Repositories
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0015 — Task 01: Implemente por TDD em `TerritoryAssignmentRepository` uma consulta paginada
> da congregação com filtros opcionais `publisher_id`, `territory_id`, `from_instant` e
> `to_instant`. O período é semiaberto `[from, to)` e a sobreposição é
> `started_at < to` e (`completed_at IS NULL` ou `completed_at >= from`). Devolva itens em ordem
> determinística por `started_at DESC, id DESC` e o total da mesma consulta antes de `limit/offset`;
> carregue o território sem N+1 e aplique `Territory.congregation_id` dentro do SQL.
>
> Critérios de aceite: inclui designação iniciada antes e concluída dentro do intervalo; inclui
> aberta iniciada antes do fim; exclui a que começa exatamente no limite exclusivo `to`; aceita
> conclusão exatamente em `from`; combina filtros de pessoa e território; não vaza outra
> congregação; pagina sem repetir ou pular linhas quando há empate de início; total ignora a
> paginação. Preserve `list_by_congregation` até a rota nova estar integrada. Toque apenas em
> Repositories e testes de repository; não altere service, schema ou router.

---

### Task 02 — Contrato HTTP paginado do histórico de designações

**Objetivo:** `GET /admin/assignments` oferece filtros, validação e paginação para os dois admins.
**Camadas:** DTOs, Services, Routers
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0015 — Task 02: Implemente por TDD o contrato paginado de `GET /admin/assignments`. Crie DTO
> explícito com `items`, `total`, `page` e `page_size`; cada item continua sendo
> `AssignmentWithTerritoryOut`. Aceite `from`, `to`, `publisher_id`, `territory_id`, `page` e
> `page_size`; `page` começa em 1, `page_size` padrão 50 e máximo 100. Exija `from < to` quando
> ambos existirem e aceite qualquer subconjunto dos filtros. Datas chegam como instantes ISO-8601
> com timezone; normalize a UTC sem redefinir o dia.
>
> O service apenas orquestra a consulta e preserva o escopo; o router converte query/DTO, sem SQL.
> Cubra resposta vazia, página intermediária, filtros combinados, período inválido (422) e escopo
> por congregação. Atualize a documentação da rota no próprio módulo. Não altere clientes nesta
> task. Toque apenas em DTOs, Services, Routers e seus testes.

---

### Task 03 — Integração HTTP do histórico por sobreposição

**Objetivo:** Provar o fluxo real router → service → repository sobre Postgres/PostGIS.
**Camadas:** Testes de integração
**Modo:** TDD
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0015 — Task 03: Implemente por TDD um teste de integração para
> `GET /admin/assignments` usando o app FastAPI e banco reais. Crie designações concluídas e abertas
> em datas controladas, consulte um intervalo e prove a regra de sobreposição, a paginação/total e
> o isolamento entre congregações. Inclua uma consulta por `publisher_id` e uma por
> `territory_id`. Não replique testes unitários de validação exótica e não mude código produtivo
> salvo uma correção estritamente exigida pelo fluxo. Toque apenas em testes de integração e na
> correção mínima diretamente revelada por eles.

---

### Task 04 — Modelos e cliente HTTP do desktop

**Objetivo:** O Main do Electron interpreta e consulta o histórico paginado.
**Camadas:** Shared, Main/Data
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0015 — Task 04: Atualize `admin/src/shared/models.ts` e
> `admin/src/main/api-client.ts` para o resultado paginado e os filtros de histórico. Use tipos
> nomeados para a página e para os parâmetros; serialize instantes como ISO-8601 e omita filtros
> ausentes. Atualize os testes do cliente para URL/encoding, parsing de página e datas, sem criar
> regra de filtragem no Main. Preserve os métodos por território e as ações de designar/concluir/
> apagar. Toque apenas em Shared, Main/Data e testes imediatos; não altere IPC nem Renderer.

---

### Task 05 — IPC e preload do histórico paginado

**Objetivo:** O Renderer acessa a nova consulta apenas por `window.api`.
**Camadas:** Shared/IPC, Main/IPC, Preload
**Modo:** direto
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0015 — Task 05: Atualize o contrato IPC, handler e preload de `assignments.listAll` (ou
> renomeie para um nome que expresse consulta, atualizando todos os consumidores) para receber os
> filtros tipados e devolver a página. Mantenha a ponte 1:1, sem filtrar, paginar ou formatar no
> preload/handler. Atualize testes de IPC e os fakes de `window.api` afetados. Toque apenas em
> Shared/IPC, Main/IPC, Preload e testes de contrato; não altere telas.

---

### Task 06 — Modelos e cliente HTTP do admin Android

**Objetivo:** O admin Android possui o mesmo contrato de consulta paginada.
**Camadas:** Domain/models, Data
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0015 — Task 06: Adicione ao `admin-app/` os tipos de
> `AssignmentWithTerritory`, filtros e página, e implemente a chamada a `GET /admin/assignments` no
> cliente HTTP. Converta datas para `Date`, serialize instantes ISO-8601 e preserve o nome copiado
> no histórico. Teste parsing, query opcional e paginação; não duplique no app a regra de
> sobreposição do servidor. Não altere Presentation. Toque apenas em Domain/models, Data e seus
> testes.

---

### Task 07 — Especificação mensurável e contrato de UX

**Objetivo:** Converter o comp aprovado em um contrato executável antes de qualquer tela nova.
**Camadas:** Design/Documentação
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0015 — Task 07: Siga o estado aberto do Impeccable em `.impeccable/build/state.json`.
> Execute `comp-spec --grid` sobre `.impeccable/mocks/admin-table-detail.webp`, nomeie em
> `regions.json` todos os blocos de texto, controles, chrome, tabela e mapa; trate o mapa como
> região de interface dinâmica, não como raster a embarcar. Meça e ranqueie a tipografia líder com
> `font-match`, feche as fases `spec` e `plates` somente quando os gates passarem e não escreva
> código de tela antes disso.
>
> Crie `UX-CONTRACT.md` na raiz com: desktop tabela+painel e Android lista+stack; navegação
> canônica; preservação de busca/filtro/seleção; estados loading/empty/no-results/error/refresh;
> paginação; busca com limpar; filtros de data; foco/retorno; confirmação destrutiva; vocabulário
> consistente; WCAG 2.2 AA e alvos de toque. Não crie `DESIGN.md` ainda: no fluxo de novo mundo ele
> é documentado a partir da implementação aprovada na Task 21. Toque apenas em `.impeccable/`,
> `UX-CONTRACT.md` e documentação de design; não altere código produtivo.

---

### Task 08 — Shell e tokens do admin desktop

**Objetivo:** O desktop adota a estrutura visual aprovada sem mudar suas fronteiras funcionais.
**Camadas:** Renderer/Presentation, estilos
**Modo:** direto
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0015 — Task 08: Implemente o shell desktop do comp aprovado em `App.tsx` e `index.css`:
> sidebar compacta com `Mapa`, `Territórios`, `Publicadores` e `Histórico completo`; identidade da
> congregação no topo; saída isolada no rodapé; conteúdo com largura estável e foco visível. Migre
> `Designações` para a seção `Territórios` e preserve todas as rotas empurradas do Mapa. Crie tokens
> CSS semânticos para superfícies, texto, borda, foco, seleção e intents; preserve as cores de
> domínio das quadras fora do tema. Atualize `App.test.tsx` para navegação e seção ativa. Não crie
> funcionalidades vistas apenas no comp. Toque apenas no shell, stylesheet global e teste do shell.

---

### Task 09 — Controles compartilhados do desktop

**Objetivo:** Busca, alternância de visualização e tabela têm comportamento único entre telas.
**Camadas:** Renderer/Presentation/components
**Modo:** direto
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0015 — Task 09: Crie/estenda primitivas compartilhadas do Renderer para `SearchField` com
> botão Limpar e retorno de foco, `SegmentedControl` com semântica de seleção, e `DataTable` de
> leitura com cabeçalhos ordenáveis, foco e overflow interno. Inclua estados busy, empty,
> no-results e erro estáveis sem saltos de layout. Use botões/inputs/tabela semânticos e os tokens
> da Task 08 quando disponíveis; se executar em paralelo, limite-se aos componentes e deixe a
> integração visual para as telas. Adicione testes de interação essenciais. Toque apenas em
> componentes compartilhados, testes e estilos estritamente locais.

---

### Task 10 — Workspace Territórios no desktop

**Objetivo:** Territórios vira a consulta central em tabela + detalhe, com acesso a mapa, designações e quadras.
**Camadas:** Renderer/Presentation
**Modo:** TDD
**Depende de:** Tasks 04, 05, 08 e 09
**Instrução para o subagente:**
> Spec 0015 — Task 10: Implemente por TDD a seção desktop `Territórios`, aproveitando e
> consolidando `DesignationsScreen` em vez de duplicar suas ações. A superfície principal é tabela
> ordenada por número com território, dirigente atual, retirada, situação, quadras e último
> trabalho; selecionar uma linha abre painel persistente à direita. O painel oferece abas/segmentos
> `Visão geral`, `Designações`, `Quadras` e `Mapa`, reutilizando `AssignmentPanel`, histórico de
> quadras e mapa existentes. A alternância Lista/Mapa e as abas preservam território selecionado,
> busca e posição; largura estreita empilha o detalhe sem esconder campos.
>
> Critérios de aceite: ordem numérica; seleção sincronizada; designar/concluir/apagar continuam
> recarregando linha e painel; território removido fecha detalhe obsoleto; loading/empty/no-results/
> erro e refresh preservam geometria; teclado abre e fecha o detalhe. Não mova regras para o
> Renderer e não recrie mapas. Toque apenas na seção Territórios, seu teste e adaptações mínimas em
> componentes existentes que ela compõe.

---

### Task 11 — Histórico de territórios por publicador no desktop

**Objetivo:** A tela Publicadores mostra, por pessoa, os territórios retirados e devolvidos.
**Camadas:** Renderer/Presentation
**Modo:** TDD
**Depende de:** Tasks 04, 05, 08 e 09
**Instrução para o subagente:**
> Spec 0015 — Task 11: Implemente por TDD em `PublishersScreen` o padrão lista + detalhe aprovado.
> A lista mantém busca, contadores, cadastro e menus de gestão; selecionar uma pessoa abre um painel
> “Histórico de territórios” carregado com `publisher_id`, mostrando território, retirada,
> devolução ou `Em andamento`. O painel é consulta: designar/concluir continuam na seção
> Territórios. Preserve seleção após renomear/ativar; feche-a após apagar a pessoa; página seguinte
> carrega sem perder a busca local da lista de pessoas.
>
> Cubra pessoa sem histórico, múltiplas páginas, nome histórico preservado, erro com tentar
> novamente e fechamento/retorno de foco. Não mostrar logs de quadra como “saída de campo”: aqui o
> histórico é exclusivamente de designações. Toque apenas em PublishersScreen, teste e componentes
> locais de detalhe.

---

### Task 12 — Histórico completo filtrado no desktop

**Objetivo:** O desktop oferece uma tabela paginada de todas as designações sobrepostas ao período.
**Camadas:** Renderer/Presentation
**Modo:** TDD
**Depende de:** Tasks 04, 05, 08 e 09
**Instrução para o subagente:**
> Spec 0015 — Task 12: Implemente por TDD a nova `HistoryScreen` como “Histórico completo”. Use
> tabela semântica com Território, Publicador, Retirada, Devolução e Situação; filtro de intervalo
> com rótulos reais e botão Limpar; paginação server-side com total/faixa. Converta o primeiro dia
> escolhido ao início local e o último ao início local do dia seguinte, enviando instantes ISO para
> preservar o intervalo semiaberto. A ordenação inicial segue o servidor; qualquer ordenação local
> deve abranger apenas a página e ser rotulada como tal, ou ser omitida.
>
> Critérios de aceite: designação que começou antes e terminou no período aparece; aberta aparece
> como `Em andamento`; troca/limpeza de datas volta à página 1; resposta tardia antiga não
> sobrescreve filtro novo; loading mantém cabeçalho; empty difere de no-results; erro preserva o
> filtro e oferece tentar novamente. A exclusão de registro continua confirmada e recalibra a
> página. Toque apenas em HistoryScreen, teste e controle de intervalo necessário.

---

### Task 13 — Migração visual das demais telas desktop

**Objetivo:** Setup, Mapa, editores, configurações e painéis deixam de parecer outro produto.
**Camadas:** Renderer/Presentation, estilos
**Modo:** direto
**Depende de:** Tasks 08, 09, 10, 11 e 12
**Instrução para o subagente:**
> Spec 0015 — Task 13: Migre as telas desktop restantes para os tokens e contratos aprovados:
> `SetupScreen`, `HomeScreen`/Mapa, editores de território/quadra, configurações, histórico de
> quadra e formulários/painéis embutidos. Preserve o mapa como workbench de desenho, todos os textos
> de consequência destrutiva, o layout lado a lado dos editores e os diálogos acessíveis da spec
> 0014. Substitua estilos ad hoc por variantes compartilhadas sem reescrever comportamento.
> Verifique estado longo, janela estreita, foco, zoom 200% e scroll ownership. Atualize apenas testes
> quebrados por rótulo/estrutura observável; não amplie o escopo funcional. Toque apenas em
> Presentation desktop e estilos; não altere API/IPC.

---

### Task 14 — Navegação e tema do admin Android

**Objetivo:** O Android oferece três destinos primários e detalhe em stack, seguindo a composição aprovada.
**Camadas:** Presentation/navigation, tema, configuração
**Modo:** direto
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0015 — Task 14: Adicione a navegação primária do admin Android com React Navigation 7,
> mantendo a Dynamic API existente: tabs inferiores para `Territórios`, `Publicadores` e
> `Histórico`, e native stack para detalhes. Instale `@react-navigation/bottom-tabs` e use a
> biblioteca de ícones já compatível com React Native CLI somente se necessária; não introduza
> Expo. “Sair da congregação” permanece no header/menu e mantém a confirmação atual. Faça o tema
> de navegação consumir tokens de `presentation/theme.ts`, respeite edge-to-edge/safe areas e o back
> físico. Atualize `App.test.tsx` para as rotas, sem testar internals da biblioteca. Toque apenas em
> navegação, tema, package/lock e teste do App.

---

### Task 15 — Controles compartilhados do admin Android

**Objetivo:** Listas, busca, segmentos, estados e paginação têm uma gramática comum no mobile.
**Camadas:** Presentation/components
**Modo:** direto
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0015 — Task 15: Crie componentes React Native compartilhados para busca com limpar,
> controle segmentado, linha/cartão denso de consulta, estados loading/empty/no-results/error e
> paginação “Anterior/Próxima” com faixa. Use `Pressable`, estados acessíveis e alvos mínimos de
> toque; não faça uma mini biblioteca genérica. Preserve altura durante busy e use texto além de
> cor. Inclua testes das interações essenciais. Toque apenas em Presentation/components, testes e
> adaptações mínimas de `theme.ts` que não pertençam à navegação.

---

### Task 16 — Territórios com Lista/Mapa no Android

**Objetivo:** A home móvel alterna lista e mapa sem perder seleção ou estado.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Tasks 06, 14 e 15
**Instrução para o subagente:**
> Spec 0015 — Task 16: Implemente por TDD a tab `Territórios` a partir de
> `DesignationsScreen`. Ela possui segmento `Lista / Mapa`; a lista é ordenada por número e mostra
> dirigente, situação, quadras e último trabalho; o mapa reutiliza `AssignmentsMapView`. Selecionar
> território em qualquer modo abre o mesmo detalhe no stack e, ao voltar, preserva modo, busca,
> seleção e posição. Tocar quadra no mapa continua abrindo o detalhe daquela quadra.
>
> Cubra alternância, seleção sincronizada, vazio/erro/recarregar, back físico e atualização após
> designar/concluir. Não virtualize especulativamente; mantenha `ScrollView` ou use `FlatList`
> somente com justificativa/medição conforme `AGENTS.md`. Toque apenas na tela Territórios, teste e
> integração mínima do mapa.

---

### Task 17 — Detalhe de território e quadras no Android

**Objetivo:** O detalhe móvel reúne visão geral, designações e quadras sem misturar escopos.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 16
**Instrução para o subagente:**
> Spec 0015 — Task 17: Implemente por TDD a tela de detalhe empilhada do território com segmentos
> `Designações` e `Quadras` (e resumo/mapa quando necessário), reutilizando `AssignmentPanel`,
> `BlocksScreen`, `BlockWorkSection` e `BlockPanel`. Preserve a separação explícita entre ação da
> quadra e ação do território inteiro. Designar, concluir, apagar designação, marcar trabalho e
> apagar log continuam disponíveis onde já eram; nenhuma gestão de cadastro/status forçado entra
> no mobile.
>
> Cubra troca de segmento, retorno ao território correto, recarga após escrita, desaparecimento de
> item obsoleto e uma única rolagem por tela. Harmonize hierarquia e ações destrutivas com os
> tokens, sem ScrollViews concorrentes. Toque apenas nos detalhes de território/quadra e testes.

---

### Task 18 — Publicadores e histórico de territórios no Android

**Objetivo:** O mobile consulta cada publicador e seus períodos de responsabilidade, sem gerenciar cadastro.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Tasks 06, 14 e 15
**Instrução para o subagente:**
> Spec 0015 — Task 18: Implemente por TDD a tab read-only `Publicadores`. Liste publicadores com
> busca local e situação necessária para identificação; ao tocar, abra detalhe no stack e consulte
> `publisher_id`, exibindo território, retirada, devolução ou `Em andamento`, com paginação. Não
> exponha criar, renomear, código, ativar/desativar ou apagar — essas ações continuam exclusivas do
> desktop. Diferencie pessoa sem histórico de busca sem resultado e preserve nome copiado nas
> linhas. Cubra erro/tentar novamente, página seguinte e back com busca/posição preservadas. Toque
> apenas nas novas telas de Publicadores, testes e registro de rota já preparado na Task 14.

---

### Task 19 — Histórico completo por período no Android

**Objetivo:** O mobile consulta todas as designações sobrepostas ao intervalo escolhido.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Tasks 06, 14 e 15
**Instrução para o subagente:**
> Spec 0015 — Task 19: Implemente por TDD a tab `Histórico` com intervalo de datas e lista de
> cartões densos contendo Território, Publicador, Retirada, Devolução e Situação. Converta datas ao
> mesmo intervalo local semiaberto do desktop; ao mudar/limpar filtro, volte à página 1 e ignore
> respostas obsoletas. Use o date picker já instalado, com rótulos visíveis e ação clara de limpar.
> Cubra sobreposição devolvida pelo servidor, aberta como `Em andamento`, empty/no-results/error,
> paginação e restauração ao trocar de tab. Esta tela é consulta: não apaga designações. Toque
> apenas na tela de Histórico, teste e componente de intervalo compartilhado estritamente
> necessário.

---

### Task 20 — Estados, acessibilidade e adaptação entre superfícies

**Objetivo:** Operações equivalentes se comportam igual no desktop e no Android.
**Camadas:** Presentation desktop e mobile
**Modo:** direto
**Depende de:** Tasks 10, 11, 12, 13, 16, 17, 18 e 19
**Instrução para o subagente:**
> Spec 0015 — Task 20: Faça uma passada de consistência usando `UX-CONTRACT.md` e o comp aprovado.
> Unifique vocabulário (`Territórios`, `Publicadores`, `Histórico completo`, `Retirada`,
> `Devolução`, `Em andamento`), estados assíncronos, tentar novamente, busca com limpar, foco/back,
> confirmação e intenção de botões. No desktop, verifique teclado, Escape, 200% de zoom, tabela com
> scroll interno e janela estreita; no Android, alvos de toque, TalkBack labels, fonte ampliada,
> teclado, safe areas e back físico. Não introduza nova função nem refatore camadas de dados.
> Corrija apenas violações observadas e atualize testes de acessibilidade/comportamento afetados.

---

### Task 21 — Verificação visual, gates e documentação final

**Objetivo:** Encerrar a reformulação com evidência, revisão independente e contexto durável.
**Camadas:** Validação, Design/Documentação
**Modo:** direto
**Depende de:** Tasks 03, 20
**Instrução para o subagente:**
> Spec 0015 — Task 21: Execute a verificação final proporcional ao risco. Rode testes, lint e
> typecheck de `admin/` e `admin-app/`, testes relevantes do servidor e
> `python <frontend-design-premium>/scripts/audit_project.py <raiz> --mode strict`. Rode o catálogo
> de anti-patterns e o detector Impeccable uma única vez apenas sobre o Renderer web alterado; não
> rode detector HTML/CSS sobre React Native. Valide o desktop em viewport largo/estreito e capture
> `.impeccable/review/desktop.png`; valide Android em telefone e capture
> `.impeccable/review/phone-android.png`. Se não houver emulador/aparelho ou JDK 17, registre o risco
> sem fingir a validação e não rode Gradle contra o pré-requisito ausente.
>
> Avance os gates Impeccable restantes na ordem (`hero`, `sections`, `motion`, `responsive`,
> `review`), comparando o primeiro viewport desktop com
> `.impeccable/mocks/admin-table-detail.webp`. Use o finish reviewer indicado pela skill com as
> capturas e trate o veredito; depois gere `DESIGN.md` e `.impeccable/design.json` pelo documenter,
> mapeando tokens para `admin/src/renderer/index.css` e
> `admin-app/src/presentation/theme.ts`. Atualize `AGENTS.md` com a nova arquitetura de informação
> e finalize a documentação Centaur. Não marque concluído com gate, teste ou risco material
> ocultado. Toque apenas em correções reveladas pela validação e documentação final.

## Como executar

Recomendado — orquestração automática:

```text
/centaur-driven-run 0015
```

Ordem recomendada: Task 01 → 02 → 03; após a Task 02, Tasks 04 e 06 podem rodar em paralelo, e a
Task 05 segue a 04. A Task 07 prepara o contrato visual em paralelo ao servidor. No desktop,
Tasks 08 e 09 preparam shell/componentes; Tasks 10, 11 e 12 podem então avançar em paralelo, e a
13 consolida as telas restantes. No Android, Tasks 14 e 15 preparam navegação/componentes; Tasks 16,
18 e 19 podem avançar em paralelo, com a 17 após a 16. Task 20 reconcilia os dois clientes e Task 21
fecha testes, gates, revisão e documentação.

Alternativa manual — abra um subagente por task e invoque a skill indicada pelo `Modo`:

```text
/centaur-driven-tdd [instrução da task TDD]
/centaur-driven-implement [instrução da task direta]
```

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido por quem orquestra ao iniciar a primeira task
- `Concluída` → somente depois da Task 21, com checklist, gates e documentação finalizados
- Tasks bloqueadas ficam anotadas no checklist com o motivo e não transformam a spec em concluída

## Checklist de conclusão

- [x] Task 01 — Consulta paginada e sobreposição no repositório → implements/0212
- [x] Task 02 — Contrato HTTP paginado do histórico de designações → implements/0215
- [x] Task 03 — Integração HTTP do histórico por sobreposição → implements/0218
- [x] Task 04 — Modelos e cliente HTTP do desktop → implements/0216
- [x] Task 05 — IPC e preload do histórico paginado → implements/0219
- [x] Task 06 — Modelos e cliente HTTP do admin Android → implements/0217
- [x] Task 07 — Especificação mensurável e contrato de UX → implements/0211
- [x] Task 08 — Shell e tokens do admin desktop → implements/0213
- [x] Task 09 — Controles compartilhados do desktop → implements/0214
- [x] Task 10 — Workspace Territórios no desktop → implements/0224
- [x] Task 11 — Histórico de territórios por publicador no desktop → implements/0222
- [x] Task 12 — Histórico completo filtrado no desktop → implements/0223
- [x] Task 13 — Migração visual das demais telas desktop → implements/0228
- [x] Task 14 — Navegação e tema do admin Android → implements/0220
- [x] Task 15 — Controles compartilhados do admin Android → implements/0221
- [x] Task 16 — Territórios com Lista/Mapa no Android → implements/0225
- [x] Task 17 — Detalhe de território e quadras no Android → implements/0229
- [x] Task 18 — Publicadores e histórico de territórios no Android → implements/0226
- [x] Task 19 — Histórico completo por período no Android → implements/0227
- [x] Task 20 — Estados, acessibilidade e adaptação entre superfícies → implements/0230
- [ ] Task 21 — Verificação visual, gates e documentação final — Bloqueada: APK release gerado; PostGIS ainda recusa conexão em `127.0.0.1:5432`, não há dispositivo Android em `adb` e não há janela Electron capturável; gates visuais e documentação final aguardam evidência válida.
