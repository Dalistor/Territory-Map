# [0201] Último trabalho na lista do admin mobile

**Data:** 2026-09-05
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 05

## Solicitação

Mostrar em cada cartão da `DesignationsScreen` o último publicador e a data do trabalho,
ou `Nunca trabalhado` quando não houver registro, mantendo dirigente e contagem de quadras
separados.

## Contexto

O contrato e o parser já entregavam `Territory.lastWork`; faltava apresentar esse resumo na
lista principal do app admin sem derivar o trabalhador a partir do dirigente atual.

## Critérios de aceite

- Registro existente aparece como `Último trabalho: Nome — dd/mm/yyyy`.
- Ausência de registro aparece como `Nunca trabalhado` sem erro.
- O nome do último trabalhador permanece separado do dirigente atual.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `shows the last work separately from the current leader` | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Linha de último trabalho usando o nome persistido e `formatDate`. |
| 2 | `shows that a territory was never worked when there is no last work` | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Fallback visual `Nunca trabalhado`. |

## O que foi feito

Adicionada uma linha de contexto aos cartões da lista, com a formatação de data já usada pelo
histórico de trabalho e estilo visual secundário consistente com a contagem de quadras.

## Arquivos modificados

- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — renderiza o último trabalho ou o fallback.
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — cobre registro, ausência, data determinística e separação do dirigente.

## Arquivos criados

- `.centaur/implements/0201/README.md` — trilha de auditoria desta implementação.

## Decisões técnicas

Foi reutilizada a função `formatDate` existente em `BlockWorkSection`, que já define a convenção
local `dd/mm/yyyy`; nenhuma regra de data, contrato de API, mapa ou tela de detalhes foi alterada.

## Como validar

```bash
cd admin-app
npm test -- --runInBand
npm run typecheck
npm run lint
```

## Resultado da validação

- Suíte Jest: 14 suites, 270 testes passando.
- TypeScript: `tsc --noEmit` passou.
- ESLint: passou.
- O projeto não possui script de coverage no `package.json`; nenhum número de cobertura foi inventado.
