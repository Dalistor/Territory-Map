# [0177] App admin: a tela de configuração inicial (`SetupScreen`)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0012/` — Task 07

## Solicitação

> Spec 0012 — Task 07: Implemente por TDD `admin-app/src/presentation/screens/SetupScreen.tsx` e
> `SetupScreen.test.tsx`. Leia antes `admin/src/renderer/screens/SetupScreen.tsx` (o comportamento a
> espelhar) e `app/src/presentation/screens/ActivationScreen.tsx` (as convenções de tela React
> Native deste monorepo: componentes RN, `StyleSheet`, o tema em `theme.ts`, teste com
> `@testing-library/react-native`).
>
> A tela tem três campos — **Nome da congregação**, **Cidade** e **Senha** (esta com
> `secureTextEntry`) — e um botão de confirmar. Ao confirmar, chama `session.configure` (recebida por
> prop, para o teste injetar um fake) e avisa o chamador pelo callback `onConfigured` com a
> congregação devolvida. Escreva no rodapé, em uma linha, que os dados ficam guardados só neste
> aparelho e que o app não vai pedir login de novo.

## Contexto

É a única tela do app admin em que alguém digita credencial, e só na primeira abertura. Depois dela
a `data/session.ts` (implements/0176) entra sozinha a cada requisição, lendo do keystore o que esta
tela gravou — é o "nunca mais pedir login" prometido no objetivo da spec 0012.

Espelha `admin/src/renderer/screens/SetupScreen.tsx` do desktop em comportamento, não em código: lá
o componente fala com `window.api.session.configure` por IPC e não navega; aqui a `session` chega
por prop e o sucesso sai por `onConfigured`, porque é a Task 08 que decide o que vem depois.

## Critérios de aceite

- Os três campos e o botão aparecem na tela.
- O botão fica desabilitado enquanto qualquer um dos três campos estiver vazio.
- Confirmar chama `configure` uma vez com exatamente `{name, city, password}` digitados.
- Enquanto a chamada está pendente, o botão fica desabilitado e um indicador de carregando aparece —
  tocar duas vezes não dispara dois logins.
- Sucesso chama `onConfigured` com a congregação devolvida.
- Credencial recusada mostra a mensagem de erro numa região acessível ao leitor de tela, e a tela
  continua na configuração, com os campos preservados para correção.
- Falha de rede mostra a mensagem do erro, distinta da de credencial recusada.
- A senha digitada não aparece em nenhum lugar da árvore renderizada além do próprio campo, e o campo
  usa `secureTextEntry`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | mostra os três campos e o botão | `admin-app/src/presentation/screens/SetupScreen.test.tsx` | `SetupScreen.tsx` (estrutura da tela) e `presentation/theme.ts` |
| 2 | botão desabilitado com qualquer campo vazio (4 casos) + habilitado com os três preenchidos | idem | `incomplete` (trim em nome/cidade, senha crua) e `disabled` no `Pressable` |
| 3 | confirmar chama `configure` uma vez com o que foi digitado | idem | `handleConfirm` chamando `session.configure` |
| 4 | trima nome e cidade, e manda a senha exatamente como digitada | idem | `name.trim()`/`city.trim()` no payload (o trim foi removido de propósito para ver o vermelho) |
| 5 | sucesso chama `onConfigured` com a congregação devolvida | idem | `onConfigured(congregation)` |
| 6 | pendente: indicador de carregando, botão travado, dois toques = um login | idem | estado `busy` + `ActivityIndicator`, e o guarda por `useRef` |
| 7 | credencial recusada: alerta acessível, campos preservados, sem navegar | idem | `try/catch`, `errorMessage`, `messageFor` e o `Text accessibilityRole="alert"` |
| 8 | falha de rede mostra a mensagem própria, distinta da de credencial | idem | (ramo `error instanceof Error` do `messageFor`, escrito no ciclo 7) |
| 9 | rodapé diz que os dados ficam só neste aparelho e que não pedirá login de novo | idem | a linha do rodapé |
| 10 | senha mascarada e ausente do resto da árvore | idem | (garante o `secureTextEntry` do ciclo 1 — teste de regressão) |
| 11 | erro não-401 mostra a explicação do servidor; rejeição sem mensagem cai no texto genérico | idem | (fecha os ramos de `messageFor` que a cobertura apontou) |

Os ciclos 8, 10 e 11 passaram sem código novo: são ramos escritos no ciclo 7 (8 e 11) e no ciclo 1
(10). Estão na suíte como guarda — o 10 em particular é o que quebra se alguém um dia ecoar a senha
numa mensagem de erro.

## O que foi feito

- `SetupScreen` renderiza os três campos rotulados, o botão "Confirmar", um alerta de erro
  condicional e a linha do rodapé. `session.configure` chega por prop (`Pick<Session, 'configure'>`,
  para o chamador poder passar a sessão inteira) e o sucesso sai por `onConfigured`.
- Erros são traduzidos por `messageFor`: 401 vira uma mensagem que diz o que fazer, qualquer outro
  `ApiError` mostra o que o servidor explicou, `NetworkError` (e qualquer `Error` com mensagem)
  mostra a própria, e o resto cai num texto genérico.
- `presentation/theme.ts` foi criado com os mesmos valores de `app/src/presentation/theme.ts` — é a
  convenção de estilo que a task manda seguir, e o app admin convive no mesmo aparelho que o do
  publicador.
- `presentation/screens/index.ts` passou a exportar `SetupScreen`.

## Arquivos modificados

- `admin-app/src/presentation/screens/index.ts` — exporta `SetupScreen` e `SetupScreenProps`

## Arquivos criados

- `admin-app/src/presentation/screens/SetupScreen.tsx` — a tela de configuração inicial
- `admin-app/src/presentation/screens/SetupScreen.test.tsx` — 17 testes
- `admin-app/src/presentation/theme.ts` — paleta, espaçamentos, raios e sombras do app admin

## Decisões técnicas

**A `session` vem por prop, e a tela não navega.** Mesma divisão do desktop: quem sabe para onde ir
depois da configuração é o `App.tsx` (Task 08). Isso é também o que torna a tela testável sem
`NavigationContainer`, sem keystore e sem `fetch` — o único colaborador é um `jest.fn()`.

**O tipo da prop é `Pick<Session, 'configure'>`, não a função solta.** Ler `session.configure` no
chamador e passar a função desacoplada convidaria a um `this` perdido no futuro; passar o objeto
inteiro mantém a chamada igual à da task e não custa nada ao teste.

**A tela importa a classe `ApiError` de `data/`, e só ela.** É a única forma de distinguir "o
servidor recusou" de "o servidor não respondeu" — e é a distinção que dois dos critérios de aceite
pedem. Nenhuma chamada HTTP acontece aqui; quem fala com a rede é a `session`. A `session.ts` faz o
mesmo import pelo mesmo motivo.

**Nome e cidade vão trimados; a senha, não.** Espaço em volta nunca é significativo num nome ou numa
cidade, e um campo só com espaços é um campo vazio (é o que desabilita o botão). A senha é uma
sequência de bytes secreta: trimar autenticaria contra algo diferente do que foi digitado, e o
servidor não trima. É a mesma escolha, com o mesmo comentário, do `SetupScreen` do desktop.

**O guarda de duplo toque é um `useRef`, além do `disabled`.** O `disabled` só existe depois do
re-render, e dois toques podem alcançar o handler antes disso — o teste do ciclo 6 provou: sem o
ref, `configure` era chamada duas vezes. O ref é escrito antes do primeiro `await`, então não há
janela entre checar e marcar.

**A mensagem de 401 é da tela, não do servidor.** O servidor responde a nome errado, cidade errada e
senha errada com o mesmo "credenciais inválidas" de propósito (CLAUDE.md, "Login (admin)"); repetir
isso deixaria o admin adivinhando qual dos três corrigir. A tela diz o que fazer, sem inventar qual
campo falhou.

**Os campos não são limpos depois de uma recusa.** Normalmente só um dos três está errado, e limpar
o formulário obrigaria a digitar os outros dois de novo.

**Sobre o `act()` no teste do estado pendente.** Simular dois toques enquanto a promessa ainda está
aberta faz o React logar "overlapping act() calls" — é inerente ao que o teste reproduz, e o comentário
no arquivo explica. O que **não** é opcional é resolver o deferred no fim do teste: um escopo de
`act` deixado aberto sobrevive ao teste e faz o `render` do teste seguinte não montar nada (aconteceu,
e foi assim que o teste de credencial recusada falhou só na suíte completa).

**`KeyboardAvoidingView` sem `behavior`.** `app/` usa `Platform.OS === 'ios' ? 'padding' : undefined`,
mas o `admin-app/` é Android apenas por decisão da spec (não existe pasta `ios/`), então o ramo de
iOS seria código morto e um branch impossível de cobrir.

**O que ficou sem teste, de propósito:** o único branch descoberto é o estilo de `pressed` do botão
(`pressed && !blocked && styles.buttonPressed`) — é aparência, não comportamento.

## Como validar

```bash
cd admin-app && npx jest src/presentation/screens/SetupScreen.test.tsx
cd admin-app && npm test          # suíte inteira
cd admin-app && npx tsc --noEmit && npm run lint
```

## Resultado da validação

- `npx jest src/presentation/screens/SetupScreen.test.tsx` → **17 testes passando**.
- `npm test` (suíte inteira do `admin-app/`) → **12 suítes, 174 testes passando**.
- Cobertura de `src/presentation/screens/SetupScreen.tsx`: **100% statements, 100% lines, 100%
  functions, 92,3% branches** (o único branch descoberto é o estilo de `pressed`).
  `src/presentation/theme.ts`: 100% em tudo.
- `npx tsc --noEmit` e `npx eslint` limpos nos arquivos desta task.
