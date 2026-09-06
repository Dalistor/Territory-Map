# [0024] Gate de chave de aplicação no servidor

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD

## Solicitação

> "quero que o servidor esteja protegido, coloquei no .env o APP_SECRET com este valor, se uma req
> n tiver isso rejeite. O admin e o app devem ter esta key nos headers (O nome pode escolher, mas o
> valor é este)"

## Contexto

A API está publicada em `http://76.13.160.146:8000`, aberta para a internet. Qualquer varredura
encontra `/docs` e a superfície inteira. Uma chave compartilhada em header faz o servidor parar de
responder a tráfego não endereçado.

**O que isto não é.** A chave é estática e viaja dentro de um APK e de um binário desktop — quem
tem qualquer um dos dois extrai o valor com `strings`. Sobre HTTP puro ela ainda trafega em texto
claro, ao lado do próprio token que deveria proteger. É um quebra-molas contra varredura
automática, não uma fronteira de autenticação. A autorização continua inteiramente no JWT do admin
e no token de app.

**O valor entregue está queimado:** foi colado no chat, cujo transcrito é armazenado e exportável.
O código nunca contém o valor — ele vem do ambiente —, então rotacionar é trocar uma linha no
`.env` da VPS e reiniciar. Registrado como pendência.

## Critérios de aceite

1. `Settings.APP_SECRET` tem default vazio quando ausente do ambiente
2. Gate ligado: requisição com o header correto passa
3. Gate ligado: requisição sem o header é recusada com 401 `{"code","detail"}`
4. Header errado devolve resposta **idêntica** à de header ausente
5. Valor certo com espaço em volta é recusado (comparação exata, sem trim)
6. `GET /health` responde sem o header
7. `GET /health` responde mesmo com header **errado** (isenção é por rota)
8. `/openapi.json`, `/docs` e `/redoc` exigem o header
9. O gate vale para escrita também, não só GET
10. `APP_SECRET` vazio: requisição sem header passa
11. `APP_SECRET` vazio: requisição **com** header qualquer também passa
12. `APP_SECRET` vazio emite WARNING no startup, citando `APP_SECRET`
13. `APP_SECRET` configurado não emite aviso
14. A comparação passa por `secrets.compare_digest`

## Ciclos TDD

| # | Caso de teste | RED real? | Código que passou a existir |
|---|---------------|-----------|------------------------------|
| 1 | default vazio de `APP_SECRET` | sim (`AttributeError`) | campo `APP_SECRET: str = ""` em `Settings` |
| 2 | requisição sem header é recusada | sim (módulo inexistente) | `app/core/app_key.py`: middleware + `install_app_key_gate` |
| 3–9 | guardas de aceitação e de abrangência | não — validados por mutação | — |
| 10 | `/health` sem header | sim (401 ≠ 200) | `EXEMPT_PATHS` conferido antes da comparação |
| 11 | `/health` com header errado | sim | idem |
| 12 | gate desligado ignora header enviado | sim (401 ≠ 200) | `install_app_key_gate` deixa de instalar o middleware |
| 13 | aviso no startup com secret vazio | sim (nenhum log) | `logger.warning` no caminho desligado |
| 14 | comparação em tempo constante | sim (`AttributeError`) | `secrets.compare_digest` no lugar de `!=` |

### Os guardas que passaram sem RED

Sete testes (3–9) descrevem o que **não** deve ser recusado, e a implementação do ciclo 2 já os
satisfazia. Em vez de aceitá-los como cobertura, provei que mordem, com três mutações no código de
produção, todas revertidas:

| Mutação | Testes que morreram |
|---------|---------------------|
| `if True:` — sempre recusa | `a_request_carrying_the_configured_key_goes_through` |
| `if False:` — gate inerte | 6 testes de recusa |
| `.strip()` antes de comparar | `the_right_value_surrounded_by_whitespace_is_refused` |

## O que foi feito

Middleware `AppKeyMiddleware` conferindo o header `X-App-Key` contra `APP_SECRET` antes do
roteamento, com `/health` isento. Instalado em `app/main.py` por `install_app_key_gate`.

## Arquivos criados

- `server/app/core/app_key.py` — o middleware, o instalador e as constantes do contrato de rede
- `server/tests/core/test_app_key.py` — 16 testes

## Arquivos modificados

- `server/app/core/config.py` — campo `APP_SECRET`, default `""`
- `server/app/main.py` — chamada de `install_app_key_gate`
- `server/.env.example` — seção documentando `APP_SECRET` e o que ele não protege
- `server/tests/services/test_auth_service.py` — **correção de defeito pré-existente**, ver abaixo

## Decisões técnicas

**Header `X-App-Key`.** Nome livre pela solicitação. Prefixo `X-` sinaliza cabeçalho não
padronizado e não colide com `Authorization`, que carrega o token — as duas coisas são
independentes e viajam juntas.

**Secret vazio remove o middleware da pilha, em vez de comparar contra `""`.** Comparar recusaria
um cliente que *manda* uma chave, que é o oposto de desligado, e faria o estado não-configurado se
comportar como mal-configurado. O ciclo 12 existe exatamente para travar essa diferença.

**Desligado por default, com aviso alto.** É o que mantém os 438 testes anteriores e o
desenvolvimento local funcionando sem header. O risco é esquecer de configurar em produção, e o
WARNING no startup é o que torna isso audível em vez de silencioso.

**`/health` isento por rota, não por fallback.** O healthcheck do deploy e o runtime do container
chamam sem chave, e ambos precisam funcionar antes de qualquer cliente existir. O ciclo 11 garante
que a isenção não é "se a comparação falhar, tenta /health".

**`/docs` e `/redoc` protegidos.** O schema nomeia toda rota e todo campo; é a planta da API.

**Mesma resposta para header ausente e errado.** Diferenciar confirmaria a um sondador que existe
chave esperada.

**`compare_digest`.** `==` sobre segredo retorna no primeiro byte diferente, e essa diferença de
tempo permite recuperar a chave caractere a caractere. Não existe asserção black-box confiável para
tempo decorrido, então o teste fixa o mecanismo com um espião — é a exceção deliberada à regra de
testar só comportamento.

## Defeito pré-existente corrigido junto

`tests/services/test_auth_service.py` (Task 11 da spec 0001) tinha
`NOW = datetime(2026, 8, 2, 12, 0, UTC)` fixo. Os testes cunham um token com esse `now` e depois o
decodificam com o `decode_token` real, que valida `exp` contra o relógio de parede. Como o token de
admin vive 12h, a suíte passava até **2026-08-03 00:00 UTC** e falhava para sempre depois disso.
Quatro testes começaram a falhar 18 minutos antes desta implementação.

Confirmei que é pré-existente rodando a suíte com as minhas mudanças em `git stash`: as mesmas
quatro falhas. Ancorei `NOW` no relógio real (`datetime.now(UTC).replace(microsecond=0)`); nenhuma
asserção depende do valor absoluto, só de `exp == NOW + 12h`.

Está fora do escopo declarado desta implementação, mas quebrava o job de testes do CI e portanto
bloquearia o deploy desta mudança.

## Anomalia não reproduzida

Um run da suíte travou por 17 minutos e foi morto. Não reproduz: as três execuções seguintes
levaram 54–58s. O diagnóstico durante o travamento mostrou uma conexão `idle` em `ROLLBACK` no
`territory_map_test`, o que aponta para contenção de locks com um processo pytest anterior deixado
em segundo plano. Não é conclusivo. Se voltar a acontecer, o caminho é conferir se há mais de um
pytest ativo antes de investigar o código.

## Como validar

```
cd server && uv run pytest tests/core/test_app_key.py -q
```

## Resultado da validação

- `uv run pytest tests/core/test_app_key.py` → **16 passed**
- Suíte inteira → **454 passed** (438 de baseline + 16), em ~55s
- `app/core/app_key.py`: 27 statements, 6 branches, **0 miss, 0 partial — 100% de linha e branch**
- `app/services/` segue em 100%
- `ruff check` e `ruff format --check` limpos

## Pendências

1. **Rotacionar o `APP_SECRET`** — o valor atual foi exposto em chat. Trocar a linha no
   `/opt/territory-map/.env` da VPS e `docker compose up -d`.
2. **Os clientes ainda não mandam o header** — `packages/core` não existe. Quando existir, o cliente
   HTTP compartilhado deve injetar `X-App-Key` em toda requisição.
3. **TLS continua sendo o buraco real.** Sobre HTTP a chave trafega em texto claro.
