# [0018] Polimento de layout, UX e UI dos três clientes

**Data:** 2026-10-22
**Status:** Pendente
**Escopo:** master
**Responsável:** dalistor
**Contrato:** —
**Regras:** —
**Spec mestre:** —
**Specs filhas:** —
**Dependências:** master/0017 (as telas de campanha entram no polimento); master/0015 Task 21 (verificação visual dos admins, bloqueada por ambiente)
**Solicitação original:** “Aproveite também para melhorar o layout, UX e UI de ambos os 3 apps — /design-taste-frontend”

## Objetivo e demonstração

**Antes:** os dois admins passaram pelo redesign da 0015 (tokens de `DESIGN.md`, `UX-CONTRACT.md`);
o app do publicador nunca passou — tem tema próprio (`app/src/presentation/theme.ts`) e telas
(`ActivationScreen`, `DashboardScreen`, `MapScreen`) anteriores a essa linguagem.
**Depois:** os três clientes falam a mesma linguagem visual de `DESIGN.md`, o app do publicador
abre no mapa com hierarquia clara (o que fazer hoje, quadras vencidas do meu território/campanha) e
os admins recebem a passada de correções da auditoria. Demonstração: capturas antes/depois de cada
tela principal nos três clientes, com a lista de achados da auditoria fechada ou justificada.

## Impacto previsto

Só apresentação: `app/src/presentation/**`, `admin-app/src/presentation/**`,
`admin/src/renderer/**` (CSS/componentes), `DESIGN.md`/`UX-CONTRACT.md` quando a auditoria pedir
token novo. Nenhuma rota, regra ou dado muda. Cores de status da quadra (`blockColor.ts`, as três
cópias) **não** mudam aqui — são de domínio e idênticas nos três clientes.

## Autonomia e decisões

Sem contrato de comportamento: é trabalho de apresentação dentro das capacidades existentes. O
executor decide composição, espaçamento, tipografia e microinteração dentro de `DESIGN.md`.
Qualquer mudança que remova, mova para outro nível ou renomeie uma ação existente é apresentada ao
usuário antes (captura + motivo), porque muda o hábito de quem já usa.

## Contexto técnico

Cada executor carrega `design-taste-frontend` (modo telas de app: auditoria, regras, loop de
captura e correção) e `clean-code`. Fontes: `DESIGN.md`, `UX-CONTRACT.md`, `PRODUCT.md`,
`.impeccable/` (comp aprovado da 0015), `premium-audit.json`. Verificação visual do Android depende
de emulador/aparelho com JDK 17 — ausente nesta máquina segundo o AGENTS.md; sem ele, a evidência
é a captura do Electron e os testes de tela.

## Tasks

### Task 01 — Auditoria visual dos três clientes
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** somente leitura; relatório em `.centaur/specs/0018/audit.md`
**Depende de:** master/0017
**Verificação:** Relatório com achados por tela, severidade e captura quando disponível.
**Instrução para o executor:**
> Spec master/0018 — Task 01: rodar a auditoria de `design-taste-frontend` em cada tela principal dos três clientes, comparando com `DESIGN.md`/`UX-CONTRACT.md`. Separar: inconsistências com os tokens, problemas de hierarquia/fluxo, estados ausentes (vazio, carregando, erro, sem rede), acessibilidade (alvo de toque, contraste). Não editar código.

### Task 02 — App do publicador na linguagem de `DESIGN.md`
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `app/src/presentation/theme.ts`, `app/src/presentation/screens/*`, `app/src/presentation/components/*`, `app/src/presentation/map/*` (só estilo de controles sobrepostos)
**Depende de:** Task 01
**Verificação:** Testes de tela existentes continuam verdes (atualizar seletores por texto se mudarem); captura em emulador quando disponível.
**Instrução para o executor:**
> Spec master/0018 — Task 02: migrar o tema para os tokens de `DESIGN.md` (versão mobile) e aplicar os achados da Task 01 nas telas de ativação, início (inclusive a aba Campanhas) e mapa. Manter a abertura direto no mapa e a confirmação pelo servidor da marcação.

### Task 03 — Correções da auditoria no app admin
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `admin-app/src/presentation/**`
**Depende de:** Task 01
**Verificação:** `npm test`, `lint`, `typecheck` em `admin-app/`.
**Instrução para o executor:**
> Spec master/0018 — Task 03: aplicar os achados da Task 01 sem reabrir decisões da 0015.

### Task 04 — Correções da auditoria no admin desktop
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `admin/src/renderer/**`
**Depende de:** Task 01
**Verificação:** `npm test`, `typecheck`; captura antes/depois no `npm run dev`.
**Instrução para o executor:**
> Spec master/0018 — Task 04: aplicar os achados da Task 01 com o loop de captura e correção do `design-taste-frontend`.

## Validação e integração

Capturas antes/depois anexadas ao relatório; suítes dos três clientes verdes. Integração na `main`
sob autorização do usuário; APKs e build desktop são publicação separada.

## Diferença entre plano e resultado

—

## Checklist de conclusão
- [ ] Task 01 — Auditoria visual dos três clientes
- [ ] Task 02 — App do publicador na linguagem de `DESIGN.md`
- [ ] Task 03 — Correções da auditoria no app admin
- [ ] Task 04 — Correções da auditoria no admin desktop

## Execução
$run master/0018

## Estado
O ciclo normativo define o estado. Checkboxes não concluem a spec.
