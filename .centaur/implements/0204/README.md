# [0204] Back do Android fecha detalhe no app admin

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 06

## Solicitação

Implementar o tratamento do retorno do Android no app admin: quando um detalhe estiver aberto,
o primeiro back deve executar a mesma ação de `← Voltar` e manter o app na lista; sem detalhe,
o comportamento padrão deve continuar intacto.

## Contexto

`DesignationsScreen` mantém a lista montada sob um único estado `detail`. O retorno precisava
fechar esse overlay antes de permitir que a navegação raiz saísse da tela.

## Critérios de aceite

- Back do Android com `AssignmentPanel`, `BlocksScreen` ou `BlockPanel` aberto fecha o detalhe e
  consome o evento.
- Back sem detalhe aberto retorna `false`, preservando a navegação padrão.
- O botão visível e o back usam a mesma transição, sem uma segunda fonte de verdade para `detail`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `closes an open detail when Android back is pressed` | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Listener de `BackHandler` que fecha o detalhe aberto e consome o retorno |
| 2 | `keeps the default Android back behavior when no detail is open` | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Retorno `false` quando a lista está visível |

## O que foi feito

Foi extraída a transição `closeDetail`, compartilhada pelo botão `← Voltar` e pelo listener de
`BackHandler`. O listener só retorna `true` quando o detalhe está realmente visível; nos demais
casos deixa o React Navigation tratar o retorno.

## Arquivos modificados

- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — tratamento do back Android e
  reutilização da transição de fechamento pelo botão.
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — testes dos estados com e sem
  detalhe.

## Decisões técnicas

Foi usado `BackHandler`, próprio do fluxo Android em React Native, em vez de criar estado paralelo
ou interceptar a navegação raiz. O estado derivado `isDetailOpen` continua sendo a única decisão
sobre se o evento deve ser consumido.

## Como validar

```bash
cd admin-app
npx jest src/presentation/screens/DesignationsScreen.test.tsx --runInBand
npx jest src/presentation/screens/DesignationsScreen.test.tsx --coverage --runInBand --coverageReporters=text
npm run lint
```

## Resultado da validação

- Teste da tela: **31 testes passando**.
- Cobertura do arquivo tocado: `DesignationsScreen.tsx` com **98,61% de linhas** e **90,78% de
  branches** no relatório do teste co-localizado.
- Lint: concluído sem erros.
- Type-check: o arquivo tocado não introduziu erros; o comando global permanece bloqueado por
  `src/presentation/map/MapStatusLegend.test.tsx:6`, que chama `screen.getByText` sem aguardar o
  `render` assíncrono.
- Suíte completa: **273 passando e 4 falhando** em testes pré-existentes de busca de publicador,
  legenda de mapa e atualização do botão de recarregar, fora do escopo desta task.
