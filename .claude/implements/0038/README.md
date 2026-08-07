# [0038] Alinhar o `CLAUDE.md` ao admin que passou a existir

**Data:** 2026-08-07
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0002/` — Task 12

## Solicitação

> Spec 0002 — Task 12: Com as tasks anteriores concluídas, o `CLAUDE.md` da raiz ficou descrevendo um
> admin que não é o que existe. Ajuste, sem reescrever o documento inteiro: **(1)** na tabela de
> camadas do **Admin (Flutter desktop)**, registre que `data/` contém os repositórios sobre o cliente
> da API além das credenciais e da sessão, e **substitua a linha de `domain/`** por uma nota
> explícita de que o admin **não tem** essa camada — os casos de uso seriam repasses de uma linha
> sobre o cliente da API, porque toda a regra de negócio vive no servidor, e a camada que realmente
> paga o próprio custo é a de repositórios, que é o que permite fake nos testes de widget. Esta é uma
> decisão tomada, não um débito. **(2)** Na árvore de "Estrutura do Projeto", tire
> `admin/lib/domain/` e acrescente os repositórios em `admin/lib/data/`. **(3)** Registre as duas
> capacidades novas do admin: apagar uma quadra (com o histórico dela junto, por cascade) e sair da
> congregação, que apaga as credenciais deste computador e devolve à configuração inicial.
> **(4)** Na seção de deploy do admin, registre que o build por tag injeta `APP_KEY` (secret) e
> `API_BASE_URL` (variable) por `--dart-define`, que o job falha de propósito se algum dos dois
> estiver faltando, e que os binários são publicados numa GitHub Release — não mais como artefato de
> Actions. **(5)** Revise a frase "Build verde só prova que compila (...) quem valida comportamento
> são os testes de widget": agora eles existem, nas seis telas; ajuste o texto para dizer o que é
> verdade. **(6)** Se a seção "Pontos em Aberto" citar algo que estas tasks resolveram, mova ou
> remova. Não altere as seções do servidor, do modelo de dados nem das regras de negócio — nada disso
> mudou. Toque apenas em `CLAUDE.md`.

## Contexto

É a última task da spec 0002 e existe porque as onze anteriores mudaram o admin de lugar. O
`CLAUDE.md` ainda prometia uma camada `domain/` que a spec decidiu não criar (Task 04), descrevia um
build por tag sem configuração injetada (Task 02), não conhecia o apagar quadra (Task 06) nem o sair
da congregação (Task 07), e dizia que os testes de widget é que validam comportamento numa época em
que não existia nenhum (Tasks 08–11).

Documento que descreve um sistema que não existe é pior que documento ausente: quem lê age sobre ele.
O caso mais caro aqui era a camada `domain/` — a próxima pessoa a mexer no admin criaria a pasta
achando que estava corrigindo uma omissão.

## O que foi feito

Seis ajustes cirúrgicos no `CLAUDE.md`, mais quatro correções de coerência que os primeiros
expuseram. Nada das seções de servidor, modelo de dados ou regras de negócio foi tocado.

**(1) Tabela de camadas do Admin.** A linha `Domain` saiu. A de `Data` passou a dizer "um repositório
por entidade (território, quadra, publicador, registro de trabalho) sobre o cliente da API, mais as
credenciais no `flutter_secure_storage` e a `Session`". A de `Presentation` ganhou "conhecer
`TerritoryMapApi` ou `Session`" na coluna do que é proibido — que é a regra que a Task 05 tornou
verificável por `grep`. No lugar da linha removida entrou um parágrafo **"Por que não existe
`domain/` aqui"**, dizendo que a regra de negócio vive no servidor, que um caso de uso no admin seria
repasse de uma linha, e que a camada que paga o próprio custo é a de repositórios porque é a
interface que o teste de widget substitui por fake. Fecha com a condição de reabertura (aparecer
regra que seja de fato do cliente), para que a decisão seja revisável sem ser reaberta por engano.

**(2) Árvore de "Estrutura do Projeto".** `admin/lib/domain/` saiu; `data/` passou a listar os
arquivos reais; entraram `admin/README.md` e `admin/lib/config.dart` com a nota do `--dart-define`,
porque é onde as duas constantes de build moram.

**(3) As duas capacidades novas.** Foram para a "Visão Geral", logo abaixo da tabela das três partes,
num bloco próprio introduzido por "Duas ações do admin merecem destaque porque destroem dado" —
apagar quadra (com o cascade dito literalmente) e sair da congregação (credenciais deste computador,
servidor intocado). A linha do admin na tabela ganhou o "apaga" junto de marcar e numerar.

**(4) Deploy do admin.** Dois parágrafos novos depois da tabela de alvos: um sobre a configuração
compilada junto com o binário (`APP_KEY` secret, `API_BASE_URL` variable, `--dart-define`, o passo
que falha de propósito antes do `flutter build` e o porquê), outro sobre a GitHub Release substituir
o artefato de Actions (expiração em 90 dias, exigência de login, `gh` CLI sem action de terceiro,
`workflow_dispatch` parando nos artefatos).

**(5) A frase sobre build verde.** Reescrita para dizer que os testes de widget existem, quais são as
seis telas cobertas, e que rodam no job de build antes da compilação — então uma tag com teste
vermelho não vira Release.

**(6) Pontos em Aberto.** O item "Desfazer no editor de polígono" saiu: o undo existe desde a
implementação 0027 (`PolygonEditorController` envolvendo o `PolyEditor`), e o próprio `CLAUDE.md` já
o descrevia como pronto em "Arquitetura e Decisões Técnicas" — a seção estava se contradizendo. No
lugar entrou um bloco **"Resolvidos, para não voltarem à mesa"** com o undo, o apagar quadra e o sair
da congregação. O item das "quadras não trabalhadas há mais de N dias" ficou, com a ressalva de que o
mapa já colore mas não existe listagem.

**Coerências que os itens acima expuseram:**

- "build do admin nas 3 plataformas por tag" na tabela de Stack Técnica → "(Windows e Linux) por tag,
  publicado numa GitHub Release". Três plataformas contradizia o "macOS ficou de fora" da própria
  seção de deploy.
- "O servidor já sobe; os clientes Flutter ainda não existem" em "Como Rodar" → o admin e o
  `packages/core` sobem; só o `app/` Android não existe.
- O parágrafo de abertura da "Estrutura do Projeto" passou a citar apagar quadra, sair da congregação
  e a cobertura de widget das seis telas.
- Na tabela de "Testes", o exemplo `flutter test test/domain/foo_test.dart` virou
  `test/home_screen_test.dart` e a meta "casos de uso do domínio" virou "uma tela, um teste de
  widget; repositórios cobertos por fake de HTTP" — os dois apontavam para a camada que a Task 04
  decidiu não criar.

## Arquivos modificados

- `CLAUDE.md` — Visão Geral (linha do admin + bloco das duas ações destrutivas), Stack Técnica
  (linha de CI/CD), Estrutura do Projeto (parágrafo de abertura e árvore do `admin/`), Arquitetura de
  Camadas → Admin (tabela e o parágrafo do porquê da ausência de `domain/`), Testes (exemplo e meta
  da coluna Flutter), Como Rodar (frase de estado), Como Fazer Deploy → Admin (dart-defines, Release,
  frase do build verde), Pontos em Aberto

## Arquivos criados

Nenhum além da documentação desta implementação.

## Decisões técnicas

**A ausência de `domain/` virou prosa, não só uma linha a menos.** Remover a linha da tabela deixaria
a ausência parecendo esquecimento. O parágrafo diz o motivo (regra no servidor), o que ganhou o lugar
(repositórios) e por que essa troca vale (fake no teste de widget) — é o que impede alguém de "criar
a pasta que falta" no próximo mês.

**As duas capacidades novas foram para a Visão Geral, não para "Regras de Negócio".** A task proibiu
tocar as regras de negócio, e com razão: nada mudou no servidor. O `ON DELETE CASCADE` já existia; o
que passou a existir é uma tela que o dispara. Isso é descrição de produto, e o lugar dela é onde o
documento apresenta as três partes.

**O item do undo foi removido dos Pontos em Aberto em vez de mantido.** A task pedia para mover ou
remover o que "estas tasks" resolveram, e o undo foi resolvido antes, na 0027. Mantê-lo seria manter
uma pergunta que o mesmo arquivo já responde duas seções acima. O bloco "Resolvidos" preserva a
informação de que houve decisão, que é o que se perderia numa remoção seca.

**As quatro correções fora da lista foram feitas, não anotadas.** Todas eram contradições diretas
introduzidas ou expostas pelos seis itens pedidos (três plataformas × macOS fora, `test/domain/` ×
sem `domain/`, "clientes Flutter não existem" × admin implementado). Deixá-las seria entregar a task
com o documento ainda mentindo sobre o mesmo assunto que ela existe para corrigir.

**Nada de reescrever o documento.** O diff é de 62 inserções e 22 remoções em ~700 linhas, todo
concentrado nas seções de admin, deploy e testes.

## Como validar

```bash
cd "/Users/dalistor/Documents/Projetos/Territory map"
git diff CLAUDE.md
grep -n "admin/lib/domain\|3 plataformas\|test/domain/foo_test" CLAUDE.md   # sem resultado
```

Confira o texto de deploy contra `.github/workflows/admin-release.yml`: o passo "Check the build
configuration" antes do "Build", os dois `--dart-define` no `flutter build`, o job `release` com
`if: startsWith(github.ref, 'refs/tags/')` e o `gh release create`. E a lista de telas cobertas
contra `admin/test/`.

## Resultado da validação

Mudança exclusivamente de documentação — não há teste nem lint aplicável a `CLAUDE.md`, e nenhum
arquivo de código foi tocado (`git diff --stat` mostra só `CLAUDE.md`).

O que foi verificado à mão:

- Cada afirmação nova sobre o build foi conferida linha a linha contra
  `.github/workflows/admin-release.yml` — inclusive a ordem dos passos, que sustenta a frase "rodam
  antes de qualquer compilação".
- As seis telas citadas existem em `admin/lib/presentation/` e têm arquivo de teste correspondente em
  `admin/test/` (`setup_screen_test`, `app_routing_test`, `home_screen_test`,
  `publishers_screen_test`, `territory_editor_test`, `block_editor_test`, `block_history_test`, mais
  `block_delete_test` e `sign_out_test` das Tasks 06 e 07).
- Os arquivos listados na árvore batem com `ls admin/lib/data`.
- `grep` confirma que não sobrou nenhuma referência a `admin/lib/domain`, a "3 plataformas" ou ao
  exemplo `test/domain/foo_test.dart`.
