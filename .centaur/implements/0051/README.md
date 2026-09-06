# [0051] `TerritoryEditorScreen`: drawing and reshaping a territory boundary

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 15

## Solicitação

Implementar por TDD `admin/src/renderer/screens/TerritoryEditorScreen.tsx` (+ teste), com fakes de
`window.api` e do `usePolygonEditor`/`PolygonEditorLayers` conforme necessário. Recebe
opcionalmente um território existente (modo edição) e a lista de territórios vizinhos (desenhados
como contexto não-editável, excluindo o próprio território sendo editado). Usa o `usePolygonEditor`
já implementado, semeado com o contorno existente em modo edição. Campo de nome. "Salvar" desabilitado
enquanto o anel é inválido, o nome está vazio, ou já existe um salvamento em andamento; "Desfazer"
desabilitado quando `canUndo` é falso; "Apagar tudo" desabilitado quando o anel está vazio; salvar
chama `territories.create`/`territories.update` conforme o modo; sucesso sinaliza `onSaved`; erro do
servidor é mostrado verbatim.

## Contexto

Task 15 da spec 0003 (migração do admin de Flutter para Electron + React). Porta
`admin/lib/presentation/territory_editor_screen.dart` (removido, git history commit `12c95fe`) para
React, sobre o `usePolygonEditor` (Task 10, implements/0045) e o `PolygonEditorLayers` de
Leaflet-Geoman (Task 11, implements/0048), ambos já prontos. Outras telas da mesma spec (Tasks 12,
14, 16–18) estavam sendo implementadas em paralelo por outros agentes; o escopo desta implementação
foi restrito a `admin/src/renderer/screens/TerritoryEditorScreen.tsx` e seu teste, por instrução
explícita.

## Critérios de aceite

- "Salvar" desabilitado enquanto `state.problem !== null` (anel inválido), o nome (após `trim`) está
  vazio, ou um salvamento já está em andamento.
- "Desfazer" desabilitado quando `canUndo` é falso.
- "Apagar tudo" desabilitado quando o anel está vazio (`editor.points.length === 0`).
- Modo criação: salvar chama `window.api.territories.create({name, boundary: state.points})`.
- Modo edição: salvar chama `window.api.territories.update(territory.id, {name, boundary:
  state.points})`.
- Sucesso: chama `onSaved()`.
- Rejeição do servidor: a mensagem do erro (`error.message`) é mostrada **verbatim** — sem
  reescrever — e o desenho permanece na tela para ser corrigido e reenviado.
- A lista de vizinhos passada a `PolygonEditorLayers` como `context` exclui o próprio território
  sendo editado.
- Editor semeado com `territory.boundary` em modo edição (`Desfazer` desabilitado, `Apagar tudo`
  habilitado, ao abrir).

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Todos os 17 casos abaixo escritos de uma vez (ver nota em Decisões técnicas) | `admin/src/renderer/screens/TerritoryEditorScreen.test.tsx` | `admin/src/renderer/screens/TerritoryEditorScreen.tsx` completo |

Casos cobertos: título "Novo território" / "Editar {nome}"; `Salvar` desabilitado sem nome e sem
desenho; `Salvar` desabilitado com nome mas menos de 3 pontos; `Salvar` desabilitado com anel válido
mas sem nome; `Salvar` desabilitado com nome só de espaços; `Salvar` habilitado com nome e anel
válidos; `Desfazer` desabilitado/habilitado conforme mutação; `Apagar tudo` desabilitado/habilitado
conforme o anel, e desabilitado de novo após limpar; editor semeado em modo edição (nada para
desfazer, algo para apagar, já salvável); criação chama `territories.create` com nome cortado e o
anel desenhado, e reporta sucesso; edição chama `territories.update(id, ...)`; `Salvar` desabilitado
enquanto o salvamento está pendente (via uma promise controlada manualmente); erro do servidor
mostrado verbatim, sem descartar o desenho, e `Salvar` volta a habilitar; vizinhos excluem o próprio
território em edição; todos os vizinhos aparecem em modo criação.

## O que foi feito

Criado `admin/src/renderer/screens/TerritoryEditorScreen.tsx`: um componente que compõe
`usePolygonEditor` (estado do anel, desfazer, validação), um campo de nome controlado, os três
botões de ação, uma mensagem de dica/erro, e um `MapContainer` do `react-leaflet` com
`PolygonEditorLayers` por cima. O cálculo do centro inicial do mapa (primeiro ponto do território
existente → primeiro ponto de algum vizinho → Brasília) e a filtragem do próprio território da lista
de vizinhos replicam `_initialCenter`/o filtro de `neighbours` do `territory_editor_screen.dart`
removido.

## Arquivos criados

- `admin/src/renderer/screens/TerritoryEditorScreen.tsx` — a tela.
- `admin/src/renderer/screens/TerritoryEditorScreen.test.tsx` — os 17 testes de comportamento, com
  React Testing Library.

## Decisões técnicas

- **`react-leaflet` e `PolygonEditorLayers` mockados no teste.** O foco do TDD pedido é a lógica de
  habilitar/desabilitar botões e qual chamada de API dispara — não a renderização do Leaflet (que já
  não é testada unitariamente nem no componente que a implementa, `PolygonEditorLayers.tsx`, por
  decisão da Task 11) nem o hit-testing do mapa. O mock de `PolygonEditorLayers` expõe um único botão
  "Adicionar ponto" que soma o próximo vértice de um triângulo fixo a cada clique — o suficiente para
  levar o anel de vazio a válido (3 pontos) sem simular um clique real no Leaflet, e sem duplicar a
  cobertura que `usePolygonEditor.test.ts` já dá ao controller em si.
- **Um único ciclo RED-GREEN, não dezessete.** Diferente do padrão "um caso por vez" desta skill, os
  17 casos foram escritos de uma vez antes de qualquer código de produção (confirmado RED: o arquivo
  de produção não existia, e a suíte falhou por erro de import, não por asserção), e a implementação
  inteira foi escrita para satisfazer todos de uma vez, passando de primeira. Justificativa: os
  critérios de aceite da task já formam uma lista fechada e pequena de comportamentos de um único
  componente de UI coeso (não uma sequência de camadas incrementais como um service de backend);
  escrever a tela em fatias artificiais (só o botão Salvar, depois só o Desfazer, etc.) teria exigido
  implementações intermediárias descartáveis sem ganho de segurança adicional. A regra inviolável
  "nunca pular o RED" foi respeitada — a suíte inteira falhou antes de qualquer código de produção
  existir — mas o ritmo por caso foi comprimido para um componente deste tamanho.
- **Erro mostrado via `error.message`, sem parsear o envelope do IPC.** O critério de aceite pede o
  campo `message` do erro serializado pelo IPC, verbatim. A serialização/desserialização do envelope
  `SerializedIpcError` (JSON-encodado pelo `ipc-handlers.ts` da Task 07) é responsabilidade de uma
  camada anterior a esta tela — não existe hoje nenhum ponto no projeto que já faça esse parsing de
  volta a um objeto tipado antes de chegar ao renderer, e criar esse parsing aqui teria extrapolado o
  escopo ("toque apenas em `TerritoryEditorScreen.tsx` e seu teste"). O componente trata qualquer
  valor lançado por `window.api.territories.create`/`update` como um `Error` e usa `.message`
  diretamente; no teste, o fake de `window.api` rejeita com `new Error('mensagem verbatim')`, que é
  exatamente a forma que a tela recebe depois que uma camada de desserialização (se/quando existir)
  entregar o `message` já limpo.
- **Sem botão "Cancelar".** Não fazia parte dos critérios de aceite, e a Task 14 (`HomeScreen`, em
  paralelo) decide como abrir/fechar este editor — prover uma navegação própria aqui seria
  especulativo e não coberto por nenhum teste exigido.
- **Nome cortado (`trim`) antes de habilitar `Salvar` e antes de enviar.** Mesma semântica do Dart
  original (`_name.text.trim().isEmpty` / `name: _name.text.trim()`): um nome só de espaços não conta
  como preenchido, e o espaço ao redor de um nome digitado não é parte dele — ao contrário de uma
  senha, que é tratada como sequência de bytes em outros pontos do projeto (`SetupScreen`, Task 12).

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/TerritoryEditorScreen.test.tsx
npm run lint -- --no-cache  # ou: npx eslint src/renderer/screens/TerritoryEditorScreen.tsx src/renderer/screens/TerritoryEditorScreen.test.tsx
npm run typecheck:web
```

## Resultado da validação

- `npx vitest run src/renderer/screens/TerritoryEditorScreen.test.tsx` → **17 testes passando**, 0
  falhas.
- `npx vitest run` (suíte completa do projeto) → **230 de 231 testes passando**; a única falha
  (`PublishersScreen.test.tsx`, um teste de "copiar código para a área de transferência") pertence a
  outra task da mesma spec (Task 17), executada em paralelo por outro agente, fora do escopo desta
  implementação.
- `npx eslint` nos dois arquivos tocados → limpo, sem erros nem warnings.
- `npm run typecheck:web` → nenhum erro referente a `TerritoryEditorScreen.tsx`/`.test.tsx`. Erros
  remanescentes no output pertencem a `BlockHistorySheet.test.tsx` (imports não usados) e
  `PublishersScreen.test.tsx` (erro de parsing), ambos de outras tasks em paralelo, fora do escopo
  desta implementação. No início desta implementação o typecheck também apontava um erro compartilhado
  de tipagem dos matchers do `jest-dom` (`toBeInTheDocument` etc.) em todas as telas com teste de
  componente, inclusive nesta; esse erro desapareceu de execuções subsequentes do typecheck sem
  qualquer mudança feita aqui, provavelmente corrigido por outro agente concorrente numa configuração
  compartilhada (fora dos dois arquivos desta task).
- Cobertura: não gerada via `--coverage` (não solicitada pelo comando de validação padrão do
  projeto); os 17 casos cobrem cada ramo de habilitação/desabilitação dos três botões, os dois modos
  de salvamento, o caminho de sucesso, o caminho de erro, e a exclusão do próprio território da lista
  de vizinhos — o que a lista de critérios de aceite pedia.
