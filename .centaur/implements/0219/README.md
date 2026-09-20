# [0219] Ponte IPC da consulta paginada de designações

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 05

## Solicitação

> Spec 0015 — Task 05: Atualize o contrato IPC, handler e preload de `assignments.listAll` (ou
> renomeie para um nome que expresse consulta, atualizando todos os consumidores) para receber os
> filtros tipados e devolver a página. Mantenha a ponte 1:1, sem filtrar, paginar ou formatar no
> preload/handler. Atualize testes de IPC e os fakes de `window.api` afetados. Toque apenas em
> Shared/IPC, Main/IPC, Preload e testes de contrato; não altere telas.

## Contexto

A consulta HTTP de designações agora devolve uma página filtrável. O renderer precisa chegar a ela
somente pela ponte IPC, sem duplicar no Electron regras que pertencem ao servidor.

## O que foi feito

- Tipado `assignments.listAll` no contrato IPC com os parâmetros e a página de histórico.
- Encaminhados os filtros, sem transformação, do preload ao handler e ao cliente principal.
- Atualizado o teste do handler para verificar tanto os filtros quanto a página devolvida.

## Arquivos modificados

- `admin/src/shared/ipc-contract.ts` — contrato de página e filtros da consulta.
- `admin/src/preload/index.ts` — repasse 1:1 de filtros ao canal IPC.
- `admin/src/main/ipc-handlers.ts` — repasse 1:1 ao cliente autenticado.
- `admin/src/main/ipc-handlers.test.ts` — fake e expectativa da página paginada.

## Arquivos criados

- `.centaur/implements/0219/README.md` — registro desta implementação.

## Decisões técnicas

`listAll` foi preservado como nome da operação para evitar uma mudança de superfície desnecessária;
o tipo agora comunica que o resultado é uma página e que a consulta aceita filtros opcionais.

## Como validar

No diretório `admin/`, execute `npm test -- --run src/main/ipc-handlers.test.ts` e
`npm run typecheck:node`.

## Resultado da validação

- `npm test -- --run src/main/ipc-handlers.test.ts` — 20 testes passaram.
- `npm run typecheck:node` — passou.
- `npm run lint` — passou sem erros; 14 avisos Prettier preexistentes em componentes/telas fora do
  escopo.
- `npm run typecheck:web` — bloqueado temporariamente pela `HistoryScreen` ainda esperar lista em
  vez da nova página; essa adaptação pertence à Task 12 desta spec.
