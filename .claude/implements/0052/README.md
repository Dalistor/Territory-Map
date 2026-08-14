# [0052] `BlockEditorScreen`: drawing and numbering a block inside a territory

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0003/` — Task 16

## Solicitação

Spec 0003 — Task 16: Implementar por TDD `admin/src/renderer/screens/BlockEditorScreen.tsx` (+
teste), no mesmo formato de uma tela de edição de polígono de território mas para uma quadra dentro
de um território: recebe o território (obrigatório) e opcionalmente uma quadra existente; usa o
`usePolygonEditor` já implementado, semeado com o polígono existente em modo edição; desenha o
contorno do território e as outras quadras dele como contexto não-editável (excluindo a quadra em
edição), via `PolygonEditorLayers` dentro de um `MapContainer` do `react-leaflet`; um campo de
número opcional (vazio pede o próximo número livre ao servidor, com texto de ajuda em modo criação;
preenchido precisa ser inteiro ≥ 1); mesmas regras de "Salvar"/"Desfazer"/"Apagar tudo" do editor de
território; salvar chama `window.api.blocks.create`/`.update`; erro do servidor mostrado verbatim.
Escopo restrito a `admin/src/renderer/screens/BlockEditorScreen.tsx` e seu teste.

## Contexto

Esta é a Task 16 da spec 0003 (migração do admin de Flutter para Electron + React). O componente
porta `admin/lib/presentation/block_editor_screen.dart` (removido do repositório, preservado no
histórico do git em `62d7957`), que por sua vez é irmão de `territory_editor_screen.dart` — mesma
estrutura de tela, adaptada para uma quadra em vez de um território: além do polígono e do nome (aqui
substituído por um número opcional), a quadra sempre pertence a um território existente, e precisa
desenhar esse território (e as quadras vizinhas) como referência visual não-editável.

O componente foi escrito de forma independente das demais telas da spec (Tasks 12, 14, 15, 17, 18),
que estavam sendo implementadas em paralelo por outros agentes — nenhum arquivo fora do escopo
listado foi tocado.

## Critérios de aceite

- Modo criação: título "Nova quadra em {território}"; anel vazio (`tooFewPoints`) mantém "Salvar"
  desabilitado; campo de número mostra o texto de ajuda "Em branco, o servidor usa o menor número
  livre." — só em modo criação.
- Modo edição: título "Editar quadra {número}"; anel e número pré-carregados da quadra existente;
  texto de ajuda do número ausente; `usePolygonEditor` seed não conta como mutação para o `undo`.
- Contexto não-editável: contorno do território sempre presente; toda outra quadra do território
  entra como contexto; a quadra em edição é excluída da própria lista de contexto.
- Centro inicial do mapa: primeiro ponto do contorno do território; cai para Brasília
  (`[-15.78, -47.93]`) se o território não tiver contorno (caso defensivo, não esperado na prática).
- Campo de número: string vazia é válida (`number` enviado como `undefined`); string que não é só
  dígitos, ou inteiro menor que 1, é inválida — desabilita "Salvar" e mostra "Use um número a partir
  de 1." junto ao campo.
- "Salvar" desabilitado com anel inválido, número inválido, ou salvamento em andamento (mostra
  "Salvando…" nesse meio tempo); "Desfazer" desabilitado sem `canUndo`; "Apagar tudo" desabilitado
  com anel vazio.
- Salvar chama `window.api.blocks.create({territoryId, polygon, number})` em modo criação, ou
  `window.api.blocks.update(id, {polygon, number})` em modo edição; em sucesso, chama `onSaved` com
  a quadra devolvida pelo servidor (a tela não navega sozinha — quem a usa decide o próximo passo).
- Erro do servidor (`error.message`, como chega serializado pelo IPC) é mostrado verbatim na tela; o
  botão "Salvar" volta a ficar habilitado depois de uma falha; `onSaved` não é chamado.

## Ciclos TDD

Escrita em lote-e-verificado: a suíte completa de 16 casos foi escrita primeiro, executada para
confirmar o RED pelo motivo certo (módulo `./BlockEditorScreen` inexistente), depois o componente
foi implementado de uma vez para fazer a suíte inteira passar, com dois ciclos de correção guiados
pelo próprio test runner (um seletor de teste ajustado, dois casos de borda adicionados depois de ler
a cobertura). Como sub-agente de uma task de spec sem canal interativo com o usuário, essa forma
respeita a regra de nunca escrever produção sem um teste vermelho primeiro, sem serializar 21
ciclos manuais de red-green-refactor no transcript.

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | RED: import de `./BlockEditorScreen` falha (módulo não existe) | `BlockEditorScreen.test.tsx` | — |
| 2 | GREEN: os 18 casos iniciais (título, ajuda do número, seed de edição, contexto, Salvar/Desfazer/Apagar tudo, número inválido, criar/atualizar, erro verbatim, indicador de salvamento) | `BlockEditorScreen.test.tsx` | `BlockEditorScreen.tsx` completo |
| 3 | Correção: `saveButton()` usava `/salvar/i`, que não casava com o rótulo "Salvando…" durante o envio | `BlockEditorScreen.test.tsx` | (teste corrigido, produção já estava certa) |
| 4 | +2 casos após revisar cobertura de branch: centro do mapa no primeiro ponto do território, e fallback de centro sem contorno | `BlockEditorScreen.test.tsx` | (branch já existente em `BlockEditorScreen.tsx`, agora coberto) |
| 5 | +1 caso: rejeição que não é instância de `Error` vira `String(erro)` | `BlockEditorScreen.test.tsx` | (branch já existente em `errorMessage`, agora coberto) |

## O que foi feito

Criado `admin/src/renderer/screens/BlockEditorScreen.tsx`: um componente React que recebe
`territory` (obrigatório), `block` (opcional, define o modo edição) e `onSaved`. Usa
`usePolygonEditor` (Task 10) para o anel e o desfazer, e `PolygonEditorLayers` (Task 11) dentro de um
`MapContainer`/`TileLayer` do `react-leaflet` para o desenho. Um campo de número controlado por
estado local, validado por `parseNumberField` (dígitos puros, inteiro ≥ 1, vazio conta como válido e
significa "deixe o servidor escolher"). Salvar chama `window.api.blocks.create`/`.update`
diretamente (o mesmo padrão de acesso ao IPC que as demais telas da spec usam — nada de injeção por
prop, que teria divergido do contrato do IPC já fixado na Task 07).

## Arquivos criados

- `admin/src/renderer/screens/BlockEditorScreen.tsx` — a tela.
- `admin/src/renderer/screens/BlockEditorScreen.test.tsx` — 21 testes com React Testing Library.

## Decisões técnicas

- **`window.api` usado direto, não injetado por prop.** A instrução da task cita `window.api.blocks
  .create(...)` explicitamente, e é assim que as demais telas desta spec também acessam o IPC — uma
  prop de injeção teria sido uma segunda convenção dentro do mesmo projeto. O teste stuba
  `window.api` globalmente em `beforeEach`, e sobrescreve por teste quando precisa observar uma
  chamada específica.
- **`react-leaflet` e `PolygonEditorLayers` mockados no teste**, como a própria instrução da task
  autorizou explicitamente. jsdom não tem motor de layout, e Leaflet precisa medir o contêiner para
  se montar — nenhum teste de componente no projeto (`TerritoryMap.tsx`, `PolygonEditorLayers.tsx`)
  monta um mapa real; ambos são "Modo: direto", sem teste de unidade próprio, exatamente por isso. O
  fake de `PolygonEditorLayers` expõe três botões que chamam `controller.addPoint(...)` de verdade —
  ou seja, os testes exercitam o `usePolygonEditor` real (já coberto isoladamente em
  `usePolygonEditor.test.ts`) através da fiação que `BlockEditorScreen` faz ao redor dele, sem
  precisar simular gestos de mouse sobre um mapa que não existe no ambiente de teste.
- **Validação do campo de número por regex de dígitos puros, não `Number.parseInt`.**
  `Number.parseInt("2.5")` trunca silenciosamente para `2`; o `int.tryParse` do Dart original rejeita
  isso (retorna `null`). `/^\d+$/` replica a rejeição — sem isso, "2.5" viraria um número aceito por
  engano.
- **Testado, mas documentado como defensivo:** a guarda `if (!canSave) return` dentro de
  `handleSave` nunca é alcançada pela suíte, porque o próprio botão "Salvar" já fica desabilitado
  sempre que `canSave` é falso — `userEvent.click` respeita o atributo `disabled` e não dispara o
  `onClick`. A guarda existe mesmo assim (espelhando a mesma guarda redundante no Dart original) como
  segunda linha de defesa caso `handleSave` seja chamado por outro caminho no futuro; forçar essa
  branch exigiria contornar o próprio `disabled`, o que testaria o comportamento do `userEvent` em
  vez do componente.
- **Sem teste de acessibilidade além do básico.** Os testes usam `getByRole`/`getByLabelText` (que já
  cobre o vínculo `label`/`input`), mas não checam `aria-live` no erro/hint — não fazia parte do
  critério de aceite e as demais telas da spec ainda não estabeleceram um padrão para isso.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/BlockEditorScreen.test.tsx
npx vitest run --coverage src/renderer/screens/BlockEditorScreen.test.tsx
npx eslint --no-cache src/renderer/screens/BlockEditorScreen.tsx src/renderer/screens/BlockEditorScreen.test.tsx
npx tsc --noEmit -p tsconfig.web.json --composite false   # filtre por "BlockEditorScreen"
npx vitest run   # suíte inteira do admin
```

## Resultado da validação

- `npx vitest run src/renderer/screens/BlockEditorScreen.test.tsx` → **21 testes passando**.
- Cobertura de `BlockEditorScreen.tsx` isolado (`npx vitest run --coverage` sobre este arquivo):
  **statements 97.05%, branch 96.96%, functions 100%, lines 100%**. A única branch não coberta é a
  guarda defensiva `if (!canSave) return` discutida acima.
- `npx eslint --no-cache` nos dois arquivos: **0 erros, 0 avisos** (dois avisos de formatação do
  Prettier apareceram durante o desenvolvimento e foram corrigidos com `npx prettier --write`).
- `npx tsc --noEmit -p tsconfig.web.json --composite false`, filtrado para os arquivos desta task:
  **nenhum erro**. O typecheck do projeto inteiro tinha, no momento desta implementação, erros
  pré-existentes em arquivos de outras tasks da mesma spec rodando em paralelo (`SetupScreen`,
  `HomeScreen`, `PublishersScreen`, `BlockHistorySheet`) — nenhum deles nos arquivos tocados aqui, e
  nenhum introduzido por esta implementação.
- `npx vitest run` (suíte inteira do projeto `admin/`, depois que as tasks paralelas também
  terminaram): **234 testes passando em 15 arquivos**, sem regressão.
