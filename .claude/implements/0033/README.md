# [0033] Sair da congregação pela interface do admin

**Data:** 2026-08-07
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0002/` — Task 07

## Solicitação

> `Session.signOut()` existe em `admin/lib/data/session.dart` e só é chamado pelo teste. Hoje o único
> caminho de volta à `SetupScreen` é a credencial guardada ser recusada pelo servidor duas vezes
> (`main.dart`, `_Authenticated`); se o admin quiser trocar de congregação ou corrigir uma senha
> digitada errada, teria que limpar o keystore do sistema operacional na mão. Acrescente a saída
> explícita à `AppBar` da `HomeScreen`, como item de um `PopupMenuButton` (`Icons.more_vert`) e não
> como botão solto — é uma ação destrutiva e não pode ficar a um toque de distância dos botões de
> recarregar e publicadores.

## Contexto

O admin nunca vê tela de login: `SetupScreen` aparece uma vez, as credenciais vão para o
`flutter_secure_storage` e a `Session` reautentica sozinha. O efeito colateral é que **não havia
saída**. As credenciais só sumiam quando o servidor as recusava duas vezes — o que exige que a senha
mude *no servidor*. Um erro de digitação aceito na primeira execução, ou a vontade de apontar a
instalação para outra congregação, deixavam o admin preso: o remédio era abrir o
gerenciador de credenciais do Windows ou o `secret-tool` do Linux e apagar as três chaves à mão.

O `signOut()` já fazia a coisa certa (limpa o store, zera o token e a congregação em memória). Faltava
alguém chamá-lo.

## Critérios de aceite

1. A `AppBar` da `HomeScreen` oferece "Sair da congregação" — **atrás de um menu**, não como botão
   solto ao lado de "Recarregar".
2. Escolher a opção abre um diálogo que diz que os dados são apagados **deste computador**, que
   **nada é removido do servidor**, e que o nome, a cidade e a senha terão de ser digitados de novo.
3. Confirmar chama `Session.signOut()`, invalida `isConfiguredProvider`, e a `SetupScreen` volta a
   ser exibida.
4. Cancelar não chama `signOut` e mantém a `HomeScreen` — as credenciais continuam guardadas.
5. Depois de sair, o `CredentialsStore` está vazio (`read()` devolve `null`).
6. A senha não aparece em nenhuma mensagem da interface, em nenhum passo do fluxo.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `the way out is in the app bar menu, not one tap away from the reload button` | `admin/test/sign_out_test.dart` | `PopupMenuButton<String>` com `Icons.more_vert` na `AppBar`, item "Sair da congregação" |
| 2 | `the dialog says the data goes from this computer, not from the server` | idem | `_signOut` abre o `AlertDialog` de confirmação com o texto completo |
| 3 | `confirming forgets the credentials and lands back on setup` | idem | `await ref.read(sessionProvider).signOut()` + `ref.invalidate(isConfiguredProvider)` |
| 4 | `cancelling keeps the admin where they were` | idem | guarda `if (confirmed != true) return;` |
| 5 | `no step of leaving puts the password on screen` | idem | nenhum — é teste de regressão sobre a superfície do fluxo |

**Honestidade sobre o ciclo 2:** ao implementar o diálogo eu escrevi junto a chamada de `signOut`,
que só o ciclo 3 exigia. Em vez de deixar o ciclo 3 nascer verde, revertei o corpo do confirm e
rodei o teste 3 contra a implementação incompleta — ele falhou em `signOutCalls: Actual <0>`, e só
então a chamada voltou. O mesmo foi feito no ciclo 4: a guarda `if (confirmed != true) return;` foi
removida de propósito para provar que o teste de cancelamento morde (`Actual <1>`), e restaurada em
seguida. Um teste que nunca foi visto vermelho não prova nada.

**O ciclo 5 nunca foi vermelho, e isso é intencional.** É um teste de guarda: para vê-lo falhar eu
teria que vazar a senha na tela de propósito. Ele existe para que uma mudança futura no diálogo (por
exemplo, "sair da congregação *Oeste* de *Cambé*" ganhando mais contexto) não arraste a credencial
junto.

## O que foi feito

Na `AppBar` da `HomeScreen`, depois dos botões de publicadores e recarregar, entrou um
`PopupMenuButton<String>` (`Icons.more_vert`, tooltip "Mais opções") com um único item, "Sair da
congregação". A escolha chama o novo `_signOut`, que pede confirmação e, no sim, chama
`Session.signOut()` e invalida `isConfiguredProvider` — o que faz o `_Root` de `main.dart` reavaliar
`isConfigured`, agora falso, e renderizar a `SetupScreen`.

O texto do diálogo é o produto de verdade aqui:

> Os dados da congregação guardados neste computador serão apagados. Nada é removido do servidor: os
> territórios, as quadras e o histórico de trabalho continuam lá.
>
> Para voltar a usar neste computador, o nome, a cidade e a senha terão de ser digitados de novo.

## Arquivos modificados

- `admin/lib/presentation/home_screen.dart` — `PopupMenuButton` na `AppBar` e o método `_signOut`

## Arquivos criados

- `admin/test/sign_out_test.dart` — os cinco testes de widget do fluxo de saída

## Decisões técnicas

**Menu em vez de botão, como a task pediu — e o teste afirma as duas metades.** O primeiro caso não
verifica só que "Sair da congregação" existe: verifica primeiro que ele **não** está visível na
`AppBar` e só aparece depois de abrir o menu. Sem essa primeira asserção, o teste continuaria verde
se alguém promovesse a saída a `IconButton` ao lado de "Recarregar", que é exatamente o que a task
proíbe.

**O teste monta o app inteiro (`TerritoryAdminApp`), não a `HomeScreen` isolada.** O critério 3 exige
que a `SetupScreen` volte, e essa decisão é do `_Root` em `main.dart` — que é privado. Montar só a
`HomeScreen` deixaria "invalidou o provider" como asserção sobre implementação, não sobre
comportamento. Com o app inteiro, a prova é a que o admin vê: a tela mudou. `main.dart` não foi
tocado; `TerritoryAdminApp` já era público.

**A `Session` do teste é a de verdade, sobre um `InMemoryCredentialsStore`.** Um fake de `Session`
provaria que o botão chama um método, e nada sobre credenciais. Com a `Session` real, o critério 5
(`read()` devolve `null`) é observado de fato, e é a mesma implementação que roda em produção.
O `SpySession` apenas conta as chamadas e delega para `super.signOut()` — ele não substitui
comportamento nenhum.

**O `TerritoryMapApi` do teste responde 500 a tudo, de propósito.** Nada neste fluxo faz rede:
`signOut` só limpa o store e zera o token. Se alguma mudança futura passar a chamar o servidor aqui,
o teste quebra alto em vez de passar silenciosamente contra um fake permissivo.

**A lista de territórios do teste é vazia.** Com ela, a `HomeScreen` renderiza `_Empty` em vez de
`TerritoryMap`, e nenhum `FlutterMap` (que precisa de tamanho finito e de um servidor de tiles) entra
no caminho. De quebra, `_TerritoryList` não gera os seus próprios `PopupMenuButton` — cujo ícone
padrão também é `more_vert` —, então `find.byIcon(Icons.more_vert)` é inequívoco.

**Não há tratamento de `ApiException` no `_signOut`, e é deliberado.** Diferente de apagar quadra ou
território, sair não fala com o servidor: `signOut()` mexe só no keystore e em campos de memória.
Um `try/catch` ali seria código morto pedindo um teste que não pode existir. Se um dia o keystore
falhar ao limpar, o lugar de tratar isso é a camada `data/`, que esta task não podia tocar.

## Como validar

```bash
cd admin && flutter test test/sign_out_test.dart
```

Suíte completa e portões do CI:

```bash
cd admin && dart format lib test && flutter analyze && flutter test
```

## Resultado da validação

- `flutter test test/sign_out_test.dart` → **5 testes passando**
- `flutter test` (suíte do admin) → **56 testes passando**, nenhuma regressão
- `flutter analyze` → `No issues found!`
- `dart format lib test` → 22 arquivos, 1 reformatado (o teste novo), nada pendente
- Cobertura (`flutter test --coverage`) de `admin/lib/presentation/home_screen.dart`: as linhas
  novas — o `PopupMenuButton` (45–57) e o `_signOut` inteiro (111–140) — estão **100% cobertas**,
  incluindo os dois ramos da guarda `confirmed != true` (ciclos 3 e 4). O arquivo inteiro está em
  74/156 linhas; o descoberto é `_editTerritory`, `_deleteTerritory`, `_TerritoryList` e `_Failure`,
  fora do escopo desta task e alvo da Task 09 da mesma spec.
