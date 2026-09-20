# [0208] Hierarquia visual do painel combinado no admin mobile

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0014/` — Task 12

## Solicitação

Melhorar a hierarquia visual de `BlockPanel.tsx`, mantendo quadra e território no mesmo painel,
com títulos persistentes, escopo explícito, ações destrutivas distintas e uma única rolagem.

## Contexto

O painel combinado reúne ações de dois escopos diferentes. A apresentação precisava deixar claro
qual área altera somente a quadra e qual altera o território inteiro, sem criar uma navegação nova
ou uma rolagem concorrente.

## O que foi feito

- A seção da quadra passou a ter cartão, cabeçalho, título de escopo e status próprios.
- A seção do território permaneceu em cartão separado, com a nota de escopo visível antes das
  ações do cartão S-13.
- Os botões de apagar receberam superfície de perigo, preservando o tratamento primário azul das
  ações de designar, concluir e marcar trabalho.
- `AssignmentPanel` continua embutido como `View` (`scrollable={false}`), deixando o `ScrollView`
  único no `BlockPanel`.
- O teste de apresentação passou a verificar o rótulo observável da seção da quadra junto do
  rótulo e da nota de escopo territorial existentes.

## Arquivos modificados

- `admin-app/src/presentation/screens/BlockPanel.tsx` — separação visual e rótulos de escopo.
- `admin-app/src/presentation/screens/BlockPanel.test.tsx` — verificação do rótulo da seção da
  quadra.
- `admin-app/src/presentation/screens/BlockWorkSection.tsx` — superfície visual de perigo para
  apagar registro de trabalho.
- `admin-app/src/presentation/screens/AssignmentPanel.tsx` — superfície visual de perigo para
  apagar designação.

## Arquivos criados

- `.centaur/implements/0208/README.md` — registro desta implementação.

## Decisões técnicas

Não foi criada uma nova tela nem uma nova camada de rolagem. A separação usa os componentes já
existentes e mantém o contrato de ações intacto; a distinção destrutiva reutiliza as cores de
perigo do tema, sem introduzir uma paleta nova.

## Como validar

```text
cd admin-app && npm test -- --runInBand
cd admin-app && npm run lint
cd admin-app && npm run typecheck
```

## Resultado da validação

- 14 suítes e 278 testes passando.
- Lint passando sem erros.
- Typecheck passando sem erros.
- `git diff --check` passando.
- O teste completo exibiu avisos preexistentes de `act()` sobreposto em `SetupScreen.test.tsx`,
  mas não falhou.
