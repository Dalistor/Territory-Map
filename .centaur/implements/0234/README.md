# [0234] Suporte nativo Android para instalação de APK no app do publicador

**Data:** 2026-10-09
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0016/` — Task 03

## Solicitação

Configurar o suporte nativo no Android para download e instalação do APK via `FileProvider` no aplicativo do publicador (`app/`).

## Contexto

Para que o Android permita abrir a tela do instalador de pacotes preservando os dados da aplicação, são necessários:
1. Permissão `REQUEST_INSTALL_PACKAGES` no `AndroidManifest.xml`.
2. `FileProvider` configurado com diretórios de cache permitidos (`res/xml/filepaths.xml`).
3. Módulo nativo em Kotlin (`ApkInstallerModule`) para consultar a versão real instalada, baixar o arquivo com progresso e abrir o instalador via `Intent.ACTION_VIEW` com permissão de URI.

## O que foi feito

- `app/android/app/src/main/AndroidManifest.xml`: inclusão de `REQUEST_INSTALL_PACKAGES` e do `FileProvider` (`${applicationId}.fileprovider`).
- `app/android/app/src/main/res/xml/filepaths.xml`: mapeamento dos caminhos de cache interno e externo.
- `app/android/app/src/main/java/com/territorymapapp/ApkInstallerModule.kt`:
  - `getAppVersion()`: retorna `versionCode` e `versionName` do pacote do Android.
  - `downloadAndInstall()`: baixa o APK em thread de fundo, emite eventos `onApkDownloadProgress` com o percentual e dispara a Intent do instalador nativo.
- `app/android/app/src/main/java/com/territorymapapp/ApkInstallerPackage.kt`: pacote React Native para expor o módulo.
- `app/android/app/src/main/java/com/territorymapapp/MainApplication.kt`: registro de `ApkInstallerPackage` no host do React Native.

## Arquivos modificados

- `app/android/app/src/main/AndroidManifest.xml`
- `app/android/app/src/main/res/xml/filepaths.xml`
- `app/android/app/src/main/java/com/territorymapapp/ApkInstallerModule.kt`
- `app/android/app/src/main/java/com/territorymapapp/ApkInstallerPackage.kt`
- `app/android/app/src/main/java/com/territorymapapp/MainApplication.kt`
