# [0236] Regras puras e cliente HTTP de atualização no app admin

**Data:** 2026-10-09
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0016/` — Task 05

## Solicitação

Implementar as regras puras de verificação de versão e o cliente HTTP de consulta de releases no aplicativo do administrador (`admin-app/`).

## Contexto

Assim como o app do publicador, o app admin precisa verificar a disponibilidade de novas versões ao abrir através da rota `/updates/latest?app=admin-app`.

## O que foi feito

- `admin-app/src/domain/appUpdate.ts`: modelos (`AppRelease`), funções puras `isUpdateAvailable`, `isUpdateMandatory` e `parseAppRelease`.
- `admin-app/src/domain/appUpdate.test.ts`: testes de unidade das regras puras.
- `admin-app/src/data/update-client.ts`: função `fetchLatestRelease` adaptada ao `admin-app`.
- `admin-app/src/data/update-client.test.ts`: testes de unidade do cliente HTTP com mocks.
- Exportações em `admin-app/src/domain/index.ts` e `admin-app/src/data/index.ts`.

## Arquivos modificados

- `admin-app/src/domain/appUpdate.ts`
- `admin-app/src/domain/appUpdate.test.ts`
- `admin-app/src/domain/index.ts`
- `admin-app/src/data/update-client.ts`
- `admin-app/src/data/update-client.test.ts`
- `admin-app/src/data/index.ts`
