# [0013] Service de publicador e código de acesso

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 12

## Solicitação

> Spec 0001 — Task 12: Implemente por TDD `server/app/services/user.py` com `UserService` (recebe
> `UserRepository`, `now_provider` e as funções de segurança). Métodos: `create(congregation_id,
> name, now)`, `regenerate_code(congregation_id, user_id, now)`, `list(congregation_id)`,
> `set_active(congregation_id, user_id, is_active)`, `activate(code, now) -> (user, token)`,
> `expire_codes(now)`. Critérios de aceite: (a) criar usuário gera código de 8 caracteres com
> validade de 24h a partir do `now` injetado, `activated_at` nulo e `token_version` 0; (b) resgatar
> um código válido devolve um token de app decodificável, grava `activated_at`, **zera o
> `access_code`** e incrementa `token_version`; (c) resgatar o **mesmo** código de novo levanta
> `InvalidAccessCodeError`; (d) código inexistente, código expirado (`now` além da validade) e
> código já resgatado levantam a mesma exceção **com a mesma mensagem** — teste que as três são
> idênticas; (e) regenerar código para quem já ativou funciona, e o código anterior deixa de valer;
> (f) um novo resgate incrementa `token_version` de novo, e o token emitido antes passa a ter versão
> defasada; (g) resgatar código de usuário com `is_active=False` levanta `InactiveUserError`; (h)
> `create`/`regenerate`/`set_active` sobre usuário de **outra** congregação levantam
> `NotFoundError`; (i) `expire_codes` limpa apenas os vencidos e não tocados, deixando intactos os
> válidos e os já resgatados; (j) o código gerado nunca aparece em nenhuma mensagem de exceção.
> Toque apenas em `app/services/user.py` e `tests/services/test_user_service.py`.

## Contexto

O `UserRepository` (implementação 0009) já sabia ler e escrever publicadores, mas ninguém decidia
nada: `get_by_access_code` responde "existe uma linha com essa string", não "esse código pode ser
resgatado". Faltava a camada que aplica as regras do ciclo de vida descritas no `CLAUDE.md` — código
de uso único, 24 horas de validade, resgate que troca o código por um token permanente, e revogação
por `is_active`.

É também o service que sustenta a promessa de segurança mais delicada do sistema: as três formas de
um código falhar (inexistente, vencido, já usado) precisam ser indistinguíveis, porque qualquer
diferença entre elas confirma a existência de um código válido para quem está tentando adivinhar.

## Critérios de aceite

1. `create` gera um código de 8 caracteres do alfabeto sem caracteres ambíguos.
2. `create` dá ao código validade de 24h contadas do `now` injetado.
3. `create` grava o nome sob a congregação informada.
4. Usuário recém-criado tem `activated_at` nulo, `token_version` 0 e `is_active` verdadeiro.
5. Colisão no sorteio do código custa uma nova tentativa, nunca um duplicado.
6. Colisão infinita termina a chamada com erro em vez de pendurá-la.
7. Resgate válido devolve um token de app decodificável com `user_id`, `congregation_id` e `type`.
8. Resgate grava `activated_at` com o momento do resgate.
9. Resgate apaga o `access_code` e a validade da linha.
10. Resgate incrementa `token_version`, e o token emitido carrega o número novo.
11. Código de ninguém → `InvalidAccessCodeError`.
12. Mesmo código duas vezes → `InvalidAccessCodeError` na segunda.
13. Código além da validade → `InvalidAccessCodeError`.
14. Código no instante exato do vencimento ainda vale (mesmo corte do job de limpeza).
15. Código sem validade nenhuma (dado corrompido) → `InvalidAccessCodeError`.
16. As três falhas de código têm `code` e mensagem idênticos.
17. Publicador revogado com código válido → `InactiveUserError`.
18. `regenerate_code` troca o código e reinicia as 24 horas.
19. O código anterior para de valer no instante em que o novo é emitido.
20. Quem já ativou pode receber código novo, preservando `activated_at` e `token_version`.
21. Segundo resgate incrementa a versão de novo e deixa o token anterior defasado.
22. `regenerate_code`/`set_active` sobre usuário de outra congregação → `NotFoundError`.
23. `regenerate_code`/`set_active` sobre usuário inexistente → `NotFoundError`.
24. Usuário criado numa congregação é inalcançável a partir de outra.
25. `set_active` revoga o acesso, e devolve o acesso revogado.
26. `list` mostra só os publicadores da congregação que perguntou.
27. `expire_codes` limpa os vencidos e devolve a contagem.
28. `expire_codes` não toca em código dentro da validade.
29. `expire_codes` não perturba quem já resgatou.
30. Numa base mista, `expire_codes` varre só as linhas vencidas.
31. Nenhuma falha do service repete o código de acesso em mensagem, `repr` ou `args`.
32. Linha cujo código não é exatamente o oferecido é recusada (comparação em tempo constante).
33. Linha cujo código já foi apagado é recusada, sem estourar na comparação.
34. Omitir `now` faz o service pedir a hora ao `now_provider` injetado.
35. O módulo nunca lê o relógio por conta própria.

## Ciclos TDD

Cada linha é um ciclo red-green-refactor. Onde a coluna de código diz "nada", o teste passou de
primeira porque o comportamento é o *service não fazer nada* — são guardas de regressão contra o
service passar a mexer no que não é dele.

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `create_mints_an_eight_character_code_from_the_unambiguous_alphabet` | `tests/services/test_user_service.py` | `UserService.__init__` e `create` chamando o gerador injetado |
| 2 | `create_gives_the_code_twenty_four_hours_from_the_injected_now` | idem | `_mint_code` e `_resolve_now`, TTL vindo de `Settings` |
| 3 | `create_stores_the_name_under_the_given_congregation` · `a_newly_created_user_is_not_activated_and_starts_at_token_version_zero` | idem | nada — guardas |
| 4 | `create_draws_another_code_when_the_first_one_is_already_taken` | idem | retry do sorteio contra `get_by_access_code` |
| 5 | `create_gives_up_instead_of_retrying_forever_when_every_draw_collides` | idem | limite `_CODE_DRAW_ATTEMPTS` e `DomainError` ao esgotar |
| 6 | `redeeming_a_valid_code_returns_an_app_token_that_names_the_user` | idem | `activate` e a injeção de `create_app_token` |
| 7 | `redeeming_a_code_stamps_the_activation_moment` · `..._wipes_it_from_the_row` · `..._bumps_the_token_version` | idem | nada — delegação a `redeem_code` já cobria |
| 8 | `a_code_that_belongs_to_nobody_is_refused` | idem | `InvalidAccessCodeError` quando a busca não acha |
| 9 | `the_same_code_cannot_be_redeemed_twice` | idem | nada — o resgate anterior já apagou o código |
| 10 | `a_code_past_its_validity_is_refused` · `a_code_still_works_at_the_very_instant_it_expires` | idem | `_is_expired`, com corte estrito alinhado ao job |
| 11 | `a_code_with_no_expiry_at_all_is_refused` · `unknown_expired_and_already_used_codes_fail_with_the_very_same_message` | idem | nada — guardas do desenho de erro único |
| 12 | `a_revoked_publisher_cannot_redeem_a_valid_code` | idem | checagem de `is_active` → `InactiveUserError` |
| 13 | `regenerating_replaces_the_code_and_restarts_the_twenty_four_hours` | idem | `regenerate_code` |
| 14 | `the_previous_code_stops_working_...` · `an_already_activated_publisher_can_be_given_a_new_code` · `a_second_redemption_bumps_the_version_again_and_strands_the_first_token` | idem | nada — guardas |
| 15 | `regenerating_..._of_another_congregations_publisher_finds_nothing` · `..._that_does_not_exist_...` · `a_publisher_created_in_one_congregation_is_out_of_reach_from_another` | idem | `_get_of_congregation` e `set_active` |
| 16 | `set_active_revokes_access` · `set_active_gives_revoked_access_back` · `set_active_on_a_publisher_that_does_not_exist_finds_nothing` | idem | nada — guardas |
| 17 | `listing_shows_only_the_publishers_of_the_asking_congregation` | idem | `list` |
| 18 | `expire_codes_*` (4 casos) | idem | `expire_codes` |
| 19 | `no_failure_of_the_service_ever_repeats_the_access_code` · `the_code_generation_failure_does_not_repeat_the_code_it_could_not_place` | idem | nada — guardas de vazamento de credencial |
| 20 | `a_row_whose_code_is_not_exactly_the_one_offered_is_refused` | idem | `_matches` com `secrets.compare_digest` |
| 21 | `a_row_whose_code_was_already_wiped_is_refused_and_not_compared` | idem | nada — cobre a guarda de `stored is None` |
| 22 | `a_caller_that_omits_now_gets_the_time_from_the_injected_provider` (3 casos) · `the_service_never_reads_the_clock_itself` | idem | nada — cobre o fallback de `_resolve_now` |

## O que foi feito

`UserService` em `server/app/services/user.py`, com os seis métodos pedidos e três helpers de
módulo (`_matches`, `_is_expired`, `_get_of_congregation`). O service recebe pelo construtor o
`UserRepository`, o `now_provider` e as duas primitivas de segurança que usa
(`generate_access_code`, `create_app_token`), com as de segurança já apontando para
`app/core/security.py` por padrão.

Os testes rodam contra um `FakeUserRepository` in-memory que implementa a mesma interface do
repositório real, com relógio congelado e — onde o caso exige — gerador de código controlado.
Nenhum teste toca banco: não há geometria envolvida aqui, e o `CLAUDE.md` reserva o PostGIS real
para os services geográficos.

## Arquivos criados

- `server/app/services/user.py` — regras do ciclo de vida do publicador e do código descartável
- `server/tests/services/test_user_service.py` — 40 testes, incluindo o fake do repositório

## Arquivos modificados

Nenhum. `app/services/__init__.py` já existia (criado pela Task 11, executada em paralelo).

## Decisões técnicas

**Corte de expiração alinhado ao job de limpeza.** `_is_expired` usa `expires_at < now`, exatamente
o predicado de `UserRepository.expire_codes`. Um corte mais rígido no service (`<=`) criaria uma
janela em que o resgate recusa um código que a rotina periódica ainda considera vivo — e o admin
veria na tela um código válido que não funciona. Consequência documentada por teste: no instante
exato do vencimento o código ainda vale.

**`InactiveUserError` é checado depois da validade do código.** A ordem importa: se a checagem de
`is_active` viesse antes, um código inválido de um usuário desativado responderia "publicador
desativado", confirmando que o código existe. Como está, só quem apresenta um código genuinamente
válido descobre que o acesso foi revogado — e aí a informação é devida, porque o admin precisa saber
que reativar é a solução.

**`secrets.compare_digest` mesmo com a busca sendo por igualdade no SQL.** A consulta que encontrou
a linha já casou por `=`, então a comparação no service é a segunda tranca, não a primeira. Ela
existe por duas razões: a regra explícita do `CLAUDE.md` sobre comparação em tempo constante, e a
proteção contra a busca ficar frouxa um dia (uma collation case-insensitive, um tipo de coluna que
apara espaços). O teste usa um repositório dublê com lookup case-insensitive para provar que o
service não confia no que a busca devolve.

**Retry de colisão com teto.** O código é único globalmente enquanto vive, e o índice parcial do
banco rejeitaria um duplicado — mas falhar um cadastro por azar de sorteio seria um erro que o admin
não pode resolver. Daí o retry. O teto de 10 tentativas existe porque um laço sem limite,
diante de um gerador quebrado, penduraria a requisição em vez de terminá-la; o caminho de
esgotamento levanta `DomainError` base, sem inventar exceção nova fora do vocabulário fixado na
Task 02.

**Critério (h) sobre `create` interpretado como escopo, não como rejeição.** `create` não recebe
`user_id` — não há usuário de outra congregação para ele recusar. O que se pode verificar, e é o que
o critério quer dizer, é que a linha que `create` grava fica presa à congregação informada:
`test_a_publisher_created_in_one_congregation_is_out_of_reach_from_another` cria numa congregação e
prova que a outra recebe `NotFoundError` ao tentar mexer.

**`now` opcional em todo método, com fallback no `now_provider`.** A assinatura da spec pede `now`
explícito; o `CLAUDE.md` pede relógio injetado. Os dois convivem: quem tem uma leitura do relógio
passa (é o caso do router, que fixa um `now` por requisição), quem não tem deixa o provider
responder. Em nenhum caminho o módulo chama `datetime.now()` — há um teste de AST que garante isso.

**Fake in-memory, não `MagicMock`.** Exigência do `CLAUDE.md`, e a razão prática aparece nos testes:
quase toda asserção é sobre o *estado* que ficou na linha (código apagado, versão incrementada,
`activated_at` gravado). Um mock só registraria que um método foi chamado. O fake aplica na inserção
os defaults que no banco vêm da coluna (`token_version` 0, `is_active` true), que é o que o `flush`
faz de verdade.

**Um defeito de teste encontrado no RED.** A primeira versão de `set_active` testava revogar e
reativar no mesmo teste, guardando dois nomes para o mesmo objeto — e a segunda chamada mutava o que
a primeira asserção ia ler. O teste foi dividido em dois (um comportamento cada), o que corrige o
alias e, de quebra, deixa cada asserção honesta. O comportamento de produção não mudou.

## Como validar

```bash
cd server
uv run pytest tests/services/test_user_service.py -v
uv run pytest tests/services/test_user_service.py --cov=app.services.user --cov-branch --cov-report=term-missing
uv run ruff check app/services/user.py tests/services/test_user_service.py
```

## Resultado da validação

- `uv run pytest tests/services/test_user_service.py` → **40 passed**
- Cobertura de `app/services/user.py` → **100% de linha e 100% de branch** (63 stmts, 14 branches,
  0 misses), atingindo a meta de 100% nos services
- `uv run pytest` (suíte inteira do servidor) → **245 passed**
- `uv run ruff check` → All checks passed · `uv run ruff format --check` → 2 files already formatted
