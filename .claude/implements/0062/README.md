# [0062] Menu de ações da quadra como modal de verdade, e design mais moderno em Publicadores

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (CSS + markup, sem lógica nova)
**Spec:** — (pedido de design do usuário, fora de qualquer spec — sequência imediata de
`implements/0061`)

## Pedido 1 — Menu de ações da quadra como modal

O menu que aparece ao tocar numa quadra no mapa (Ver histórico / Editar contorno ou número / Apagar
quadra) era um bloco `role="menu"` anexado ao final de `<main>`, sem se destacar da página — não
parecia um modal de verdade.

**Correção:** `HomeScreen.tsx` ganhou um cabeçalho visível ("Quadra N — Território" + botão "×" com
`aria-label="Fechar"`) e classes (`block-actions-modal`, `block-action`, `block-action-danger`) sem
tocar em nenhum `role`/nome acessível existente. `index.css` estiliza `.block-actions-modal` como um
modal de verdade: `position: fixed` + `inset: 0` + `margin: auto` centraliza a caixa no viewport sem
precisar de um elemento de fundo separado, e um `box-shadow` gigante sem blur (`0 0 0 9999px
rgba(...)`) pinta o fundo escurecido — a mesma técnica aplicada a `[role='dialog']` (que passou a
valer para os diálogos existentes de Publicadores e do histórico de quadra também, de graça, por ser
uma regra de CSS única).

O botão "Fechar" antigo virou um ícone "×" no cabeçalho — mantém `aria-label="Fechar"`, então o nome
acessível não mudou.

## Pedido 2 — Design mais moderno em Publicadores

**Correção**, tudo em `PublishersScreen.tsx` + `index.css`, sem mudar nenhum texto que os testes
conferem:
- Cada linha ganhou um avatar circular com a inicial do nome (`aria-hidden`, decorativo).
- O status virou um selo colorido (`status-badge`) — verde para ativo, azul para código válido
  pendente de uso, âmbar para pendente sem código, cinza para revogado — calculado por uma função
  nova `statusCategory`, separada do texto que `statusOf` já produzia (o texto em si não mudou).
- O botão "Ações" de cada linha virou um ícone "⋮" (mantém `aria-label={\`Ações de ${nome}\`}`, nome
  acessível inalterado).
- "Cadastrar", "Gerar código" e "Copiar" ganharam a cor primária verde do app via uma classe nova
  `.button-primary` (mesmo visual que `button[type='submit']` já tinha, para botões que não estão
  dentro de um `<form>`).
- O código de acesso, no diálogo de revelação, ganhou uma caixa destacada (`access-code-display`):
  fonte monoespaçada maior, espaçamento entre letras, fundo diferenciado — mais fácil de ler em voz
  alta pro publicador.

## Por que nenhum teste quebrou

Toda mudança foi aditiva (classes CSS novas, um cabeçalho visual a mais) ou preservou o nome
acessível via `aria-label` mesmo trocando o texto/ícone visível (`Fechar`, `Ações de {nome}`). Nada
que os testes consultam — `role`, nome acessível, `data-testid`, texto de status via
`statusOf`— mudou de valor.

## Arquivos modificados

- `admin/src/renderer/screens/HomeScreen.tsx`
- `admin/src/renderer/screens/PublishersScreen.tsx`
- `admin/src/renderer/index.css`

## Como validar

```bash
cd admin
npm run lint
npm run typecheck
npm test
npm run build
env -u ELECTRON_RUN_AS_NODE npm run dev
```

## Resultado da validação

- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros.
- `npm test` — 294/294 passando, sem nenhuma mudança de teste necessária.
- `npm run build` — conclui (CSS subiu de 52.15 kB para 56.14 kB, só isso).
