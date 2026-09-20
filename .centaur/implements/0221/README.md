# [0221] Controles compartilhados de consulta no admin Android

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 15

## Solicitação

Criar controles React Native compartilhados para busca, segmentos, cartões densos de consulta,
estados de lista e paginação, com acessibilidade e testes essenciais.

## Contexto

As novas consultas de Territórios, Publicadores e Histórico precisam se comportar de modo
consistente no Android, sem cada tela reinventar busca, feedback assíncrono ou paginação.

## O que foi feito

- Criados `QuerySearchField`, `QuerySegmentedControl`, `QueryListItem`, `QueryState` e
  `QueryPagination` como componentes concretos para as superfícies de consulta do admin.
- Garantidos alvos de toque mínimos de 48 px, rótulos TalkBack, estado selecionado/desabilitado e
  feedback textual que não depende somente de cor.
- O estado de consulta usa altura mínima estável durante carregamento; a busca devolve o foco ao
  campo após limpar.
- Incluídos testes de digitação/limpeza, troca de segmento, abertura de cartão, retry e paginação.

## Arquivos modificados

Nenhum.

## Arquivos criados

- `admin-app/src/presentation/components/QueryControls.tsx` — controles compartilhados de consulta.
- `admin-app/src/presentation/components/index.ts` — exportações públicas dos controles.
- `admin-app/src/presentation/components/QueryControls.test.tsx` — testes de interação essencial.

## Decisões técnicas

Os componentes são deliberadamente poucos e específicos ao vocabulário de consulta deste app;
não há uma camada genérica de design system. As futuras telas ficam responsáveis por buscar dados e
apenas compõem esses controles de apresentação.

## Como validar

```bash
cd admin-app
npm test -- --runInBand src/presentation/components/QueryControls.test.tsx
npm run typecheck
npm run lint
```

## Resultado da validação

Os cinco testes passaram. `tsc --noEmit` e ESLint concluíram sem erros.
