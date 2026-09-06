# [0042] Armazenamento seguro de credenciais do admin Electron (`main/credentials-store.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 05

## Solicitação

Implementar por TDD `admin/src/main/credentials-store.ts`, portando `admin/lib/data/credentials_store.dart`
(Flutter/`flutter_secure_storage`) para Electron/`safeStorage`. Exportar um tipo `Credentials {name,
city, password}` e uma função `createCredentialsStore({ safeStorage, getFilePath, fs? })` — com as
dependências do Electron injetadas para que os testes mockem `safeStorage` e o filesystem sem subir
uma janela real — expondo `read()`, `write()` e `clear()`.

## Contexto

Spec 0003 migra o admin de Flutter desktop para Electron. O admin não tem tela de login diária: guarda
nome/cidade/senha da congregação no primeiro uso e se autentica sozinho a partir daí (o JWT dura 12h).
Isso exige guardar a senha em disco de um jeito que não seja texto puro — no Flutter isso era
`flutter_secure_storage` (DPAPI/libsecret); no Electron, a decisão já tomada na spec é usar
`safeStorage` nativo (também backed pelo keychain do SO) em vez de `keytar`, para não reintroduzir uma
dependência de módulo nativo compilado. Este módulo é a peça de `main/` que a Task 06 (sessão) e a
Task 07 (fiação IPC/`app.getPath('userData')`) vão consumir.

## Critérios de aceite

- `write` criptografa os dados com `safeStorage.encryptString` antes de gravar em disco (nunca grava
  `password` em texto puro).
- Se `safeStorage.isEncryptionAvailable()` retorna `false`, `write` lança um erro claro em vez de
  gravar em texto puro silenciosamente.
- `read` retorna `null` quando o arquivo não existe.
- `read` retorna `null` quando o arquivo existe mas está corrompido/incompleto (não é um JSON válido,
  ou falta `name`/`city`/`password`) — tudo ou nada, igual ao Dart.
- `read` retorna as `Credentials` decodificadas quando tudo está presente e válido.
- `clear` remove o arquivo/dado gravado; um `read` seguinte retorna `null`. `clear` não lança se já
  não havia nada gravado.
- Nada aqui deve nunca logar `password` (nem em uma mensagem de erro).

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `write` criptografa os dados com `encryptString` antes de gravar | `credentials-store.test.ts` | `write()` chamando `safeStorage.encryptString` e `fs.writeFile` |
| 2 | `write` lança em vez de gravar quando `isEncryptionAvailable()` é `false` | idem | checagem de `isEncryptionAvailable()` no início de `write()` |
| 3 | `read` retorna `null` quando o arquivo não existe | idem | passou trivialmente sobre o stub `read()` — ver Decisões técnicas |
| 4 | `read` retorna as credenciais decodificadas quando tudo é válido | idem | `read()` real: `fs.readFile` → `decryptString` → `JSON.parse` → validação de forma |
| 5 | `read` retorna `null` quando o conteúdo descriptografado não é JSON válido | idem | `try/catch` ao redor de `JSON.parse` |
| 6 | `read` retorna `null` quando falta um campo obrigatório (registro parcial) | idem | função `isCredentials` (type guard) |
| 7 | `clear` remove o arquivo gravado; `read` seguinte retorna `null` | idem | `clear()` chamando `fs.rm(path, { force: true })` |
| 8 | `clear` não lança quando nada havia sido gravado | idem | passou trivialmente sobre o stub `clear()` — ver Decisões técnicas |
| 9 | Ciclo write → clear → read, ponta a ponta com fs em memória | idem | validação de integração do fluxo completo |
| 10 | Nada aqui loga a senha (write, read, e um `write` que falha) | idem | invariante confirmada por spy no `console.*` — nenhuma mudança de produção necessária |
| 11 | `read` retorna `null` quando o JSON é válido mas não é objeto (ex. `null`) | idem | fecha o branch não coberto de `isCredentials` (`typeof value !== 'object'`) |

## O que foi feito

Criado `admin/src/main/credentials-store.ts` com:
- `Credentials` — tipo `{ name, city, password }`.
- `SafeStorageLike` e `CredentialsFsLike` — interfaces mínimas (subconjunto de `safeStorage` do
  Electron e de `node:fs/promises`) para permitir injeção nos testes.
- `createCredentialsStore({ safeStorage, getFilePath, fs? })` — `fs` é opcional e, quando omitido,
  usa `node:fs/promises` de verdade (import como `nodeFs`), como a task autorizou.
- `read()/write()/clear()` implementando os critérios de aceite acima.

E o teste correspondente `admin/src/main/credentials-store.test.ts`, com fakes reutilizáveis
(`fakeSafeStorage`, `fakeFs`, `inMemoryFs`, `enoentError`) extraídos no passo de refactor.

## Arquivos criados

- `admin/src/main/credentials-store.ts` — o store de credenciais.
- `admin/src/main/credentials-store.test.ts` — 11 testes cobrindo os critérios de aceite.

## Decisões técnicas

- **`fs` opcional, com default para `node:fs/promises` real.** A task deixava a critério do
  implementador; optei por injeção com fallback real (mesmo padrão que a Task 07 vai usar para ligar
  `safeStorage`/`app.getPath('userData')` reais) em vez de tornar `fs` obrigatório — assim o chamador
  de produção (Task 07) não precisa passar um wrapper fino em cima do módulo nativo.
- **Erro genérico em qualquer falha de leitura, não só `ENOENT`.** `read()` trata qualquer exceção de
  `fs.readFile` (arquivo ausente, permissão negada, etc.) como "não configurado" — mesma postura do
  Dart, que não distingue causas de leitura ausente. Falha ao ler credenciais deve levar de volta à
  tela de configuração, não derrubar o app.
- **`clear()` nunca lança.** Usa `fs.rm(path, { force: true })` (que no `node:fs/promises` real já é
  um no-op sobre caminho inexistente) e ainda envolve a chamada num `try/catch` como rede de segurança
  para fakes/erros de filesystem que não sigam esse contrato — a garantia do critério de aceite não
  pode depender de um comportamento externo específico.
- **Dois casos "passaram de primeira" contra os stubs iniciais (`read` com arquivo ausente e `clear`
  sem nada gravado).** Isso aconteceu porque a implementação inicial de `read()`/`clear()` era um
  stub que sempre retornava `null`/nunca lançava — o comportamento correto para exatamente esses dois
  casos, mas não para os demais. Não são testes falsos: continuam guardando o comportamento
  desejado (viram testes de regressão), mas quem de fato forçou a implementação real de `read()` foi
  o caso do caminho feliz (#4), e quem forçou `clear()` de verdade foi o caso #7 (remoção efetiva).
  Documentando aqui em vez de descartar os testes, como a skill pede.
- **Teste "nunca loga a senha" não mudou nenhuma linha de produção.** O módulo simplesmente nunca
  chama `console.*`; o teste existe como guarda de regressão explícita do critério de aceite, e
  também confirma que a mensagem de erro de `write()` (quando a criptografia está indisponível) não
  interpola a senha.
- **Fake de `safeStorage` nos testes usa uma "criptografia" reversível (base64 com prefixo) em vez de
  um mock que apenas registra chamadas.** Isso permite testar o ciclo completo write→read (incluindo
  o caso de JSON corrompido e o caso de JSON válido mas de forma errada) sem depender do `safeStorage`
  real do Electron, que não roda fora de uma janela.
- **Tipagem dos fakes em `vi.fn<T>()` explícito.** O Vitest 4 não infere bem o tipo de `vi.fn(fn)` sem
  o parâmetro de tipo genérico quando o objeto retornado precisa satisfazer uma interface estrutural
  (`SafeStorageLike`); sem isso o `tsc` falhava com "no match for the signature". Ajustado durante a
  validação de tipos (passo 11), não fazia diferença para o comportamento em runtime.

## Como validar

```bash
cd admin
npx vitest run src/main/credentials-store.test.ts   # só este arquivo
npm test                                             # suíte inteira do admin
npm run typecheck
npx eslint --cache src/main/credentials-store.ts src/main/credentials-store.test.ts
```

## Resultado da validação

- `npx vitest run src/main/credentials-store.test.ts`: **11 testes passando**.
- `npx vitest run src/main/credentials-store.test.ts --coverage --coverage.include='src/main/credentials-store.ts'`:
  **100% statements, 100% branches, 100% funções, 100% linhas** — nenhuma linha nem branch descoberta.
- `npm test` (suíte inteira do `admin/`, incluindo os módulos das Tasks 02/03 que rodaram em paralelo):
  **62 testes passando**, 0 falhas.
- `npm run typecheck`: limpo, sem erros.
- `npx eslint --cache src/main/credentials-store.ts src/main/credentials-store.test.ts`: limpo, 0
  erros e 0 warnings (após `prettier --write` nos dois arquivos).
