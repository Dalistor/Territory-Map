# [0187] App admin: as quadras do mapa como dado puro (spec 0013, Task 02)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0013/` — Task 02

## Solicitação
Spec 0013 — Task 02: implementar, por TDD, em `admin-app/src/domain/territoryMap.ts`, o que o mapa
precisa para desenhar as quadras: `BLOCK_CATEGORY_COLOR`, a interface `BlockMapFeature`,
`blockMapFeatures(territories, now)` e `shouldShowTerritoryLabels(features)`.

## Contexto
O mapa do app admin desenhava só as demarcações. A spec 0013 reverte a decisão 5 da spec 0012 e
passa a desenhar as quadras, numeradas e coloridas por status. Como o componente MapLibre não tem
teste automatizado, todo cálculo mora no domínio — este arquivo. `shouldShowTerritoryLabels` é a
correção do problema relatado pelo usuário (balões do território em cima dos números), a mesma
regra que o app do publicador já aplica em `territoryLabelMarkers`.

## Critérios de aceite
- Dois territórios com duas quadras cada produzem quatro features, cada uma carregando seu território.
- Nunca trabalhada → `#c62828`; 200 dias com rotação 120 → `#ef6c00`; ontem → `#2e7d32`.
- A rotação usada é a do território dono: 150 dias sai verde com `rotationDays: 365` e laranja com 120.
- `statusOverride: 'never'` vence a data e sai vermelha.
- `label` é o número como string (quadra 7 → `'7'`).
- Quadra com menos de 3 vértices é descartada, sem derrubar as irmãs.
- Território sem quadra não contribui; `blockMapFeatures([])` devolve `[]`.
- `shouldShowTerritoryLabels([])` é `true`; com pelo menos uma feature, `false`.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | achata as quadras de todos os territórios, cada uma com o seu | `admin-app/src/domain/territoryMap.test.ts` | `blockMapFeatures`, `BlockMapFeature` |
| 2 | nunca trabalhada sai vermelha | idem | `BLOCK_CATEGORY_COLOR` |
| 3 | vencida sai laranja | idem | mapeamento de `blockColorCategory` |
| 4 | trabalhada ontem sai verde | idem | idem |
| 5 | usa a rotação do território dono | idem | `territory.rotationDays` repassado |
| 6 | status forçado vence a data | idem | (herdado de `blockColorCategory`) |
| 7 | rótulo é o número como string | idem | `label: String(block.number)` |
| 8 | anel fechado, longitude primeiro, centro no centroide | idem | `toGeoJsonRing` + `averageCentroid` |
| 9 | quadra degenerada é descartada, irmãs continuam | idem | guarda `MIN_BOUNDARY_VERTICES` |
| 10 | território sem quadra e lista vazia não desenham nada | idem | — |
| 11 | rótulos de território aparecem sem quadras | idem | `shouldShowTerritoryLabels` |
| 12 | somem com pelo menos uma quadra | idem | idem |

## O que foi feito
Acrescentados ao módulo puro do mapa: a constante `BLOCK_CATEGORY_COLOR` (mesmos três valores do
app do publicador), a interface `BlockMapFeature`, a função `blockMapFeatures` e a regra
`shouldShowTerritoryLabels`. Nenhuma função existente foi alterada.

## Arquivos modificados
- `admin-app/src/domain/territoryMap.ts` — quadras desenháveis e a regra dos rótulos
- `admin-app/src/domain/territoryMap.test.ts` — 12 testes novos, acrescentados aos 13 existentes

## Decisões técnicas
- **A cor é domínio, não tema.** `BLOCK_CATEGORY_COLOR` fica aqui e não em `presentation/theme.ts`,
  como o próprio comentário do tema pede: vermelho/laranja/verde significam status de quadra, não
  danger/warning/success, e re-skin não pode repintá-los. Valores copiados um a um de
  `app/src/presentation/map/TerritoryMapView.tsx`.
- **A rotação é a do território dono**, passada a `blockColorCategory`, nunca um número fixo — é o
  que a spec 0009 estabeleceu e o que os outros dois clientes já fazem.
- **O descarte da quadra degenerada usa `MIN_BOUNDARY_VERTICES`**, a mesma constante que
  `territoryMapFeatures` aplica à demarcação, em vez de um `3` literal novo.
- **Sem teste deliberado:** a guarda `center === null` dentro de `blockMapFeatures` é inalcançável
  depois da checagem de 3 vértices — é defensiva e espelha exatamente a que `territoryMapFeatures`
  já tinha (linha 92, igualmente descoberta antes desta task). Preferi manter a simetria a remover a
  guarda por causa da métrica.

## Como validar
```bash
cd admin-app && npx jest src/domain/territoryMap.test.ts
```

## Resultado da validação
- `npx jest src/domain/territoryMap.test.ts` — 25 testes passando (13 antigos + 12 novos)
- `npx jest` (suíte inteira do `admin-app`) — 13 suítes, 225 testes passando
- Cobertura de `territoryMap.ts`: 95.45% de statements, 87.5% de branch, 100% de funções — as duas
  linhas descobertas são as guardas defensivas descritas acima
- `npx tsc --noEmit` limpo; `npm run lint` limpo
