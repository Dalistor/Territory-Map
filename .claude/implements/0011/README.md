# [0011] Service de autenticação do admin

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 11

## Solicitação

> Spec 0001 — Task 11: Implemente por TDD `server/app/services/auth.py` com `AuthService`,
> recebendo `CongregationRepository`, um `now_provider` e as funções de `app/core/security.py`.
> Método `login(name, city, password, now) -> (congregation, token)`. Critérios de aceite:
> (a) nome, cidade e senha corretos devolvem a congregação e um JWT de admin válido, decodificável
> e com o `congregation_id` certo; (b) nome errado, cidade errada e senha errada levantam **a
> mesma** `InvalidCredentialsError`, com a mesma mensagem — um teste deve comparar as três
> mensagens e afirmar que são idênticas; (c) nome e cidade certos de congregações diferentes não se
> misturam: com duas congregações de mesmo nome em cidades distintas, a senha de uma não autentica
> a outra; (d) `verify_password` é chamado **mesmo quando a congregação não existe**, comparando
> contra um hash descartável, para que o tempo de resposta não revele a existência do registro —
> verifique isso com um dublê que conta chamadas; (e) o service não constrói `HTTPException` nem
> importa FastAPI. Toque apenas em `app/services/auth.py` e `tests/services/test_auth_service.py`.

## Contexto

É o primeiro service do projeto e a única porta de entrada do admin. Tudo que o app admin faz
depois depende do JWT emitido aqui, e o `congregation_id` desse token é a única barreira entre os
dados de congregações diferentes — nenhum endpoint aceita esse id do cliente.

O ponto delicado não é acertar o login, é errar de forma uniforme. O par `(name, city)` é público e
adivinhável de um jeito que uma senha não é: se responder "não existe" for distinguível de "senha
errada" — por mensagem **ou por tempo de resposta** —, dá para mapear as congregações do sistema
sem nunca acertar uma senha. Daí os dois requisitos incomuns desta task: mensagem única e
verificação de senha incondicional.

## Critérios de aceite

1. Nome, cidade e senha corretos devolvem a congregação encontrada.
2. O login bem-sucedido devolve um JWT de admin decodificável, com o `congregation_id` certo e
   `type == "admin"`.
3. Nome desconhecido é rejeitado com `InvalidCredentialsError`.
4. Nome certo em cidade errada é rejeitado com `InvalidCredentialsError`.
5. Senha errada é rejeitada com `InvalidCredentialsError`.
6. As mensagens dos três casos acima são **idênticas** entre si.
7. Com duas congregações de mesmo nome em cidades distintas, a senha de uma não autentica a outra.
8. Cada uma dessas duas autentica com a própria senha e recebe o token da própria congregação.
9. `verify_password` é chamado mesmo quando a congregação não existe.
10. O hash descartável usado nesse caso é um digest bcrypt real, e não um placeholder barato.
11. A expiração do token é 12h após o `now` recebido.
12. Sem `now`, o service usa o `now_provider` injetado.
13. O service não importa FastAPI nem Starlette.
14. O service não constrói `HTTPException`.
15. O service não lê o relógio por conta própria.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_correct_name_city_and_password_return_that_congregation` | `tests/services/test_auth_service.py` | `AuthService` com o repositório injetado e a busca por `(name, city)` |
| 2 | `test_a_successful_login_returns_a_decodable_admin_token_for_that_congregation` | idem | `create_admin_token` injetado e emissão do token |
| 3 | `test_an_unknown_congregation_name_is_rejected` | idem | `raise InvalidCredentialsError` quando não há linha |
| 4 | `test_the_right_name_in_the_wrong_city_is_rejected` | idem | — (verde de imediato; guarda a regra "nome e cidade juntos") |
| 5 | `test_the_wrong_password_is_rejected` | idem | `verify_password` injetado e conferência do digest |
| 6 | `test_wrong_name_wrong_city_and_wrong_password_fail_with_the_very_same_message` | idem | — (verde de imediato; trava a mensagem única) |
| 7 | `test_the_password_of_a_namesake_in_another_city_does_not_authenticate` | idem | — (verde de imediato) |
| 8 | `test_namesake_congregations_each_authenticate_with_their_own_password` | idem | — (verde de imediato) |
| 9 | `test_the_password_is_verified_even_when_the_congregation_does_not_exist` | idem | `_ABSENT_CONGREGATION_HASH` e verificação incondicional |
| 10 | `test_the_absent_congregation_is_compared_against_a_real_bcrypt_digest` | idem | — (verde de imediato; trava a qualidade do hash descartável) |
| 11 | `test_the_token_expires_twelve_hours_after_the_now_that_was_passed_in` | idem | — (verde de imediato) |
| 12 | `test_login_falls_back_to_the_injected_clock_when_no_now_is_given` | idem | `issued_at = self._now_provider() if now is None else now` |
| 13 | `test_the_service_does_not_import_fastapi` | idem | — (guarda de camada) |
| 14 | `test_the_service_never_builds_an_http_exception` | idem | — (guarda de camada) |
| 15 | `test_the_service_never_reads_the_clock_itself` | idem | — (guarda de camada) |

Os ciclos marcados "verde de imediato" não geraram código novo: são critérios de aceite que a
implementação já satisfazia e que agora ficam travados contra regressão. Nenhum deles é duplicata
de outro — cada um cobre uma dimensão distinta (cidade vs. nome, mensagem, congregação homônima,
qualidade do hash, relógio). Os três últimos foram validados por mutação (veja abaixo).

## O que foi feito

`AuthService.login` busca a congregação pelo par `(name, city)`, verifica a senha e devolve
`(congregation, token)`. Toda dependência entra pelo construtor: o `CongregationRepository`, o
`now_provider` e as duas funções de `app/core/security.py` (`verify_password` e
`create_admin_token`), estas com o valor real como default.

A verificação de senha acontece **sempre**, mesmo sem congregação: nesse caso o alvo da comparação
é `_ABSENT_CONGREGATION_HASH`, um digest bcrypt de uma string aleatória computado uma única vez na
importação do módulo. Só depois da comparação é que a decisão é tomada, com um único
`raise InvalidCredentialsError` cobrindo os três modos de falha.

## Arquivos modificados

Nenhum arquivo existente foi alterado.

## Arquivos criados

- `server/app/services/__init__.py` — docstring da camada de services (a pasta ainda não existia).
- `server/app/services/auth.py` — `AuthService` e o hash descartável.
- `server/tests/services/test_auth_service.py` — 15 testes, o fake do repositório e o dublê contador.

## Decisões técnicas

**Hash descartável em constante de módulo, não lazy.** A defesa contra o oráculo de tempo só vale
se o custo for igual nos dois caminhos. Um digest construído sob demanda (`lru_cache`) deixaria
justamente a *primeira* tentativa contra congregação inexistente mais lenta que as demais — o
vazamento que se queria fechar, só que uma vez. Computar na importação custa ~250ms uma vez no
boot e iguala todas as requisições. É por isso também que o alvo é um bcrypt de verdade e não uma
string qualquer: `verify_password` contra um placeholder retornaria em microssegundos.

**Resultado calculado antes do `if`.** `password_matches` é avaliado e só então a condição
`congregation is None or not password_matches` decide. Escrever `if congregation is None: raise`
antes da verificação seria mais legível e reintroduziria exatamente o curto-circuito que a task
proíbe.

**`now` como parâmetro *e* `now_provider` injetado.** A instrução pedia os dois. A leitura adotada:
`now` é opcional e, quando omitido, vem do provider. O router passa o instante da requisição; um
teste passa um instante fixo; em nenhum caso o módulo lê o relógio. O teste 15 garante isso por AST.

**Fake in-memory em vez de `MagicMock`.** Como manda o `CLAUDE.md` para service não-geométrico. O
fake responde `None` para o que não tem, igual ao repositório real — um mock devolveria um objeto
para qualquer coisa e o teste passaria contra um comportamento que a classe real nunca teria. Não
há banco nesta suíte: o login não tem regra geométrica, então tudo roda em memória, em ~7s
(dominados por bcrypt, que é lento de propósito).

**Dublê contador em vez de medir tempo.** O critério (d) é sobre tempo de resposta, mas cronometrar
bcrypt num teste seria intermitente. O que se verifica é a causa observável — `verify_password` foi
chamada, e com um digest bcrypt real —, não o efeito estatístico.

**Guardas de camada validadas por mutação.** Os três últimos testes leem o AST do módulo e passam
desde o primeiro instante, então foram verificados injetando temporariamente `from fastapi import
HTTPException`, uma construção de `HTTPException` e um `_dt.now()` no service: os três acusaram, e
a mutação foi revertida. A primeira versão do teste de relógio **não** pegou o `_dt.now()` — ela
comparava o nome pontilhado `datetime.now`, que um `import ... as _dt` contorna. Foi reescrita para
casar pelo atributo chamado (`now`/`utcnow`/`today`/`time`/`monotonic`), independentemente do nome
do receptor, e só então passou a acusar.

**Deixado deliberadamente sem teste:** o tempo de resposta em si (não é determinístico) e a
integração com o `CongregationRepository` real contra o banco — esta é coberta pelos testes de rota
da Task 17 e pelos de integração da Task 21.

## Como validar

```bash
cd server
uv run pytest tests/services/test_auth_service.py -v
uv run pytest tests/services/test_auth_service.py --cov=app.services.auth --cov-report=term-missing --cov-branch
uv run ruff check app/services/auth.py tests/services/test_auth_service.py
```

## Resultado da validação

- `uv run pytest tests/services/test_auth_service.py -q` → **15 passed**.
- Cobertura de `app/services/auth.py`: **100% de linha e 100% de branch** (22 statements, 2
  branches, 0 miss, 0 partial).
- `uv run ruff check` e `ruff format --check` nos dois arquivos: limpos.
- Suíte completa: os arquivos desta task passam integralmente. No momento da execução havia falhas
  em `tests/services/test_user_service.py`, de outra task da spec (Task 12) rodando em paralelo e
  ainda não concluída — sem relação com este código, que não toca nenhum arquivo compartilhado.
