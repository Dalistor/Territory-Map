# [0230] Consistência e acessibilidade das consultas administrativas

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 20

## Solicitação

Fazer uma passada de consistência entre os admins desktop e Android usando o contrato de UX e o comp aprovado, corrigindo apenas violações observadas de vocabulário, estados e acessibilidade.

## Contexto

As telas de consulta passaram a compartilhar os destinos `Territórios`, `Publicadores` e `Histórico completo`. A revisão precisava garantir que o nome do destino, os filtros de período e a leitura com fonte ampliada mantivessem o mesmo significado entre as superfícies.

## O que foi feito

- Renomeou o título primário do workspace desktop de `Designações` para `Territórios`, preservando `Designações` como detalhe contextual do território.
- Fez o intervalo móvel exibir os rótulos visíveis `De` e `Até`, mantendo labels TalkBack descritivos para as duas datas.
- Removeu truncamento de nomes e detalhes de consulta em cartões móveis, para que datas e informações críticas possam quebrar linha com fonte ampliada.
- Atualizou os testes de navegação, rótulos acessíveis e não-truncamento.

## Arquivos modificados

- `admin/src/renderer/screens/DesignationsScreen.tsx` — título canônico da seção de territórios.
- `admin/src/renderer/App.test.tsx` — expectativas da navegação e do título atualizado.
- `admin-app/src/presentation/screens/HistoryScreen.tsx` — rótulos de período e cartões sem truncamento.
- `admin-app/src/presentation/screens/HistoryScreen.test.tsx` — cobertura dos rótulos visíveis e acessíveis das datas.
- `admin-app/src/presentation/components/QueryControls.tsx` — cartões de consulta podem crescer verticalmente para preservar conteúdo.
- `admin-app/src/presentation/components/QueryControls.test.tsx` — cobertura do detalhe não truncado.

## Arquivos criados

- `.centaur/implements/0230/README.md` — registro desta implementação.

## Decisões técnicas

`Designações` permanece em abas e painéis que descrevem a responsabilidade por um território; apenas o destino principal adota `Territórios`. Os controles móveis conservam labels curtos na tela e labels completos para leitor de tela, evitando abreviações ambíguas no TalkBack.

## Como validar

1. No admin desktop, abrir `Territórios` pela sidebar e confirmar o título e o retorno ao mapa.
2. No admin Android, abrir `Histórico completo` e confirmar `De`/`Até`, bem como os labels de data em leitor de tela.
3. Aumentar a fonte do Android e conferir que nomes, datas e detalhes dos cartões quebram linha em vez de sumirem.

## Resultado da validação

- `cd admin && npm test -- --run` — 29 arquivos, 561 testes passando.
- `cd admin-app && npm test -- --runInBand` — 18 arquivos, 306 testes passando. Há avisos preexistentes de `act(...)` em testes de telas de publicadores, sem falha.
- `cd admin && npm run typecheck` — passou.
- `cd admin-app && npm run typecheck` — passou.
- `git diff --check` — passou.
