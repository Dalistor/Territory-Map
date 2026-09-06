# [0146] App: o mapa passa a rotação do território para a cor da quadra (spec 0009, Task 12)

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0009/` — Task 12

## Solicitação
> Spec 0009 — Task 12: em `app/src/presentation/map/TerritoryMapView.tsx` e
> `app/src/presentation/screens/MapScreen.tsx`, passe o `rotationDays` do território dono da quadra
> na chamada a `blockColorCategory`, em vez do limiar fixo de hoje. Se houver texto na interface
> citando "120 dias", ajuste para não mentir num território com rotação própria.

## Contexto
A Task 11 já tinha ensinado `blockColorCategory` a receber um `rotationDays` opcional e
`parseTerritory` a ler `rotation_days` da API. Faltava o último elo: a camada de apresentação do app
ainda chamava a regra com dois argumentos, então um território com rotação de 30 dias configurada
pelo admin continuava sendo desenhado com o limiar padrão de 120. A cor no mapa é a informação que
diz ao publicador para onde ir hoje — deixá-la fora da configuração tornaria a configuração
inofensiva na prática.

## O que foi feito
Em `TerritoryMapView.tsx`, a montagem de `blockFeatureProperties` já itera os territórios e, dentro
de cada um, os seus blocos — o território dono da quadra já estava em escopo. A chamada passou a
ser `blockColorCategory(block, effectiveNow, territory.rotationDays)`.

O único texto que citava o limiar era o comentário ao lado da cor `overdue` em `CATEGORY_COLOR`
("orange -- past the 120-day threshold"), que passou a descrever a rotação do território dono da
quadra em vez de um número fixo. Não há nenhum texto de interface no app citando "120 dias" — a
varredura por `120` em `app/src/` só encontra `domain/blockColor.ts` (onde `DEFAULT_ROTATION_DAYS`
é a fonte do valor) e os testes.

`MapScreen.tsx` **não foi modificado**: ele não chama `blockColorCategory` em nenhum ponto — quem
colore é o `TerritoryMapView` que ele compõe. O que a tela faz é montar
`territoriesWithOverrides` com spread (`{ ...territory, blocks: ... }`), o que já preserva
`rotationDays` no território repassado ao mapa, e mostrar `describeLastWorked`, que fala em data e
dias corridos, nunca em limiar. Modificá-lo seria mudança sem efeito.

## Arquivos modificados
- `app/src/presentation/map/TerritoryMapView.tsx` — `blockColorCategory` recebe
  `territory.rotationDays`; o comentário da cor `overdue` deixou de citar o limiar fixo de 120 dias.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Nenhum teste novo, por decisão já documentada.** `TerritoryMapView.tsx` e `MapScreen.tsx` são os
  dois arquivos do app que desenham o MapLibre nativo e são risco assumido sem teste automatizado no
  AGENTS.md (mesmo caso do Leaflet-Geoman no admin). A regra que mudou de comportamento —
  `blockColorCategory` com rotação — já está coberta em `app/src/domain/blockColor.test.ts` pela
  Task 11. O que esta task acrescenta é a fiação, verificável por leitura.
- **`MapScreen.tsx` intocado**, pelo motivo acima: a instrução da task o nomeia, mas ele não contém
  chamada a `blockColorCategory` nem texto citando o limiar. Editá-lo só para cumprir a letra da
  instrução adicionaria ruído ao diff.
- **A rotação vem do território, não de um prop novo do componente.** `blockFeatureProperties` já
  percorre `territory.blocks` dentro de `territories.flatMap`, então o dono de cada quadra está em
  escopo — não foi preciso índice auxiliar nem passar a rotação por fora.
- Nenhuma alteração não commitada em `MapScreen.tsx`/`MapScreen.test.tsx` foi revertida, e nenhum
  teste existente precisou de conserto: a suíte inteira já passava e continuou passando.

## Como validar
`npm run android` num emulador ou aparelho, com um território cuja `rotation_days` seja menor que o
intervalo desde a última visita de alguma quadra: a quadra deve aparecer laranja (vencida) mesmo com
menos de 120 dias, e verde de novo se a rotação for aumentada pelo admin. Quadra nunca trabalhada
continua vermelha em qualquer rotação, e território sem rotação configurada continua exatamente como
antes.

## Resultado da validação
- `cd app && npm test` — 12 suítes, 94 testes, todos passando.
- `cd app && npx tsc --noEmit` — sem erros.
- `npx eslint src/presentation/map/TerritoryMapView.tsx` — sem warnings.
