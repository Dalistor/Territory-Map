# [0233] Regras puras e cliente HTTP de atualização no app do publicador

**Data:** 2026-10-09
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0016/` — Task 02

## Solicitação

Implementar as regras puras de comparação de versão e o cliente HTTP de verificação de atualização no aplicativo do publicador (`app/`).

## Contexto

O app do publicador precisa consultar a rota `/updates/latest?app=app` ao abrir e verificar se a versão remota é superior à versão atual e se a atualização é mandatória.

## O que foi feito

- `app/src/domain/appUpdate.ts`:
  - Interface `AppRelease`.
  - Funções puras `isUpdateAvailable`, `isUpdateMandatory` e `parseAppRelease`.
- `app/src/domain/appUpdate.test.ts`: testes de unidade cobrindo todas as condições lógicas de versão.
- `app/src/data/update-client.ts`: função `fetchLatestRelease` com injeção de `fetchImpl`, tratamento de 404 (sem release), 4xx/5xx (`ApiErrorException`) e falhas de conexão (`NetworkException`).
- `app/src/data/update-client.test.ts`: testes de unidade do cliente HTTP com mocks.
- Exportação dos módulos em `app/src/domain/index.ts` e `app/src/data/index.ts`.

## Arquivos modificados

- `app/src/domain/appUpdate.ts`
- `app/src/domain/appUpdate.test.ts`
- `app/src/domain/index.ts`
- `app/src/data/update-client.ts`
- `app/src/data/update-client.test.ts`
- `app/src/data/index.ts`
