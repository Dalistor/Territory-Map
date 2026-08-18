# [0098] Documentação: atualizar o `CLAUDE.md` com o app React Native e a designação de território

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0005/` — Task 27

## Solicitação
Atualizar `CLAUDE.md` para refletir o que a spec 0005 implementou de fato (não o que foi planejado):
troca do app de Flutter para React Native, remoção de `packages/core`, `Territory.assigned_user_id`
no modelo de dados, a regra de negócio de designação de território, a camada de arquitetura do app
em React Native, os comandos reais de rodar/build do app, a linha de testes do app na tabela, e
confirmação de que a regra "localização é dado sensível" segue valendo.

## Contexto
Todas as 26 tasks anteriores da spec 0005 estavam concluídas (servidor com `assigned_user_id`,
`TerritoryNotAssignedError`, a restrição em `mark_worked`, as rotas de designação e de territórios
trabalhados; o app React Native completo em `app/`; o admin com a tela de designação). O `CLAUDE.md`
ainda descrevia o app como um alvo Flutter "ainda não existente" e listava `packages/core` (Dart)
como pacote vivo — ambos desatualizados desde as Tasks 12 e 16-26.

## O que foi feito
Conferido o código resultante antes de escrever (modelo `Territory`, exceção
`TerritoryNotAssignedError`, `WorkLogService.mark_worked`, `DOMAIN_ERROR_STATUS` em `main.py`,
`admin/src/shared/models.ts`, a árvore real de `app/src/`, `app/README.md`, `app/package.json`,
confirmado que `packages/core/` não existe mais no disco). Depois, atualizado `CLAUDE.md`:

- **Visão Geral**: linha do App Android passa a citar React Native e a marcação restrita ao
  território designado.
- **Stack Técnica**: linha do app trocada para React Native (CLI puro) + TypeScript +
  `@maplibre/maplibre-react-native` + React Navigation; linha de `packages/core` removida da
  tabela; nova nota de decisão (mesmo estilo da nota já existente sobre Electron) explicando a
  troca de Flutter para React Native — escolha do usuário, não limitação técnica — e a remoção de
  `packages/core` em consequência.
- **Estrutura do Projeto**: parágrafo introdutório atualizado (app implementado, não mais "ainda
  não existe"); árvore do monorepo com a estrutura real de `app/` (`domain/`, `data/`,
  `presentation/`) e sem o diretório `packages/`; parágrafo sobre dependência de pacote reescrito
  (nenhum dos dois clientes depende de `packages/core`, que não existe mais).
- **Modelo de Dados**: linha `assigned_user_id` na tabela de `Territory`, com nota sobre a
  cardinalidade (um território, no máximo um publicador por vez; um publicador, vários territórios).
- **Regras de Negócio**: nova seção "Designação de território" (mesmo estilo em bullets das seções
  vizinhas), entre "Marcar quadra como trabalhada" e "Demarcação de território".
- **Arquitetura e Decisões Técnicas**: nova bullet sobre a escolha de MapLibre Native em vez de
  `react-native-maps`; nova bullet sobre a troca do app para React Native (mesmo estilo da bullet já
  existente sobre o Electron); a bullet do Electron perdeu a menção a `packages/core` (que já não
  existe, então a frase antiga não fazia mais sentido).
- **Arquitetura de Camadas**: seção "App (Flutter)" renomeada para "App (React Native)" com os
  caminhos reais (`app/src/presentation/`, `domain/`, `data/`) e uma nota sobre não usar gerenciador
  de estado externo; seção "Pacote compartilhado (`packages/core`)" removida inteira.
- **Testes**: tabela reduzida de 4 para 3 colunas (Servidor, App, Admin — sem `packages/core`), com
  a linha do app em Jest + Testing Library, comandos reais, local dos arquivos e a mesma meta de
  rigor do admin (uma tela, um teste; `domain/`/`data/` cobertos por fake; a view nativa do MapLibre
  como risco assumido sem teste, mesmo caso do Leaflet-Geoman); parágrafo "por que foge do `test/`
  espelhado" passou a cobrir também o app; bullet de mock de HTTP e novo bullet de mock de
  armazenamento (`react-native-keychain`/`AsyncStorage`) para o app.
- **Como Rodar**: comandos do app trocados de `flutter pub get && flutter run` para
  `npm install && cp .env.example .env && npm run android`, com a explicação de que `.env` é lido em
  tempo de build (sem hot reload); bloco "Pacote compartilhado" removido.
- **Como Fazer Deploy**: linha final do app trocada de "build de APK/AAB também por tag" (que nunca
  existiu) para o processo real: sem CI, build local com `./gradlew assembleRelease`, sem assinatura
  de código, `.env` lido em tempo de build.
- **Restrições e Cuidados / Regras e Convenções**: naming, tipo `LatLng` e ordem de coordenadas
  atualizados para as duas linguagens reais (Python, TypeScript) em vez de citar Dart/Flutter; regra
  "localização é dado sensível" conferida contra o app real (posição nunca sai do dispositivo,
  README do app confirma) e mantida sem duplicar.
- **Pontos em Aberto**: item "atribuição de território" movido para "Resolvidos" (a spec 0005
  implementou o fluxo ponta a ponta); item de sincronização offline detalhado com o que existe hoje
  (pull completo, delta por timestamp ainda não avaliado).

Também corrigidas, fora da lista explícita da task mas necessárias para não deixar o documento
contraditório: menção a `flutter_secure_storage` (trocada por `react-native-keychain`) na seção
"Cadastro de publicador", e a frase sobre `packages/core` na seção "Chave de aplicação" (trocada
para descrever os dois clientes HTTP reais injetando o header).

## Arquivos modificados
- `CLAUDE.md` — todas as seções listadas acima.

## Decisões técnicas
Nenhuma decisão de produto nova: esta task é só documentação. Onde a spec listou uma seção
explicitamente ("Stack Técnica", "Estrutura do Projeto", etc.), segui a instrução ao pé da letra.
Onde havia referências remanescentes a Flutter/Dart/`packages/core` fora das seções listadas (regras
de negócio de cadastro de publicador, chave de aplicação, naming/convenções) e que ficariam
contraditórias com o resto do documento atualizado, corrigi também — o objetivo do `CLAUDE.md` é
descrever o sistema real, e deixar uma referência stale ao lado de uma corrigida teria sido pior do
que corrigir as duas.

Não toquei na pendência de 4 falhas/6 erros na suíte de testes do servidor (testes pré-existentes
que marcam quadra sem designar território antes) — está fora do escopo desta task e foi só contexto
para não me confundir ao conferir o estado do código.

## Como validar
Ler `CLAUDE.md` do início ao fim e conferir que nenhuma seção descreve o app como Flutter ou como
"ainda não existe", que não sobra nenhuma menção viva a `packages/core` (as que restam são
históricas, no passado, explicando a remoção), e que os comandos de `app/` batem com
`app/package.json` e `app/README.md`.

## Resultado da validação
Revisão manual linha a linha do `CLAUDE.md` inteiro após as edições. `grep -n "Flutter\|Dart\b"` e
`grep -n "packages/core"` no arquivo confirmam que toda ocorrência restante é histórica (tempo
verbal passado, explicando uma decisão revertida), não uma descrição do estado atual. Não há
mecanismo de lint/teste automatizado para `CLAUDE.md` no projeto.
