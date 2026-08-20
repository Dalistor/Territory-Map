# [0161] Documentar o status forçado e a tabela de quadras no `CLAUDE.md`

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0010/` — Task 12

## Solicitação
"Spec 0010 — Task 12: atualize o `CLAUDE.md` da raiz para refletir a spec 0010, no mesmo tom do
documento (português, explicando o porquê e não só o quê, sem inflar)" — cobrindo `status_override`
no modelo de dados, a regra de cor, a entrada pelo `PATCH /admin/blocks/{block_id}`, a tabela de
quadras da `TerritorySettingsScreen` e os Pontos em Aberto. Tocar apenas no `CLAUDE.md`.

## Contexto
As onze tasks anteriores da spec 0010 já estavam concluídas: a coluna existe no banco, os dois
clientes a respeitam, e a página de configurações do território ganhou a tabela de quadras com o
painel de trabalho embutido. O `CLAUDE.md` ainda descrevia o sistema anterior — sem a coluna, com a
cor decidida só por data, e com a página de configurações apenas somente-leitura abaixo do nome e da
rotação.

## O que foi feito
Cinco trechos do `CLAUDE.md` foram atualizados:

1. **Modelo de Dados → Block**: a coluna `status_override` entrou na tabela de campos
   (`VARCHAR(16) NULL`, CHECK `ck_blocks_status_override` restringindo a `overdue`/`never`), com dois
   parágrafos novos: nulo é "derive a cor dos registros" e por isso a migration não faz backfill nem
   define `server_default`; e a coluna convive com `last_worked_at` em vez de substituí-la — o log é
   a verdade sobre quem esteve lá e quando, o override só diz como pintar. Ficou registrado também o
   caminho descartado (forçar laranja criando um registro antigo), porque exigiria nomear um
   publicador que nunca esteve ali.
2. **Regras de Negócio → Cor da quadra no mapa**: o override é consultado antes do cálculo por data
   nos dois clientes; qualquer registro de trabalho novo o limpa (rota do app e rota do admin), e
   apagar um registro não mexe nele, com o porquê das duas metades. Também o reenvio de `log_id`, que
   volta antes de gravar e portanto não limpa nada, e a obrigação de a interface dizer quando o
   forçado se desfaz.
3. **Regras de Negócio → Demarcação de quadra (block)**: item novo sobre o `PATCH
   /admin/blocks/{block_id}`, com a mesma distinção ausente/nulo já documentada para `rotation_days`
   e a nota de que quem traduz é o router, por `model_fields_set`.
4. **Estrutura do Projeto**: a descrição da `TerritorySettingsScreen` passou a incluir a tabela de
   quadras e o `BlockWorkPanel` expandido na linha, mais o `MarkWorkedForm` extraído da `HomeScreen`.
   A `BlockHistorySheet` foi mantida e reposicionada: ela continua sendo a tela empurrada a partir do
   mapa, e o texto agora diz explicitamente como as duas dividem o assunto. A contagem de telas
   **não** mudou (continuam nove telas roteadas), porque o que a spec acrescentou foram componentes,
   não telas — e eles foram citados na frase de cobertura de teste, aqui e na seção de deploy.
5. **Pontos em Aberto**: o item da listagem de quadras vencidas passou a "existe por território,
   falta a congregação inteira de uma vez". Em "Resolvidos", entrou a correção do registro de
   trabalho pela interface e o forçar cor.

## Arquivos modificados
- `CLAUDE.md` — Modelo de Dados (Block), Regras de Negócio (cor da quadra e demarcação de quadra),
  Estrutura do Projeto (telas do admin), Como Fazer Deploy (frase de cobertura de teste) e Pontos em
  Aberto.

## Arquivos criados
- Nenhum (fora a documentação desta implementação).

## Decisões técnicas
- **A contagem "nove telas" foi mantida.** `BlockWorkPanel` e `MarkWorkedForm` são componentes, não
  telas roteadas — `admin/src/renderer/App.tsx` continua roteando as mesmas nove. Inflar a contagem
  faria o número deixar de corresponder ao roteador, que é o que ele descreve.
- **A `BlockHistorySheet` não foi removida do texto.** Ela continua existindo e sendo roteada; o que
  mudou é que passou a dividir o assunto com o painel novo, e o `CLAUDE.md` agora diz qual caminho
  serve a qual situação em vez de deixar o leitor achar que uma substituiu a outra.
- **A limpeza do override foi documentada na seção de cor, não na de marcação pelo admin.** É uma
  regra sobre como a quadra é pintada, e mantê-la junto do resto da regra de cor evita que as duas
  metades da assimetria (limpar ao gravar, não limpar ao apagar) fiquem em seções diferentes.
- **O ponteiro para o teste de integração ficou no texto.** A assimetria é o comportamento que um
  refactor futuro mais provavelmente quebra, e dizer onde está a rede de segurança vale mais que a
  linha que custa.

## Como validar
Ler as cinco seções do `CLAUDE.md` citadas acima e conferir contra o código: `server/app/models/block.py`
(coluna e CHECK), `admin/src/renderer/map/blockColor.ts` e `app/src/domain/blockColor.ts` (override antes
da data), `server/app/routers/admin_blocks.py` (ausente vs. nulo) e
`admin/src/renderer/screens/TerritorySettingsScreen.tsx` (tabela + painel).

## Resultado da validação
Mudança apenas de documentação — não há teste, lint ou type-check que a alcance, e nenhum código foi
tocado (`git diff --stat` confirma que o único arquivo modificado por esta task é o `CLAUDE.md`). A
verificação foi feita por leitura cruzada com o modelo, os dois `blockColor.ts`, o router e a tela,
confirmando que cada afirmação nova corresponde ao que está implementado.
