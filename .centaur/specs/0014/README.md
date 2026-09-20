# [0014] Melhorias de UI nos admins e último trabalho do território

**Data:** 2026-09-05
**Status:** Concluída
**Solicitação original:** "Faça uma spec para melhorar a UI dos apps e aplicar este detalhe"

## Objetivo

Melhorar os fluxos mais importantes do admin desktop e do admin mobile, com foco em clareza,
acessibilidade e uso em campo, e mostrar na lista de territórios quem realizou o trabalho mais
recente e em que data.

O último trabalho de um território é o registro com maior `worked_at` entre todas as suas quadras.
O retorno deve trazer o nome preservado no registro de trabalho e a data correspondente. Quando não
houver registros, os clientes mostram **Nunca trabalhado**. A informação será entregue pelo servidor
junto do território, sem uma requisição por quadra.

## Contexto técnico

O servidor já possui `BlockWorkLogRepository.list_worked_territories`, mas esse método é filtrado por
publicador e não atende à lista geral de territórios. `TerritoryOut` atualmente traz território,
designação, rotação e quadras, mas não traz o último trabalho agregado. O nome do publicador deve vir
do `user_name` persistido no log, pois o histórico continua legível mesmo depois da exclusão da
pessoa.

No desktop, a Home está em `admin/src/renderer/screens/HomeScreen.tsx`, a navegação e a sidebar em
`admin/src/renderer/App.tsx`, os diálogos e responsividade em `admin/src/renderer/index.css`, e as
demais telas têm testes Vitest co-localizados. No mobile, a tela principal está em
`admin-app/src/presentation/screens/DesignationsScreen.tsx`, os detalhes em `AssignmentPanel.tsx`,
`BlocksScreen.tsx` e `BlockPanel.tsx`, e a navegação raiz em `admin-app/src/presentation/App.tsx`.

As cores das quadras são regra de domínio, não tema: a legenda deve usar as mesmas categorias
`Nunca trabalhada`, `Vencida` e `Em dia` sem duplicar a decisão de cor. O mapa nativo continua sem
teste de renderização; cálculos puros e comportamento de telas devem ser testados.

O skill de React Native exige medir antes de trocar listas ou adicionar memoização. Portanto, a
substituição de `ScrollView` por `FlatList` só deve acontecer se a medição ou uma limitação
observável justificar a mudança; não é permitido fazer otimização especulativa.

## Tasks

### Task 01 — Agregação do último trabalho por território

**Objetivo:** O servidor consegue consultar, por congregação, o último registro de trabalho de cada território.
**Camadas:** Repositories
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0014 — Task 01: Implemente por TDD uma consulta em `server/app/repositories/block_work_log.py`
> que devolva, para uma congregação, no máximo uma linha por território: `territory_id`,
> `user_id`, `user_name` e o maior `worked_at` entre todas as quadras daquele território.
> Faça os joins por `Block` e `Territory`, filtre sempre por `Territory.congregation_id` e não
> devolva dados de outra congregação. Em empate de `worked_at`, escolha um resultado determinístico
> usando o id do log como desempate, se a consulta precisar expor essa coluna internamente.
>
> Critérios de aceite: retorna o trabalho mais recente entre várias quadras do mesmo território;
> retorna o nome armazenado no log; não mistura territórios; uma congregação sem registros retorna
> lista vazia; registros de outra congregação são ignorados.
>
> Reaproveite o estilo de `BlockWorkLogRepository` e seus testes. Não altere schemas, routers ou
> clientes nesta task. Toque apenas na camada Repositories e nos testes dessa camada.

---

### Task 02 — DTO e rota de territórios com o último trabalho

**Objetivo:** `TerritoryOut` passa a transportar o resumo do último trabalho e as rotas de território o preenchem.
**Camadas:** DTOs, Services, Handlers
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0014 — Task 02: Implemente por TDD a extensão do retorno de território. Crie um DTO aninhado
> explícito, por exemplo `last_work`, com `user`/nome e `worked_at`, ou nomes equivalentes ao
> vocabulário já usado no projeto; o campo deve ser `null` quando não existir trabalho. O formato
> precisa ser consistente nos endpoints de listagem e detalhe de território.
>
> Integre a consulta da Task 01 ao caminho que monta `TerritoryOut`, preservando o escopo por
> congregação e evitando uma consulta por território ou por quadra quando a lista for carregada.
> Não crie migration: o dado já existe em `block_work_logs`. Atualize testes de router/service
> para cobrir território com trabalho, território sem trabalho e isolamento entre congregações.
>
> Toque apenas em schemas, services/roteamento necessários e testes correspondentes; não altere
> componentes TypeScript nesta task.

---

### Task 03 — Contratos e parsing do último trabalho nos dois clientes

**Objetivo:** Desktop e mobile interpretam o novo campo da API sem perder o comportamento atual.
**Camadas:** Data, Domain/models
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0014 — Task 03: Atualize os modelos e parsers de `admin/` e `admin-app/` para o novo resumo
> do último trabalho. Use um tipo nomeado com `PublisherBrief`/nome e `Date`, mantendo o campo
> nulo/ausente quando a API responder `null`. Não derive o nome a partir de `assignedUser`: o
> dirigente do território e quem realizou a última visita são conceitos diferentes.
>
> Atualize os testes existentes dos clientes para validar parsing com registro e sem registro. Não
> mude URLs, autenticação, ordenação de territórios ou modelos de `WorkLog` já existentes.
> Toque apenas em modelos, parsers/clientes e seus testes imediatos; não altere telas nesta task.

---

### Task 04 — Último trabalho na lista do admin desktop

**Objetivo:** Cada linha da Home informa o último publicador e a data, ou que nunca foi trabalhada.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 03
**Instrução para o subagente:**
> Spec 0014 — Task 04: Implemente por TDD em `admin/src/renderer/screens/HomeScreen.tsx` a
> apresentação do último trabalho na lista de territórios. Use texto claro e compacto, por exemplo
> `Último trabalho: João — 05/09/2026`; quando o campo for nulo, mostre `Nunca trabalhado`.
> Formate datas com a convenção local já usada pelo admin e não confunda o último trabalho com a
> designação atual.
>
> Atualize somente o teste da Home e, se necessário, as classes CSS diretamente relacionadas à
> nova linha. Cubra trabalho existente e ausência de trabalho. Não altere a API nem outras telas.

---

### Task 05 — Último trabalho na lista do admin mobile

**Objetivo:** A lista principal do app mobile informa o último publicador e a data de cada território.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 03
**Instrução para o subagente:**
> Spec 0014 — Task 05: Implemente por TDD em `admin-app/src/presentation/screens/DesignationsScreen.tsx`
> uma linha de contexto em cada cartão: `Último trabalho: Nome — dd/mm/yyyy`, ou `Nunca trabalhado`
> sem registro. Preserve separadas as informações de dirigente atual, quantidade de quadras e
> último trabalho. A data deve ser determinística nos testes e usar a mesma convenção visual das
> outras datas do app.
>
> Atualize apenas a tela e seu teste co-localizado. Não altere o mapa nativo, o contrato da API ou
> a tela de detalhes. Critérios: registro é mostrado; ausência é mostrada sem erro; nome do último
> trabalhador não é substituído pelo dirigente atual.

---

### Task 06 — Voltar físico e gesto de retorno no admin mobile

**Objetivo:** O botão físico/gesto de voltar fecha o detalhe aberto antes de sair da tela.
**Camadas:** Presentation/navigation
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0014 — Task 06: Implemente por TDD o tratamento do retorno do Android em
> `admin-app/src/presentation/screens/DesignationsScreen.tsx` ou na camada de navegação apropriada.
> Quando `AssignmentPanel`, `BlocksScreen` ou `BlockPanel` estiver aberto, o primeiro back deve
> executar a mesma ação de `← Voltar` e manter o app na lista. Quando nenhum detalhe estiver aberto,
> o comportamento padrão de navegação deve continuar intacto.
>
> Cubra os dois estados nos testes usando o mecanismo de back escolhido. Não crie uma segunda fonte
> de verdade para `detail`; o botão visível e o back físico devem chamar a mesma transição.
> Toque apenas em Presentation/navigation e testes correspondentes; não altere data ou domínio.

---

### Task 07 — Busca e seleção de publicador no mobile

**Objetivo:** O admin encontra rapidamente o publicador ao designar território ou lançar trabalho.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0014 — Task 07: Implemente por TDD uma seleção pesquisável de publicador para
> `AssignmentPanel.tsx` e `BlockWorkSection.tsx`. A busca deve filtrar por nome sem diferenciar
> maiúsculas/minúsculas, manter o nome selecionado visível e impedir o envio sem seleção. Quando
> não houver correspondência, mostre uma mensagem clara sem quebrar o formulário.
>
> Preserve a regra: somente publicadores ativos aparecem para designação; o admin pode lançar o
> trabalho de qualquer publicador permitido pelo fluxo existente. Cubra nome encontrado, busca sem
> correspondência e seleção mantida até confirmar. Não altere cliente HTTP ou regras do servidor.
> Toque apenas em Presentation e seus testes.

---

### Task 08 — Legenda de status do mapa

**Objetivo:** Desktop e mobile explicam visualmente as cores das quadras.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0014 — Task 08: Adicione uma legenda compacta e acessível próxima aos mapas do admin
> desktop e do admin mobile, usando exatamente as categorias já existentes: `Nunca trabalhada`,
> `Vencida` e `Em dia`. A legenda deve ter texto, não apenas círculos coloridos, e não deve criar
> uma nova regra ou paleta; reutilize as cores de `blockColor`.
>
> No mobile, a legenda não pode cobrir a atribuição OSM nem os controles do mapa. No desktop, ela
> deve permanecer legível sobre o mapa sem impedir o clique nas quadras. Atualize testes de
> apresentação apenas se necessário para provar que os três rótulos aparecem. Toque apenas em
> Presentation/map e estilos relacionados; não altere domain/blockColor.

---

### Task 09 — Estados de atualização e prevenção de toques duplicados

**Objetivo:** Recarregar e operações de escrita deixam claro quando estão em andamento.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0014 — Task 09: Implemente por TDD estados ocupados nas ações de recarregar do admin
> desktop e mobile. Enquanto a leitura estiver pendente, desabilite o botão, mostre `Atualizando…`
> ou equivalente e não dispare uma segunda leitura. Ao terminar, restaure o rótulo e o estado,
> inclusive quando a requisição falhar.
>
> Aplique o mesmo princípio aos botões de escrita que ainda puderem receber toques duplicados,
> sem alterar mensagens de erro ou contratos da API. Cubra sucesso, erro e segundo toque durante a
> espera. Toque apenas em telas Presentation e testes co-localizados.

---

### Task 10 — Modal acessível e ações de desktop mais descobríveis

**Objetivo:** Os diálogos do desktop funcionam corretamente com teclado/leitor de tela e as ações frequentes ficam fáceis de encontrar.
**Camadas:** Presentation, estilos
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0014 — Task 10: Implemente por TDD uma solução consistente para os diálogos customizados do
> admin desktop. Todo diálogo deve usar semântica de diálogo (não `role=menu`), `aria-modal`, título
> associado, foco inicial, retorno do foco ao abrir e fechamento por `Escape`, sem permitir interação
> acidental com o conteúdo atrás. Preserve as confirmações destrutivas e seus textos.
>
> Na Home, mantenha apagar dentro do menu, mas torne `Quadras`/`Configurações` mais descobríveis sem
> retirar o menu de opções. Garanta foco visível e navegação por teclado nos menus. Atualize testes
> de `App`, `HomeScreen`, `DesignationsScreen` e/ou um componente compartilhado conforme a solução.
> Não altere o servidor nem a API. Toque apenas em Presentation do desktop e CSS relacionado.

---

### Task 11 — Sidebar e layout responsivo do desktop

**Objetivo:** A navegação continua utilizável em janelas estreitas sem sacrificar o mapa.
**Camadas:** Presentation, estilos
**Modo:** direto
**Depende de:** Task 10
**Instrução para o subagente:**
> Spec 0014 — Task 11: Ajuste a sidebar e os layouts responsivos de `admin/`. Em larguras menores,
> a navegação deve continuar identificável e o conteúdo principal não pode ficar impraticável por
> causa da sidebar fixa de 230px. Preserve a indicação de seção ativa, a área de sair da congregação,
> o layout lado a lado em telas largas e o empilhamento em telas estreitas.
>
> Use os estilos existentes como base, sem introduzir framework de ícones ou dependência nova.
> Verifique visualmente em uma janela larga e uma estreita e mantenha testes de roteamento/sidebar
> passando. Toque apenas em `admin/src/renderer/App.tsx`, `admin/src/renderer/index.css` e testes
> de apresentação; não altere API ou servidor.

---

### Task 12 — Hierarquia do painel combinado no mobile

**Objetivo:** O painel de quadra deixa inequívoco o que afeta a quadra e o que afeta o território inteiro.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0014 — Task 12: Melhore a hierarquia visual de `BlockPanel.tsx`. Mantenha as duas áreas no
> mesmo painel, mas torne a seção da quadra e a seção do território visualmente separadas, com
> títulos persistentes, escopo explícito e ações destrutivas visualmente distintas das ações
> primárias. O texto que informa que designar/concluir/apagar afeta o território inteiro deve
> permanecer visível antes dessas ações.
>
> Não transforme a tela em uma navegação adicional nem remova ações existentes. Verifique que o
> conteúdo continua alcançável com uma única rolagem e que o painel embutido não cria ScrollView
> concorrente. Atualize testes de apresentação somente para os rótulos e escopo observáveis.
> Toque apenas em Presentation do admin mobile e testes correspondentes.

---

### Task 13 — Medição de listas e validação visual em aparelho

**Objetivo:** Confirmar que as listas e mapas continuam responsivos com dados representativos.
**Camadas:** Presentation, validação
**Modo:** direto
**Depende de:** Tasks 04, 05, 07, 08, 09, 10, 11 e 12
**Instrução para o subagente:**
> Spec 0014 — Task 13: Faça a validação final sem introduzir otimização especulativa. Rode os testes,
> lint e typecheck dos três clientes TypeScript. No admin mobile, exercite a lista com dados
> representativos e use o profiler disponível para verificar rolagem, abertura de detalhe e mapa.
> Só substitua `ScrollView` por `FlatList`/lista virtualizada se houver uma lentidão ou custo de
> renderização observável; se fizer a troca, adicione teste de comportamento e documente a medição.
>
> Faça verificação manual em emulador/aparelho Android para o back físico, área segura, teclado,
> legenda e mapa. No desktop, verifique teclado, Escape, foco, janela larga/estreita e clique nas
> quadras. Não rode Gradle se o pré-requisito documentado continuar ausente. Toque apenas nos
> arquivos de validação necessários e em correções diretamente exigidas pelos achados desta task;
> não faça refatorações fora do escopo.

## Como executar

Recomendado — orquestração automática:

```text
/centaur-driven-run 0014
```

Ordem recomendada: Tasks 01 → 02 → 03 → Tasks 04 e 05 em paralelo; Tasks 06, 07, 08 e 09 podem
começar em paralelo após suas dependências; Task 10 pode começar independentemente, Task 11 depende
da 10, Task 12 depende da 07, e Task 13 fecha depois de todas as melhorias de UI.

Execução manual:

```text
/centaur-driven-tdd [instrução da task marcada TDD]
/centaur-driven-implement [instrução da task marcada direto]
```

Os subagentes não devem editar este README nem `.centaur/implements/status.md`; a consolidação da
spec e do histórico fica para o orquestrador.

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pelo orquestrador ao iniciar a execução
- `Concluída` → definido pelo orquestrador quando todas as tasks forem concluídas

## Checklist de conclusão

- [x] Task 01 — Agregação do último trabalho por território → implements/0197
- [x] Task 02 — DTO e rota de territórios com o último trabalho → implements/0198
- [x] Task 03 — Contratos e parsing do último trabalho nos dois clientes → implements/0199
- [x] Task 04 — Último trabalho na lista do admin desktop → implements/0200
- [x] Task 05 — Último trabalho na lista do admin mobile → implements/0201
- [x] Task 06 — Voltar físico e gesto de retorno no admin mobile → implements/0203
- [x] Task 07 — Busca e seleção de publicador no mobile → implements/0202
- [x] Task 08 — Legenda de status do mapa → implements/0205
- [x] Task 09 — Estados de atualização e prevenção de toques duplicados → implements/0206
- [x] Task 10 — Modal acessível e ações de desktop mais descobríveis → implements/0207
- [x] Task 11 — Sidebar e layout responsivo do desktop → implements/0209
- [x] Task 12 — Hierarquia do painel combinado no mobile → implements/0208
- [x] Task 13 — Medição de listas e validação visual em aparelho — Concluída por decisão do responsável; risco aceito: não houve aparelho/emulador Android conectado nem verificação visual interativa do desktop autenticado.
