# [0021] Testes de integração ponta a ponta

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 21

## Solicitação

> Spec 0001 — Task 21: Escreva em `server/tests/integration/` os testes ponta a ponta, usando o app
> FastAPI real e o PostGIS real, cada teste partindo de banco limpo. Fluxos: (1) **caminho completo**
> — criar congregação por fixture, logar como admin, cadastrar publicador, resgatar o código no papel
> do app, o app lê os territórios, o admin desenha um território e duas quadras, o app relê e enxerga
> as quadras, o app marca a quadra 1 como trabalhada, o admin vê o log com o nome do publicador e o
> `last_worked_at` correto; (2) **troca de aparelho** — publicador ativo, admin gera novo código, o
> segundo resgate emite novo token, o **token antigo passa a responder 401** e o token novo funciona;
> (3) **isolamento entre congregações** — duas congregações com territórios sobrepostos
> geograficamente, cada admin enxerga apenas os seus, e o token de uma responde 404 ao tentar ler ou
> marcar recurso da outra; (4) **integridade da demarcação** — território com quadras, tentativa de
> encolher o contorno deixando uma quadra fora responde 422 citando o número da quadra, e o estado no
> banco permanece **inalterado** depois da falha; (5) **revogação** — admin desativa o publicador e o
> token dele passa a responder 401, mas o histórico de trabalho dele continua visível para o admin.
> Não altere código de produção nesta task; se um teste falhar por bug real, registre o problema no
> relatório em vez de contornar. Toque apenas em `tests/integration/`.

## Contexto

As tasks 01–20 entregaram o servidor inteiro, com cobertura de 100% nos services e testes de rota
para cada endpoint. O que nenhum desses testes cobre são as **juntas**: o código que o admin lê na
tela é o mesmo que o app consegue gastar? O id da quadra devolvido na criação é o id que o app marca?
A projeção `last_worked_at` que o admin lê depois é o instante que o telefone enviou? Cada teste
unitário prova um lado da junta; nenhum prova que os dois lados encaixam.

Os testes de rota também substituem parte da realidade por atalhos legítimos — semeiam território
por repositório, criam publicador com `activated_at` na mão. Aqui nada é encurtado: tudo que **pode**
ser criado por HTTP é criado por HTTP, na ordem em que um admin e um telefone reais criariam.

## O que foi feito

Criada a pasta `server/tests/integration/` com um conftest próprio e cinco arquivos de fluxo,
totalizando **25 testes** que sobem o app FastAPI real sobre o PostGIS real.

### Infraestrutura (`conftest.py`)

- **`client`** — `httpx.ASGITransport` sobre o `app` de produção (routers, autenticação, tradução de
  `DomainError` e rate limiter reais). O `get_session` é sobrescrito por um gerador que **commita no
  sucesso e faz rollback na falha**, exatamente como o de produção — não apenas entrega a sessão.
- **`register_congregation`** — a única linha escrita direto no banco, porque a API não tem endpoint
  que crie congregação (ela é provisionada, não cadastrada). Commita, para que uma requisição que
  falhe depois não leve o tenant junto no rollback.
- **`api`** — fachada fina sobre o cliente HTTP, um método por ação (`login`, `register_publisher`,
  `activate`, `draw_territory`, `draw_block`, `read_map`, `mark_worked`, `work_logs`…). Devolve
  sempre a `httpx.Response` crua, então os testes continuam afirmando status e corpo eles mesmos; o
  que a fachada remove é o ruído de URL e header que soterraria a narrativa de cada fluxo.
- **`square`** — fábrica do anel mais simples que é um polígono válido, já em formato JSON.
- **`fresh_rate_limit_counters`** (autouse) — zera o balde do `slowapi` antes e depois de cada teste;
  vários fluxos logam e resgatam código mais de uma vez.

### Os cinco fluxos

| Arquivo | Testes | O que prova |
|---------|--------|-------------|
| `test_full_flow_integration.py` | 1 | A jornada inteira num único teste: provisionar → logar → cadastrar publicador → resgatar código → mapa vazio → desenhar território e 2 quadras → app relê e vê as quadras → marca a quadra 1 → admin lê o log com o nome e o `worked_at` → `last_worked_at` bate nas duas visões (admin e app) e a quadra 2 continua `None` |
| `test_device_swap_integration.py` | 3 | Novo resgate emite token novo e **mata o antigo nas duas rotas do app** (401 na leitura e na escrita); o código anterior não resgatado morre ao ser reemitido; um código não pode ser gasto duas vezes |
| `test_tenant_isolation_integration.py` | 10 | Duas congregações desenham **o mesmo quadrado** (legal — a regra de sobreposição é intra-congregação) e nada disso muda o que cada uma enxerga: listagens escopadas, e 404 (nunca 403) ao ler, redesenhar, apagar território alheio, ler histórico alheio, reemitir código ou revogar publicador alheio, e ao marcar quadra alheia |
| `test_demarcation_integrity_integration.py` | 5 | Encolher deixando a quadra 2 fora → 422 com `"quadra 2"` na mensagem; **o banco fica inalterado** (contorno e quadras lidos direto do PostGIS com `ST_AsText`, mais releitura por HTTP); duas quadras órfãs → `"quadras 1 e 2"`; caso de controle de um contorno menor que ainda contém tudo → 200 e o contorno **muda** de fato na tabela; quadra desenhada fora do território → 422 |
| `test_revocation_integration.py` | 6 | Desativar corta o acesso na requisição seguinte (leitura e escrita); o histórico e o `last_worked_at` sobrevivem com o nome da pessoa; o publicador continua na lista marcado como inativo; código novo emitido para desativado responde `inactive_user`; reativar devolve o acesso **ao mesmo aparelho**, sem código novo |

## Arquivos criados

- `server/tests/integration/conftest.py` — cliente sobre o app real com transação por requisição,
  fábrica de congregação, fachada `Api` e fábrica de geometria
- `server/tests/integration/test_full_flow_integration.py` — fluxo 1
- `server/tests/integration/test_device_swap_integration.py` — fluxo 2
- `server/tests/integration/test_tenant_isolation_integration.py` — fluxo 3
- `server/tests/integration/test_demarcation_integrity_integration.py` — fluxo 4
- `server/tests/integration/test_revocation_integration.py` — fluxo 5

## Arquivos modificados

Nenhum. Código de produção intocado, conforme a task.

## Decisões técnicas

**Uma transação por requisição, e não uma sessão emprestada.** Os testes de rota sobrescrevem
`get_session` por `lambda: session` — bom o bastante para provar o comportamento de um endpoint. Aqui
a sobrescrita reproduz o contrato real (`commit` no sucesso, `rollback` na exceção), porque o fluxo 4
afirma que **o banco** ficou inalterado depois de um 422; uma fixture que só emprestasse a sessão
provaria isso sobre a sessão, não sobre o banco. Verificado empiricamente que o caminho de rollback
é de fato exercitado: numa sonda descartável, um 422 e um 401 produziram cada um exatamente
`{commit: 0, rollback: 1}` — o `DomainError` propaga pelo exit stack do FastAPI antes de o
exception handler o traduzir, então o teardown da dependência recebe a exceção como em produção.

**Banco limpo sem truncar tabela.** A fixture `session` da raiz vive dentro de uma transação externa
sempre revertida e entra nela com `join_transaction_mode="create_savepoint"`, então cada `commit()`
aqui libera um savepoint em vez de gravar de verdade. Consequência importante: `register_congregation`
precisa **commitar** (e não só `flush`), senão uma requisição que falhe depois faria rollback até o
savepoint e levaria a congregação junto. Conferido ao fim da execução completa: as cinco tabelas
ficam com 0 linhas.

**Tudo por HTTP, exceto a congregação.** É o que separa estes testes dos de rota. A congregação é a
única exceção porque não existe endpoint que a crie.

**Uma fachada `Api` em vez de helpers soltos.** As pastas de `tests/` não são pacotes (sem
`__init__.py`), então não há como importar um módulo de helpers entre arquivos de teste sem depender
do modo de importação do pytest. A alternativa seria repetir `bearer`/`square`/chamadas em cinco
arquivos. A fachada resolve os dois e mantém os status codes visíveis nos testes.

**O fluxo 1 é um teste longo de propósito.** Dividido em cinco, cada parte precisaria das outras
quatro como setup, e a sequência — a única coisa que este arquivo existe para testar — seria
justamente o que não estaria sendo afirmado.

**Nomes de arquivo com sufixo `_integration`.** O pytest aborta a coleta quando dois arquivos de
teste têm o mesmo basename em pastas sem `__init__.py`; o sufixo garante unicidade no servidor
inteiro, como manda o `CLAUDE.md`.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d          # PostGIS
cd server && uv run pytest tests/integration -q         # só os fluxos: 25 testes
cd server && uv run pytest -q                           # suíte completa
cd server && uv run ruff check . && uv run ruff format --check .
```

## Resultado da validação

- `uv run pytest tests/integration -q` → **25 passed** (~21 s)
- `uv run pytest -q` → **438 passed** (413 antes desta task + 25), sem regressão
- `uv run pytest --cov=app --cov-report=term-missing` → `app/services/` segue em **100%** em todos os
  cinco arquivos; total do projeto **98%**
- `uv run ruff check tests/integration` → limpo; `ruff format` aplicado
- Banco de teste conferido depois da execução completa: 0 linhas em `congregations`, `users`,
  `territories`, `blocks` e `block_work_logs`

**Nenhum bug de produção encontrado.** Todos os 25 fluxos passaram na primeira execução contra o
código como estava — inclusive os pontos mais sensíveis (o token antigo devolvendo 401 no instante do
segundo resgate, o 404 em vez de 403 em todos os cruzamentos entre congregações, e o banco intacto
depois do 422 de demarcação).

Para checar que os testes não passam à toa, duas regressões foram simuladas por `monkeypatch` numa
sonda descartável (nunca no código de produção, que ficou intocado): remover o incremento de
`token_version` no resgate, e fazer a listagem de territórios ignorar a congregação. As duas mudanças
produziram exatamente o comportamento que os fluxos 2 e 3 afirmam **não** acontecer, ou seja, os dois
testes falhariam. A sonda foi apagada em seguida.
