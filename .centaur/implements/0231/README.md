# [0231] Verificação visual, gates e documentação final — Bloqueado

**Data:** 2026-09-20
**Status:** Bloqueado
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 21

## Motivo do bloqueio

A validação automática disponível foi executada, mas faltam as evidências de ambiente que a Task 21 exige para fechar os gates Impeccable e iniciar a revisão independente/documentação final:

- O PostgreSQL de desenvolvimento não está acessível em `localhost:5432`. Mesmo após a retomada solicitada, `nc -zv 127.0.0.1 5432` retornou `Connection refused`, portanto os testes de repositório e integração que requerem PostGIS não conseguem migrar `territory_map_test`.
- `adb devices -l` não lista emulador nem aparelho. Embora o JDK 17 e o `adb` estejam instalados e o APK de release tenha sido gerado, não há telefone Android para instalar/capturar `phone-android.png`.
- O Electron iniciou com o renderer em `http://localhost:5173`, mas a automação disponível para esta task não expõe janelas nativas nem permite captura. Sem API/credenciais de teste, o preview também registra erro ao carregar `assignments:listAll`. Não foi criado screenshot substituto, pois isso falsificaria a evidência exigida para `.impeccable/review/desktop.png` e `hero-repro.png`.
- Por consequência, `impeccable build-phase advance` recusou o gate `hero` por ausência de `.impeccable/review/hero-repro.png`. Os gates `sections`, `motion`, `responsive` e `review`, o `comp-diff`, o finish reviewer, `.impeccable/design.json` e a atualização final de `AGENTS.md` não podem ser concluídos honestamente.

O catálogo de anti-patterns também encontrou seis usos existentes de `window.confirm` no Renderer. Eles exigem uma migração coordenada para o `Dialog` acessível existente e atualizações de teste; isso não foi ocultado como aprovação visual.

## Correções aplicadas durante a validação

- `admin/src/renderer/screens/HistoryScreen.tsx` — agendou a consulta inicial após a fase de commit do effect, removendo a violação de lint `react-hooks/set-state-in-effect`.
- `admin/src/renderer/index.css` — removeu os três indicadores laterais que o detector Impeccable classificou como `side-tab`; a seleção/resultado agora usam cor de borda e sombra interna sem o padrão sinalizado.
- `admin/src/renderer/screens/PublishersScreen.tsx` — adicionou `noValidate` ao formulário de renomear, conforme o catálogo de anti-patterns.
- `admin/src/main/api-client.ts` — passou a converter também o array legado de `GET /admin/assignments` em uma página local (`page: 1`, `pageSize: 50`) antes de acessar `items`. Isso mantém o Electron utilizável enquanto uma instalação ainda aponta para o servidor anterior; o deploy do servidor com o contrato paginado elimina a origem da incompatibilidade.
- `admin/src/renderer/screens/PublishersScreen.tsx` e `admin/src/renderer/index.css` — colocaram o registro longo em região de rolagem vertical interna, focalizável e rotulada, mantendo título, busca e ações de gestão no fluxo visível.
- `admin-app/src/data/api-client.ts` — passou a aceitar o contrato legado em array de `GET /admin/assignments`, normalizando-o para a primeira página local (`items`, `total`, `page: 1`, `pageSize: 50`). A resposta paginada nova continua preservada. Isso elimina a origem de `NaN` e das consultas vazias enquanto houver servidor ainda não atualizado.
- `admin-app/src/presentation/App.tsx` e `presentation/components/TabIcon.tsx` — configuraram `tabBarIcon` nas três tabs da Dynamic API do React Navigation 7. Os símbolos de territórios, publicadores e histórico são desenhados com `View` nativo, com rótulos acessíveis, sem Expo, fonte vinculada ou download no aparelho.
- `admin/src/main/api-client.ts` e `admin-app/src/data/api-client.ts` — o fallback do array legado agora reaplica no cliente os filtros de publicador, território e sobreposição de datas antes de paginar. Isso corrige o caso observado em que o servidor publicado ignorava `publisher_id` e devolvia o histórico inteiro nos dois admins.
- `admin/src/renderer/screens/PublishersScreen.tsx` e `index.css` — o histórico da pessoa selecionada virou um workspace mestre–detalhe contido, com cabeçalho contextual, total, tabela rolável, situação por texto/chip e sem a coluna redundante de publicador. Em largura reduzida, o detalhe empilha abaixo da lista.
- `admin-app/src/presentation/screens/PublisherHistoryScreen.tsx` — os registros agora são movimentos territoriais compactos, com identidade da pessoa no cabeçalho e cada cartão exibindo território, retirada, devolução e situação numa linha temporal legível.
- `DESIGN.md` — criado como memória durável do sistema visual adaptativo, espelhando os tokens canônicos atuais de Electron e React Native e registrando o histórico como “registro de movimentos territoriais”.

## Validação executada

- `admin/`: `npm test` — 29 arquivos e 564 testes passaram; `npm run lint`, `npm run typecheck` e `npm run build` passaram.
- Correções posteriores de compatibilidade/layout: `npx vitest run src/main/api-client.test.ts src/renderer/screens/PublishersScreen.test.tsx` — 115 testes passaram; `npm run lint` e `npm run typecheck` passaram. Os testes incluem a resposta legada em array e a região de rolagem acessível.
- `admin-app/`: `npm test -- --runInBand` passou com 19 suítes e 311 testes; `npm run lint` e `npm run typecheck` passaram. A suíte ainda emite avisos preexistentes de `act(...)` do ambiente de testes, sem falha.
- Android: `./gradlew assembleRelease --console=plain -q` passou com JDK 17 (`exit 0`). O instalável atualizado é `admin-app/android/app/build/outputs/apk/release/app-release.apk` (109.349.583 bytes, SHA-256 `6652285ed4f3cf78978dcb695595142ed171a20e51de058b0008b2d1331ed76e`). O Gradle relatou avisos de APIs/configurações obsoletas para Gradle 10, mas terminou com sucesso.
- `server/`: `uv run pytest tests/routers/test_admin_assignment_history_query.py` — 2 testes passaram; `uv run ruff check app tests` passou. Os testes de repositório/integração planejados falharam apenas porque a conexão PostgreSQL foi recusada.
- Frontend Design Premium: `python3 .../audit_project.py <raiz> --mode strict --no-write` passou sem findings. `npx -p @google/design.md designmd lint DESIGN.md` passou sem erros (somente avisos de tokens documentais sem consumidor declarado).
- Impeccable: detector executado uma vez somente contra `admin/src/renderer` e apontou três avisos `side-tab`, corrigidos acima. O gate Hero foi tentado e permaneceu aberto pela captura ausente; não houve detector em React Native.

## O que destrava

1. Iniciar e tornar saudável o serviço `db` de `docker-compose.dev.yml` até a porta `5432` aceitar conexões.
2. Instalar o APK de release acima em um telefone ou emulador e conectá-lo em `adb devices -l` (a lista ainda está vazia); validar manualmente as três tabs e as consultas de histórico.
3. Disponibilizar uma janela Electron capturável com dados de teste/autenticação, ou executar a Task 21 em um ambiente com automação de desktop.

Depois, retome `/centaur-driven-run 0015`: a Task 21 deve capturar os dois destinos, avançar os gates na ordem, rodar o reviewer e gerar a documentação final antes de marcar a spec como concluída.
