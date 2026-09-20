# [0220] Navegação primária do admin Android

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 14

## Solicitação

Adicionar a navegação primária do admin Android com React Navigation 7: tabs inferiores para
Territórios, Publicadores e Histórico, mantendo uma stack nativa para detalhes e a confirmação de
saída da congregação.

## Contexto

O admin de campo tinha uma única tela de designações. A reformulação aprovada separa as consultas
principais em destinos persistentes e deixa detalhes como navegação empilhada, sem alterar a
fronteira de sessão ou a API dinâmica existente.

## O que foi feito

- Instalado o navegador de tabs inferiores do React Navigation 7.
- Transformada a home autenticada em tabs Territórios, Publicadores e Histórico; Territórios segue
  renderizando a tela de designações já existente.
- Mantida a stack nativa acima das tabs, com rota preparada para detalhe de território.
- Aplicados tokens de `presentation/theme.ts` ao tema, header e barra inferior; a barra respeita
  teclado e o `SafeAreaProvider` existente continua envolvendo toda a navegação.
- Mantida a saída no header de cada destino, com a mesma confirmação e sem mudar a sessão.
- Coberta a troca entre os três destinos pelo teste de integração do App.

## Arquivos modificados

- `admin-app/package.json` — adiciona `@react-navigation/bottom-tabs`.
- `admin-app/package-lock.json` — fixa a árvore de dependências da navegação.
- `admin-app/src/presentation/App.tsx` — tabs primárias, stack de detalhe e tema de navegação.
- `admin-app/src/presentation/App.test.tsx` — verifica as rotas primárias e preservação da sessão.

## Arquivos criados

- Nenhum arquivo produtivo novo.

## Decisões técnicas

As abas Publicadores e Histórico ficam como superfícies mínimas até as Tasks 18 e 19 entregarem
suas consultas. Isso deixa os destinos e a stack estáveis desde já, sem antecipar lógica de tela ou
duplicar o contrato de dados.

## Como validar

No diretório `admin-app/`, execute:

```text
npm run typecheck
npm test -- --runInBand App.test.tsx
npx eslint src/presentation/App.tsx src/presentation/App.test.tsx
```

Em aparelho Android, configure o app, alterne entre as três abas, abra um detalhe quando a tela
Territórios passar a oferecê-lo e confirme que o back físico retorna à aba anterior sem sair do app.

## Resultado da validação

- `npm test -- --runInBand App.test.tsx` — 16 testes passaram.
- `npx eslint src/presentation/App.tsx src/presentation/App.test.tsx` — sem erros.
- `npm run typecheck` foi executado, mas a verificação completa está bloqueada por erros de tipos
  já presentes nos componentes paralelos da Task 15 (`QueryControls.tsx` e seu teste), fora deste
  escopo. Antes deles, o typecheck desta alteração passou; a suíte focal e o lint permanecem verdes.
- `npm ls @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack --depth=0`
  confirmou as dependências instaladas.
