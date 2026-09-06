# [0149] AGENTS.md: rotação por território e marcação de quadra pelo admin (spec 0009, Task 13)

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0009/` — Task 13

## Solicitação
"Atualize o `AGENTS.md` da raiz para refletir a spec 0009, escrevendo no mesmo tom do documento
(português, explicando o porquê e não só o quê, sem inflar)": `Territory.rotation_days`, a marcação
de quadra feita pelo admin, a cor calculada pela rotação, a `TerritorySettingsScreen` e o ajuste
dos pontos em aberto. Tocar apenas no `AGENTS.md`.

## Contexto
As doze tasks anteriores da spec 0009 mudaram o sistema — coluna nova no território, rota nova do
admin, tela nova no Electron, limiar de cor deixando de ser fixo. O `AGENTS.md` descrevia o sistema
anterior e, em três pontos, passou a mentir: falava em oito telas no admin, citava "acima de 120
dias" como se fosse regra imutável e listava como ponto em aberto um "N dias" que virou
configuração real.

## O que foi feito
- **Modelo de dados / Territory:** linha `rotation_days` na tabela de campos e um parágrafo
  explicando por que nulo é o valor correto (e não "faltando preencher"), por que a migration
  `a1c7e4f92b83` não faz backfill nem define `server_default`, e a faixa aceita (1 a 3650).
- **Regras de negócio:** subseção nova "Marcar quadra como trabalhada (pelo admin)" com
  `POST /admin/blocks/{block_id}/worked`, a escolha do publicador, o `log_id` gerado no servidor e
  as duas frouxidões deliberadas (sem checagem de designação, sem o piso de 90 dias), cada uma com
  o motivo, mais o 404 comum e o publicador inativo. Fecha dizendo que a rota do app **não** mudou.
- **Regras de negócio:** subseção nova "Cor da quadra no mapa" — três cores mantidas, limiar agora
  vindo do `rotation_days` do território, com 120 só como padrão, e o lembrete de que os dois
  `blockColor.ts` precisam continuar idênticos.
- **Estrutura do projeto:** a `TerritorySettingsScreen` descrita (nome, rotação, resumo, apagar) e
  a observação de que o desenho continua no `TerritoryEditorScreen`; "oito telas" → "nove telas",
  nos dois lugares onde a contagem aparecia (Estrutura e Como Fazer Deploy).
- **Pontos em aberto:** o item das quadras vencidas foi reescrito — o N já existe e é por
  território; o que resta em aberto é a listagem impressa da congregação inteira.

## Arquivos modificados
- `AGENTS.md` — as cinco alterações acima.

## Decisões técnicas
- A regra da cor virou **subseção própria** em "Regras de Negócio" em vez de uma frase solta: ela
  agora é uma regra com configuração, vive duplicada em dois arquivos e tem semântica de borda
  (no limiar ainda é recente) — coisas que precisam estar escritas num lugar só.
- O parágrafo de `rotation_days` insiste no "nulo não é faltando preencher" porque é exatamente a
  leitura errada que levaria alguém a escrever um backfill depois.
- A contagem de telas foi corrigida nos dois lugares, não só na Estrutura: o texto de deploy também
  enumerava as telas cobertas por teste.

## Como validar
Ler as seções alteradas do `AGENTS.md`: Estrutura do Projeto, Modelo de Dados → Territory, Regras
de Negócio (as duas subseções novas), Como Fazer Deploy e Pontos em Aberto. Conferir que nenhum
trecho ainda fala em oito telas do admin ou em limiar fixo de 120 dias como regra.

## Resultado da validação
Mudança só de documentação — não há teste, lint ou type-check aplicável. `grep` por "120" e "oito"
confirma que as menções restantes a 120 são todas ao **padrão** da rotação, e que não sobrou
nenhuma "oito telas". `git diff --stat` confirma que só o `AGENTS.md` foi tocado por esta task.
