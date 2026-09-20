# Contrato de UX — consultas administrativas

**Escopo:** admin Electron e app admin Android da congregação.

Este contrato traduz a composição aprovada em comportamento. Ele é a fonte comum para as telas de
consulta da spec 0015; não substitui as fronteiras funcionais de `AGENTS.md` nem cria capacidades
que não existam no produto.

## Estrutura por superfície

### Desktop

`Territórios`, `Publicadores` e `Histórico completo` são destinos primários na sidebar. A área de
consulta tem controles acima da lista/tabela e um detalhe contextual persistente à direita quando
há uma linha selecionada. Em largura estreita, o detalhe passa a uma camada empilhada, sem ocultar
campos ou tornar a tabela uma sequência de cartões ambíguos.

Em `Territórios`, Lista e Mapa são modos da mesma consulta: a mesma seleção, busca, filtro e
posição pertencem aos dois modos. O mapa continua um workbench interativo — geometrias, rótulos e
controles são desenhados pelo mapa, não são uma imagem do comp. Editores mantêm o layout lado a
lado já existente.

### Android

As tabs inferiores são `Territórios`, `Publicadores` e `Histórico`. Cada tab é uma consulta com
lista densa; tocar um item abre seu detalhe no native stack. Voltar restaura a tab, busca, filtros,
seleção e posição anteriores. A tab `Territórios` alterna `Lista` e `Mapa` sem reinicializar seu
estado.

`Publicadores` no Android é somente leitura. Cadastro, renomeação, códigos, ativação, desativação
e exclusão continuam exclusivamente no desktop.

## Navegação e estado persistente

- A seção ativa deve ser inequívoca na sidebar ou tab bar, por texto e por estado visual; cor
  isolada nunca é o único sinal.
- A consulta conserva busca, filtros, página, modo de visualização, seleção e posição enquanto o
  usuário abre um detalhe, conclui uma ação contextual ou alterna Lista/Mapa.
- Uma seleção que deixa de existir após atualização, exclusão ou mudança de escopo fecha o detalhe
  e devolve foco à linha/controle que a originou. Nunca exiba detalhes obsoletos.
- `Escape` fecha primeiro o painel/modal mais alto no desktop; no Android o back físico fecha o
  detalhe antes de sair da tab. Nenhum dos dois descarta uma edição sem a confirmação já prevista.
- Fechar um painel por botão, Escape ou back devolve foco ao item de origem no desktop; no Android,
  devolve o foco lógico e a posição da lista que o abriu.

## Consultas, busca, filtros e paginação

- `Territórios` é a consulta de território: território, dirigente atual, retirada, situação,
  quadras e último trabalho; seu detalhe reúne visão geral, designações, quadras e mapa.
- `Publicadores` mostra por pessoa o **Histórico de territórios**: território, retirada, devolução
  ou `Em andamento`. Não chamar logs de quadra de “saída de campo”.
- `Histórico completo` mostra Território, Publicador, Retirada, Devolução e Situação. O intervalo
  inclui toda designação que se sobreponha ao período selecionado; a tela não reimplementa a regra
  no cliente.
- Toda busca possui rótulo acessível, placeholder específico do contexto e botão `Limpar`. Limpar
  remove o termo, retorna à primeira página da consulta remota quando aplicável e devolve foco ao
  campo.
- Filtros de data têm rótulos visíveis `De` e `Até`, exibem a data local escolhida e podem ser
  limpos em uma ação explícita. Primeiro dia = início local; último dia = início local do dia
  seguinte, enviados como ISO-8601. Datas inválidas não fazem consulta e explicam como corrigir.
- Histórico remoto pagina no servidor. A interface informa faixa e total quando disponíveis,
  desabilita `Anterior`/`Próxima` nos limites e volta à página 1 ao alterar ou limpar filtros.
  Uma resposta antiga nunca substitui a consulta mais recente.
- Ordenação local, quando existir, é apenas da página carregada e deve ser declarada; não sugerir
  que ordena o histórico inteiro. A ordem padrão vem do servidor.

## Estados assíncronos e recuperação

As áreas de lista/tabela e detalhe preservam sua geometria durante carregamento para evitar saltos.
Cada estado usa texto e, quando apropriado, ícone além de cor.

| Estado | Contrato |
| --- | --- |
| `loading` / `busy` | Mantém cabeçalho, filtros e espaço principal; ações conflitantes ficam indisponíveis e anunciam processamento. |
| `empty` | Não há dados naquela coleção; explica o que ela representa e oferece ação contextual segura, quando houver. |
| `no-results` | Há dados, mas a busca/filtro atual não encontrou itens; mostra os critérios e oferece `Limpar filtros` ou `Limpar busca`. |
| `error` | Preserva busca, filtros e dados anteriores estáveis; descreve a falha sem expor detalhes técnicos e oferece `Tentar novamente`. |
| `refresh` | Atualiza sem apagar seleção válida nem reposicionar a lista; quando a seleção some, aplica a regra de retorno acima. |

## Ações e consequências

- Ação primária descreve resultado: `Designar publicador`, `Marcar como concluído`, `Marcar como
  trabalhada`, `Salvar`, `Tentar novamente`. Evitar `Enviar`, `OK` ou ação apenas por ícone quando
  há espaço para texto.
- Exclusões e outras ações destrutivas mantêm as confirmações e textos de consequência já definidos
  em `AGENTS.md`; a confirmação nomeia o alvo e deixa clara a perda de dados associada.
- Ações do território e da quadra permanecem visual e semanticamente separadas. Designar muda o
  responsável pelo território inteiro; marcar trabalho atua somente na quadra.
- Após escrita bem-sucedida, a linha e o detalhe são reconciliados a partir dos dados atualizados;
  feedback de sucesso é curto, não bloqueia leitura e não substitui mudança visível no conteúdo.

## Vocabulário canônico

Usar sempre: `Territórios`, `Publicadores`, `Histórico completo`, `Histórico de territórios`,
`Retirada`, `Devolução`, `Em andamento`, `Quadras`, `Último trabalho`, `Dirigente atual`,
`Designações`, `Lista`, `Mapa`, `Buscar`, `Limpar`, `Filtros`, `Tentar novamente`.

`Retirada` é o início de uma designação e `Devolução` é sua conclusão. `Em andamento` substitui
uma data de devolução ausente. `Publicador` identifica a pessoa; o nome histórico é a fotografia
gravada na designação e continua legível mesmo se ela não existir mais no cadastro.

## Acessibilidade e adaptação

- Meta mínima: WCAG 2.2 AA. Contraste de texto, foco e bordas atende AA no tema claro; estados de
  domínio não dependem apenas de vermelho, verde ou laranja.
- Controles operáveis por teclado no desktop têm ordem lógica, foco visível e rótulos acessíveis.
  Linhas selecionáveis não escondem o foco e cabeçalhos ordenáveis anunciam coluna e direção.
- No Android, `Pressable` e controles equivalentes têm alvo de toque de pelo menos 44 × 44 pt/dp
  quando a plataforma permitir, `accessibilityLabel` em ícones e estado anunciado para segmentos,
  tabs, paginação e carregamento.
- Texto suporta ampliação sem truncar datas, situação ou ações críticas. Tabelas mantêm scroll
  interno explícito no desktop; cada tela móvel tem uma única rolagem proprietária.
- Safe areas, teclado, leitor de tela, zoom de 200% no desktop e fonte ampliada no Android são
  condições de aceite, não acabamentos posteriores.
