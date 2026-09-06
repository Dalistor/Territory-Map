# [0167] Teste de integração: a pessoa some, o histórico fica (spec 0011, Task 05)

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0011/` — Task 05

## Solicitação
> Spec 0011 — Task 05: escreva `server/tests/integration/test_publisher_deletion_integration.py`,
> seguindo o padrão dos arquivos vizinhos em `server/tests/integration/` (app FastAPI real sobre
> PostGIS real, tudo criado por HTTP, congregação como única linha escrita direto no banco).
>
> O fluxo central: o admin cadastra um publicador, designa um território a ele, registra trabalho
> numa quadra em nome dele, e **tenta apagá-lo — recebendo 409** porque a designação está aberta;
> conclui a designação e aí a exclusão responde 204. Depois disso, verifique o que a spec inteira
> existe para garantir: `GET /admin/blocks/{id}/work-logs` continua nomeando a pessoa,
> `GET /admin/assignments` continua mostrando a designação concluída com o nome dela, o território
> segue existindo e sem publicador designado, e `GET /admin/users` não a lista mais. Verifique
> também que **o token do aparelho dela deixa de valer** (uma chamada a `GET /app/territories` com
> aquele token é recusada) — apagar a pessoa tem que revogar o acesso, senão a exclusão seria só
> cosmética. Feche com o isolamento: o admin de outra congregação recebe 404 ao tentar apagar um
> publicador que não é dele.
>
> Toque apenas em `server/tests/integration/`; não modifique código de produção — se algum
> comportamento não fechar, o defeito é de uma task anterior e deve ser reportado, não corrigido
> aqui.

## Contexto
As Tasks 01 a 04 desmontaram a FK de `users` nas duas tabelas de histórico, gravaram o nome na
própria linha, criaram a regra de exclusão e a expuseram em `DELETE /admin/users/{id}`. Cada uma
tem teste de service ou de router — e nenhuma delas prova o que a spec inteira existe para
garantir, porque isso só aparece **depois** que a linha de `users` deixa de existir de verdade.
Um teste de service afirma que duas colunas foram gravadas; este afirma que o mesmo JSON que as
telas do admin leem continua nomeando a pessoa depois de ela ser apagada de um PostGIS real.

Três juntas só são observáveis ponta a ponta, e é por elas que o arquivo existe:

- **A recusa é sobre o estado, não sobre a pessoa.** A mesma requisição toma 409 enquanto a
  designação está aberta e responde 204 depois de concluída, sem que nada em Marta tenha mudado
  no meio — ela continua com registro de trabalho e continua no cartão. É o que separa "tem
  designação aberta" de "tem histórico", que é a distinção em que a spec se apoia.
- **Apagar revoga o acesso.** O token do aparelho é emitido antes da exclusão e usado depois.
  `current_app_user` lê a linha a cada requisição, então o celular precisa parar de funcionar; um
  teste de `delete` jamais notaria, porque o token nunca chega ao service — e uma exclusão que só
  esvazia uma lista enquanto o celular continua marcando quadra seria cosmética.
- **Nada mais cai junto.** O território sobrevive, sem publicador designado, com a projeção
  recalculada em vez de apontando para um fantasma.

## Critérios de aceite
- Apagar um publicador com designação **aberta** responde **409** com `code`
  `publisher_has_open_assignment`, e a recusa não escreve nada: ele continua na lista e continua
  designado.
- Concluída a designação, a **mesma** requisição responde **204**, com corpo vazio.
- `GET /admin/users` deixa de listá-lo.
- `GET /admin/blocks/{id}/work-logs` continua devolvendo `user` como `{id, name}` com o nome dele,
  e a data trabalhada intacta.
- `GET /admin/assignments` continua devolvendo a designação **concluída** com o nome dele e o
  território embutido; o cartão do território (`GET .../assignments`) também.
- O território segue existindo, com `assigned_user` nulo e a quadra dele no lugar.
- O **token do aparelho** dele deixa de valer: `GET /app/territories` e a marcação de quadra
  respondem **401**.
- O admin de outra congregação recebe **404** (`code` `not_found`) ao apagar um publicador que não
  é dele, e a pessoa fica intacta na lista do dono.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_a_deleted_publisher_leaves_the_list_and_stays_in_the_history` | `server/tests/integration/test_publisher_deletion_integration.py` | nenhum — o comportamento já vinha das Tasks 01–04; o RED foi provado por mutação (ver Decisões técnicas) |
| 2 | `test_deleting_a_publisher_of_another_congregation_is_not_found` | `server/tests/integration/test_publisher_deletion_integration.py` | idem |

## O que foi feito
Um arquivo novo de teste de integração, com dois testes: o fluxo longo da exclusão (cadastro,
designação, marcação pelo app, 409, conclusão, 204, e as seis verificações de que o histórico
sobreviveu e o acesso não) e a recusa entre congregações. Nenhuma linha de produção foi tocada.

## Arquivos criados
- `server/tests/integration/test_publisher_deletion_integration.py` — o fluxo ponta a ponta da
  exclusão de publicador e o isolamento entre congregações.

## Decisões técnicas
- **O RED foi obtido por mutação, não por ausência de código.** Esta task depende da Task 04, que
  já estava concluída, então um teste escrito depois da implementação passa de primeira — e um
  teste que nunca falhou não prova nada. Em vez de aceitar o verde, cada asserção central foi
  verificada invertendo temporariamente o código de produção e conferindo que o teste quebra pelo
  motivo certo, restaurando o arquivo em seguida (confirmado com `diff` contra a cópia de
  segurança em cada caso):
  - trocar `raise PublisherHasOpenAssignmentError` por `pass` em `app/services/user.py` →
    `assert 204 == 409` no ponto da recusa;
  - trocar `name=row.user_name` por um literal em `app/routers/history_dto.py` → a asserção do
    nome no work log quebra, provando que é o nome **gravado na linha** que está sendo lido, e não
    algo reconstruído;
  - ignorar o `congregation_id` em `UserService.delete` → os **dois** testes quebram, o que mostra
    que o teste de isolamento não passa por acidente de a exclusão nunca funcionar.
- **Os helpers ficaram locais ao arquivo, e o `Api` do conftest não foi mexido.** `DELETE
  /admin/users/{id}` e `GET /admin/assignments` não estão na fachada compartilhada, e o vizinho
  `test_admin_marking_integration.py` já resolveu o mesmo caso com `bearer` duplicado e chamadas
  diretas em `api.client`. Seguir o padrão que existe custa três linhas duplicadas e não obriga
  todo o resto da pasta a recarregar um conftest maior.
- **Um teste longo para o fluxo, outro para o isolamento**, como nos arquivos vizinhos: os passos
  do primeiro são uma corrente em que cada asserção verifica o que a anterior deixou, e quebrá-lo
  transformaria a parte interessante em setup repetido. O isolamento precisa de uma segunda
  congregação e não pertence à corrente.
- **A congregação do intruso também tem um publicador.** Sem isso, o 404 poderia ser explicado por
  o chamador simplesmente não ter ninguém — a asserção final confere que cada admin enxerga só a
  própria lista.
- **A verificação da revogação usa duas rotas do app** (`GET /app/territories` e a marcação de
  quadra). A primeira é a que a instrução pede; a segunda existe porque é a única escrita que o
  app tem, e é ela que tornaria a exclusão cosmética se continuasse passando.
- **Nada foi corrigido em produção.** Todo o comportamento esperado fechou; não houve defeito de
  task anterior a reportar.

## Como validar
```bash
cd server && uv run pytest tests/integration/test_publisher_deletion_integration.py -q
```

## Resultado da validação
- `uv run pytest tests/integration/test_publisher_deletion_integration.py -q` → **2 passed**
- `uv run pytest -q` (suíte inteira) → **625 passed**
- `uv run pytest -q --cov=app/services --cov-report=term-missing --cov-branch` → **100%** de linha
  e de branch em `app/services/` (portão de CI mantido; `app/services/user.py` 70/70 linhas,
  16/16 branches)
- `uv run ruff check` e `uv run ruff format --check` no arquivo novo → limpos
