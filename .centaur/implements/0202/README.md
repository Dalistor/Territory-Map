# [0202] Busca e seleção de publicador no admin mobile

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 07

## Solicitação

Implementar uma seleção pesquisável de publicador em `AssignmentPanel.tsx` e
`BlockWorkSection.tsx`, filtrando por nome sem diferenciar maiúsculas/minúsculas,
mantendo o selecionado visível, impedindo envio sem seleção e mostrando uma mensagem
clara quando não houver correspondência.

## Contexto

As duas telas exibiam todos os publicadores como uma lista extensa. A seleção foi
extraída para um componente de Presentation reutilizável, preservando a diferença de
escopo: `AssignmentPanel` continua recebendo somente publicadores ativos, enquanto o
lançamento de trabalho continua recebendo todos os publicadores retornados pelo fluxo
existente.

## Critérios de aceite

- A busca filtra nomes por substring sem diferenciar maiúsculas/minúsculas.
- O publicador selecionado continua visível mesmo quando não corresponde à busca.
- O formulário não envia sem publicador selecionado.
- Busca sem correspondência mostra `Nenhum publicador encontrado.` sem desmontar o formulário.
- Somente publicadores ativos aparecem para designação.
- O lançamento de trabalho continua permitindo qualquer publicador permitido pelo fluxo.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Filtra e preserva a seleção na designação até confirmar | `admin-app/src/presentation/screens/AssignmentPanel.test.tsx` | `PublisherPicker` integrado ao `AssignmentPanel` |
| 2 | Filtra e preserva a seleção no lançamento de trabalho até confirmar | `admin-app/src/presentation/screens/BlocksScreen.test.tsx` | `PublisherPicker` integrado ao `BlockWorkSection` |

## O que foi feito

Foi criado o `PublisherPicker`, com `TextInput`, filtragem case-insensitive, opção
selecionada preservada fora do resultado e mensagem de lista vazia. Os dois painéis
passaram a reutilizá-lo; os guards de seleção existentes continuam bloqueando as ações
sem publicador.

## Arquivos modificados

- `admin-app/src/presentation/screens/AssignmentPanel.tsx` — usa o seletor pesquisável e mantém o filtro de ativos.
- `admin-app/src/presentation/screens/BlockWorkSection.tsx` — usa o seletor pesquisável sem restringir a lista além do fluxo existente.
- `admin-app/src/presentation/screens/AssignmentPanel.test.tsx` — cobre busca, ausência de correspondência e confirmação da seleção.
- `admin-app/src/presentation/screens/BlocksScreen.test.tsx` — cobre os mesmos comportamentos no lançamento de trabalho.

## Arquivos criados

- `admin-app/src/presentation/screens/PublisherPicker.tsx` — componente de Presentation compartilhado pelos dois formulários.

## Decisões técnicas

O publicador escolhido é incluído novamente na lista visível quando a busca atual não
o encontra; assim, limpar ou trocar o filtro não apaga uma escolha já feita e o admin
consegue confirmar com segurança. A mensagem de ausência se baseia nos resultados da
busca, não na lista visível, para permanecer informativa mesmo quando o selecionado é
mantido na tela.

## Como validar

```sh
cd admin-app
npm test -- --runInBand
npm run typecheck
npm run lint
```

## Resultado da validação

- `npm test -- --runInBand`: 14 suítes e 276 testes passando.
- `npm run typecheck`: passou.
- `npm run lint`: passou.
- Não há script de cobertura configurado no `admin-app`; por isso não foi reportada cobertura de linha/branch.
