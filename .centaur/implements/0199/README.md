# [0199] Contratos dos clientes para o último trabalho do território

**Data:** 2026-09-05
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0014/` — Task 03

## Solicitação

Atualizar os modelos e parsers de `admin/` e `admin-app/` para o resumo do último trabalho,
usando um tipo nomeado com `PublisherBrief` e `Date`, preservando nulo/ausente quando não houver
registro. O último trabalhador não deve ser inferido do dirigente do território.

## Contexto

As rotas de território passaram a devolver `last_work`, separado de `assigned_user`, com o nome
persistido no registro de trabalho e a data da visita mais recente.

## O que foi feito

- Criado `LastWorkSummary` nos dois clientes, com `PublisherBrief` e `Date`.
- O parser do desktop lê `last_work` como `lastWork` e mantém ausência como `undefined`.
- O parser do app admin lê `last_work` como `lastWork` e mantém ausência como `null`.
- Testes cobrem território com registro, sem registro e com dirigente diferente do autor da visita.
- URLs, autenticação, ordenação, `WorkLog` e telas permaneceram inalterados.

## Arquivos modificados

- `admin/src/shared/models.ts` — adiciona `LastWorkSummary` e o campo opcional de `Territory`.
- `admin/src/main/api-client.ts` — faz o parsing do resumo recebido da API.
- `admin/src/main/api-client.test.ts` — valida parsing com e sem registro e separação do dirigente.
- `admin-app/src/domain/models.ts` — adiciona `LastWorkSummary` e o campo de `Territory`.
- `admin-app/src/data/api-client.ts` — faz o parsing do resumo recebido da API.
- `admin-app/src/data/api-client.test.ts` — valida parsing com e sem registro e separação do dirigente.

## Arquivos criados

Nenhum arquivo de código foi criado.

## Decisões técnicas

Cada cliente manteve sua convenção existente para ausência: `undefined` no desktop e `null` no
`admin-app`. O resumo usa `publisher`, em vez de reaproveitar `assignedUser`/`assignedPublisher`,
para tornar explícita a diferença entre quem dirige o território e quem realizou a última visita.

## Como validar

```bash
cd admin && npm test -- --run
cd admin-app && npm test -- --runInBand
cd admin && npm run lint && npm run typecheck
cd admin-app && npm run lint && npm run typecheck
```

## Resultado da validação

- `admin`: 27 arquivos, 541 testes passando.
- `admin-app`: 14 suítes, 268 testes passando.
- Lint e type-check passaram nos dois clientes.
- `git diff --check` passou.
