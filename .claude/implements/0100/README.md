# [0100] Corrigir `AndroidManifest.xml` inválido que impedia qualquer build do app

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** decorrente da [0005](../../specs/0005/README.md) (Task 25, implementação 0092), mas não
é uma task dela — bug encontrado ao tentar gerar o build pela primeira vez.

## Sintoma

`cd app/android && ./gradlew assembleDebug` falhava em `:app:processDebugMainManifest` com
`ManifestMerger2$MergeFailureException: Error parsing AndroidManifest.xml`, antes de chegar a
compilar qualquer código Kotlin/Java — nenhum build do app (debug ou release) era possível.

## Causa raiz

A implementação 0092 (Task 25) adicionou as permissões de localização a
`app/android/app/src/main/AndroidManifest.xml` com um comentário XML que continha `--` no meio do
texto ("PermissionsAndroid -- declaring it here..."). A especificação de XML proíbe a sequência
`--` dentro do conteúdo de um comentário (só é permitida no fechamento `-->`), então o parser do
Android Gradle Plugin rejeitava o arquivo inteiro: `SAXParseException: A string "--" não é
permitida nos comentários.`

## Correção

Trocado o `--` por `:` no comentário (`PermissionsAndroid: declaring it here...`), sem mudar o
conteúdo do comentário além do necessário para ser XML válido.

## Arquivos modificados

- `app/android/app/src/main/AndroidManifest.xml`

## Como validar

```bash
cd app/android
./gradlew assembleDebug
./gradlew assembleRelease
```

Requer `sdk.dir` apontando para um Android SDK válido em `app/android/local.properties` (não
versionado — cada máquina de desenvolvimento aponta para o seu próprio SDK) e `app/.env`
preenchido a partir de `app/.env.example`.

## Resultado da validação

- `./gradlew assembleDebug` → `BUILD SUCCESSFUL`, gerou
  `app/android/app/build/outputs/apk/debug/app-debug.apk` (197M, sem otimização/minify — normal
  para debug).
- `./gradlew assembleRelease` → `BUILD SUCCESSFUL`, gerou
  `app/android/app/build/outputs/apk/release/app-release.apk` (109M).
- Nenhum teste automatizado cobre `AndroidManifest.xml` (é justamente o tipo de arquivo que só um
  build real valida) — a verificação é o próprio build passando.
- Ainda **pendente**: instalar o APK num emulador/aparelho de verdade e confirmar visualmente o
  mapa, a permissão de localização e o fluxo completo (a verificação manual que a implementação
  0092/Task 25 já deixou registrada como pendente) — este conserto só prova que o projeto
  **compila e empacota**, não que a tela do mapa funciona em runtime.
