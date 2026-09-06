# [0192] Documentar as quadras no mapa do app admin, o painel combinado e a logo

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0013/` — Task 08

## Solicitação
Atualizar `AGENTS.md` (raiz) e `admin-app/README.md` para corrigir duas afirmações que a spec 0013
tornou falsas — que o mapa do app admin não desenha quadras, e que apagar registro de trabalho é só
no desktop — e documentar o painel combinado da quadra e a adoção da logo/ícone do produto. Sem
tocar em código.

## Contexto
As decisões 4 e 5 da spec 0012 foram revertidas de propósito pela spec 0013, e as duas estavam
escritas nos dois documentos. Ficariam descrevendo um app que não existe mais.

## O que foi feito
Antes de escrever, foram lidos os arquivos produzidos pelas Tasks 01–07:
`admin-app/src/domain/territoryMap.ts` (`BLOCK_CATEGORY_COLOR`, `blockMapFeatures`,
`shouldShowTerritoryLabels`), `presentation/map/AssignmentsMapView.tsx` (prop `onSelectBlock`,
números como `Marker` + `<Text>`), `presentation/screens/BlockPanel.tsx` (as duas seções,
`TERRITORY_SCOPE_NOTE`, reuso de `BlockWorkSection` e `AssignmentPanel`),
`DesignationsScreen.tsx` (o wiring e o `SafeAreaView`) e `SetupScreen.tsx` (a logo).

**`AGENTS.md`:**
- linha da tabela de partes: o app admin passa a listar as quadras no mapa e o apagar registro de
  trabalho;
- "O que o app admin não faz": apagar registro de trabalho saiu da lista, com um parágrafo dizendo
  por que foi ele e não os outros; desenho, gestão de publicador, `status_override`, página
  Histórico e import/export S-13/T continuam escritos como exclusivos do desktop;
- parágrafo do `admin-app/`: reescrito com o desenho das quadras (cor por status via
  `BLOCK_CATEGORY_COLOR`, `statusOverride` e `rotationDays` do território dono, número em `Marker`
  com `<Text>` e não `symbol` layer), a regra dos rótulos de território que somem — com o porquê e
  o aviso de que um refactor a derruba —, o painel combinado com a justificativa da separação, e a
  logo/ícone do produto;
- "Cor da quadra no mapa": o app admin agora mostra a categoria como cor **e** como texto;
- parágrafo de "Resolvidos": acrescentado o que a spec 0013 fechou.

**`admin-app/README.md`:**
- abertura: apagar registro de trabalho entre o que o app faz, e a nota sobre a logo/ícone comuns;
- "O que este app **não** faz": apagar registro de trabalho removido da lista, com o parágrafo do
  porquê;
- nova seção "O mapa e o painel da quadra": o desenho das quadras, o aviso destacado sobre
  `shouldShowTerritoryLabels`, a tabela das duas seções do painel e a razão da separação, mais o
  reuso de `BlockWorkSection`/`AssignmentPanel` e o callback que recarrega a `DesignationsScreen`;
- "Limitações conhecidas": o passo manual pendente passou a incluir as quadras numeradas/coloridas,
  o sumiço dos rótulos e o toque que abre o painel combinado.

## Arquivos modificados
- `AGENTS.md` — as cinco passagens acima
- `admin-app/README.md` — as quatro passagens acima

## Arquivos criados
Nenhum.

## Decisões técnicas
- **A linha 109 do `AGENTS.md` não foi tocada**: aquele "sem quadras" descreve a página Designações
  do **admin desktop**, que continua verdadeira. Só o app admin mudou.
- **A separação do painel foi documentada com o motivo, não só com o layout** — a spec pediu isso
  explicitamente, e é o que impede um refactor de fundir as duas seções por economia de espaço.
- **A regra dos rótulos ficou marcada com ⚠️ no README** e com um parágrafo próprio no `AGENTS.md`:
  é uma linha de código (`shouldShowTerritoryLabels`) cujo motivo não é óbvio olhando só para ela.

## Como validar
Ler as duas passagens revertidas e confirmar que nenhuma afirma mais que o mapa não desenha quadras
ou que apagar registro é só no desktop, e que as cinco exclusões que continuam válidas seguem
escritas nos dois arquivos.

## Resultado da validação
Task de documentação — nenhum código foi tocado, então não há teste, lint ou type-check a rodar.
Verificado por `grep` que "sem quadras" e "só acrescenta" não sobraram descrevendo o app admin em
nenhum dos dois arquivos (a única ocorrência restante é a da página Designações do desktop, correta).
Revisão manual dos dois documentos feita contra os arquivos das Tasks 01–07.
