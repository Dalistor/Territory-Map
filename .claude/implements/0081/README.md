# [0081] Restringir `WorkLogService.mark_worked` ao território designado

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 06

## Solicitação

Em `server/app/services/work_log.py`, dentro de `WorkLogService.mark_worked`, depois de resolver
`block` via `_block_of_congregation` e depois da checagem de reenvio (`stored is not None`, que
deve continuar retornando sem reavaliar nada), adicionar a checagem de designação **só no caminho
de uma marcação nova**: se `block.territory.assigned_user_id != user.id`, levantar
`TerritoryNotAssignedError` antes de criar o log.

## Contexto

A spec 0005 introduz a designação de território a um publicador (`Territory.assigned_user_id`,
Task 02, já implementada). Esta task fecha a regra do lado que protege dado: sem ela, qualquer
publicador da congregação poderia marcar quadra de qualquer território, mesmo sem estar designado
a ele. A regra só vale para uma marcação **nova** — um reenvio de uma visita já aceita (mesmo
`log_id`) não pode ser invalidado por uma designação que o admin mudou depois, pelo mesmo raciocínio
que já protegia o reenvio da regra de relógio (`_refuse_implausible_moment`).

## Critérios de aceite

- Caminho feliz: publicador com o território do bloco designado a ele marca a quadra normalmente
  — cria o log e recalcula `last_worked_at` (comportamento já existente, sem regressão).
- Erro novo: publicador sem nenhum território designado tenta marcar uma quadra → levanta
  `TerritoryNotAssignedError`, nenhum `BlockWorkLog` é criado.
- Erro novo: publicador com **outro** território designado (não o do bloco) tenta marcar → mesma
  rejeição.
- Borda: reenvio (mesmo `log_id` já gravado) de uma marcação aceita antes continua devolvendo o
  log armazenado mesmo que a designação do território tenha sido removida depois — não levanta
  `TerritoryNotAssignedError` nesse caminho.
- Borda: bloco de outra congregação continua levantando `NotFoundError` antes de qualquer
  checagem de designação (ordem de checagens documentada no docstring de `mark_worked` mantida:
  posse → reenvio → designação/relógio, apenas para uma marcação nova).

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_marking_a_block_whose_territory_has_no_designation_is_refused` (RED confirmado: `DID NOT RAISE`) | `tests/services/test_work_log_service.py` | `WorkLogService._refuse_unassigned_territory`, chamada em `mark_worked` após a checagem de reenvio |
| 2 | `test_marking_a_block_of_a_territory_designated_to_someone_else_is_refused` | idem | reaproveita o mesmo check genérico (`assigned_user_id != user.id`) |
| 3 | `test_a_resend_is_confirmed_even_after_the_territorys_designation_changed` | idem | confirma que o check só roda no ramo de marcação nova (já garantido pela posição da chamada) |

Os demais 24 testes já existentes no arquivo continuam verdes, agora exercitando um `block` cuja
fixture designa o território a `user` por padrão — sem isso, todo teste do arquivo pré-existente
que chama `mark_worked` numa marcação nova quebraria com `TerritoryNotAssignedError`, já que o
service agora exige a designação em todo caminho novo.

## O que foi feito

- `WorkLogService.mark_worked` (`server/app/services/work_log.py`) ganhou a chamada
  `self._refuse_unassigned_territory(block, user)` logo após o retorno antecipado do reenvio e
  antes de `_refuse_implausible_moment` — ou seja, roda só quando a marcação é de fato nova.
- Novo método privado `_refuse_unassigned_territory(self, block: Block, user: User) -> None`,
  seguindo o mesmo padrão dos outros `_refuse_*` do arquivo (docstring explicando o porquê,
  levanta a exceção de domínio correspondente).
- Docstring de `mark_worked` atualizada para descrever as quatro checagens (posse, reenvio,
  designação, relógio) e por que a ordem é essa — mantendo a ideia já documentada de que só uma
  visita genuinamente nova é julgada contra regras que podem mudar com o tempo.
- `tests/services/test_work_log_service.py`: `draw_block` ganhou o parâmetro
  `assigned_user_id: UUID | None = None` e passou a anexar um objeto `Territory` em memória
  (`block.territory = Territory(...)`) ao bloco criado — antes a fake nunca populava essa
  relação, porque nada no service a lia. A fixture `block` passou a depender de `user` e a
  designar o território a ele por padrão, para que o restante da suíte (relógio, reenvio,
  histórico, deleção) continue exercitando exatamente o que exercitava antes. Dois pontos que
  criavam um segundo bloco/publicador "à mão" (fora da fixture `block`) e o marcavam como visita
  nova precisaram do `assigned_user_id` explícito para continuar testando o que se propunham a
  testar: `elsewhere` em
  `test_a_log_id_already_used_for_another_block_is_refused_instead_of_confirmed` e
  `stranger_block`/`stranger` em `test_deleting_a_visit_of_another_congregation_is_not_found`
  (neste último, a ordem de criação mudou: `stranger` passou a ser criado antes de
  `stranger_block`, para ter o `id` disponível).

## Arquivos modificados

- `server/app/services/work_log.py` — checagem de designação de território no caminho de
  marcação nova.
- `server/tests/services/test_work_log_service.py` — três testes novos, `draw_block`/fixture
  `block` passam a modelar a designação, dois pontos de setup ajustados para continuar
  testando seu comportamento original.

## Decisões técnicas

- **A checagem roda depois do retorno antecipado do reenvio, não antes.** É o que garante a
  borda pedida pela spec: alterar ou remover a designação depois de uma visita aceita não pode
  invalidar retroativamente essa visita. Isso é estrutural (a chamada só existe no bloco de
  código que já era exclusivo de "marcação nova"), não depende de dado de teste específico.
- **Erro genérico, sem distinguir "sem território nenhum" de "território de outra pessoa".** A
  spec pede a mesma rejeição (`TerritoryNotAssignedError`) nos dois casos; implementei como uma
  única comparação de identidade (`block.territory.assigned_user_id != user.id`), que já cobre
  ambos sem precisar de dois `if`.
- **`block.territory` via lazy load do SQLAlchemy em produção, populado à mão no fake de teste.**
  O repositório real (`BlockRepository.get_in_congregation`) devolve um `Block` cuja relação
  `territory` carrega sob demanda dentro da sessão real; nada precisou mudar lá. No fake em
  memória, que nunca teve sessão nenhuma, a relação simplesmente não existia antes — o teste
  helper `draw_block` passou a atribuir um `Territory` construído à mão, do mesmo jeito que o
  arquivo já constrói `Block`/`User` sem sessão real.
- **Fallout esperado e deliberadamente fora do escopo desta task:** rodar a suíte inteira do
  servidor (`uv run pytest`) depois dessa mudança revela 4 falhas em
  `server/tests/routers/test_app_client_routes.py` e 6 erros em
  `server/tests/integration/test_revocation_integration.py` (mais falhas pontuais em outros
  arquivos de integração) — todos porque essas suítes marcam quadra por HTTP contra um
  publicador sem nenhum território designado, e hoje não existe rota que designe (isso é a
  Task 08 da spec, que ainda não tinha aterrissado no momento desta execução). A instrução da
  task restringe explicitamente o escopo a `server/app/services/work_log.py` e seu teste — não
  toquei rotas, repositórios nem os testes de router/integração. Essa quebra é esperada e deve
  ser resolvida quando a designação puder de fato ser atribuída via API (Tasks 05/08/09) e a
  Task 11 (integração) cobrir o fluxo ponta a ponta; se essas tasks já tiverem sido concluídas
  por execução paralela no momento em que isto for lido, vale re-rodar a suíte completa do
  servidor para confirmar que o fallout foi mesmo absorvido.

## Como validar

```bash
cd server
uv run pytest tests/services/test_work_log_service.py -q
uv run pytest tests/services/test_work_log_service.py --cov=app.services.work_log --cov-report=term-missing --cov-branch -q
uv run ruff check app/services/work_log.py tests/services/test_work_log_service.py
uv run ruff format --check app/services/work_log.py tests/services/test_work_log_service.py
```

## Resultado da validação

- `pytest tests/services/test_work_log_service.py -q` → **27 passed** (24 pré-existentes + 3
  novos).
- `pytest tests/services -q` (toda a camada de services) → **136 passed**.
- Cobertura de `app/services/work_log.py`: **100% de linha e 100% de branch** (53/53 statements,
  12/12 branches).
- `ruff check` e `ruff format --check` limpos nos dois arquivos tocados.
- `pytest` da suíte inteira do servidor: **4 failed, 6 errors** (mais alguns por arquivo de
  integração), todos fora do escopo desta task e documentados acima em "Decisões técnicas" —
  nenhum deles em `server/tests/services/`.
