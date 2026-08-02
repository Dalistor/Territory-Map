# [0020] Rate limit por IP e expiração automática de códigos de acesso

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 20

## Solicitação

> Spec 0001 — Task 20: Implemente por TDD (1) rate limit com `slowapi` aplicado a `POST /app/activate`
> (10 requisições por minuto por IP) e `POST /auth/login` (5 por minuto por IP), com handler devolvendo
> **429** e um corpo no mesmo formato dos demais erros; (2) `server/app/jobs/expire_codes.py`, executável
> como `python -m app.jobs.expire_codes`, que abre uma sessão e chama `UserService.expire_codes`,
> registrando quantos códigos foram limpos; (3) `server/app/core/scheduler.py` iniciando um
> `BackgroundScheduler` no `lifespan` do FastAPI que roda esse job de hora em hora e é desligado no
> shutdown. Critérios de aceite: (a) na 11ª chamada seguida a `/app/activate` a resposta é 429; (b) na 6ª
> chamada seguida a `/auth/login` a resposta é 429; (c) o limite é por IP — dois IPs distintos não
> compartilham a cota; (d) o job limpa códigos vencidos e devolve a contagem correta; (e) o job é
> idempotente: rodar duas vezes seguidas limpa 0 na segunda; (f) o job não toca em códigos válidos nem em
> usuários já ativados; (g) o scheduler é iniciado e encerrado pelo `lifespan` — teste que o app sobe e
> desce sem deixar thread pendurada. Documente que, com múltiplos workers uvicorn, o job roda uma vez por
> worker, o que é inofensivo por ser idempotente. Toque apenas em `app/core/scheduler.py`, `app/jobs/`, o
> wiring do rate limit em `app/main.py` e os testes correspondentes.

## Contexto

Duas pontas operacionais de segurança ficaram abertas depois que as rotas foram entregues (0017–0019).

A primeira é o `CLAUDE.md` cobrando literalmente: "`POST /app/activate` precisa de rate limit. É o único
endpoint em que um código curto pode ser adivinhado por tentativa e erro." `/auth/login` está na mesma
situação — as duas são as únicas rotas alcançáveis sem token e as duas aceitam uma credencial. Nada mais
protegia nenhuma das duas.

A segunda é a regra de negócio do código descartável: "Uma rotina periódica limpa os códigos vencidos e
não usados, para que a expiração não dependa só da checagem em tempo de resgate." `UserService.expire_codes`
existe desde a 0013 e nunca foi chamado por ninguém — a varredura estava escrita mas nunca rodava.

## Critérios de aceite

1. A 11ª chamada seguida a `POST /app/activate` do mesmo IP responde **429**; as 10 primeiras, não.
2. A 6ª chamada seguida a `POST /auth/login` do mesmo IP responde **429**; as 5 primeiras, não.
3. O corpo do 429 tem o mesmo formato dos demais erros da API: `{"code", "detail"}`.
4. A cota é por IP: um IP esgotado não afeta outro.
5. As duas rotas têm cotas separadas — inundar o login não fecha a ativação.
6. Rota sem segredo a guardar (`/health`) não é limitada.
7. O job limpa os códigos vencidos e devolve a contagem correta.
8. O job é idempotente: a segunda execução seguida limpa 0.
9. O job não toca em código dentro da validade.
10. O job não perturba publicador já ativado (`activated_at`, `token_version`, `is_active` intactos).
11. O job registra em log quantos códigos limpou — e **nunca** o código em si.
12. Uma varredura que falha faz rollback e mesmo assim solta a sessão.
13. O job é executável como `python -m app.jobs.expire_codes`.
14. O `lifespan` inicia o scheduler e o encerra no shutdown, sem deixar thread pendurada.
15. O scheduler está ligado ao job de expiração, de hora em hora.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_the_job_clears_the_expired_codes_and_reports_how_many` | `tests/jobs/test_expire_codes_job.py` | `app/jobs/expire_codes.py` — `run()` abrindo, comitando e fechando a própria sessão |
| 2 | `test_a_second_run_right_after_the_first_clears_nothing` + os 3 casos de seletividade da varredura | `tests/jobs/test_expire_codes_job.py` | (nenhum — comportamento herdado; ver "Decisões técnicas") |
| 3 | `test_the_job_logs_how_many_codes_it_cleared` | `tests/jobs/test_expire_codes_job.py` | `logger.info("Expired access codes cleared: %d", ...)` |
| 4 | `test_the_module_runs_on_its_own_as_a_command` | `tests/jobs/test_expire_codes_job.py` | `main()` + guarda `if __name__ == "__main__"` |
| 5 | `test_the_lifespan_starts_the_scheduler_and_shuts_it_down_again`, `test_the_application_leaves_no_scheduler_thread_behind`, `test_the_scheduler_is_wired_to_the_expire_codes_job_every_hour` | `tests/core/test_scheduler.py` | `app/core/scheduler.py` (`create_scheduler`, `lifespan`) e `lifespan=` em `app/main.py` |
| 6 | `test_the_call_just_past_the_limit_is_refused_and_the_ones_before_it_are_not` (2 parâmetros: activate-11th, login-6th) | `tests/routers/test_rate_limit_routes.py` | `app/core/rate_limit.py` (`limiter`, limites) e os decoradores em `app/routers/auth.py` |
| 7 | `test_the_refusal_looks_like_every_other_error_of_this_api` | `tests/routers/test_rate_limit_routes.py` | `rate_limit_exceeded_handler` + registro em `app/main.py` |
| 8 | `test_a_sweep_that_blows_up_rolls_back_and_still_lets_the_session_go`, `test_the_default_clock_is_timezone_aware_utc` | `tests/jobs/test_expire_codes_job.py` | (cobertura dos caminhos de erro e do relógio padrão) |

Os casos 2, 4, 5 e 6 dos critérios de aceite do rate limit (`two_different_ips`, `flooding_the_login`,
`route_that_guards_no_secret`) foram escritos no mesmo ciclo RED do caso 6 e passaram junto com ele.

## O que foi feito

**Rate limit.** `app/core/rate_limit.py` cria o `Limiter` do `slowapi` chaveado pelo endereço do cliente,
declara os dois limites (10/minuto na ativação, 5/minuto no login) e o handler que devolve 429 com
`{"code": "rate_limit_exceeded", "detail": "Muitas tentativas em pouco tempo. Aguarde um minuto e tente
de novo."}` mais `Retry-After`. `app/main.py` publica o limiter em `app.state` e registra o handler;
`app/routers/auth.py` decora as duas rotas.

**Job.** `app/jobs/expire_codes.py` abre uma sessão, chama `UserService.expire_codes`, comita, fecha e
loga a contagem. Roda sozinho por `python -m app.jobs.expire_codes`.

**Scheduler.** `app/core/scheduler.py` monta um `BackgroundScheduler` com o job registrado de hora em
hora e expõe o `lifespan` que o liga na subida e o desliga na descida, publicando-o em `app.state`.

## Arquivos criados

- `server/app/core/rate_limit.py` — o `Limiter`, os dois limites e o handler do 429
- `server/app/core/scheduler.py` — `create_scheduler()` e o `lifespan` que o gerencia
- `server/app/jobs/__init__.py` — pacote das tarefas agendadas
- `server/app/jobs/expire_codes.py` — a varredura de códigos vencidos, com entrada `python -m`
- `server/tests/routers/test_rate_limit_routes.py` — 6 testes do throttle
- `server/tests/core/test_scheduler.py` — 3 testes do ciclo de vida do scheduler
- `server/tests/jobs/test_expire_codes_job.py` — 10 testes da varredura

## Arquivos modificados

- `server/app/main.py` — `lifespan=lifespan` no `FastAPI(...)`, `app.state.limiter` e o handler de `RateLimitExceeded`
- `server/app/routers/auth.py` — `@limiter.limit(...)` e o parâmetro `request: Request` nas duas rotas públicas
- `server/tests/routers/conftest.py` — fixture autouse que zera os contadores do limiter entre testes
- `server/migrations/env.py` — `fileConfig(..., disable_existing_loggers=False)` (ver abaixo)

## Decisões técnicas

**O limiter mora em `core/`, não em `main.py`.** A instrução da task pedia o wiring em `app/main.py`, mas
o decorador do `slowapi` precisa ser aplicado na função da rota, e um router importando `app.main`
fecharia um ciclo de import (`main` importa os routers). O objeto ficou em `app/core/rate_limit.py`, ao
lado de `config`, `security` e `deps`, e `main.py` guardou o que de fato é wiring: `app.state.limiter` e o
handler. Consequência aceita: `app/routers/auth.py` também foi tocado, o que a task não listava — não há
como declarar um limite por rota sem escrever na rota.

**Handler próprio em vez do que vem no `slowapi`.** O padrão responde `{"error": "Rate limit exceeded:
5 per 1 minute"}`. Seria o único corpo da API que os clientes não conseguem tratar como os outros, e ainda
diria a quem está adivinhando exatamente em que ritmo insistir. O nosso devolve `{"code", "detail"}` como
todo o resto e não menciona o limite. O `Retry-After` é lido do limite que foi atingido, não fixado em 60,
para não descolar da janela se os números mudarem.

**Toda requisição conta, não só as que falham.** Contar apenas erros deixaria um atacante zerar o
orçamento com uma requisição válida no meio das tentativas. Por isso os testes usam corpos deliberadamente
errados: as respostas antes do corte são 401, o que deixa visível que o 429 substituiu uma resposta que o
endpoint ainda estava dando.

**Contadores em memória, um por processo.** Sem Redis: com vários workers uvicorn o teto efetivo é o
limite vezes o número de workers — continua sendo um teto, e continua ordens de grandeza abaixo do que
tornaria a força bruta viável. Está documentado no módulo, com `storage_uri` como saída se um dia for
preciso um balde compartilhado.

**Chave é `request.client.host`, o que exige `--proxy-headers` em produção.** Atrás de um proxy reverso
toda requisição chega do proxy, e sem `--proxy-headers` (com o proxy setando `X-Forwarded-For`) todos os
chamadores dividiriam um balde só — o primeiro que adivinhasse trancaria a congregação inteira. Está
registrado no docstring de `app/core/rate_limit.py`.

**Fixture autouse zerando o limiter entre os testes de rota.** Os contadores vivem no processo e todos os
testes de rota chamam o app do mesmo endereço; sem isso, um teste falharia por causa dos vizinhos que
gastaram a cota antes dele — foi exatamente o que aconteceu com
`test_the_three_ways_to_fail_a_login_answer_byte_for_byte_the_same` assim que o limite entrou.

**O job recebe uma *factory* de sessão, não uma sessão.** Ele roda sem requisição em volta, então não há
`get_session` de quem pegar emprestado: precisa abrir, comitar e fechar a sua. Os testes passam uma
factory que cria uma `Session` nova sobre a mesma conexão da transação de teste — assim o job realmente
abre e fecha a dele (uma sessão emprestada esconderia o fechamento), e o commit continua caindo dentro da
transação que a fixture reverte no fim.

**Relógio injetado, como nos services.** `run()` recebe `now_provider` e o padrão `utc_now()` é a única
leitura de relógio do módulo — a mesma disciplina do `CLAUDE.md` que mantém a expiração testável sem
esperar o tempo passar.

**`scheduler.shutdown(wait=True)`.** Junta as threads de trabalho, então quando o shutdown do ASGI é
respondido uma varredura pega no meio do caminho terminou a transação dela em vez de ser cortada pela
metade.

**Vários workers uvicorn = vários schedulers.** Cada worker é um processo e sobe a sua cópia, então o job
roda uma vez por worker a cada hora em vez de uma vez só. É inofensivo e foi deixado assim de propósito: a
varredura é idempotente (o `UPDATE` só casa linhas que ainda têm código, então da segunda em diante limpa
zero e custa um no-op) e não toma nenhum lock que execuções concorrentes possam disputar. Se a tarefa
algum dia ganhar um efeito colateral que precise acontecer exatamente uma vez — enviar e-mail, cobrar
algo, gerar relatório —, é essa premissa que quebra, e a resposta então é um lock no banco ou um runner
agendado único, não menos workers. Registrado no docstring de `app/core/scheduler.py`.

**Correção fora do escopo listado: `migrations/env.py`.** O `fileConfig()` do Alembic usa
`disable_existing_loggers=True` por padrão, e a suíte roda `upgrade head` **no mesmo processo** (fixture
`engine`) — isso desligava todo logger criado antes daquela linha, inclusive o do job, e o critério de
aceite "registrando quantos códigos foram limpos" ficava impossível de observar. Uma linha, um argumento,
e o comportamento do Alembic em processo separado (produção) não muda.

**Testes que passaram de primeira foram verificados por mutação.** Os casos de seletividade da varredura
herdam o comportamento de `UserRepository.expire_codes`, já implementado na 0010; o que eles acrescentam é
prová-lo através de uma sessão real comitada. Para confirmar que não são testes vazios, a regra de
produção foi mutada de propósito e os testes falharam como esperado:

| Mutação | Testes que quebraram |
|---------|----------------------|
| remover `access_code_expires_at < now` do `UPDATE` | `leaves_a_code_that_is_still_within_its_validity`, `sweeps_only_the_stale_code` |
| `key_func` devolvendo constante (balde único) | `two_different_ips_do_not_share_the_quota` |
| `SlowAPIASGIMiddleware` + `default_limits` (limite global) | `a_route_that_guards_no_secret_is_not_throttled` |
| `shared_limit` com escopo comum nas duas rotas | `the_call_just_past_the_limit...[activate-11th]`, `flooding_the_login_does_not_close_the_activation_route` |

**O que ficou deliberadamente sem cobertura medida.** `main()` e a guarda `if __name__ == "__main__"` em
`app/jobs/expire_codes.py` (linhas 78-79 e 83) aparecem como descobertas: são exercitadas de verdade por
`test_the_module_runs_on_its_own_as_a_command`, que gera o processo com `python -m`, e cobertura não
atravessa fronteira de processo. Testar um ponto de entrada de outro jeito seria testar outra coisa.

## Como validar

```bash
cd server
docker compose -f ../docker-compose.dev.yml up -d      # PostGIS precisa estar de pé
.venv/bin/python -m pytest tests/jobs/test_expire_codes_job.py tests/core/test_scheduler.py tests/routers/test_rate_limit_routes.py -v
```

Suíte inteira, cobertura e lint:

```bash
cd server
.venv/bin/python -m pytest -q --cov=app --cov-branch --cov-report=term-missing
.venv/bin/python -m ruff check . && .venv/bin/python -m ruff format --check .
```

## Resultado da validação

- `pytest -q` → **413 testes passando** (baseline 394 + 19 novos), 46s.
- Cobertura de linha **e branch** dos arquivos tocados:

| Arquivo | Stmts | Miss | Branch | BrPart | Cover |
|---------|-------|------|--------|--------|-------|
| `app/core/rate_limit.py` | 14 | 0 | 0 | 0 | **100%** |
| `app/core/scheduler.py` | 20 | 0 | 0 | 0 | **100%** |
| `app/jobs/expire_codes.py` | 27 | 3 | 2 | 1 | 86% (só `main()`, ver acima) |
| `app/routers/auth.py` | 30 | 0 | 0 | 0 | **100%** |
| `app/main.py` | 35 | 1 | 6 | 1 | 95% (a linha do CORS, descoberta desde antes) |

  Total do projeto: **98%**.
- `ruff check .` → All checks passed. `ruff format` aplicado.
- Fumaça no servidor real: `uvicorn app.main:app` sobe, `/health` responde `{"status":"ok"}`, `SIGTERM`
  encerra o processo sem thread pendurada ("Application shutdown complete", processo morto).
