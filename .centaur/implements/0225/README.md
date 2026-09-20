# [0225] Consulta de territórios em lista ou mapa no admin Android

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 16

## Solicitação

Implementar a tab `Territórios` a partir de `DesignationsScreen`, com alternância Lista/Mapa,
busca e detalhe preservado entre as visualizações.

## Contexto

A tela inicial combinava o mapa e a lista ao mesmo tempo. A nova consulta móvel precisa deixar o
admin escolher a leitura mais útil sem perder contexto ao abrir e fechar um território ou uma
quadra.

## Critérios de aceite

- Alternar Lista/Mapa sem outra busca à API e conservar a ordenação numérica.
- Mostrar dirigente, situação, quadras e último trabalho em cada linha.
- Abrir o mesmo detalhe territorial pela lista ou pelo mapa; manter o detalhe de quadra ao tocar a
  quadra no mapa.
- Preservar modo, busca e território selecionado ao retornar do detalhe.
- Preservar os estados de carregamento, vazio, erro, recarregar, back físico e atualização depois
  de designar/concluir.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Alterna lista e mapa sem novo carregamento | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Segmento de visualização e superfície condicional. |
| 2 | Retorna mantendo mapa, busca e seleção | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Estado persistente de busca/seleção e abertura unificada do detalhe. |

## O que foi feito

- Adicionado segmento `Lista / Mapa`, busca de território ou dirigente e estado de seleção.
- O mapa reaproveita `AssignmentsMapView`; tocar um território abre o cartão territorial, e tocar
  uma quadra mantém o painel combinado daquela quadra.
- A lista agora torna explícita a situação do território e mantém o `ScrollView`: não houve medição
  que justificasse virtualização especulativa.

## Arquivos modificados

- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — consulta Lista/Mapa, busca e seleção.
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — comportamento da consulta e
  adaptação dos testes legados ao novo contrato.

## Decisões técnicas

O detalhe continua como overlay nesta task, portanto a superfície de consulta permanece montada por
baixo dele e preserva seu estado de retorno. A migração para a tela de detalhe empilhada cabe à Task
17; esta mudança não antecipa essa navegação.

## Como validar

```bash
cd admin-app
npm test -- --runInBand src/presentation/screens/DesignationsScreen.test.tsx
npm run typecheck
npm run lint
```

## Resultado da validação

- `npm test -- --runInBand src/presentation/screens/DesignationsScreen.test.tsx` — 34 testes passando.
- `npm run typecheck` — concluído sem erros.
- `npm run lint` — concluído sem erros.
- `npm test -- --runInBand` — 300/301 testes passando; falha fora do escopo em
  `src/presentation/App.test.tsx`, porque seu fake de `ApiClient` não inclui `listPublishers` após
  a integração concorrente da tela Publicadores.
