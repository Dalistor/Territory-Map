# [0203] Back físico fecha detalhes do app admin

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 06

## Solicitação

Implementar o tratamento do retorno do Android no app admin: quando um detalhe estiver aberto,
o primeiro back deve executar a mesma ação de `← Voltar` e manter o app na lista; sem detalhe,
o comportamento padrão deve continuar intacto.

## Contexto

Os detalhes são overlays controlados por `detail` na `DesignationsScreen`. O retorno físico passa
a consultar o mesmo estado e chama a mesma transição `closeDetail` usada pelo botão visível, sem
criar uma segunda fonte de verdade.

## Critérios de aceite

- Back físico fecha `AssignmentPanel`, `BlocksScreen` ou `BlockPanel` quando o detalhe está aberto.
- O handler retorna `true` ao consumir o back e mantém a lista montada.
- Sem detalhe aberto, o handler retorna `false` para preservar a navegação padrão.
- O botão `← Voltar` e o back físico usam a mesma transição.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Fecha um detalhe aberto com o back do Android | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Registro do listener `hardwareBackPress` e fechamento compartilhado |
| 2 | Mantém o back padrão sem detalhe aberto | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Retorno `false` quando não há overlay ativo |

## O que foi feito

- Registrado o listener `hardwareBackPress` na `DesignationsScreen`.
- Extraída a transição `closeDetail`, reutilizada pelo botão e pelo back físico.
- Adicionados testes para detalhe aberto e para a passagem do back padrão.

## Arquivos modificados

- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — tratamento do back e transição compartilhada.
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — cobertura dos dois estados do back.

## Como validar

```bash
cd admin-app
npm test -- --runInBand
npm run typecheck
npm run lint
```

## Resultado da validação

- `npm test -- --runInBand`: 14 suítes e 276 testes passando.
- `npm run typecheck`: passando.
- `npm run lint`: passando.
- Não há comando de cobertura configurado no `admin-app/package.json`; portanto não foi reportado
  percentual de linha/branch.
