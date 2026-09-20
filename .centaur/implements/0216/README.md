# [0216] Cliente desktop do histórico paginado

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 04

## Solicitação

Atualizar os modelos compartilhados e o cliente HTTP do admin desktop para consultar e interpretar
o histórico de designações paginado e filtrável.

## Contexto

`GET /admin/assignments` passou a devolver uma página de histórico, em vez de uma lista completa.
O processo Main precisa transportar os filtros ao servidor e converter a resposta para tipos que o
IPC e o renderer poderão consumir na task seguinte, sem recriar a regra de sobreposição no cliente.

## O que foi feito

- Adicionei os tipos nomeados `AssignmentHistoryQuery` e `AssignmentHistoryPage` ao contrato
  compartilhado.
- Atualizei `listAllAssignments` para serializar somente parâmetros presentes, convertendo as datas
  para instantes ISO-8601.
- Converti `items`, `total`, `page` e `page_size` da resposta paginada para o modelo TypeScript,
  preservando os métodos de histórico por território e todas as operações de designação.
- Cobri parsing da página, codificação de URL, datas e omissão de filtros ausentes.

## Arquivos modificados

- `admin/src/shared/models.ts` — tipos da consulta e página de histórico.
- `admin/src/main/api-client.ts` — construção da query, chamada e parsing da página.
- `admin/src/main/api-client.test.ts` — testes do contrato HTTP do cliente.

## Arquivos criados

- `.centaur/implements/0216/README.md` — registro desta implementação.

## Decisões técnicas

O Main apenas converte nomes de campos, datas e query string. O intervalo semiaberto e a decisão de
quais designações se sobrepõem continuam exclusivamente no servidor, onde o contrato foi definido.

## Como validar

1. Em `admin/`, execute `npm test -- --run src/main/api-client.test.ts`.
2. Em `admin/`, execute `npm run typecheck`.
3. Em `admin/`, execute `npm run lint` e confirme que não há avisos nos arquivos desta mudança.

## Resultado da validação

- `npm test -- --run src/main/api-client.test.ts`: 69 testes passaram.
- `npm run typecheck`: passou nos projetos Node e Web.
- `npm run lint`: sem avisos em `api-client.ts` ou `api-client.test.ts`; havia avisos Prettier já
  existentes em arquivos de renderer fora do escopo.
- `git diff --check` nos arquivos alterados: sem erros.
