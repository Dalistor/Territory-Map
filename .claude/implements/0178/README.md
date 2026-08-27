# [0178] App admin: o painel S-13 do território

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0012/` — Task 11

## Solicitação

> Spec 0012 — Task 11: Implemente por TDD `admin-app/src/presentation/screens/AssignmentPanel.tsx`
> e `AssignmentPanel.test.tsx`. Leia antes o painel de histórico dentro de
> `admin/src/renderer/screens/DesignationsScreen.tsx` — é o comportamento a espelhar, incluindo os
> textos de confirmação, que devem dizer a consequência e não só a ação.
>
> O painel recebe um `Territory`, carrega `listAssignments(territory.id)` e `listPublishers()` por
> `session.run`, e mostra: a designação **em vigor** com o nome e a data de início; abaixo, as
> anteriores em ordem decrescente (use `sortAssignments` da Task 03), cada uma com início e
> conclusão e um botão de apagar. As ações são "Designar a…" (escolher entre os publicadores),
> "Marcar como concluído" (só quando há designação aberta) e apagar registro. Toda ação destrutiva
> ou que encerra uma designação pede confirmação num `Alert` antes.

## Contexto

O app admin Android (spec 0012) precisa levar para o campo o cartão S-13 que hoje só existe na mesa,
dentro da `DesignationsScreen` do admin desktop. É a tela em que o responsável pelos territórios vê
quem está com um território, quem esteve antes, e faz as três escritas que a designação admite:
designar, concluir e apagar um registro do histórico.

O ponto delicado não é a leitura, é o texto das confirmações. As três ações mexem em registro
datado — designar por cima de uma designação aberta **encerra** a atual com a data de hoje, concluir
**tira na hora** do publicador o direito de marcar quadras, apagar **remove a linha de vez**. Um
`Alert` que só perguntasse "tem certeza?" transferiria a decisão sem transferir a informação. Os
textos foram copiados do desktop palavra por palavra, para as duas interfaces não divergirem sobre o
que acontece.

## Critérios de aceite

1. Território sem histórico mostra "Sem designação" e oferece "Designar a…", mas **não** oferece
   "Marcar como concluído".
2. Com uma designação aberta, o nome do dirigente e a data de início aparecem, e "Marcar como
   concluído" aparece.
3. As designações concluídas aparecem com as duas datas, mais recente primeiro.
4. Designar quando **já há** uma aberta avisa antes, na confirmação, que a designação atual será
   encerrada com a data de hoje; cancelar não chama a API.
5. Confirmar "Designar a…" chama `designate(territoryId, publisherId)` com o publicador escolhido e
   recarrega o cartão.
6. Confirmar "Marcar como concluído" chama `completeAssignment(territoryId)`, e a confirmação diz
   que o publicador perde na hora o acesso para marcar quadras nele.
7. Apagar um registro pede confirmação dizendo que não há como desfazer; confirmar chama
   `deleteAssignment(territoryId, assignmentId)` com o id daquela linha, e não de outra.
8. Um erro em qualquer das três ações aparece numa região acessível ao leitor de tela e **não**
   fecha o painel.
9. Uma mudança bem-sucedida avisa o chamador por callback, para a Task 10 atualizar a lista.

Três comportamentos foram acrescentados durante a execução, por serem defeito e não escolha:

10. Uma falha ao **carregar** o cartão aparece como erro, em vez de o painel exibir "Sem designação"
    — que é um fato diferente, e sobre o qual o admin agiria.
11. "Designar" só chama a API depois de um publicador ser escolhido.
12. Publicador desativado não é oferecido como opção.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | mostra "Sem designação" e oferece designar, sem oferecer concluir, num território sem histórico | `admin-app/src/presentation/screens/AssignmentPanel.test.tsx` | Carga do cartão e dos publicadores por `session.run`, seção "Designação atual" e o cabeçalho "Designar a…" |
| 2 | mostra o dirigente e a data de início da designação em vigor, e oferece concluir | idem | O botão "Marcar como concluído", condicionado à designação aberta |
| 3 | lista as designações concluídas com as duas datas, mais recente primeiro | idem | A lista do histórico, ordenada por `sortAssignments` e estreitada por `assignmentIsCompleted` |
| 4 | designa o publicador escolhido num território livre, recarrega o cartão e avisa o chamador | idem | Seletor de publicador, botão "Designar", recarga do cartão e o callback `onChanged` |
| 5 | avisa que a designação atual será encerrada com a data de hoje, e cancelar não chama a API | idem | `confirmThen` sobre `Alert.alert` e `replaceConfirmMessage` |
| 6 | confirmar a troca de dirigente designa o publicador escolhido e recarrega o cartão | idem | *(verde de imediato — é a outra metade do ciclo 5, cuja implementação já ligou o botão de confirmar)* |
| 7 | concluir avisa que o publicador perde na hora o acesso, e confirmar chama a API | idem | `requestComplete` e `completeConfirmMessage` |
| 8 | apagar um registro avisa que não há como desfazer e apaga a linha tocada, não outra | idem | Botão de apagar por linha (com `accessibilityLabel` próprio), `requestDelete` e `deleteConfirmMessage` |
| 9 | mostra o erro de designar / de concluir / de apagar numa região acessível, sem fechar o painel (3 testes) | idem | `runGuarded`, o estado `actionError` e a região `accessibilityRole="alert"` |
| 10 | mostra o erro de carregar o cartão em vez de um cartão vazio | idem | Estado `loadError`, exibido no lugar do cartão |
| 11 | só designa depois de escolher um publicador | idem | *(verde de imediato — o `disabled` do botão veio no ciclo 4)* |
| 12 | não oferece publicador desativado como opção de designação | idem | *(verde de imediato — o filtro por `isActive` veio no ciclo 1)* |
| 13 | mostra um texto genérico quando a falha não traz mensagem nenhuma | idem | O fallback de `errorMessage` |

Os ciclos 6, 11 e 12 passaram sem RED próprio: o comportamento já tinha entrado junto com o ciclo
anterior. Ficaram na suíte como cobertura de regressão, e estão marcados acima para não passarem por
ciclos que eles não foram.

## O que foi feito

Criado o componente `AssignmentPanel`, na camada Presentation do `admin-app/`. Ele recebe o
`Territory`, a `session` e o `api` por prop — nenhuma tela deste projeto conhece HTTP, e é isso que
permite testar o painel inteiro com fakes, sem rede e sem emulador.

Estrutura do que ele mostra, de cima para baixo: o título com o nome do território; a região de erro
de ação, quando há; "Designação atual" (o nome e a data de início, ou "Sem designação"); "Histórico"
(as concluídas, mais recente primeiro, cada uma com as duas datas e um "Apagar"); "Designar a…" (os
publicadores ativos como opções de escolha única) e os botões "Designar" e — só quando há designação
aberta — "Marcar como concluído".

As três escritas passam por `writeThenRefresh`: executa sob `session.run` (que renova sozinha o JWT
de 12h), relê o cartão e dispara `onChanged`. As destrutivas passam antes por `confirmThen`, que é o
`Alert.alert` com dois botões e a mensagem que diz a consequência.

## Arquivos criados

- `admin-app/src/presentation/screens/AssignmentPanel.tsx` — o painel S-13 do território
- `admin-app/src/presentation/screens/AssignmentPanel.test.tsx` — 15 testes cobrindo os 12 critérios

## Arquivos modificados

Nenhum. A task tocou só a camada Presentation de `admin-app/`, e só com arquivos novos —
`screens/index.ts` foi deliberadamente **não** alterado (ver Decisões técnicas).

## Decisões técnicas

**Designar num território livre não pergunta nada.** É o desktop copiado, e a razão é a mesma: a
confirmação existe porque designar por cima de alguém **encerra** a designação em vigor com a data
de hoje. Num território sem ninguém, não há nada a encerrar, e um diálogo ali só treinaria o admin a
clicar "sim" sem ler — o que estragaria justamente o caso em que a leitura importa.

**`Alert` em vez de um modal próprio.** É o equivalente de telefone ao `window.confirm` que o
desktop usa, pelo mesmo motivo: não existe componente de diálogo próprio neste app ainda, e o texto
— que é o ponto — chega igual. Nos testes ele é um módulo nativo espionado (`jest.spyOn(Alert,
'alert')`): "o admin tocou em sim" vira invocar o `onPress` do botão que não é o de cancelar.

**Duas regiões de erro, não uma.** `loadError` substitui o cartão; `actionError` fica **acima** dele
e o cartão continua na tela. A diferença é intencional: uma escrita que falhou não invalida o que
está sendo mostrado, e o admin precisa continuar vendo o cartão para tentar de novo — enquanto um
cartão que não carregou não tem o que mostrar, e exibi-lo vazio diria "sem designação", que é outro
fato.

**A falha de carga deixou de ser silenciosa.** A primeira versão engolia a rejeição do mount
(`.catch(() => undefined)`) e caía num cartão vazio. É o pior desfecho possível aqui: "Sem
designação" é uma informação sobre a qual o admin **age** (designa alguém), e emiti-la por falta de
rede seria a interface mentindo. Virou critério 10.

**O nome do publicador do histórico vem da linha, não do cadastro.** Nada foi feito para isso — é
como o servidor já entrega (`user_name` gravado no momento em que a linha nasce, ver "O nome na
linha, em vez da FK" no `CLAUDE.md`). Vale registrar porque explica por que o painel não precisa
cruzar `Assignment.publisher.id` com a lista de publicadores para exibir um nome, e por que uma
designação de alguém já apagado continua legível.

**`session` e `api` por prop, não por contexto nem import direto.** É o que a Arquitetura de Camadas
do `admin-app/` pede (Presentation não fala HTTP) e é o que torna os 15 testes instantâneos. As
interfaces declaradas (`AssignmentPanelApi`, `AssignmentPanelSession`) são recortes estruturais do
`ApiClient` e da `Session` reais — o painel declara só o que usa, e o objeto real satisfaz.

**`screens/index.ts` não foi tocado.** As Tasks 07, 10 e 12 estavam sendo executadas em paralelo e
todas escreveriam nesse mesmo barril; a Task 10, que consome este painel, importa direto de
`./AssignmentPanel`, que é como as telas de `app/` já se importam entre si.

**O tema não foi criado aqui, foi consumido depois que apareceu.** O `admin-app/` não tinha
`presentation/theme.ts` quando esta task começou, e criá-lo teria colidido com a Task 07, que roda
em paralelo e é quem naturalmente o traz (implements/0177). Enquanto isso o painel usou um
`StyleSheet` local com cores literais; assim que a Task 07 aterrissou, os estilos foram trocados por
`colors`/`spacing`/`radius` do tema, para não deixar uma segunda paleta no projeto. Nenhum teste
mudou nessa troca — nenhum deles depende de cor, que é exatamente o que tornou o ajuste seguro.

**O que ficou deliberadamente sem teste:** os dois `if (... === null) return` no topo de
`requestDesignate` e `requestComplete` (linhas 220 e 251, as únicas descobertas). Eles existem para
o TypeScript estreitar `string | null` e `Assignment | null`, e são inalcançáveis pela interface —
o botão "Designar" está `disabled` enquanto nada foi escolhido, e "Marcar como concluído" nem é
renderizado sem designação aberta. Os dois casos **estão** testados pelo lado observável (ciclos 11
e 1); o que não se cobre é a linha do `return`, porque não há caminho de UI que chegue nela.

## Como validar

```bash
cd admin-app
npx jest src/presentation/screens/AssignmentPanel.test.tsx
npx jest --coverage --collectCoverageFrom='src/presentation/screens/AssignmentPanel.tsx'
npx tsc --noEmit
npx eslint src/presentation/screens/AssignmentPanel.tsx src/presentation/screens/AssignmentPanel.test.tsx
```

## Resultado da validação

- `npx jest src/presentation/screens/AssignmentPanel.test.tsx` → **15 testes passando**, 1 suíte.
- Suíte inteira do `admin-app/` (`npx jest`) → **174 testes passando, 12 suítes**, nenhuma regressão.
- Cobertura de `AssignmentPanel.tsx`: **97,29% de statements, 83,33% de branch, 100% de funções,
  96,96% de linhas**. Descobertas: 220 e 251 — os dois guardas de estreitamento de tipo
  justificados acima.
- `npx eslint` nos dois arquivos desta task → **limpo**, sem erro e sem warning.
- `npx tsc --noEmit` → **sem nenhum erro nos arquivos desta task**. Os erros que o comando ainda
  reporta são de `src/presentation/screens/BlocksScreen.test.tsx` (Task 12, executada em paralelo),
  fora do escopo desta.
