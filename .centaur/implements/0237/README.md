# [0237] Suporte nativo Android para instalação de APK no app admin

**Data:** 2026-10-09
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0016/` — Task 06

## Solicitação

Configurar o suporte nativo no Android para download e instalação de APK via `FileProvider` no aplicativo do administrador (`admin-app/`).

## Contexto

Assim como no app do publicador, o app admin precisa de permissões de instalação de pacotes e de um FileProvider para instalar atualizações recebidas da VPS preservando credenciais no keystore.

## O que foi feito

- `admin-app/android/app/src/main/AndroidManifest.xml`: inclusão de `REQUEST_INSTALL_PACKAGES` e do `FileProvider` (`${applicationId}.fileprovider`).
- `admin-app/android/app/src/main/res/xml/filepaths.xml`: mapeamento dos diretórios de cache.
- `admin-app/android/app/src/main/java/com/territorymapadmin/ApkInstallerModule.kt`: módulo nativo para consultar versão, baixar APK com progresso e abrir instalador nativo.
- `admin-app/android/app/src/main/java/com/territorymapadmin/ApkInstallerPackage.kt`: pacote de exposição para o React Native.
- `admin-app/android/app/src/main/java/com/territorymapadmin/MainApplication.kt`: registro no host da aplicação.

## Arquivos modificados

- `admin-app/android/app/src/main/AndroidManifest.xml`
- `admin-app/android/app/src/main/res/xml/filepaths.xml`
- `admin-app/android/app/src/main/java/com/territorymapadmin/ApkInstallerModule.kt`
- `admin-app/android/app/src/main/java/com/territorymapadmin/ApkInstallerPackage.kt`
- `admin-app/android/app/src/main/java/com/territorymapadmin/MainApplication.kt`
