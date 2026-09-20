# Admin desktop e Android — reformulação de consultas

**Escopo:** `admin/` e `admin-app/`
**Modo:** Operate
**Público:** responsável pelos territórios, no trabalho de mesa e em campo.
**Tarefa:** alternar entre consulta por publicador, território e histórico completo sem perder o contexto da seleção.
**Comp aprovado:** `.impeccable/mocks/decision/canon.webp`

## Direction contract

**THESIS:** A comparação lidera e o detalhe explica. O sistema recusa painéis formados por cartões
soltos: listas e tabelas são a superfície principal, com mapa e histórico contextualizados ao lado
no desktop e empilhados no Android.

**OWN-WORLD:** Admin contemporâneo sereno, com fundo branco e cinza-azulado, texto azul-marinho,
azul acessível para seleção e ações, verde/laranja/vermelho somente para estados semânticos,
divisores finos, raios modestos, tipografia humanista compacta e numerais tabulares para datas.

**STORY:** O responsável escolhe Publicadores, Territórios ou Histórico completo, localiza uma linha,
compara datas e situação e abre o contexto sem perder filtros, seleção ou posição. Mapa e lista são
modos equivalentes da consulta territorial, não páginas desconectadas.

**FIRST VIEWPORT:** No desktop, sidebar compacta, controles e busca acima de uma tabela dominante e
painel contextual à direita; no Android, navegação primária inferior, lista de cartões de alta
densidade e detalhe no stack. O comp aprovado governa proporção e hierarquia, mas seus itens extras
de navegação, tipos de atividade e funcionalidades não documentadas não são produto e não devem ser
literalizados.

**FORM:** Padrão convencional de admin escolhido conscientemente pelo usuário; composição “Tabela +
detalhe”, primeira opção do round comp-first, seed `27fac91d`. A única referência externa de
acabamento e arquitetura da informação é “Territórios da Congregação”, de Simão Lúcio.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisões funcionais

- Publicadores mostra os territórios retirados e devolvidos por cada pessoa.
- Territórios reúne histórico de publicadores e quadras, com alternância Lista/Mapa.
- Histórico completo mostra todas as designações e inclui qualquer período que se sobreponha ao
  intervalo selecionado.
- As três consultas existem no desktop e no Android; gestão de publicadores continua só no desktop.
- Ações destrutivas, desenho de mapa, status forçado e importação/exportação mantêm as fronteiras já
  documentadas em `AGENTS.md`.
