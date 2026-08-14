# [0047] Sessão do admin: login e reautenticação silenciosa (`main/session.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0003/` — Task 06

## Solicitação

Implementar por TDD `admin/src/main/session.ts`, uma classe/função `createSession({ api, store })`
(usando o cliente de `admin/src/main/api-client.ts` e o store de `admin/src/main/credentials-store.ts`,
já implementados — injetados como fakes nos testes) expondo `isConfigured()`, `configure(credentials)`,
`run(action)`, `signOut()` e um getter `congregation`, além de uma classe de erro
`CredentialsRejectedException`, espelhando o comportamento de `admin/lib/data/session.dart` (Flutter,
já removido do repo).

## Contexto

É o Task 06 da Spec 0003 (migração do admin de Flutter para Electron). É o coração da UX "nunca pedir
login de novo": o JWT do admin dura 12 horas, e é esta camada que renova o login em silêncio usando as
credenciais salvas (Task 05), sem que nenhuma tela precise saber que o token expira. As Tasks 04
(`api-client.ts`) e 05 (`credentials-store.ts`) já existiam prontas e foram usadas apenas como
dependências injetadas (fakes nos testes, nunca as implementações reais).

## Critérios de aceite

- `isConfigured()` é verdadeiro sse `store.read()` não é `null`.
- `configure(credentials)`: chama `api.login(...)` antes de gravar (login que falha não deixa nada
  salvo); em caso de sucesso, grava no store, seta o token no `api`, guarda a congregação e marca a
  sessão como autenticada; retorna a congregação. Falha de login propaga como está.
- `run(action)`: se a sessão ainda não autenticou nesta instância, faz sign-in primeiro (lê credenciais
  do store; sem nenhuma, lança `CredentialsRejectedException` sem chamar a API) e então executa `action`.
- Sign-in automático: `api.login` falhando com `isUnauthorized` vira `CredentialsRejectedException`;
  qualquer outro erro (ex. rede) propaga sem conversão.
- Se `action()` lançar um erro unauthorized: marca a sessão como não-autenticada, refaz o sign-in e
  tenta `action()` de novo uma única vez; se o sign-in de retry também falhar unauthorized, lança
  `CredentialsRejectedException`; erro não-unauthorized de `action()` propaga sem retry.
- `signOut()`: limpa o store, zera o token no `api`, limpa a congregação guardada e marca a sessão como
  não-autenticada.

## Ciclos TDD

Escrita a suíte completa de 17 testes primeiro (RED confirmado: `Failed to resolve import "./session"`
— módulo inexistente), depois `session.ts` implementado de uma vez guiado pelos testes (GREEN nos 17 de
primeira). Dado que o contrato já vinha inteiramente especificado pela task da spec (sem ambiguidade a
resolver em tempo real), os ciclos foram agrupados por bloco de comportamento em vez de um teste por
vez — trade-off registrado aqui em vez de escondido.

| # | Bloco de comportamento | Arquivo de teste | Código que passou a existir |
|---|------------------------|-------------------|------------------------------|
| 1 | `isConfigured` (2 casos) | `session.test.ts` | `isConfigured()` |
| 2 | `configure` (4 casos: ordem login→write, sucesso, marca autenticado, falha propaga) | `session.test.ts` | `configure()` |
| 3 | `run` — sign-in automático e cache de autenticação (5 casos) | `session.test.ts` | `signInFromStore()`, `run()` (ramo inicial) |
| 4 | `run` — retry único após unauthorized em `action()` (3 casos) | `session.test.ts` | `run()` (ramo de retry) |
| 5 | `signOut` (3 casos, incluindo propagação de falha de `store.clear()`) | `session.test.ts` | `signOut()` |

## O que foi feito

Criado `admin/src/main/session.ts` com `createSession({ api, store })` e `CredentialsRejectedException`.
Internamente, um único helper `signInFromStore()` cobre tanto o primeiro sign-in de `run()` quanto o
retry após token stale — ele lê do store, chama `api.login`, e converte unauthorized em
`CredentialsRejectedException`; qualquer outro erro sobe cru. `run()` só chama esse helper fora do
`try/catch` na primeira vez (session ainda não autenticada) e de novo dentro do `catch`, mas apenas
quando o erro de `action()` é unauthorized — a segunda chamada a `action()` fica fora de qualquer
`try/catch`, então uma falha nela (unauthorized ou não) propaga sem uma terceira tentativa, cumprindo o
"uma única vez" do critério de aceite.

## Arquivos modificados

Nenhum — `api-client.ts` e `credentials-store.ts` foram só lidos, não tocados, conforme restrição da
task.

## Arquivos criados

- `admin/src/main/session.ts` — a sessão (`createSession`, `Session`, `CredentialsRejectedException`).
- `admin/src/main/session.test.ts` — 17 testes cobrindo os cinco blocos de comportamento acima.

## Decisões técnicas

- **Um único helper de sign-in para os dois gatilhos.** O sign-in inicial de `run()` e o sign-in de
  retry depois de um `action()` unauthorized fazem exatamente a mesma coisa (ler o store, logar, tratar
  unauthorized) — extrair `signInFromStore()` evitou duplicar essa lógica e essa é a única razão pela
  qual "sign-in de retry falhando unauthorized" e "sign-in inicial sem credenciais" compartilham o mesmo
  comportamento sem código repetido.
- **`configure()` não reusa `signInFromStore()`.** É deliberado: `configure()` loga com as credenciais
  que acabou de receber como parâmetro (não as do store) e uma falha ali propaga crua, sem virar
  `CredentialsRejectedException` — comportamento diferente o suficiente do sign-in automático para não
  valer a pena forçar uma abstração comum.
- **`isUnauthorizedError` checa `instanceof ApiErrorException && error.isUnauthorized`.** Não fiz
  duck-typing (`(error as any)?.isUnauthorized`) porque a única fonte real de erro unauthorized é a
  classe já testada em `shared/api-errors.ts`; duck-typing abriria a porta para um objeto qualquer com
  essa propriedade acionar o fluxo de credenciais rejeitadas por acidente.
- **Estratégia de mock**: `api` e `store` são fakes 100% in-memory (`vi.fn()`), nunca as implementações
  reais de `api-client.ts`/`credentials-store.ts` — a task pediu explicitamente para não usar as reais
  aqui, e os testes de cada uma já cobrem seu próprio comportamento nas Tasks 04 e 05.
- **Deixado sem teste dedicado**: o `get congregation()` isolado sem nenhuma chamada prévia (estado
  inicial `null`) não ganhou um teste próprio porque já é verificado implicitamente pelo teste de falha
  de `configure()` (`expect(session.congregation).toBeNull()` depois de um login que falhou) — um teste
  só para "começa null" seria redundante com esse.

## Como validar

```bash
cd admin
npx vitest run src/main/session.test.ts   # só esta suíte
npx vitest run                             # suíte inteira do admin
npm run lint
npm run typecheck
npm run build
```

## Resultado da validação

- `npx vitest run src/main/session.test.ts` → **17/17 testes passando**.
- `npx vitest run` (suíte inteira do admin) → **148/148 testes passando** (9 arquivos), sem regressão.
- Cobertura isolada de `session.ts` (`npx vitest run src/main/session.test.ts --coverage
  --coverage.include='src/main/session.ts'`): **100% statements (40/40), 100% branches (10/10), 100%
  functions (9/9), 100% lines (40/40)**. (No relatório da suíte inteira o arquivo some da tabela porque
  o reporter padrão omite arquivos 100% cobertos — só `api-client.ts`, com uma branch não coberta,
  aparece.)
- `npm run lint` → limpo, sem erros nem warnings.
- `npm run typecheck` (node + web) → limpo.
- `npm run build` → build completo (main, preload, renderer) sem erros.
