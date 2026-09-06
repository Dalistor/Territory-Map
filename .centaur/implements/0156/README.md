# [0156] Teste de integração: forçar o status da quadra e vê-lo se desfazer sozinho

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0010/` — Task 05

## Solicitação
> Spec 0010 — Task 05: escreva `server/tests/integration/test_block_status_override_integration.py`,
> seguindo o padrão dos arquivos vizinhos em `server/tests/integration/` (app FastAPI real sobre
> PostGIS real, tudo criado por HTTP, congregação como única linha escrita direto no banco).
>
> Cubra o ciclo inteiro num fluxo só: o admin cria território e quadra, força
> `status_override: "overdue"` pelo `PATCH`, e o campo volta tanto no `GET` do território do admin
> quanto no `GET /app/territories` lido com o token de um publicador; um `PATCH` que só renumera a
> quadra preserva o status forçado; o admin então registra trabalho na quadra por
> `POST /admin/blocks/{id}/worked` e o status forçado aparece **nulo** na releitura, com
> `last_worked_at` preenchido; forçar `"never"` de novo e **apagar** o registro de trabalho deixa o
> override **intacto** (é a assimetria deliberada da Task 03, e é o caso que um refactor futuro mais
> provavelmente quebra); por fim, `status_override: null` devolve a quadra ao automático. Verifique
> também que o admin de outra congregação recebe 404 ao tentar forçar o status dessa quadra.
>
> Toque apenas em `server/tests/integration/`; não modifique código de produção — se algum
> comportamento não fechar, o defeito é de uma task anterior e deve ser reportado, não corrigido
> aqui.

## Contexto
As Tasks 01–04 da spec 0010 construíram o `status_override` camada por camada: coluna, DTO,
service, router. Cada uma tem teste próprio, mas nenhuma prova que as peças se encaixam quando o que
as move é HTTP de verdade contra o PostGIS de verdade. Três coisas só aparecem nessa altura:

1. o valor forçado sai por **dois serializadores independentes** — o `block_out` do admin e o
   `_block_out` do app —, e um deles poderia esquecer o campo sem quebrar nada da outra ponta;
2. a distinção **ausente vs. nulo** do `PATCH` vive em `model_fields_set`, que deixa de existir
   assim que a requisição vira JSON; só vale a pena conferir do outro lado do fio;
3. a **assimetria** entre "registrar trabalho limpa o override" e "apagar registro não limpa" é a
   decisão desta spec com maior chance de ser "arrumada" por um refactor futuro que ache que as duas
   metades deviam ser simétricas. Um teste ponta a ponta faz esse refactor quebrar um fluxo, e não
   só um teste de unidade que se pode ler como detalhe de implementação.

## Critérios de aceite
- Quadra recém-criada volta com `status_override` nulo e `last_worked_at` nulo.
- `PATCH /admin/blocks/{id}` com `status_override: "overdue"` responde 200 com o campo preenchido.
- O campo forçado aparece no `GET /admin/territories/{id}` e no `GET /app/territories` lido com o
  token de um publicador.
- Um `PATCH` que só manda `number` preserva o status forçado (e renumera de fato).
- `POST /admin/blocks/{id}/worked` deixa o `status_override` **nulo** na releitura, com
  `last_worked_at` preenchido — nos dois mapas.
- Forçar `"never"` de novo e apagar o registro de trabalho por `DELETE /admin/work-logs/{id}` deixa
  `last_worked_at` nulo e o override **intacto**.
- `PATCH` com `status_override: null` devolve a quadra ao automático, sem mexer no número.
- O admin de outra congregação recebe **404** (`code: "not_found"`) ao tentar forçar o status, e a
  quadra fica exatamente como estava.

## Ciclos TDD
Esta task é de verificação: o comportamento já existia (Tasks 01–04), então o RED convencional
("escrever o teste e vê-lo falhar por falta de código") não se aplica. O equivalente honesto é
provar que as asserções **mordem** — feito por mutação do código de produção, aplicada e revertida.

| # | Caso de teste | Arquivo de teste | Verificação |
|---|---------------|------------------|-------------|
| 1 | `test_the_admin_pins_a_block_status_and_only_new_work_unpins_it` | `server/tests/integration/test_block_status_override_integration.py` | Mutação: fazer `WorkLogService.delete` chamar `set_status_override(block, None)` (a simetria "óbvia" que a spec descartou) faz o teste falhar com `AssertionError: assert None == 'never'`, exatamente na asserção da assimetria. Revertida a mutação, verde. |
| 2 | `test_the_other_congregations_admin_cannot_pin_a_status_on_my_block` | idem | Cobre o 404 entre congregações e a ausência de escrita colateral. |

## O que foi feito
Um arquivo de teste novo, com dois fluxos e nenhuma mudança em código de produção.

O primeiro fluxo é **um teste longo só**, como nos arquivos vizinhos: fixar, ler nos dois mapas,
renumerar, marcar trabalho, refixar, apagar o registro, soltar. Cada passo depende do que o anterior
deixou na coluna — quebrar em sete testes transformaria as asserções de cada um em setup do
seguinte e esconderia justamente o encadeamento que está sob teste.

O segundo é o corte por congregação, no molde já usado por
`test_admin_marking_integration.py`: mesma quadra real, token errado, 404 e nada escrito.

## Arquivos criados
- `server/tests/integration/test_block_status_override_integration.py` — o ciclo completo do
  `status_override` por HTTP contra o PostGIS real.

## Arquivos modificados
Nenhum. Nenhum defeito de task anterior foi encontrado — os quatro comportamentos que a instrução
mandava conferir fecharam de primeira.

## Decisões técnicas
- **Helpers locais em vez de crescer o `Api` do conftest.** `patch_block`, `admin_mark_worked` e
  `delete_work_log` ficam no próprio arquivo, seguindo o precedente de
  `test_admin_marking_integration.py`, que fez o mesmo com `admin_mark_worked` e `patch_territory`.
  Mexer na fachada compartilhada por causa de uma spec tocaria arquivo de que oito outros fluxos
  dependem, sem ganho.
- **`patch_block` recebe o corpo cru, não argumentos nomeados.** É a mesma razão registrada em
  `patch_territory`: o que está sob teste é a diferença entre chave ausente e chave nula, e uma
  assinatura com defaults apagaria essa diferença antes de a requisição ser montada.
- **`only_block` afirma que há exatamente uma quadra** antes de devolvê-la. Um `[0]` solto passaria
  a ler a quadra errada em silêncio se o fluxo um dia ganhasse uma segunda.
- **O RED foi feito por mutação.** A task pede um teste sobre código já pronto, então não havia
  produção a escrever; para não "inventar" um ciclo red-green, a mutação do
  `WorkLogService.delete` serviu de prova de que o teste detecta a regressão que ele existe para
  impedir. Aplicada e revertida — o `git diff` do arquivo voltou ao estado da Task 03.
- **Nada de mock.** É o ponto do `tests/integration/`: app FastAPI real, PostGIS real, congregação
  como única linha escrita direto no banco.

## Como validar
```bash
cd server && uv run pytest tests/integration/test_block_status_override_integration.py -q
```
(exige o PostGIS de `docker compose -f docker-compose.dev.yml up -d`)

## Resultado da validação
- `uv run pytest tests/integration/test_block_status_override_integration.py -q` → **2 passed**
- `uv run pytest -q` (suíte inteira do servidor) → **596 passed**
- `uv run ruff check tests/integration/` → `All checks passed!`
- `uv run ruff format --check tests/integration/` → `10 files already formatted`
- Cobertura: não se aplica como número novo — a task não adiciona linha de produção. O que ela
  cobre é o caminho HTTP completo do `status_override`, cujas linhas de service e router já estavam
  a 100% pelas Tasks 03 e 04.
