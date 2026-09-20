# [0209] Sidebar e layout responsivo do admin

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0014/` — Task 11

## Solicitação

Ajustar a sidebar e os layouts responsivos de `admin/`, mantendo a navegação identificável,
a seção ativa, a área de saída da congregação, o layout lado a lado em telas largas e o
empilhamento em telas estreitas.

## Contexto

A sidebar com largura fixa de 230px consumia espaço demais antes que os layouts de mapa e editor
passassem para o modo empilhado.

## O que foi feito

- A sidebar passou a usar largura fluida em telas intermediárias.
- Até 760px, o shell passa a empilhar sidebar e conteúdo; os rótulos completos da navegação
  permanecem visíveis e quebram em linhas, e o botão de saída continua separado no rodapé.
- O `nav` recebeu nome acessível e o teste de apresentação foi atualizado para refletir a semântica
  atual do botão de histórico.

## Arquivos modificados

- `admin/src/renderer/App.tsx` — nome acessível para a navegação principal.
- `admin/src/renderer/index.css` — largura fluida da sidebar e breakpoint de shell responsivo.
- `admin/src/renderer/App.test.tsx` — cobertura do nome acessível e alinhamento do papel do botão.

## Decisões técnicas

Foi mantida a navegação textual existente, sem ícones ou dependências novas, para que os nomes das
seções continuem compreensíveis em telas estreitas.

## Como validar

- `cd admin && npm test -- --run src/renderer/App.test.tsx`
- `cd admin && npm run typecheck:web`
- Abrir `http://localhost:5173/` e conferir o renderer em viewport largo e estreito; a tela local
  disponível nesta máquina abriu a configuração inicial, sem credenciais salvas para chegar à
  sidebar autenticada.

## Resultado da validação

`App.test.tsx`: 24 testes passando. `typecheck:web`: passando. O renderer local abriu no navegador;
a inspeção visual da sidebar autenticada ficou bloqueada pela ausência de credenciais locais.
