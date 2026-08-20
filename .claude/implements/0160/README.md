# [0160] Admin: a tabela de quadras na página de configurações do território

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0010/` — Task 10

## Solicitação
> Spec 0010 — Task 10: implemente por TDD a tabela de quadras em
> `admin/src/renderer/screens/TerritorySettingsScreen.tsx`, com os casos no teste co-localizado que
> já existe. Abaixo do resumo, uma tabela das quadras ordenada por número, com número, status e
> última visita; o status sai de `blockColorCategory` (nunca uma segunda cópia da regra), escrito
> por extenso, e diz quando é forçado. Território sem quadra mostra uma mensagem. Clicar numa linha
> expande o `BlockWorkPanel` da Task 09 dentro da página, clicar de novo recolhe, e abrir outra
> linha troca o painel. O `onChanged` do painel precisa atualizar a tabela e o resumo, buscando a
> versão nova por `window.api.territories.listWithBlocks()`.

## Contexto
A `TerritorySettingsScreen` (spec 0009) já reunia nome, rotação, resumo e o apagar do território,
mas falava das quadras só por contagem. A spec 0010 criou o `BlockWorkPanel` (Task 09) e faltava o
lugar de onde abri-lo: esta task é a tabela que lista as quadras e expande o painel de cada uma
dentro da própria página, para o admin percorrer várias sem ir e voltar.

## Critérios de aceite
- A tabela lista as quadras ordenadas por número, com número, status e última visita.
- O status é escrito por extenso ("Nunca trabalhada", "Vencida", "Recente") e vem de
  `blockColorCategory` com a rotação do território — correto tanto para 30 dias quanto para o
  padrão de 120.
- Uma quadra com `statusOverride` mostra o status forçado e é sinalizada como forçada.
- A última visita mostra a data, ou "Nunca trabalhada" quando não há nenhuma.
- Território sem quadras mostra uma mensagem própria em vez de uma tabela vazia.
- Clicar numa linha abre o `BlockWorkPanel` daquela quadra; clicar de novo fecha.
- Abrir outra linha move o painel, sem empilhar dois.
- Uma mudança disparada pelo painel (`onChanged`) atualiza a linha e o resumo sem sair da página.
- Uma falha ao recarregar aparece na tela em vez de deixar a tabela silenciosamente velha.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | lists the territory blocks ordered by number | `admin/src/renderer/screens/TerritorySettingsScreen.test.tsx` | `sortedBlocks` + a `<table>` com a coluna do número |
| 2 | spells out the status of each block against the territory rotation | idem | `CATEGORY_LABEL` e a coluna de status, alimentada por `blockColorCategory` |
| 3 | spells out the status against the default rotation when the territory has none | idem | (verde de imediato — guarda de regressão do ramo do padrão, já exercitado no ciclo 2) |
| 4 | marks a forced status as forced | idem | o sufixo "(forçado)" na célula de status |
| 5 | shows the date of the last visit, and says so when there was none | idem | a coluna "Última visita" |
| 6 | says the territory has no blocks instead of showing an empty table | idem | a mensagem do território sem quadras |
| 7 | opens the work panel of the clicked block and closes it on a second click | idem | `openBlockId`, o botão-número com `aria-expanded` e a linha expandida com o `BlockWorkPanel` |
| 8 | moves the panel to the other block instead of stacking two of them | idem | (verde de imediato — o estado de um id só, escolhido no ciclo 7, é o que garante isso) |
| 9 | refreshes the row and the summary after a marking made in the panel | idem | `refreshed`/`current` e `handleBlocksChanged` lendo `territories.listWithBlocks()` |
| 10 | shows a failed refresh instead of leaving the table silently stale | idem | o `catch` de `handleBlocksChanged` traduzindo o erro com `parseIpcError` |
| 11 | keeps what is on screen when the territory is no longer in the listing | idem | o guarda `if (fresh !== undefined)` |

Nos ciclos 10 e 11 a tratativa de erro foi **removida do código antes de escrever o teste**, para
que o RED fosse real e não uma asserção sobre algo já pronto; só depois de ver os dois falharem ela
voltou.

## O que foi feito
`TerritorySettingsScreen` ganhou, abaixo do resumo, a seção "Quadras do território": uma tabela de
três colunas ordenada por número, em que o próprio número é o botão que expande o `BlockWorkPanel`
daquela quadra numa linha logo abaixo. A tela deixou de ler o território só da prop — agora mantém
a versão recarregada (`refreshed`) que o `onChanged` do painel busca por
`territories.listWithBlocks()`, e tabela, resumo, título e confirmação de apagar leem dessa versão.

## Arquivos modificados
- `admin/src/renderer/screens/TerritorySettingsScreen.tsx` — a tabela de quadras, o painel expandido
  por linha e a recarga disparada pelo `onChanged`.
- `admin/src/renderer/screens/TerritorySettingsScreen.test.tsx` — 11 casos novos, mais o fake de
  `window.api` estendido com `workLogs`, `blocks` e `publishers` (o painel os chama ao montar).
- `admin/src/renderer/index.css` — estilos de `.settings-blocks`, `.block-row-toggle` e
  `.block-status-forced`.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **O número é o botão.** Manter a célula com o texto do número (e o nome acessível no
  `aria-label`) preserva a leitura de tabela numerada e evita uma coluna a mais só para o controle.
  `aria-expanded` é o que diz, sem cor, qual linha está aberta.
- **Um `openBlockId`, não um conjunto.** Abrir outra linha move o painel porque só cabe um id no
  estado — a regra pedida pela spec sai da estrutura de dados, sem código de caso especial.
- **`refreshed` com guarda de id.** A tela recebe o território por prop; guardar a versão nova num
  estado e usar `refreshed.id === territory.id` como condição faz uma navegação para outro
  território descartar a recarga velha em vez de exibi-la.
- **`listWithBlocks` porque não existe leitura por território na ponte.** É a única chamada que
  traz as quadras junto; a tela escolhe a sua da listagem. Território que sumiu da listagem
  (apagado em outro lugar) mantém o que está na tela — apagar a tabela seria pior que mostrar o
  último estado conhecido.
- **O `h3` da seção é "Quadras do território", não "Quadras".** O resumo já tem um `<dt>Quadras</dt>`,
  e dois textos idênticos quebrariam o `getByText('Quadras')` que o teste do resumo já usava; mudar
  o texto novo foi preferível a afrouxar o teste antigo.
- **Sem teste do relógio real.** Os dois ramos de branch descobertos são o `now ?? new Date()` dos
  dois `useMemo`: todo teste fixa `now`, que é a convenção já adotada nesta tela.

## Como validar
```bash
cd admin && npx vitest run src/renderer/screens/TerritorySettingsScreen.test.tsx
```

## Resultado da validação
- `npx vitest run src/renderer/screens/TerritorySettingsScreen.test.tsx` → 31 testes passando.
- `npx vitest run` (suíte inteira do admin) → 26 arquivos, **502 testes passando**.
- Cobertura de `TerritorySettingsScreen.tsx`: **100% de linha, 100% de statements, 100% de funções,
  96,42% de branch** (os dois ramos restantes são o fallback `new Date()` descrito acima).
- `npx tsc --noEmit -p tsconfig.web.json` → limpo.
- `npx eslint` nos arquivos tocados → sem erros nem warnings. (O único warning do renderer é de
  formatação em `TerritoryEditorScreen.tsx`, arquivo não tocado por esta task.)
