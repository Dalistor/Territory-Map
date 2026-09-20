# [0211] Contrato mensurável da reformulação administrativa

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 07

## Solicitação

Transformar o comp aprovado da reformulação administrativa em uma especificação mensurável e
registrar o comportamento compartilhado das consultas desktop e Android, sem alterar telas.

## Contexto

O redesign parte de uma composição aprovada, mas as próximas tasks não podem depender de uma leitura
subjetiva da imagem. Era necessário fechar os gates de especificação e materiais antes de qualquer
código de interface, além de deixar explícito como busca, filtros, seleção, detalhes e falhas se
comportam nas duas plataformas.

## O que foi feito

- Medi o comp `admin-table-detail.webp` em 39 regiões semânticas, cobrindo chrome, textos,
  controles, tabela, painel e mapa.
- Formalizei o mapa como região dinâmica desenhada pela biblioteca de mapas, não como raster a
  embarcar; por isso a fase de materiais não tem plates devidos.
- Medi e ranqueei a tipografia do título líder e medi os demais textos do comp.
- Fechei os gates `spec` e `plates` do Impeccable; o próximo gate aberto é `hero`, destinado às
  tasks de implementação de interface.
- Criei o contrato de UX para a navegação, consulta, estados, acessibilidade e adaptação entre
  desktop e Android.

## Arquivos modificados

- `.impeccable/build/state.json` — registra os gates `spec` e `plates` concluídos.

## Arquivos criados

- `.impeccable/build/regions.json` — inventário nomeado das regiões da composição.
- `.impeccable/build/spec.json` — especificação medida com caixas, paleta, médias e tipografia.
- `.impeccable/build/comp-grid.png` — grade de referência do comp.
- `.impeccable/build/font-match/page-title.png` — prova visual do ranking tipográfico.
- `UX-CONTRACT.md` — contrato de interação e acessibilidade para as consultas administrativas.

## Decisões técnicas

O mapa contém pixels no comp, mas é uma superfície operacional cuja geometria, tiles, rótulos e
controles precisam responder aos dados e ao toque. Foi marcado como `codeDrawn` no spec para
preservar a implementação MapLibre/Leaflet dinâmica sem tratá-lo como imagem estática. Nenhum outro
material pintado do comp exige plate, pois a composição é integralmente UI sem ilustração ou textura
autoral.

## Como validar

1. Execute `python3 -m json.tool .impeccable/build/regions.json` e o mesmo para `spec.json`.
2. Execute o launcher Impeccable `build-phase status --json` e confirme `spec` e `plates` como
   `closed`, com `hero` aberto.
3. Leia `UX-CONTRACT.md` contra as telas que serão construídas nas Tasks 08 a 20.

## Resultado da validação

- JSON de regiões e spec: válidos.
- `git diff --check`: sem erros para os artefatos desta task.
- Impeccable: `spec` passou com 39 regiões, zero plates e quatro regiões de texto medidas;
  `plates` passou sem materiais devidos.
- Nenhum código produtivo foi alterado.
