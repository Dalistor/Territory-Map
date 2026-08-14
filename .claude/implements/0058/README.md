# [0058] Atualizar CLAUDE.md para a nova stack do admin (Electron)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0003/` — Task 20

## Solicitação

Editar `CLAUDE.md` para refletir a migração do admin de Flutter desktop para Electron + React +
TypeScript + Leaflet/Leaflet-Geoman, sem reescrever o documento inteiro: atualizar a tabela "Stack
Técnica", o diagrama de pastas, a "Arquitetura de Camadas" do admin, a tabela de "Testes", "Como
Rodar", "Como Fazer Deploy" e remover menções soltas a bibliotecas/mecanismos abandonados
(`flutter_map_line_editor`, `flutter_map_dragmarker`, DPAPI/libsecret citados via
`flutter_secure_storage`, o runner `macos-latest` planejado para CI), registrando a decisão e a data
da troca. Não tocar em servidor, `packages/core`, modelo de dados, regras de negócio ou app Android.

## Contexto

Última task (20 de 20) da spec 0003, que migrou o admin inteiro de Flutter para Electron ao longo
das Tasks 01–19 (já documentadas em `.claude/implements/0039` a `.claude/implements/0057`). O
`CLAUDE.md` ainda descrevia o admin em Flutter desktop (`flutter_secure_storage`,
`flutter_map_line_editor`/`flutter_map_dragmarker`, build por tag no GitHub Actions com matriz
Windows/Linux) — documentação e código estavam fora de sincronia desde a Task 01. Antes de editar,
foi lido `.claude/specs/0003/README.md` inteiro (Objetivo, Contexto técnico e as 20 tasks) e
inspecionado o código real do admin (`admin/src/main/index.ts`, `admin/src/main/credentials-store.ts`,
`admin/README.md`, `admin/package.json`) para descrever com precisão o que existe — arquitetura de
processo (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), scripts de build
reais (`build:mac`/`build:win`/`build:linux`), e a estrutura efetiva de `admin/src/`.

## O que foi feito

Editado `CLAUDE.md` cirurgicamente, mantendo o restante do documento intocado:

1. **Stack Técnica** — linha do Admin trocada para Electron + React + TypeScript + Leaflet +
   Leaflet-Geoman + `safeStorage`; linha "Mapas" ajustada para citar `react-leaflet`/Leaflet no
   admin; a linha "Edição de polígono" (específica do Flutter) foi removida e seu conteúdo dobrado
   na linha do Admin; linha de CI/CD ajustada para "sem CI, build local". Adicionada uma nota (`>`)
   logo após a tabela registrando a decisão e a data, e a arquitetura de processo (main fala com a
   API; renderer só por IPC via `contextBridge`).
2. **Estrutura do Projeto** — árvore de `admin/lib/{data,presentation}/` trocada pela nova
   `admin/src/{main,preload,renderer,shared}/`, com comentário do que cada pasta guarda; parágrafo
   de fechamento (dependência de `packages/core` via `path:`) reescrito para deixar claro que só o
   `app/` depende do pacote Dart agora.
3. **Arquitetura de Camadas → Admin** — seção renomeada para "Admin (Electron)", tabela de camadas
   reescrita para Main/Preload/Renderer/Shared (pasta, responsabilidade, proibido cada uma), e o
   parágrafo "Por que não existe `domain/` aqui" adaptado: o Main assume o papel do antigo `data/`
   (fala com a API, só repassa pelo IPC), o Renderer é Presentation pura (só conhece `window.api`),
   mantendo o estilo de justificar a decisão em vez de só descrevê-la.
4. **Testes** — tabela expandida para separar App (Flutter) de Admin (Electron), com Vitest + React
   Testing Library, comandos reais (`npm test`, `npx vitest run <arquivo>`, `npx vitest run
   --coverage`) e a convenção `admin/src/**/*.test.ts(x)` co-localizada; adicionada uma frase
   explicando por que essa convenção foge do `test/` espelhado do resto do projeto (padrão do
   ecossistema Vitest/Vite).
5. **Como Rodar** — bloco do admin trocado para `npm install && npm run dev`, removida a menção ao
   Chrome como ambiente de desenvolvimento (não se aplica mais), adicionada a instrução de copiar
   `.env.example` para `.env`.
6. **Como Fazer Deploy → Admin** — matriz de CI por tag/GitHub Release substituída pela descrição do
   build local via `electron-builder` (`build:mac`/`build:win`/`build:linux`, documentado em
   `admin/README.md`), mantendo a menção ao SmartScreen/Gatekeeper (continua se aplicando a binários
   não assinados em Electron) e adicionando a ressalva sobre cross-compile de Windows/Linux a partir
   do macOS (Wine para o NSIS).
7. **Limpeza de menções soltas** — removidas ou reescritas as referências a `flutter_secure_storage`
   (trocado por `safeStorage`), DPAPI/libsecret (generalizado para "keychain do sistema operacional"),
   e a entrada "macOS ficou de fora... runner `macos-latest`" em "Como Fazer Deploy" (o admin agora
   roda em macOS de verdade, então a ressalva toda desapareceu junto com a seção de CI que a
   continha). A referência a `flutter_map_line_editor`/`flutter_map_dragmarker` em "Arquitetura e
   Decisões Técnicas" foi mantida deliberadamente, como comparação histórica explicando por que o
   Leaflet-Geoman também está confinado a um único arquivo — não é uma menção solta, é a
   justificativa da decisão de isolamento se repetindo.

Além dos sete pontos pedidos, a releitura de consistência interna (exigida na instrução da task)
encontrou e corrigiu mais contradições que sobrariam se só os sete pontos fossem tocados:
- Tabela "Visão Geral" ainda dizia "Admin (Flutter desktop)" e "Roda em Windows e Linux" — corrigido
  para Electron/macOS incluído (o admin agora compila e roda em macOS também).
- Parágrafo "Uso pessoal" citava `flutter_secure_storage` para o admin.
- Parágrafo `### Pacote compartilhado (packages/core)` dizia "nem `app/` nem `admin/` podem importar
  código um do outro" implicando que ambos ainda dependiam do pacote Dart — reescrito.
- "Regras e Convenções": bullet de naming sem TypeScript, bullet de `LatLng`/coordenadas citando só
  `packages/core`, bullet de "lógica compartilhada vive em `core`" implicando o admin também, bullet
  de lint citando `flutter_lints` para os dois clientes — todos corrigidos para distinguir Dart
  (`app/`+`packages/core`) de TypeScript (`admin/`).
- "Restrições e Cuidados": bullet de ordem de coordenadas e bullet de armazenamento de credenciais
  do admin, ambos ainda só citando o lado Dart/`flutter_secure_storage`.
- "Pontos em Aberto → Resolvidos": citava `PolygonEditorController`/`PolyEditor` (Dart) — atualizado
  para `usePolygonEditor.ts`.
- "Como mockar → HTTP no app/admin": dizia que "o cliente vive em `core`" e "o mesmo fake serve aos
  dois projetos" — falso desde que o admin tem seu próprio `main/api-client.ts` em TypeScript.
- Comentário na árvore de pastas ("pacote Dart compartilhado app ↔ admin") também desatualizado.

## Arquivos modificados

- `CLAUDE.md` — todas as mudanças descritas acima.

## Arquivos criados

Nenhum.

## Decisões técnicas

- **Manter a menção histórica a `flutter_map_line_editor`/`flutter_map_dragmarker`** em vez de
  apagá-la por completo: a instrução pedia para remover "menções soltas", mas esta em particular é
  usada para justificar por que o Leaflet-Geoman também está confinado a um único arquivo — apagá-la
  perderia o raciocínio, não só uma referência obsoleta. Julgamento aplicado: uma menção histórica
  que sustenta uma decisão atual não é "solta".
- **Ir além dos sete pontos listados na task** para corrigir contradições que a instrução da própria
  task pedia para verificar ("releia o CLAUDE.md inteiro para garantir consistência interna... e que
  nenhuma menção a Flutter/Dart sobrou na parte do admin fora do que é intencional"). Os pontos (1)–
  (7) cobriam as seções principais, mas várias frases isoladas em "Regras e Convenções" e
  "Restrições e Cuidados" ainda presumiam que o admin fosse Dart; deixá-las como estavam violaria a
  própria instrução de consistência.
- **Distinguir explicitamente Dart (`app/` + `packages/core`) de TypeScript (`admin/`)** em vez de
  generalizar regras que hoje só valem para um lado (naming, lint, `LatLng`, HTTP mockado) — a
  alternativa de simplesmente apagar a menção ao Dart deixaria essas regras sem dono para o `app/`,
  que continua existindo.

## Como validar

Leitura do `CLAUDE.md` (761 linhas) do início ao fim; `grep` por termos residuais
(`flutter_map_line_editor`, `flutter_map_dragmarker`, `DPAPI`, `libsecret`, `macos-latest`,
`PolyEditor`, `admin/lib`, `admin/test/`, `flutter run -d chrome`, `Flutter desktop`) confirmando que
só a menção histórica intencional sobrou; contagem de colunas das tabelas editadas (Stack Técnica,
Testes, Arquitetura de Camadas do Admin) para garantir que nenhuma ficou com número de células
inconsistente com o cabeçalho.

## Resultado da validação

- `git diff --stat CLAUDE.md`: 164 inserções, 127 remoções, um arquivo.
- Grep de termos residuais: única ocorrência restante de `flutter_map_line_editor`/
  `flutter_map_dragmarker` é a comparação histórica intencional em "Arquitetura e Decisões
  Técnicas" (linha ~368); nenhuma ocorrência de `DPAPI`, `libsecret`, `macos-latest`, `PolyEditor`,
  `admin/lib`, `admin/test/`, `flutter run -d chrome`, `flutter pub get && flutter run -d`, ou
  "Flutter desktop".
- Contagem de colunas: tabela "Stack Técnica" (10 linhas, todas com 4 campos ao dividir por `|`),
  tabela "Testes" (8 linhas, todas com 7 campos), tabela "Admin (Electron)" em "Arquitetura de
  Camadas" (6 linhas, todas com 6 campos) — nenhuma tabela ficou desalinhada.
- Não há mecanismo de teste/lint automatizado para `CLAUDE.md` no projeto; a validação foi
  inteiramente por leitura e checagem manual/grep, como já registrado acima.
