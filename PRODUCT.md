# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

O usuário principal das superfícies administrativas é o responsável pelos territórios de uma
congregação das Testemunhas de Jeová. No computador, ele organiza áreas, quadras, publicadores,
designações e registros; no Android, consulta e corrige as informações que fazem sentido durante o
trabalho em campo.

Os publicadores usam um aplicativo Android separado, ativado por um código individual entregue pelo
admin. Eles consultam os territórios da congregação e registram o trabalho feito apenas dentro dos
territórios que lhes estão designados.

## Product Purpose

O Territory Map mantém a demarcação real dos territórios e quadras da congregação, registra quem
ficou responsável por cada território e preserva o histórico do que foi trabalhado. O produto é
bem-sucedido quando o responsável consegue responder rapidamente quem está com cada território,
quando ele foi retirado e devolvido, quais quadras precisam de atenção e quem realizou o trabalho.

## Positioning

O produto reúne mapa, quadras numeradas, designações datadas e histórico de trabalho em um único
sistema com escopo por congregação. O servidor é a fonte de verdade e aplica as mesmas regras aos
clientes desktop e Android, em vez de depender de arquivos isolados em cada aparelho.

## Operating Context

- O admin desktop é usado para trabalho de mesa: desenhar e editar demarcações, administrar
  publicadores, corrigir status, consultar históricos amplos e importar ou exportar documentos.
- O admin Android é usado em campo: consultar territórios, quadras e designações, designar ou
  concluir um território e registrar ou corrigir trabalho realizado.
- O app do publicador abre no mapa e prioriza localização, territórios designados e marcação de
  quadras trabalhadas.
- O cartão S-13 é o modelo mental das designações: cada período possui publicador, data de início e
  data de conclusão.
- A referência "Territórios da Congregação", de Simão Lúcio, orienta a organização por áreas,
  resumos e modos alternativos de consulta. Sua aparência visual não deve ser copiada.

## Capabilities and Constraints

- O servidor FastAPI com PostgreSQL/PostGIS é dono das regras de negócio, do isolamento por
  congregação e da validação geométrica.
- O admin desktop é Electron + React + TypeScript. O renderer não recebe senha nem token e acessa o
  servidor somente pela ponte IPC exposta pelo preload.
- Os dois aplicativos Android são React Native CLI + TypeScript, sem Expo. O admin Android usa a
  mesma credencial da congregação que o desktop, guardada no keystore.
- A gestão de publicadores continua exclusiva do admin desktop. O admin Android pode consultar os
  publicadores e seus históricos, mas não cadastrar, renomear, desativar, apagar ou gerar códigos.
- As superfícies administrativas devem oferecer três consultas coerentes: Publicadores, com o
  histórico de territórios retirados e devolvidos por pessoa; Territórios, com histórico de
  publicadores e de quadras; e Histórico completo, com todas as designações.
- O Histórico completo aceita intervalo de datas e inclui toda designação cuja vigência tenha
  qualquer sobreposição com o período selecionado, inclusive designações ainda abertas.
- Desenho de territórios e quadras, importação/exportação S-13-T e correções administrativas de
  configuração continuam exclusivos do desktop.
- Datas são apresentadas em português do Brasil e obedecem ao fuso de domínio documentado pelo
  servidor e pelos clientes; não devem ser reinterpretadas silenciosamente entre superfícies.
- As cores de status das quadras são regra de domínio compartilhada por comportamento, não uma
  escolha livre de tema.

## Brand Commitments

O nome Territory Map, a logo e o ícone existentes devem ser preservados. A voz é direta, serena e
operacional, em português do Brasil. A reformulação assume deliberadamente o padrão visual de um
admin contemporâneo, com convenções reconhecíveis executadas com alto acabamento. O aplicativo
“Territórios da Congregação”, de Simão Lúcio, é a única referência externa escolhida: sua
organização por áreas, resumos e modos de consulta serve de barra de qualidade, sem copiar sua
aparência antiga nem suas limitações.

## Evidence on Hand

- `AGENTS.md` documenta arquitetura, regras, públicos e fronteiras entre os quatro componentes.
- `admin/`, `admin-app/` e `app/` contêm as implementações atuais e testes co-localizados.
- `admin/resources/S-13_T_template.docx` é o modelo oficial usado nas exportações do desktop.
- Os dados e fluxos reais do produto estão no repositório; não há autorização para inventar
  depoimentos, métricas de uso ou alegações institucionais.

## Product Principles

1. Mostrar primeiro o que o responsável precisa decidir agora, preservando o histórico completo a
   poucos passos de distância.
2. Manter a mesma informação e o mesmo vocabulário no desktop e no Android, adaptando a navegação à
   situação de uso de cada aparelho.
3. Distinguir com clareza território, designação e trabalho de quadra; uma ação nunca deve parecer
   ter um escopo menor ou maior do que realmente tem.
4. Preservar rastreabilidade: retirar, devolver, trabalhar e corrigir são eventos datados e
   compreensíveis, não simples estados que apagam o passado.
5. Manter ações destrutivas explícitas, confirmadas e separadas das ações frequentes de consulta.

## Accessibility & Inclusion

As superfícies administrativas devem atender ao nível WCAG 2.2 AA onde aplicável. No desktop isso
inclui semântica, teclado, foco visível, contraste e zoom; no Android inclui alvos de toque,
descrições acessíveis, área segura, retorno físico/gestual e leitura sem depender apenas de cor.
