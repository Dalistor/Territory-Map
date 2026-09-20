# [0206] Estados ocupados e prevenção de toques duplicados nos admins

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 09

## Solicitação

Implementar estados ocupados nas ações de recarregar do admin desktop e mobile, impedindo uma
segunda leitura enquanto a primeira está pendente e restaurando o botão após sucesso ou erro.
Aplicar o mesmo princípio aos botões de escrita ainda sujeitos a toques duplicados, sem alterar
mensagens de erro ou contratos da API.

## Critérios de aceite

- Recarregar mostra `Atualizando…`, fica desabilitado e não inicia uma segunda leitura.
- O recarregar volta a `Recarregar` habilitado após sucesso e após falha.
- Escritas com janela de duplicação ficam desabilitadas durante a promise e exibem estado ocupado.
- O bloqueio vale para o desktop e para o app admin mobile.
- Mensagens de erro, contratos IPC/API e camadas de dados permanecem inalterados.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Home desktop bloqueia o segundo recarregar e restaura após sucesso | `admin/src/renderer/screens/HomeScreen.test.tsx` | Guarda síncrona e estado visual de refresh |
| 2 | Home desktop restaura o recarregar após erro | `admin/src/renderer/screens/HomeScreen.test.tsx` | `finally` libera a leitura pendente |
| 3 | Designations mobile bloqueia o segundo recarregar e cobre sucesso/erro | `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Estado `Atualizando…` e guarda de refresh |
| 4 | Writes de designação mobile não aceitam segundo toque | `admin-app/src/presentation/screens/AssignmentPanel.test.tsx`, `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` | Estado ocupado compartilhado pelos writes |
| 5 | Painéis e ações desktop mantêm os erros existentes e bloqueiam submits duplicados | testes co-localizados dos painéis | Guardas de ação nos componentes de Presentation |

## O que foi feito

Foram adicionadas guardas síncronas com `useRef` e estados visuais com `useState` nas leituras e
ações de escrita relevantes. Os botões usam `disabled` e rótulos de andamento; os estados são
liberados em `finally`, inclusive quando a operação falha. As mudanças ficaram restritas às telas
de Presentation e aos testes co-localizados.

## Arquivos modificados

- `admin/src/renderer/screens/` — estados ocupados para recarregar, designações, histórico,
  publicadores, configurações, trabalho e marcação.
- `admin-app/src/presentation/screens/` — estados ocupados para recarregar, designações e remoção
  de trabalho.
- Testes co-localizados nas telas alteradas.

## Decisões técnicas

O `ref` evita a segunda chamada mesmo antes de o React concluir o novo render; o `state` existe para
comunicar visualmente a ocupação e alimentar `disabled`/acessibilidade. A proteção foi mantida na
Presentation, sem alterar clientes HTTP, IPC ou mensagens de erro.

## Como validar

Desktop:

```text
cd admin && npm test -- --run src/renderer/screens/HomeScreen.test.tsx src/renderer/screens/DesignationsScreen.test.tsx src/renderer/screens/HistoryScreen.test.tsx src/renderer/screens/BlockWorkPanel.test.tsx src/renderer/screens/BlockHistorySheet.test.tsx src/renderer/screens/MarkWorkedForm.test.tsx
```

Mobile:

```text
cd admin-app && npm test -- --runInBand src/presentation/screens/DesignationsScreen.test.tsx src/presentation/screens/AssignmentPanel.test.tsx
```

## Resultado da validação

- Desktop: 6 arquivos e 117 testes passando.
- Mobile: 2 suítes e 49 testes passando.
- `npm run typecheck` passou em `admin` e `admin-app`.
- `npm run lint` passou em `admin` e `admin-app`, sem erros ou avisos.
- A suíte completa e cobertura não foram iniciadas nesta finalização, conforme solicitação de
  interromper suítes longas.
