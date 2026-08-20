# [0147] Admin: a página de configurações do território (spec 0009, Task 09)

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 09

## Solicitação

Implementar por TDD `admin/src/renderer/screens/TerritorySettingsScreen.tsx` com teste
co-localizado, ligá-la ao roteamento em `App.tsx` e ao menu "⋮" da lista de territórios na
`HomeScreen`. A tela recebe o território (com as quadras já carregadas) e mostra nome editável,
tempo de rotação em dias (vazio = padrão de 120 dias, dito na interface), um resumo somente-leitura
(quadras, vencidas segundo a rotação em vigor via `blockColorCategory`, publicador designado,
última visita) e a ação de apagar o território reaproveitando `deleteTerritoryConfirmMessage`.
Só `window.api`, nada de HTTP; tocar apenas em `admin/src/renderer/`.

## Contexto

Terceiro objetivo da spec 0009: depois de a rotação existir no servidor (Tasks 01–06), no modelo
compartilhado e na regra de cor do admin (Task 07) e no IPC (Task 08), faltava o lugar onde o admin
configura essa rotação. O admin já tinha oito telas; esta é a nona, e a primeira que reúne
configuração e resumo de um território num lugar só — antes, apagar território só existia no menu
da `HomeScreen` e a rotação não existia em lugar nenhum.

## Critérios de aceite

- A tela mostra o nome e a rotação atuais do território.
- O campo de rotação fica vazio quando o território usa o padrão, e a interface diz por escrito
  que vazio significa o padrão de 120 dias.
- Editar o nome e salvar chama `territories.update` com o nome novo.
- Digitar 60 e salvar manda `rotationDays: 60`.
- Limpar o campo e salvar manda `rotationDays: null`.
- Valor inválido de rotação (zero, negativo, texto, fração) é barrado com mensagem **antes** de
  chamar a API.
- Nome em branco é barrado com mensagem antes de chamar a API.
- Um erro vindo da API aparece na tela em vez de sumir.
- O resumo conta as quadras e as vencidas corretamente para uma rotação de 30 dias e para o padrão.
- O resumo nomeia o publicador designado, ou "Nenhum", e a data da última visita, ou
  "Nunca trabalhada".
- Apagar pede confirmação (com a mesma mensagem da `HomeScreen`); cancelar não chama
  `territories.delete`; uma falha ao apagar aparece na tela.
- A `HomeScreen` tem, no menu "⋮" de cada território, uma entrada que navega para esta tela.
- `App.tsx` empurra a tela com "← Voltar" e volta para a Home.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | shows the territory current name in the name field | `TerritorySettingsScreen.test.tsx` | esqueleto da tela + campo de nome |
| 2 | shows the territory current rotation in the rotation field | idem | campo de rotação (string, `type="text"` + `inputMode`) |
| 3 | leaves the rotation field empty and spells out the default when the territory has none | idem | `field-hint` com `DEFAULT_ROTATION_DAYS` |
| 4 | saves the edited name through territories.update | idem | `handleSave`, botão "Salvar", `parseIpcError` |
| 5 | sends the typed number as rotationDays | idem | (já satisfeito pelo corpo montado no ciclo 4) |
| 6 | sends rotationDays: null when the rotation field is cleared | idem | (idem) |
| 7 | refuses zero / negative / text / fraction before calling the API | idem | `parseRotation` + `ROTATION_ERROR_MESSAGE` |
| 8 | refuses a blank name before calling the API | idem | `BLANK_NAME_ERROR_MESSAGE` |
| 9 | shows a refusal coming from the API instead of losing it | idem | (coberto pelo `catch` do ciclo 4) |
| 10 | counts the blocks and the overdue ones against the territory rotation / against the default | idem | `summary` via `blockColorCategory` |
| 11 | names the designated publisher, and says "Nenhum" when there is none | idem | linhas do `<dl>` |
| 12 | shows the most recent visit / says never worked | idem | `summary.lastVisit` + `formatDate` |
| 13 | asks for confirmation, deletes and reports back / cancela / falha aparece | idem | `handleDelete` + `deleteTerritoryConfirmMessage` |
| 14 | the "⋮" menu offers exactly four actions (…settings…) e chama `onOpenSettings` | `HomeScreen.test.tsx` | prop `onOpenSettings` e o item de menu |
| 15 | opens the settings screen from a territory's "Configurações" action and returns home on "← Voltar" | `App.test.tsx` | rota `territory-settings` dentro de `PushedScreen` |

## O que foi feito

- Nova tela `TerritorySettingsScreen`, com nome, rotação, resumo e apagar, falando só com
  `window.api.territories`.
- `HomeScreen` ganhou a prop `onOpenSettings` e o item "Configurações de {território}" no menu "⋮"
  (agora com quatro ações).
- `App.tsx` ganhou a rota `territory-settings`, empurrada com `PushedScreen`; `onSaved` e
  `onDeleted` voltam para a Home, que refaz o fetch dos territórios no mount.
- `deleteTerritoryConfirmMessage`/`deleteBlockConfirmMessage` saíram da `HomeScreen` para
  `screens/confirmMessages.ts`, para que as duas telas usem o mesmo texto.
- Estilos novos em `index.css` (`.settings-screen`, `.field-hint`, `.settings-summary`,
  `.settings-danger`).
- De quebra, os fakes de `IpcApi.workLogs` dos testes de renderer ganharam `markWorked`: a Task 08
  acrescentou o método ao contrato e deixou `npm run typecheck` vermelho em oito arquivos de teste.

## Arquivos modificados

- `admin/src/renderer/App.tsx` — rota `territory-settings` e a ligação com `onOpenSettings`
- `admin/src/renderer/App.test.tsx` — teste da rota nova; fake de `workLogs` com `markWorked`
- `admin/src/renderer/screens/HomeScreen.tsx` — prop `onOpenSettings`, item de menu, mensagens de
  confirmação movidas para `confirmMessages.ts`
- `admin/src/renderer/screens/HomeScreen.test.tsx` — menu com quatro ações e o novo callback
- `admin/src/renderer/index.css` — estilos da tela de configurações
- `admin/src/renderer/screens/{BlockEditorScreen,BlockHistorySheet,DesignationsScreen,HistoryScreen,SetupScreen,TerritoryEditorScreen}.test.tsx`
  — `markWorked` nos fakes de `workLogs` (typecheck)

## Arquivos criados

- `admin/src/renderer/screens/TerritorySettingsScreen.tsx` — a tela
- `admin/src/renderer/screens/TerritorySettingsScreen.test.tsx` — os 20 testes dela
- `admin/src/renderer/screens/confirmMessages.ts` — os textos de confirmação destrutiva,
  compartilhados entre `HomeScreen` e `TerritorySettingsScreen`

## Decisões técnicas

- **Campo de rotação é `type="text"` com `inputMode="numeric"`, não `type="number"`.** Um input
  numérico devolve string vazia quando o que foi digitado não é um número — e vazio, aqui, tem o
  significado legítimo de "usar o padrão". Aceitar isso transformaria um erro de digitação numa
  mudança silenciosa de configuração, exatamente o que o critério de aceite pede para barrar.
- **`parseRotation` devolve `number | null | 'invalid'`**, para que "vazio" e "inválido" nunca sejam
  o mesmo caso no chamador.
- **O resumo usa `blockColorCategory`**, a mesma função que colore o mapa, com a rotação do
  território. Contar "vencidas" à mão aqui seria uma segunda cópia da regra, que divergiria do mapa
  na primeira mudança.
- **"Vencidas" e "nunca trabalhadas" são duas linhas.** `blockColorCategory` distingue `'overdue'`
  de `'never'`, e somá-las esconderia justamente a quadra que nunca foi visitada — a informação mais
  acionável do resumo. "Vencida" fica sendo o que a rotação define; "nunca trabalhada" independe de
  rotação.
- **O resumo lê a rotação salva, não a digitada.** É "a rotação em vigor": enquanto o admin ainda
  não salvou, o número no campo não vale para o mapa nem para ninguém.
- **`confirmMessages.ts` em vez de exportar a função da `HomeScreen`.** Exportar uma função pura de
  um arquivo que também exporta componente quebra o Fast Refresh
  (`react-refresh/only-export-components`, erro de lint no projeto). O módulo separado mantém uma
  única fonte do texto sem esse custo.
- **`onSaved`/`onDeleted` voltam para a Home**, como o editor de território já faz: a `HomeScreen`
  refaz o fetch no mount, então voltar já é a invalidação de que o nome novo, a rotação nova ou o
  território apagado precisam — sem um caminho de invalidação próprio.
- **Sem teste do estado "Salvando…"** como caso próprio: é o mesmo `disabled` em voo que as outras
  telas já cobrem, e o comportamento observável que importa (não chamar a API duas vezes) está no
  botão desabilitado.

## Como validar

```bash
cd admin && npx vitest run
# ou só esta tela:
npx vitest run src/renderer/screens/TerritorySettingsScreen.test.tsx
```

## Resultado da validação

- `npx vitest run` — **432 testes passando**, 23 arquivos (20 novos em
  `TerritorySettingsScreen.test.tsx`, 1 novo em `HomeScreen.test.tsx`, 1 novo em `App.test.tsx`).
- Cobertura (`--coverage`) nos arquivos tocados: `TerritorySettingsScreen.tsx` 100% de linhas,
  branches, funções e statements; `confirmMessages.ts` 100% em tudo; `HomeScreen.tsx` 100% de
  linhas/statements e 87,5% de branches (branches pré-existentes, não introduzidas aqui);
  `App.tsx` 97,53% de linhas e 89,13% de branches.
- `npm run typecheck` — **0 erros** (eram 9 antes, herdados da Task 08).
- `npx eslint src/renderer` — sem erros; resta 1 warning de formatação pré-existente em
  `TerritoryEditorScreen.tsx`, fora do escopo desta task.
