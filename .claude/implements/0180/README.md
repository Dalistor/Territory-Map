# [0180] `admin-app/README.md`: como rodar, empacotar e o que o app admin não faz

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0012/` — Task 13

## Solicitação

> Spec 0012 — Task 13: Escreva `admin-app/README.md`, espelhando a estrutura de `app/README.md`
> (leia esse arquivo antes). Cubra: instalar (`npm install`), copiar `.env.example` para `.env` e
> preencher `API_BASE_URL` e `APP_KEY`, o fato de o `.env` ser lido em tempo de **build** pelo
> `react-native-config` (editar exige rodar de novo, não há hot reload dele), rodar
> (`npm run android`, exigindo emulador ou aparelho), testar (`npm test`) e empacotar
> (`cd android && ./gradlew assembleRelease`, com o `.apk` em
> `android/app/build/outputs/apk/release/`). Registre três coisas que quem chegar depois precisa
> saber: (1) **é preciso JDK 17**, e esta máquina de desenvolvimento não o tem hoje — Jest e `tsc`
> rodam sem ele, mas nenhum build Android roda; (2) o app **não é assinado**, então o Android vai
> avisar de "fonte desconhecida" na instalação, igual ao app do publicador; (3) este APK é do
> **admin**, `com.territorymapadmin`, e convive no mesmo aparelho com o do publicador
> (`com.territorymapapp`) — são apps diferentes, com credenciais diferentes. Diga também o que o
> app **não** faz, e que para isso o caminho é o admin do computador: desenhar território e quadra,
> cadastrar publicador, forçar status de quadra, apagar registro de trabalho e o import/export
> S-13. Toque apenas em `admin-app/README.md`; não modifique código nem outros projetos.

## Contexto

`admin-app/` foi criado na Task 01 desta spec e chegou à Task 13 com domínio, data e quatro telas
implementados, mas sem nenhum README. Quem clonasse o monorepo encontraria três projetos com
instruções (`server/`, `app/`, `admin/`) e um quarto sem — e o quarto é justamente o que tem dois
pré-requisitos não óbvios: o JDK 17 ausente nesta máquina, e o fato de ser um segundo APK que
convive com o do publicador em vez de substituí-lo.

## O que foi feito

Criado `admin-app/README.md`, espelhando as seções de `app/README.md` (Instalar / Configurar /
Estrutura / Rodar / Testes / Gerar o `.apk` / Limitações conhecidas) e acrescentando três seções
que só fazem sentido neste projeto:

- **Pré-requisito: JDK 17** — seção própria, antes de "Rodar", porque é o que bloqueia os dois
  comandos de Gradle. Diz explicitamente que Jest, ESLint e `tsc` rodam sem ele, para que a ausência
  do JDK não pareça impedir o desenvolvimento.
- **Dois apps no mesmo aparelho** — tabela comparando `com.territorymapapp` e `com.territorymapadmin`
  em como entra, o que o servidor deixa fazer e onde guarda a credencial.
- **O que este app não faz** — a lista de escopo que continua só no desktop: desenhar/editar/apagar
  demarcação de território e quadra, gerir publicadores (o app **lê** a lista, para escolher um
  dirigente ou o autor de uma marcação), forçar `status_override`, apagar registro de trabalho, a
  página Histórico e o import/export S-13 em XLSX/DOCX.

Também ficaram registrados: o `.env` lido em tempo de build (sem hot reload), a ausência de
assinatura de código e o aviso de "fonte desconhecida", a ausência deliberada de cache offline, e o
`AssignmentsMapView.tsx` como a exceção sem teste automatizado com o passo de verificação manual
ainda pendente por falta de JDK.

## Arquivos criados

- `admin-app/README.md` — instruções de instalação, configuração, execução, teste e empacotamento
  do app admin Android, mais o escopo do que ele não faz.

## Decisões técnicas

- **JDK 17 virou seção própria, não uma nota dentro de "Rodar".** Ele bloqueia dois comandos
  distintos (`npm run android` e `./gradlew assembleRelease`) e é a causa mais provável de uma falha
  de Gradle sem mensagem clara nesta máquina; repetir o aviso em dois lugares seria pior que
  centralizá-lo num terceiro, referenciado pelos dois.
- **"Dois apps no mesmo aparelho" em tabela.** A confusão real que essa seção evita não é o
  `applicationId` em si, é achar que instalar um substitui o outro, ou que a credencial é a mesma. A
  tabela põe as três diferenças (como entra, o que pode, onde guarda) lado a lado, que é o formato
  em que a diferença fica óbvia.
- **A lista do "não faz" cita o motivo quando ele não é óbvio** — apagar quadra leva o histórico de
  trabalho junto; o app lê publicadores mas não os gerencia. Uma lista só de proibições faria o
  leitor achar que é limitação de implementação, e não escopo decidido.
- **Registrada a pendência das Tasks 08 e 10 nas limitações**, com a instrução de apagar o item
  quando elas fecharem. O `App.tsx` de hoje é um placeholder, então prometer no README um app que
  abre nas Designações seria documentação mentindo para quem rodasse agora; um item datado e
  autodestrutível é menos ruim que um README correto só no futuro.
- **Nada de `npm run android` ou Gradle foi executado**, pela própria razão que o README documenta:
  não há JDK nesta máquina, e a spec já registra isso como pré-requisito do operador, não falha de
  task.

## Como validar

Ler `admin-app/README.md` e conferir contra o projeto:

```bash
cat admin-app/package.json          # os scripts android/start/lint/test/typecheck citados
cat admin-app/.env.example          # API_BASE_URL e APP_KEY
grep -nE 'applicationId|namespace' admin-app/android/app/build.gradle   # com.territorymapadmin
grep -n applicationId app/android/app/build.gradle                      # com.territorymapapp
cd admin-app && npm test && npm run lint && npm run typecheck
```

## Resultado da validação

- Todos os fatos afirmados no README foram conferidos nos arquivos antes de escrever: os cinco
  scripts existem em `admin-app/package.json`; `.env.example` traz exatamente `API_BASE_URL` e
  `APP_KEY`; `admin-app/android/app/build.gradle` declara `namespace`/`applicationId`
  `com.territorymapadmin` e `app.json` o displayName "Territory Map Admin"; o `.env` é coberto pelo
  `.gitignore` da raiz (`.env`, `.env.*`, com exceção de `!.env.example`); a árvore de
  `admin-app/src/` bate com as três camadas e com os arquivos citados
  (`api-client.ts`, `credentials-store.ts`, `session.ts`, `territoryMap.ts`,
  `map/AssignmentsMapView.tsx`).
- `java -version` falha nesta máquina ("Unable to locate a Java Runtime"), confirmando o aviso do
  JDK que o README registra.
- Mudança é só de documentação: nenhum arquivo de código foi tocado, e nenhum teste, lint ou
  typecheck depende do arquivo criado.
