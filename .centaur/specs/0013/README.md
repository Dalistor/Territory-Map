# [0013] App admin: logo, quadras no mapa e painel combinado

**Data:** 2026-08-23
**Status:** Concluída
**Solicitação original:** "Neste app de admin, precisa ter a mesma logo das dos outros. Precisa
aparecer o número das quadras e mostrar o status dela, e precisa ter a funcao de que ao clicar na
quadra apareça as opcaoes para designar e pagar designacao. outros detalhes de UX precisam melhorar
(como os baloes aparecendo fora do espacamento do mapa)"

Esclarecido depois: ao tocar na quadra abre **um painel só**, com as ações da quadra (marcar como
trabalhada, apagar registro de trabalho) **e** as do território que a contém (designar, marcar como
concluído, apagar registro da designação). As quadras aparecem com **número + cor por status**, sem
o status por extenso no mapa.

## Objetivo

O app admin no celular passa a mostrar, no mapa, a mesma informação que o admin do computador e o
app do publicador já mostram — as quadras, numeradas e coloridas pelo status —, e o toque numa
quadra vira o ponto único de ação: dali o admin marca trabalho, apaga um registro errado, designa o
território e conclui a designação, sem navegar para outro lugar. E o app deixa de parecer um app
diferente dos outros dois: ganha a logo do produto, no ícone e na tela de configuração inicial.

## Contexto técnico

### O que já existe e serve de molde

**O app do publicador já faz quase tudo que esta spec pede**, e é a referência direta:
[app/src/presentation/map/TerritoryMapView.tsx](app/src/presentation/map/TerritoryMapView.tsx).
De lá vêm três soluções já validadas:

1. **As cores por status**, em `CATEGORY_COLOR` (linha 69): `never` → `#c62828` (vermelho),
   `overdue` → `#ef6c00` (laranja), `recent` → `#2e7d32` (verde). Derivadas de
   `blockColorCategory`, passando o `rotationDays` **do território dono da quadra**.
2. **Os números como `Marker` com `<Text>` do React Native**, não como `symbol` layer — o
   comentário na linha 294 explica por quê, e a razão vale igual aqui: o estilo é raster puro, sem
   `glyphs`, e um servidor de fontes é exatamente o que escolher OSM + MapLibre evita.
3. **A correção do problema que o usuário relatou.** Na linha 250, `territoryLabelMarkers` é
   `(showBlocks ? [] : drawableTerritories)` — quando as quadras estão à vista, os balões de
   território **somem**, porque senão sentariam em cima dos números. É a regra que o `admin-app`
   não tem.

No `admin-app/`, o que já existe:

- [domain/territoryMap.ts](admin-app/src/domain/territoryMap.ts) — as funções puras do mapa
  (`territoryMapFeatures`, `averageCentroid`, `territoriesBounds`, cores azul/cinza do território).
  É onde as quadras entram, pelo mesmo princípio: o componente MapLibre não tem teste, então todo
  cálculo mora fora dele.
- [domain/blockColor.ts](admin-app/src/domain/blockColor.ts) — `blockColorCategory`, já pronto, com
  `statusOverride` antes do cálculo por data.
- [presentation/map/AssignmentsMapView.tsx](admin-app/src/presentation/map/AssignmentsMapView.tsx)
  — hoje desenha **só as demarcações** e um `Marker` de rótulo por território, ancorado no
  centroide, sem nenhuma contenção.
- [presentation/screens/DesignationsScreen.tsx](admin-app/src/presentation/screens/DesignationsScreen.tsx)
  — já tem um **overlay** que, ao selecionar um território, monta `AssignmentPanel` e `BlocksScreen`
  juntos (linhas 212-231). O painel combinado desta spec é a evolução disso, agora alcançável
  tocando numa quadra e já focado nela.
- [presentation/theme.ts](admin-app/src/presentation/theme.ts) — a paleta, com o comentário
  dizendo de propósito que as cores de status da quadra **não** vivem nela, porque são do domínio.

### Duas decisões da spec 0012 que esta spec reverte, de propósito

1. **"O mapa não desenha quadras"** (decisão 5 da spec 0012). Era o espelho da página Designações
   do desktop. No celular o mapa é o contexto inteiro que o admin tem, e sem as quadras ele não sabe
   o que está olhando. Passa a desenhar.
2. **"Apagar registro de trabalho continua só no desktop"** (decisão 4 da spec 0012). Passa a
   existir no celular, porque é a correção que acompanha naturalmente o marcar — quem lança trabalho
   errado em campo precisa desfazer em campo. A rota já existe no servidor
   (`DELETE /admin/work-logs/{logId}`); o que falta é o método no cliente do `admin-app`.

As duas estão escritas hoje no `AGENTS.md` e no `admin-app/README.md`, e a Task 08 as corrige.
Continuam **fora** de escopo, e só no desktop: desenhar ou editar demarcação, gerir publicadores,
forçar `status_override`, a página Histórico e o import/export S-13.

### Escopo das correções de UX — leia antes de executar a Task 07

O usuário relatou **um** problema concreto ("os balões aparecendo fora do espaçamento do mapa") e
disse que "outros detalhes de UX precisam melhorar", sem listar quais. **Nenhuma tela deste app foi
vista rodando por quem escreveu esta spec.** Portanto:

- O problema dos balões é resolvido pela Task 04, com a regra do publicador.
- A Task 07 trata apenas o que se **prova lendo o código**: `BlocksScreen.tsx` ficou com cores
  literais enquanto as outras telas usam `theme.ts`, e o overlay dos painéis precisa respeitar a
  área segura do aparelho.
- **Não invente outras correções de UX.** O que só se percebe rodando fica para uma spec futura,
  depois que o usuário listar o que viu. Uma task que "melhora o visual" sem critério observável não
  é executável e não deve ser criada.

## Tasks

### Task 01 — A logo do produto no app admin

**Objetivo:** O app admin deixa de usar o ícone genérico do React Native e passa a mostrar a mesma
logo dos outros dois clientes.
**Camadas:** Presentation, configuração Android
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0013 — Task 01: Traga a logo do produto para o `admin-app/`, em duas frentes.
>
> **(a) Ícone do app.** O `admin-app/` ficou com os ícones default do template do React Native; o
> `app/` do publicador tem os ícones do produto nas cinco densidades. Copie
> `app/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` e
> `ic_launcher_round.png` para os diretórios de mesmo nome em
> `admin-app/android/app/src/main/res/`, sobrescrevendo os existentes. São 10 arquivos; confira com
> `sips -g pixelWidth` que chegaram com 48/72/96/144/192 px, como no `app/`. Não gere imagem nova e
> não redimensione nada — os arquivos corretos já existem, é cópia.
>
> **(b) Logo dentro do app.** Copie `app/src/presentation/assets/logo.png` (640×749) para
> `admin-app/src/presentation/assets/logo.png` e crie `admin-app/src/presentation/assets/images.d.ts`
> igual ao de `app/src/presentation/assets/images.d.ts` (sem ele o TypeScript recusa o `import` de
> um `.png`). Depois exiba a logo na `SetupScreen`, acima do título, exatamente como
> `app/src/presentation/screens/ActivationScreen.tsx` faz (leia as linhas do `import logo`, do
> `<Image source={logo}>` e do estilo `logo`) — use `resizeMode="contain"` e mantenha a proporção,
> já que a imagem não é quadrada.
>
> Critério de sucesso: `npx tsc --noEmit`, `npm run lint` e `npm test` passam em `admin-app/`. Os
> testes existentes da `SetupScreen` (`SetupScreen.test.tsx`) devem continuar passando sem
> alteração — se algum quebrar por causa da `<Image>`, o conserto é no teste, mas **não** relaxe
> nenhuma asserção de comportamento existente. Não rode Gradle. Toque apenas em
> `admin-app/src/presentation/` e em `admin-app/android/app/src/main/res/`; não modifique `app/`,
> `admin/` nem `server/`.

---

### Task 02 — Domain: as quadras e a visibilidade dos rótulos no mapa

**Objetivo:** Tudo que o mapa precisa **decidir** sobre as quadras, calculado fora do componente
MapLibre, que não tem teste.
**Camadas:** Domain
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0013 — Task 02: Implemente por TDD, em `admin-app/src/domain/territoryMap.ts` (e no teste
> co-localizado `territoryMap.test.ts`, que já existe — acrescente, não reescreva), o que o mapa
> precisa para desenhar as quadras. Leia antes `app/src/presentation/map/TerritoryMapView.tsx`, de
> onde vêm as decisões já validadas, e `admin-app/src/domain/blockColor.ts`, que você vai consumir.
>
> Exporte `BLOCK_CATEGORY_COLOR: Record<BlockColorCategory, string>` com **exatamente** os mesmos
> valores que o app do publicador usa (`never` → `'#c62828'`, `overdue` → `'#ef6c00'`, `recent` →
> `'#2e7d32'`), a interface `BlockMapFeature` (`{block, territory, ring: number[][], center: LatLng,
> color: string, label: string}`) e duas funções:
>
> **`blockMapFeatures(territories, now)`** — achata as quadras de todos os territórios em features
> desenháveis. `color` vem de `blockColorCategory(block, now, territory.rotationDays)` mapeado por
> `BLOCK_CATEGORY_COLOR` — a rotação é **a do território dono da quadra**, nunca um número fixo.
> `label` é o número da quadra como string. `ring` usa `toGeoJsonRing`, e `center` usa
> `averageCentroid`, as duas já existentes neste arquivo.
>
> **`shouldShowTerritoryLabels(features)`** — recebe as features de quadra e devolve `false` quando
> houver pelo menos uma. É a regra que conserta o problema relatado pelo usuário: com quadras à
> vista, os balões de território somem em vez de sentar em cima dos números, exatamente como o
> publicador faz em `territoryLabelMarkers` (linha 250 do arquivo dele).
>
> Critérios de aceite como comportamentos observáveis:
> - Dois territórios com duas quadras cada produzem quatro features, e cada uma carrega o
>   território a que pertence.
> - Uma quadra nunca trabalhada e sem override sai vermelha (`#c62828`); uma trabalhada há 200 dias
>   num território de rotação 120 sai laranja (`#ef6c00`); uma trabalhada ontem sai verde
>   (`#2e7d32`).
> - **A rotação usada é a do território dono:** a mesma quadra, trabalhada há 150 dias, sai verde
>   num território com `rotationDays: 365` e laranja num com `rotationDays: 120`.
> - Uma quadra com `statusOverride: 'never'`, trabalhada ontem, sai vermelha — o override vence a
>   data, como já garante `blockColorCategory`.
> - `label` é o número como string: a quadra 7 vira `'7'`.
> - Quadra com menos de 3 vértices no polígono é descartada, mesmo critério que
>   `territoryMapFeatures` já aplica à demarcação — e as outras quadras do mesmo território
>   continuam saindo.
> - Território sem quadra nenhuma não contribui com feature, e `blockMapFeatures([])` devolve `[]`.
> - `shouldShowTerritoryLabels([])` devolve `true`; com uma feature ou mais, `false`.
>
> Este arquivo é código puro: nada de `react-native`, HTTP ou armazenamento. Toque apenas na camada
> Domain de `admin-app/`; não modifique arquivos de outras camadas nem de outros projetos.

---

### Task 03 — Data: apagar registro de trabalho

**Objetivo:** O cliente HTTP do app admin passa a saber apagar um registro de trabalho.
**Camadas:** Data
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0013 — Task 03: Implemente por TDD o método `deleteWorkLog(logId: string): Promise<void>` em
> `admin-app/src/data/api-client.ts`, acrescentando os casos ao `api-client.test.ts` que já existe
> (acrescente, não reescreva). Ele faz `DELETE /admin/work-logs/{logId}` — o caminho exato que
> `admin/src/main/api-client.ts` já usa; leia de lá, não invente. A rota já existe no servidor e
> devolve 204; ao apagar, o servidor recalcula o `lastWorkedAt` da quadra a partir dos registros
> que sobraram.
>
> Siga o padrão dos métodos vizinhos deste mesmo arquivo: `fetch` injetado (nenhum teste toca a
> rede), `X-App-Key` em toda requisição, `Authorization: Bearer` quando há token, e os mesmos
> `ApiError`/`NetworkError` já exportados.
>
> Critérios de aceite como comportamentos observáveis:
> - Chama `DELETE` em `/admin/work-logs/{logId}` com o id recebido, e leva o header `X-App-Key`.
> - Resposta 204 resolve sem tentar ler JSON do corpo — igual às outras duas rotas de DELETE já
>   implementadas aqui.
> - Com token aplicado por `setToken`, leva `Authorization: Bearer <token>`.
> - 404 lança `ApiError` com `isUnauthorized === false` e a mensagem vinda do corpo.
> - 401 lança `ApiError` com `isUnauthorized === true`, para a sessão poder renovar o JWT.
> - O `fetch` rejeitando lança `NetworkError`, não `ApiError`.
>
> Toque apenas na camada Data de `admin-app/`; não modifique arquivos de outras camadas nem de
> outros projetos.

---

### Task 04 — O mapa desenha as quadras e responde ao toque

**Objetivo:** As quadras aparecem numeradas e coloridas, os balões param de escapar, e tocar numa
quadra avisa quem chamou.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0013 — Task 04: Altere `admin-app/src/presentation/map/AssignmentsMapView.tsx` para desenhar
> as quadras. Leia antes `app/src/presentation/map/TerritoryMapView.tsx`, que já faz isto e é a
> referência a copiar em desenho e em estrutura.
>
> Acrescente uma prop `onSelectBlock(block, territory)`. Usando `blockMapFeatures` e
> `shouldShowTerritoryLabels` da Task 02 (não recalcule nada aqui — este arquivo só traduz valores
> em JSX):
>
> 1. Desenhe os polígonos das quadras num `GeoJSONSource` próprio, acima do das demarcações, com a
>    cor vindo da propriedade `color` da feature (`['get', 'color']`), preenchimento translúcido e
>    linha sólida — mesmo tratamento que o publicador dá.
> 2. Desenhe o **número** de cada quadra como um `Marker` com `<Text>` do React Native, um por
>    quadra, ancorado no `center` da feature. **Não** use `symbol` layer com `text-field`: o estilo
>    é raster puro e não tem `glyphs`, e um servidor de fontes é o que a escolha por OSM + MapLibre
>    existe para evitar — o comentário na linha 294 do arquivo do publicador explica isso e vale
>    igual aqui.
> 3. **Esconda os rótulos de território** quando `shouldShowTerritoryLabels` devolver `false`. É a
>    correção do problema que o usuário relatou: com as quadras à vista, os balões de nome
>    sentavam em cima dos números.
> 4. O alvo do toque da quadra é **o polígono inteiro**, não só o número — mesma escolha do
>    publicador. Tocar numa quadra chama `onSelectBlock`; tocar num território fora de qualquer
>    quadra continua chamando `onSelectTerritory`.
>
> Este arquivo continua sendo a exceção de teste automatizado registrada no `AGENTS.md` para a view
> nativa do MapLibre — **não escreva teste para ele**. Se precisar de qualquer cálculo novo, ele vai
> para `admin-app/src/domain/territoryMap.ts` com teste, nunca para dentro deste componente.
> Critério de sucesso: `npx tsc --noEmit` e `npm run lint` passam, `npm test` continua verde, e o
> arquivo não importa nada de `data/`. Não rode Gradle. Toque apenas na camada Presentation e, se
> for inevitável, na Domain de `admin-app/`; não modifique arquivos de outros projetos.

---

### Task 05 — O painel combinado da quadra

**Objetivo:** Tocar numa quadra abre um lugar só com as ações da quadra e as do território dela.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 03
**Instrução para o subagente:**
> Spec 0013 — Task 05: Implemente por TDD
> `admin-app/src/presentation/screens/BlockPanel.tsx` e `BlockPanel.test.tsx`. É o painel que abre
> ao tocar numa quadra no mapa, e ele reúne dois níveis de ação que hoje vivem em telas separadas.
> Leia antes `admin-app/src/presentation/screens/BlocksScreen.tsx` (de onde vem a marcação de
> trabalho e a lista de registros — **reaproveite o que der, não duplique**) e
> `admin-app/src/presentation/screens/AssignmentPanel.tsx` (de onde vêm as ações de designação e os
> textos de confirmação).
>
> O painel recebe `block`, `territory`, `session` e `api` por prop e mostra, de cima para baixo: o
> número da quadra e o status por extenso (`blockStatusLabel`, passando o `rotationDays` do
> território); o histórico de trabalho dela (`listWorkLogs`), mais recente primeiro, **com um botão
> de apagar em cada registro**; o formulário de marcar como trabalhada (publicador + data, com a
> data começando em hoje e futuro recusado); e, numa seção claramente separada e rotulada como
> sendo **do território**, o dirigente atual e as ações de designação — designar a alguém, marcar
> como concluído e apagar registro da designação.
>
> A separação visual entre as duas seções não é decoração: designar afeta o território inteiro, não
> aquela quadra, e o admin precisa ver isso antes de tocar. Toda ação destrutiva pede confirmação
> num `Alert` antes, com o texto dizendo a consequência — reaproveite os textos que o
> `AssignmentPanel` já usa.
>
> Critérios de aceite como comportamentos observáveis:
> - O número da quadra e o status por extenso aparecem; uma quadra nunca trabalhada mostra "Nunca
>   trabalhada".
> - O histórico da quadra aparece com nome e data de cada registro, mais recente primeiro; sem
>   registro nenhum, aparece um texto dizendo isso, e não uma lista vazia.
> - Apagar um registro de trabalho pede confirmação; cancelar **não** chama a API; confirmar chama
>   `deleteWorkLog` com o id **daquele** registro, e não de outro, e recarrega o histórico.
> - Marcar como trabalhada chama `markWorked` com a quadra, o publicador escolhido e a data; o botão
>   fica desabilitado sem publicador escolhido e com data no futuro, esta com explicação visível.
> - A seção do território mostra o dirigente atual, ou que não há nenhum.
> - "Designar a…" com uma designação já aberta avisa na confirmação que a atual será encerrada com
>   a data de hoje; confirmar chama `designate`.
> - "Marcar como concluído" só aparece quando há designação aberta, e a confirmação diz que o
>   publicador perde na hora o acesso para marcar quadras.
> - Apagar registro da designação pede confirmação dizendo que não há como desfazer, e chama
>   `deleteAssignment` com o id daquela linha.
> - Erro em qualquer ação aparece numa região acessível ao leitor de tela e **não** fecha o painel.
> - Toda escrita passa por `session.run` — o painel nunca vê token.
> - Uma mudança bem-sucedida avisa o chamador por callback, para a Task 06 atualizar o mapa.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 06 — Ligar o toque na quadra ao painel

**Objetivo:** O caminho completo funciona: tocar numa quadra no mapa abre o painel dela, e o que
mudar ali se reflete no mapa.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 04, Task 05
**Instrução para o subagente:**
> Spec 0013 — Task 06: Ligue o `BlockPanel` da Task 05 ao mapa, em
> `admin-app/src/presentation/screens/DesignationsScreen.tsx` e no seu teste co-localizado
> (acrescente casos, não reescreva os existentes). A tela já tem um overlay que abre ao selecionar
> um território (linhas 212-231); acrescente o caminho da quadra ao lado dele, sem quebrar o que já
> existe.
>
> Passe `onSelectBlock` ao `AssignmentsMapView`; recebê-lo abre o `BlockPanel` daquela quadra, com o
> território dono. Fechar o painel volta ao mapa. Quando o painel avisar por callback que algo
> mudou, recarregue os territórios, para que a cor e o status da quadra e o dirigente do território
> reflitam a mudança sem sair e voltar da tela.
>
> Critérios de aceite como comportamentos observáveis:
> - Tocar numa quadra abre o painel **daquela** quadra — número e território corretos —, e não o
>   painel de designação do território.
> - Tocar num território (fora de qualquer quadra) continua abrindo o que abria antes: nenhum teste
>   existente da tela pode passar a falhar.
> - Fechar o painel da quadra volta ao mapa, com a lista de territórios ainda montada.
> - Uma ação bem-sucedida no painel dispara nova carga dos territórios.
> - Um erro ao recarregar aparece numa região acessível ao leitor de tela, sem fechar o painel.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 07 — UX: paleta única e área segura nos painéis

**Objetivo:** As telas param de destoar entre si e de encostar na barra de status.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0013 — Task 07: Duas correções de UX, e **apenas estas duas** — leia a seção "Escopo das
> correções de UX" da spec 0013 antes de começar: quem escreveu a spec nunca viu este app rodando,
> então não invente melhorias visuais que não estejam aqui. Não altere layout, tamanho ou
> hierarquia de nenhum elemento além do que estas duas correções exigem.
>
> **(a) Paleta única.** `admin-app/src/presentation/screens/BlocksScreen.tsx` ficou com cerca de 21
> cores literais em hexadecimal, enquanto `SetupScreen.tsx` e `AssignmentPanel.tsx` usam
> `admin-app/src/presentation/theme.ts`. Substitua cada literal pelo token equivalente de `colors`,
> `spacing` e `radius`. Onde um literal não tiver token exato, use o token mais próximo em vez de
> acrescentar cor nova ao tema — o objetivo é uma paleta só, não uma paleta maior. **Exceção
> explícita:** as cores de status da quadra (`#c62828`, `#ef6c00`, `#2e7d32`) **não** entram no
> tema; o comentário no topo de `theme.ts` já diz que elas pertencem ao domínio, e desde a Task 02
> a fonte delas é `BLOCK_CATEGORY_COLOR` em `domain/territoryMap.ts`.
>
> **(b) Área segura.** O overlay de painéis de `DesignationsScreen.tsx` desenha sobre a tela inteira
> sem respeitar os recortes do aparelho. Envolva-o com o `SafeAreaView` de
> `react-native-safe-area-context` (já é dependência do projeto, e `jest.setup.js` já traz o mock
> oficial dela), para o conteúdo não ficar sob a barra de status nem sob a barra de gestos.
>
> Critério de sucesso: `npx tsc --noEmit`, `npm run lint` e `npm test` passam, e **nenhum teste
> existente precisou ser alterado** — as duas mudanças são de estilo e de contêiner, não de
> comportamento. Se algum teste quebrar, é sinal de que a mudança passou do escopo: reverta em vez
> de ajustar o teste. Não rode Gradle. Toque apenas na camada Presentation de `admin-app/`; não
> modifique arquivos de outras camadas nem de outros projetos.

---

### Task 08 — Documentar as duas reversões e o painel combinado

**Objetivo:** A documentação volta a descrever o app que existe.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 01, Task 06, Task 07
**Instrução para o subagente:**
> Spec 0013 — Task 08: Atualize `AGENTS.md` (raiz) e `admin-app/README.md`. Os dois hoje afirmam
> duas coisas que **deixaram de ser verdade** com esta spec, e é o principal a corrigir:
>
> 1. Que o mapa do app admin **não desenha quadras**. Agora desenha: polígono colorido pelo status
>    (as mesmas três cores dos outros dois clientes, respeitando `statusOverride` e o
>    `rotationDays` do território dono) e o número por cima. Registre também que os rótulos de
>    território **somem quando as quadras estão à vista**, e o porquê — senão sentariam em cima dos
>    números —, porque é uma regra que um refactor futuro derruba sem perceber.
> 2. Que **apagar registro de trabalho é só no desktop**. Agora existe no celular, dentro do painel
>    da quadra. Continuam só no desktop, e isso deve seguir escrito: desenhar ou editar demarcação,
>    gerir publicadores, forçar `status_override`, a página Histórico e o import/export S-13.
>
> Documente também o **painel combinado**: tocar numa quadra abre um lugar só com as ações da
> quadra (marcar trabalhada, apagar registro) e, em seção separada, as do território que a contém
> (designar, concluir, apagar registro da designação) — e diga por que a separação visual existe,
> que é o admin saber que designar afeta o território inteiro, não aquela quadra. E registre que o
> app admin passou a usar a logo e o ícone do produto, os mesmos do app do publicador.
>
> Não invente comportamento: leia os arquivos que as Tasks 01 a 07 produziram antes de descrevê-los.
> Toque apenas em `AGENTS.md` e `admin-app/README.md`; não modifique código.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0013
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo`
da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

### Ordem e paralelismo

| Onda | Tasks | Observação |
|------|-------|------------|
| 1 | 01, 02, 03 | independentes entre si — logo, domínio e cliente HTTP |
| 2 | 04, 05 | 04 precisa de 02; 05 precisa de 03 |
| 3 | 06, 07 | 06 precisa de 04 e 05; 07 precisa de 05 |
| 4 | 08 | precisa de 01, 06 e 07 |

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task, ou pelo `/centaur-driven-run` ao montar
  o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — A logo do produto no app admin → implements/0185
- [x] Task 02 — Domain: as quadras e a visibilidade dos rótulos no mapa → implements/0187
- [x] Task 03 — Data: apagar registro de trabalho → implements/0186
- [x] Task 04 — O mapa desenha as quadras e responde ao toque → implements/0188
- [x] Task 05 — O painel combinado da quadra → implements/0189
- [x] Task 06 — Ligar o toque na quadra ao painel → implements/0191
- [x] Task 07 — UX: paleta única e área segura nos painéis → implements/0190
- [x] Task 08 — Documentar as duas reversões e o painel combinado → implements/0192
