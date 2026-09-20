# [0205] Legenda de status nos mapas dos admins

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0014/` — Task 08

## Solicitação

Adicionar uma legenda compacta e acessível aos mapas do admin desktop e do admin mobile com as
categorias `Nunca trabalhada`, `Vencida` e `Em dia`, reutilizando as cores existentes.

## Contexto

As quadras já são coloridas por status, mas o significado das cores não estava explícito para quem
usa o mapa.

## O que foi feito

- Criada uma legenda textual com os três status no mapa de quadras do desktop.
- Criada a mesma legenda no mapa MapLibre do admin mobile.
- A legenda reutiliza `CATEGORY_COLOR` no desktop e `BLOCK_CATEGORY_COLOR` no mobile.
- O overlay desktop não captura ponteiros, preservando o clique nas quadras.
- No mobile, a legenda fica acima da faixa inferior da atribuição OSM e não captura ponteiros; os
  controles nativos continuam livres no topo.
- Adicionado teste de apresentação desktop para os três rótulos.

## Arquivos modificados

- `admin/src/renderer/map/TerritoryMap.tsx` — envolve o mapa e renderiza a legenda.
- `admin/src/renderer/map/TerritoryMap.test.tsx` — verifica os três rótulos.
- `admin/src/renderer/index.css` — posicionamento, legibilidade e não-interceptação do overlay.
- `admin-app/src/presentation/map/AssignmentsMapView.tsx` — renderiza a legenda no mapa mobile.

## Arquivos criados

- `admin/src/renderer/map/MapStatusLegend.tsx` — legenda acessível do desktop.
- `admin-app/src/presentation/map/MapStatusLegend.tsx` — legenda acessível do mobile.

## Decisões técnicas

O mapa MapLibre nativo não foi coberto por teste de renderização, seguindo a convenção documentada
do projeto. A legenda mobile foi mantida no próprio componente de mapa para garantir que a posição
relativa à atribuição OSM permaneça correta tanto na Home quanto na tela de quadras.

## Como validar

- Desktop: `cd admin && npm test`; abrir a Home e confirmar a legenda sobre o mapa e o clique nas
  quadras.
- Mobile: `cd admin-app && npm test`; abrir a Home e a tela de quadras em emulador/aparelho e
  confirmar a legenda acima da atribuição OSM.

## Resultado da validação

- Desktop: 27 suítes, 546 testes passando.
- Mobile: 14 suítes, 276 testes passando.
- Lint dos arquivos alterados: passando.
- Type-check desktop: passando.
- Type-check mobile: permanece com dois erros preexistentes em
  `src/presentation/screens/DesignationsScreen.test.tsx`, linhas 545 e 569, relacionados ao
  callback do retorno físico do Android; nenhum erro novo foi introduzido pela legenda.
