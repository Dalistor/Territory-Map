# [0169] Documentar a exclusão de publicador no `CLAUDE.md`

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0011/` — Task 08

## Solicitação
Atualizar o `CLAUDE.md` da raiz para refletir a spec 0011, no mesmo tom do documento (português,
explicando o porquê e não só o quê, sem inflar): a coluna `user_name` e o fim da FK para `users` nas
duas tabelas de histórico, a exclusão de publicador com 409 enquanto houver designação aberta, a
diferença entre apagar e desativar, e os ajustes em Estrutura do Projeto, Pontos em Aberto e
Resolvidos. Tocar apenas o `CLAUDE.md`.

## Contexto
As sete tasks anteriores da spec 0011 mudaram o modelo (`BlockWorkLog` e `TerritoryAssignment`
guardam `user_name` e não têm mais FK para `users`), a regra (`UserService.delete` recusa quem tem
designação aberta), a rota (`DELETE /admin/users/{id}`) e a tela (`PublishersScreen`). O `CLAUDE.md`
ainda descrevia o modelo anterior e afirmava o contrário do que passou a valer: que `user_id` era
`ON DELETE RESTRICT` "porque o histórico nomeia uma pessoa e não a perde em silêncio".

## O que foi feito
- **Modelo de dados.** As linhas de `user_id` nas tabelas de `TerritoryAssignment` e `BlockWorkLog`
  passaram a dizer "Sem FK", e cada tabela ganhou a linha `user_name`.
- **Nova subseção "O nome na linha, em vez da FK"**, logo depois de `BlockWorkLog`, valendo para as
  duas tabelas: por que o `ON DELETE RESTRICT` caiu (recusava apagar todo publicador que importava),
  por que a intenção original continua valendo com outro mecanismo (o nome copiado na escrita), o
  que `user_id` passou a ser, o fim das relationships `user`, o DTO inalterado, e as duas
  consequências aceitas — o nome é uma fotografia e homônimos ficam indistinguíveis depois da
  exclusão. Fecha com a migration `e7b34c1d5a80` e seu backfill exato, contrastada com as duas
  migrations do documento que deliberadamente **não** fazem backfill.
- **Cadastro de publicador.** Três bullets novos: apagar (204, histórico preservado), a única
  barreira (409 por designação aberta, com o 404 de escopo), e a diferença entre desativar e apagar.
- **Estrutura do projeto.** A descrição da tela de Publicadores, que citava só busca e contadores,
  passou a listar as ações da linha, incluindo apagar.
- **Resolvidos.** Frase final registrando que apagar publicador deixou de ser impossível.

## Arquivos modificados
- `CLAUDE.md` — Modelo de dados (`TerritoryAssignment`, `BlockWorkLog`, subseção nova), Regras de
  Negócio (cadastro de publicador), Estrutura do Projeto (tela de Publicadores) e Resolvidos.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Uma subseção única em vez de repetir a explicação nas duas tabelas.** A troca é literalmente a
  mesma nas duas, e duplicar o texto criaria dois lugares para divergir depois — o mesmo cuidado que
  o documento já toma ao explicar `last_worked_at` como projeção num lugar só.
- **Corrigir o texto do `ON DELETE RESTRICT` em vez de apagá-lo.** O documento explica escolhas, e a
  escolha antiga contextualiza a nova; o que não podia sobreviver eram as duas versões convivendo
  como se ambas valessem. A intenção original ("o histórico não perde o nome") ficou explícita como
  o que continua valendo.
- **Nada em Pontos em Aberto.** Nenhum dos itens abertos falava de exclusão de publicador; o item de
  "reinstalar o app custa um código novo" continua exatamente como estava. Só Resolvidos mudou.
- **Não removi o `SET NULL` de `Territory.assigned_user_id`**: essa FK continua existindo e é o que
  garante que apagar o publicador não apaga território.

## Como validar
Ler as seções alteradas do `CLAUDE.md` e conferir contra `server/app/models/block_work_log.py`,
`server/app/models/territory_assignment.py`, `server/app/services/user.py`,
`server/app/routers/admin_users.py` e `admin/src/renderer/screens/PublishersScreen.tsx`.

## Resultado da validação
Mudança só de documentação — não há teste, lint ou type-check que a alcance. Verificado por busca
que não sobrou nenhuma menção a `ON DELETE RESTRICT` nem à relationship `BlockWorkLog.user` fora do
parágrafo histórico da subseção nova, e que o id da migration citado (`e7b34c1d5a80`) corresponde ao
arquivo em `server/migrations/versions/`.
