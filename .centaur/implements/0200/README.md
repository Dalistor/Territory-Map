# [0200] Último trabalho na lista do admin desktop

**Data:** 2026-09-05
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 04

## Solicitação

Mostrar na lista de territórios da Home o último publicador e a data do trabalho, ou
`Nunca trabalhado` quando não houver registro, sem confundir essa informação com a designação atual.

## Contexto

O contrato do desktop já entregava `lastWork`; faltava apresentá-lo na linha de cada território.
Foi reutilizada a convenção local `Date.toLocaleDateString()` já usada pelas telas do admin.

## Critérios de aceite

- Com último trabalho, a linha mostra `Último trabalho: Nome — data`.
- Sem último trabalho, a linha mostra `Nunca trabalhado`.
- A designação atual permanece apresentada separadamente.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---|---|---|
| 1 | Mostra o último trabalho separadamente da designação atual | `admin/src/renderer/screens/HomeScreen.test.tsx` | Formatação local e linha `territory-last-work` em `HomeScreen.tsx` |
| 2 | Mostra que o território nunca foi trabalhado | `admin/src/renderer/screens/HomeScreen.test.tsx` | Fallback `Nunca trabalhado` em `HomeScreen.tsx` |

## Verificação

- `npm test`: 27 arquivos, 543 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- Cobertura focal da Home: 100% de linhas e 88,09% de branches.
