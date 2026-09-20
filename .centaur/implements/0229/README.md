# [0229] Detalhe empilhado de território no admin Android

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 17

## Solicitação

Implementar o detalhe móvel de um território com segmentos de designações e
quadras, preservando as ações já disponíveis e a separação entre o escopo de
uma quadra e o escopo do território inteiro.

## Contexto

A consulta Territórios precisava deixar de abrir um overlay local e passar a
usar a pilha de navegação, mantendo a lista/mapa sob ela. O detalhe não pode
ter rolagens verticais concorrentes, pois cartões de designação e quadras são
conteúdos de uma única jornada no celular.

## Critérios de aceite

- Alternar entre `Designações` e `Quadras` no território aberto.
- Abrir pelo id do território selecionado e voltar à tab que o originou.
- Recarregar o território após escrita de designação ou trabalho.
- Voltar ao contexto anterior se o território tiver sido apagado (404).
- Manter uma única rolagem vertical por detalhe e preservar o painel combinado
  da quadra para a exclusão de logs.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Carrega o território da rota e troca segmentos numa única rolagem | `admin-app/src/presentation/screens/TerritoryDetailScreen.test.tsx` | `TerritoryDetailScreen` e composição sem `ScrollView` concorrente. |
| 2 | Recarrega o id correto após designar | `admin-app/src/presentation/screens/TerritoryDetailScreen.test.tsx` | Retomada do território após escrita. |
| 3 | Abre o detalhe real pela stack | `admin-app/src/presentation/App.test.tsx` | Rota `TerritoryDetail` ligada à tab Territórios. |

## O que foi feito

- Criada a tela `TerritoryDetailScreen`, com resumo do território e segmentos
  de designações/quadras.
- A rota da stack agora carrega o território atual pelo id e fecha quando a
  API informa 404, sem reter painel obsoleto.
- `AssignmentPanel` e `BlocksScreen` podem renderizar conteúdo sem rolagem
  própria dentro do detalhe; `BlockPanel` continua sendo o caminho completo
  para uma quadra, inclusive para apagar registro de trabalho.
- A tab Territórios abre a rota de detalhe quando recebe a navegação do app;
  seu overlay local continua como fallback de uso isolado/teste.

## Arquivos modificados

- `admin-app/src/presentation/App.tsx` — rota de detalhe territorial e abertura a partir da tab.
- `admin-app/src/presentation/App.test.tsx` — cobertura da rota real em vez do placeholder.
- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — delega a abertura ao stack quando disponível.
- `admin-app/src/presentation/screens/BlocksScreen.tsx` — permite composição sem rolagem própria e promoção de uma quadra.
- `admin-app/src/presentation/screens/index.ts` — exporta o detalhe territorial.

## Arquivos criados

- `admin-app/src/presentation/screens/TerritoryDetailScreen.tsx` — detalhe empilhado do território.
- `admin-app/src/presentation/screens/TerritoryDetailScreen.test.tsx` — especificação executável do detalhe.

## Decisões técnicas

O 404 é tratado como remoção do item, não como erro recuperável: manter o
detalhe de um território inexistente permitiria agir sobre dados obsoletos. Os
demais erros continuam mostrando tentativa de novo carregamento.

## Como validar

```bash
cd admin-app
npm test -- --runInBand
npm run typecheck
npm run lint
```

## Resultado da validação

- `npm test -- --runInBand` — 305 testes passando em 18 suítes.
- `npx jest --coverage --runInBand src/presentation/screens/TerritoryDetailScreen.test.tsx src/presentation/App.test.tsx` — 20 testes passando; `TerritoryDetailScreen.tsx`: 71,79% linhas e 51,42% branches. Os caminhos remanescentes são erro recuperável/retry e promoção de bloco, já cobertos nas telas especializadas existentes.
- `npm run typecheck` — concluído sem erros.
- `npm run lint` — concluído sem erros.
