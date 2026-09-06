# [0191] App admin: o toque na quadra abre o painel combinado (spec 0013, Task 06)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0013/` — Task 06

## Solicitação
Ligar o `BlockPanel` da Task 05 ao mapa, em `DesignationsScreen.tsx`: passar `onSelectBlock` ao
`AssignmentsMapView`, abrir o painel da quadra tocada com o território dono, fechar voltando ao
mapa, e recarregar os territórios quando o painel avisar que algo mudou.

## Contexto
A Task 04 fez o mapa desenhar as quadras e chamar `onSelectBlock`, e a Task 05 construiu o painel
combinado. Faltava o fio entre os dois: sem ele, o mapa avisava e ninguém escutava, e o painel
existia sem caminho até ele. Recarregar depois de uma escrita é o que faz a cor da quadra e o
dirigente do território — os dois desenhados no mapa atrás do painel — refletirem o que o admin
acabou de fazer sem sair e voltar da tela.

## Critérios de aceite
- Tocar numa quadra abre o painel daquela quadra, com número e território corretos, e não o painel
  de designação do território.
- Tocar num território fora de qualquer quadra continua abrindo o que abria antes.
- Fechar o painel da quadra volta ao mapa, com a lista de territórios ainda montada.
- Uma ação bem-sucedida no painel dispara nova carga dos territórios.
- Um erro ao recarregar aparece numa região acessível ao leitor de tela, sem fechar o painel.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | opens the panel of the block tapped on the map, with the territory that owns it | `DesignationsScreen.test.tsx` | `onSelectBlock` no mapa, `view: 'block'` + `blockId` no estado `detail`, `detailBlock`, ramo `BlockPanel` |
| 2 | opens the plain S-13 panel, not the block one, when a territory is tapped | idem | (regressão do caminho antigo; nenhum código novo) |
| 3 | comes back to the map and the list from a block panel that was open | idem | o mesmo "← Voltar" já existente passou a fechar também o painel da quadra |
| 4 | reloads the territories when something changes inside the block panel | idem | `onChanged={load}` no `BlockPanel` |
| 5 | announces a failed reload without closing the block panel | idem | `errorBanner` extraído e renderizado dentro do overlay quando ele está aberto |
| 6 | closes the panel of a block that is no longer in the reloaded territory | idem | `isDetailOpen`, que fecha o overlay quando a quadra sumiu do reload |

## O que foi feito
`DesignationsScreen` ganhou o terceiro tipo de detalhe (`'block'`), guardado por id como os outros
dois, e passou a entregar `onSelectBlock` ao mapa. O overlay que já existia hospeda o `BlockPanel`
ao lado do `AssignmentPanel` e do `BlocksScreen`, com o mesmo "← Voltar". O `DesignationsScreenApi`
passou a estender também `BlockPanelApi` (ou seja, `deleteWorkLog`), porque é esta tela que entrega
o cliente ao painel.

O banner de erro virou um elemento só, renderizado no corpo da tela **ou** dentro do overlay,
conforme o overlay esteja aberto: ele é opaco e absolutamente posicionado, então um erro anunciado
por baixo dele seria invisível justamente para quem o causou.

## Arquivos modificados
- `admin-app/src/presentation/screens/DesignationsScreen.tsx` — `onSelectBlock`, estado de detalhe
  com a quadra, ramo do `BlockPanel`, `isDetailOpen` e o banner de erro reposicionável
- `admin-app/src/presentation/screens/DesignationsScreen.test.tsx` — seis casos novos, o mock do
  mapa agora expõe as quadras, e o fake da API ganhou `deleteWorkLog`

## Decisões técnicas
- **A quadra é guardada por id, não por objeto**, pelo mesmo motivo já documentado para o
  território: a lista é recarregada a cada escrita, e guardar o objeto prenderia o painel à cópia
  anterior à mudança — que é exatamente a obsolescência que esta task existe para evitar.
- **A quadra que some do reload fecha o painel**, em vez de deixar um overlay vazio com um botão de
  voltar. Mesma regra que o território já seguia.
- **Um único elemento de alerta, movido**, em vez de dois: dois `role="alert"` deixariam a asserção
  por papel ambígua e o leitor de tela anunciaria a mesma falha duas vezes.
- **O helper `pressTerritoryPublisher` no teste** existe porque as duas metades do painel listam a
  mesma congregação, então o nome sozinho é ambíguo dentro dele; a metade do território é a de
  baixo. Os testes antigos, que abrem só o `AssignmentPanel`, continuam usando `getByRole` direto.
- **O componente do mapa continua sem teste**, como o `AGENTS.md` registra; o mock tipado com
  `AssignmentsMapViewProps` faz um rename de prop quebrar em tempo de compilação.

## Como validar
```bash
cd admin-app && npx jest src/presentation/screens/DesignationsScreen.test.tsx
```

## Resultado da validação
- `npx jest src/presentation/screens/DesignationsScreen.test.tsx` — 19 testes passando (13 antigos
  intactos, 6 novos)
- `npm test` — 251 testes, 14 suítes, todas verdes
- Cobertura de `DesignationsScreen.tsx`: 100% de linha, 100% de função, 92,3% de branch. Os quatro
  branches descobertos são todos `pressed && styles.pressed` (o estilo de toque dos `Pressable`),
  pré-existentes e sem comportamento a asseverar.
- `npx tsc --noEmit` e `npm run lint` limpos
