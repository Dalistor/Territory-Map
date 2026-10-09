# [0016] Atualização automática in-app dos apps Android via VPS

**Data:** 2026-10-09
**Status:** Concluída
**Solicitação original:** "Também gostaria que o app se atualizasse ao abrir, para isso teria que subir uma versao instalavel na VPS e o app teria que adquirir ela. Tem algum programa open source que resolve isso? (...) Segue a recomendação então"
**Escopo confirmado:** Ambos os apps Android (`app/` do publicador e `admin-app/` do administrador em campo).

## Objetivo

Permitir que tanto o **app do publicador** (`app/`) quanto o **app do admin** (`admin-app/`) verifiquem se há uma versão mais recente disponível na VPS ao serem abertos. Havendo nova versão:
1. O app informa o usuário de forma clara (versão, notas de atualização/changelog).
2. Permite baixar o arquivo `.apk` diretamente da VPS com indicador de progresso.
3. Aciona o instalador de pacotes nativo do Android via `FileProvider`, preservando login, dados e banco local (desde que assinados com o mesmo keystore e com `versionCode` crescente).

## Arquitetura e Decisões

1. **Sem novos serviços pesados na VPS**: O próprio servidor FastAPI existente expõe:
   - `GET /updates/latest?app={app|admin-app}`: retorna metadados da versão atualizada (`version_code`, `version_name`, `min_version_code`, `download_url`, `changelog`).
   - `GET /updates/download/{app}`: transmite o arquivo `.apk` oficial diretamente com `FileResponse`.
2. **Autenticação**: As rotas de atualização são públicas ou exigem apenas o `X-App-Key` (já presente nas requisições de ambos os apps), não exigindo token JWT de congregação, para que a verificação funcione mesmo antes do login ou ativação.
3. **Instalação Android sem dependências externas frágeis**:
   - Criação de um módulo nativo minimalista `ApkInstaller` (ou uso de `FileProvider` padrão) nos dois apps para disparar a `Intent.ACTION_VIEW` com o MIME type `application/vnd.android.package-archive` e `FLAG_GRANT_READ_URI_PERMISSION`.
   - Permissão `android.permission.REQUEST_INSTALL_PACKAGES` no `AndroidManifest.xml` de ambos os projetos para permitir a abertura do diálogo nativo do sistema.
4. **Regras de Atualização**:
   - **Opcional**: se `local_version_code < version_code` e `local_version_code >= min_version_code`, o usuário pode atualizar agora ou continuar usando.
   - **Obrigatória (Bloqueante)**: se `local_version_code < min_version_code`, o modal não oferece botão de fechar, exigindo a atualização para garantir compatibilidade com quebras de contrato da API.

---

## Tasks

### Task 01 — Endpoints de atualização no Servidor FastAPI
**Objetivo:** O servidor expõe rotas para consultar a versão mais recente e fazer download do APK de cada cliente.
**Camadas:** Routers, Schemas, Core
**Modo:** TDD
**Depende de:** —
**Arquivos:**
- `server/app/schemas/update.py`
- `server/app/routers/updates.py`
- `server/app/core/config.py`
- `server/app/main.py`
- `server/tests/routers/test_updates_routes.py`
**Instrução para o executor:**
> Spec 0016 — Task 01: Implemente por TDD em `server/` o suporte a releases de apps:
> 1. Adicione `RELEASES_DIR` nas configurações (`get_settings()`), apontando por padrão para `./releases` (ou `/app/releases` em container).
> 2. Crie `server/app/schemas/update.py` com o schema `AppReleaseOut` contendo `app` (`app` ou `admin-app`), `version_code` (int), `version_name` (str), `min_version_code` (int), `download_url` (str), `changelog` (str opcional) e `published_at` (datetime).
> 3. Crie `server/app/routers/updates.py` com:
>    - `GET /updates/latest?app={app}`: lê o `version.json` do app solicitado dentro de `RELEASES_DIR/{app}/version.json`. Se não houver release cadastrado, devolve 404 (`release_not_found`).
>    - `GET /updates/download/{app}`: lê o arquivo `.apk` especificado no manifesto e o entrega com `FileResponse` e cabeçalhos de download binário.
> 4. Registre o router em `server/app/main.py`. Assegure que as rotas aceitem requisições com o header `X-App-Key`.
> 5. Crie testes automatizados em `server/tests/routers/test_updates_routes.py` cobrindo sucesso, 404 quando não há versão, e parâmetros inválidos.

---

### Task 02 — Regras puras e cliente HTTP de atualização no App do Publicador (`app/`)
**Objetivo:** Implementar a lógica de comparação de versão e chamada de API no `app/`.
**Camadas:** Domain, Data
**Modo:** TDD
**Depende de:** Task 01
**Arquivos:**
- `app/src/domain/appUpdate.ts`
- `app/src/domain/appUpdate.test.ts`
- `app/src/data/update-client.ts`
- `app/src/data/update-client.test.ts`
**Instrução para o executor:**
> Spec 0016 — Task 02:
> 1. Crie `app/src/domain/appUpdate.ts` com funções puras para determinar:
>    - `isUpdateAvailable(currentCode: number, remoteCode: number): boolean`
>    - `isUpdateMandatory(currentCode: number, minRemoteCode: number): boolean`
> 2. Crie `app/src/data/update-client.ts` com funções para consultar `GET /updates/latest?app=app` e baixar o arquivo com callback de progresso para a pasta de cache do app.
> 3. Cubra ambas as camadas com testes unitários no Jest.

---

### Task 03 — Suporte nativo Android para instalação de APK no App do Publicador (`app/`)
**Objetivo:** Configurar `AndroidManifest.xml`, `FileProvider` e o módulo de disparo do instalador no `app/`.
**Camadas:** Android Native
**Modo:** direto
**Depende de:** Task 02
**Arquivos:**
- `app/android/app/src/main/AndroidManifest.xml`
- `app/android/app/src/main/res/xml/filepaths.xml`
- `app/android/app/src/main/java/com/territorymapapp/ApkInstallerModule.java` (ou Kotlin equivalente)
- `app/android/app/src/main/java/com/territorymapapp/ApkInstallerPackage.java`
- `app/android/app/src/main/java/com/territorymapapp/MainApplication.kt` (ou .java)
**Instrução para o executor:**
> Spec 0016 — Task 03:
> 1. Adicione a permissão `android.permission.REQUEST_INSTALL_PACKAGES` ao `AndroidManifest.xml`.
> 2. Configure o `FileProvider` apontando para `res/xml/filepaths.xml` com `<external-cache-path>` e `<cache-path>`.
> 3. Implemente um NativeModule `ApkInstaller` expondo o método `installApk(filePath: string)` que gera a URI via `FileProvider.getUriForFile` e dispara a `Intent.ACTION_VIEW` com flag `FLAG_ACTIVITY_NEW_TASK` e `FLAG_GRANT_READ_URI_PERMISSION`.

---

### Task 04 — Modal de atualização e verificação ao abrir no App do Publicador (`app/`)
**Objetivo:** Integrar a verificação de versão no ciclo de abertura do app e exibir o diálogo de atualização.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** Task 02, Task 03
**Arquivos:**
- `app/src/presentation/components/UpdateModal.tsx`
- `app/src/presentation/components/UpdateModal.test.tsx`
- `app/src/presentation/App.tsx`
- `app/src/presentation/App.test.tsx`
**Instrução para o executor:**
> Spec 0016 — Task 04:
> 1. Crie o componente `UpdateModal` com design claro e harmonioso: título, versão nova, changelog, barra de progresso durante o download e botão de ação ("Atualizar agora"). Se a versão for obrigatória, esconde o botão de fechar/cancelar.
> 2. No bootstrap de `App.tsx`, invoque a verificação de atualização de forma não-bloqueante ao carregar o app. Se houver atualização, exiba o modal.
> 3. Escreva testes no `@testing-library/react-native` cobrindo a exibição do modal, o clique em atualizar e o bloqueio quando for mandatório.

---

### Task 05 — Regras puras e cliente HTTP de atualização no App Admin (`admin-app/`)
**Objetivo:** Implementar a lógica de comparação de versão e chamada de API no `admin-app/`.
**Camadas:** Domain, Data
**Modo:** TDD
**Depende de:** Task 01
**Arquivos:**
- `admin-app/src/domain/appUpdate.ts`
- `admin-app/src/domain/appUpdate.test.ts`
- `admin-app/src/data/update-client.ts`
- `admin-app/src/data/update-client.test.ts`
**Instrução para o executor:**
> Spec 0016 — Task 05:
> 1. Crie `admin-app/src/domain/appUpdate.ts` com as regras de verificação de versão.
> 2. Crie `admin-app/src/data/update-client.ts` consultando `GET /updates/latest?app=admin-app` e gerenciando o download do APK.
> 3. Cubra com testes no Jest.

---

### Task 06 — Suporte nativo Android para instalação de APK no App Admin (`admin-app/`)
**Objetivo:** Configurar `AndroidManifest.xml`, `FileProvider` e o módulo instalador no `admin-app/`.
**Camadas:** Android Native
**Modo:** direto
**Depende de:** Task 05
**Arquivos:**
- `admin-app/android/app/src/main/AndroidManifest.xml`
- `admin-app/android/app/src/main/res/xml/filepaths.xml`
- `admin-app/android/app/src/main/java/com/territorymapadmin/ApkInstallerModule.java`
- `admin-app/android/app/src/main/java/com/territorymapadmin/ApkInstallerPackage.java`
- `admin-app/android/app/src/main/java/com/territorymapadmin/MainApplication.kt`
**Instrução para o executor:**
> Spec 0016 — Task 06:
> 1. Adicione a permissão `android.permission.REQUEST_INSTALL_PACKAGES` no manifesto do `admin-app`.
> 2. Configure o `FileProvider` em `res/xml/filepaths.xml`.
> 3. Adicione o `ApkInstallerModule` com chamada ao `FileProvider` e `Intent.ACTION_VIEW` no `admin-app`.

---

### Task 07 — Modal de atualização e verificação ao abrir no App Admin (`admin-app/`)
**Objetivo:** Integrar a verificação de versão no ciclo de inicialização do `admin-app/`.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** Task 05, Task 06
**Arquivos:**
- `admin-app/src/presentation/components/UpdateModal.tsx`
- `admin-app/src/presentation/components/UpdateModal.test.tsx`
- `admin-app/src/presentation/App.tsx`
- `admin-app/src/presentation/App.test.tsx`
**Instrução para o executor:**
> Spec 0016 — Task 07:
> 1. Crie `UpdateModal` no `admin-app/` seguindo a linguagem visual do app.
> 2. Em `admin-app/src/presentation/App.tsx`, execute a checagem no bootstrap e exiba o modal quando houver versão disponível.
> 3. Cubra com testes no Jest / Testing Library.

---

### Task 08 — Documentação e fluxo de deploy das releases na VPS
**Objetivo:** Documentar como compilar os APKs e publicá-los no servidor FastAPI na VPS.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Tasks 01 a 07
**Arquivos:**
- `AGENTS.md`
- `server/README.md`
- `app/README.md`
- `admin-app/README.md`
**Instrução para o executor:**
> Spec 0016 — Task 08:
> Atualize os READMEs e o `AGENTS.md` descrevendo:
> 1. A arquitetura de auto-update in-app via VPS.
> 2. Como gerar o APK assinado de cada app (`./gradlew assembleRelease`).
> 3. A estrutura do diretório `releases/` no servidor (`releases/app/` e `releases/admin-app/`) com o formato do `version.json`.
> 4. Exemplos de upload via SCP ou volume Docker para publicar novas versões na VPS.
