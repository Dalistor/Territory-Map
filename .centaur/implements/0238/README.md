# Implementação 0238: Modal de atualização e verificação ao abrir no app admin (spec 0016, Task 07)

## O que foi feito
1. Criado `admin-app/src/presentation/components/UpdateModal.tsx` com renderização de modal para novas versões (obrigatórias e opcionais), changelog, barra de progresso do download do APK e mensagens de erro.
2. Criada suíte de testes unitários `admin-app/src/presentation/components/UpdateModal.test.tsx` cobrindo apresentação, obrigatoriedade, progresso e botões.
3. Integrado o fluxo no `admin-app/src/presentation/App.tsx`:
   - Checagem de atualizações em segundo plano no `boot()` consultando `admin-app`.
   - Comparação semântica com o `versionCode` local.
   - Listener de eventos nativos `onApkDownloadProgress`.
   - Acionamento do download e instalador do Android via `downloadAndInstall`.
   - Inclusão do `<UpdateModal />` nas árvores de setup e principal.
4. Adicionados testes em `admin-app/src/presentation/App.test.tsx` validando detecção de atualização e descarte quando opcional.

## Arquivos Afetados
- `admin-app/src/presentation/components/UpdateModal.tsx`
- `admin-app/src/presentation/components/UpdateModal.test.tsx`
- `admin-app/src/presentation/App.tsx`
- `admin-app/src/presentation/App.test.tsx`

## Verificação
- `npm test` em `admin-app`: 22 suítes, 326 testes passando com sucesso.
