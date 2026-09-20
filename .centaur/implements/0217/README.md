# [0217] Consulta paginada de designações no admin Android

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 06

## Solicitação

Adicionar ao `admin-app/` os tipos e a chamada HTTP para consultar o histórico
paginado de designações, com filtros opcionais e datas ISO-8601.

## Contexto

O histórico da congregação deixou de ser uma lista sem paginação. O admin Android
precisa interpretar o mesmo contrato do servidor sem reproduzir no cliente a regra
de sobreposição de períodos.

## O que foi feito

- Foram definidos os tipos de linha com território, filtros e página de histórico.
- O cliente passou a consultar `GET /admin/assignments`, serializando somente os
  filtros escolhidos e convertendo datas recebidas para `Date`.
- A linha preserva o nome copiado do publicador devolvido pelo servidor.
- O fake de `ApiClient` da sessão foi atualizado para refletir o contrato ampliado.

## Arquivos modificados

- `admin-app/src/domain/models.ts` — tipos do histórico paginado.
- `admin-app/src/domain/models.test.ts` — formas de domínio do histórico.
- `admin-app/src/data/api-client.ts` — parsing e consulta HTTP paginada.
- `admin-app/src/data/api-client.test.ts` — parsing, query opcional e paginação.
- `admin-app/src/data/session.test.ts` — fake completo do cliente HTTP.

## Decisões técnicas

A regra de quais períodos se sobrepõem continua inteiramente no servidor. O cliente
só serializa filtros e apresenta a página que recebeu.

## Como validar

```bash
cd admin-app
npm test -- --runInBand
npm run typecheck
npm run lint
```

## Resultado da validação

Os 282 testes Jest passaram; `tsc --noEmit` e ESLint concluíram sem erros. A suíte
mostrou avisos já existentes de chamadas `act()` sobrepostas em `SetupScreen.test.tsx`,
mas nenhum teste falhou.
