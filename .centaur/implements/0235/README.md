# [0235] Modal de atualização e verificação ao abrir no app do publicador

**Data:** 2026-10-09
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0016/` — Task 04

## Solicitação

Integrar a verificação de versão no ciclo de abertura do app do publicador (`app/`) e exibir o diálogo de atualização com progresso e notas de lançamento.

## Contexto

Quando o publicador abre o app, uma checagem em segundo plano consulta a VPS. Se houver nova versão, um modal deve ser apresentado destacando versão, notas e botão de atualização (com bloqueio quando mandatória).

## O que foi feito

- `app/src/presentation/components/UpdateModal.tsx`:
  - Modal acessível com título, versão, changelog, aviso de atualização obrigatória quando aplicável e barra de progresso durante o download.
- `app/src/presentation/components/UpdateModal.test.tsx`: testes de renderização, botão atualizar, progresso e comportamento obrigatório/opcional.
- `app/src/presentation/App.tsx`:
  - Extensão de `AppDependencies` com `checkForUpdates`, `getAppVersion` e `downloadAndInstall`.
  - Checagem assíncrona em segundo plano sem bloquear a inicialização ou a restauração de sessão.
  - Listener para eventos de progresso `onApkDownloadProgress`.
  - Renderização do `UpdateModal`.
- `app/src/presentation/App.test.tsx`: teste de integração do fluxo de bootstrap com exibição do modal de atualização.

## Arquivos modificados

- `app/src/presentation/components/UpdateModal.tsx`
- `app/src/presentation/components/UpdateModal.test.tsx`
- `app/src/presentation/App.tsx`
- `app/src/presentation/App.test.tsx`
