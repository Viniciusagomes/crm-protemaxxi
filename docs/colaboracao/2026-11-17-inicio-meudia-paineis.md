# Início e Meu dia em painel (17/11)

Pedido do Vinícius: telas mais profissionais, com painéis e gráficos, sem poluição, para entender rápido a situação do mês e o que há para fazer.

## O que mudou
- **`js/painel.js` (novo; carregado antes do `main.js`)**. O `vInicio` saiu do `main.js` e passou para cá.
  - **Números do mês**:
    - vendas, com a variação em relação ao mesmo ponto do mês passado e a linha dos últimos 30 dias;
    - projeção, com a barra da meta e a marca de onde deveria estar hoje;
    - pedidos e ticket médio;
    - venda de hoje comparada com ontem.
  - **Ritmo do mês**:
    - uma frase que resume o mês: acima ou abaixo do mês passado, onde o mês fecha e quanto falta por dia útil;
    - o gráfico do acumulado deste mês, do mês passado e do caminho até a meta.
  - **Equipe no mês** (quem vê todas as vendas): barras com o vendido, a projeção e a marca da meta de cada vendedor.
  - **Precisa da sua atenção**, do mais grave para o menos grave:
    - solicitações atrasadas, atividades atrasadas e retornos vencidos;
    - para o dono, também os alertas da equipe.
  - **A fazer hoje**: checklist, atividades, retornos, prospecção e solicitações, com o progresso de cada um.
  - Meta da loja = soma das metas de faturamento (`kpi fat`) dos vendedores ativos.
- **Meu dia** (`crm.js`):
  - Os 4 cartões do topo viraram um painel só: anel de feitas hoje, Atrasadas, Para hoje, Prospecção, Negócios parados e um gráfico das concluídas nos últimos 7 dias.
  - As vistas Fila, Leads e Campanhas viraram um seletor segmentado.
  - "Próximos 7 dias" agora vem agrupado por dia.
- Nas duas telas, os avisos de boletos e da assistência mostram só a linha principal (`.pain-avisos`); o detalhe continua na própria aba.
- Nenhuma regra mudou. As ações (concluir atividade, abrir negócio, prospecção) são as mesmas.

## Validação
- `tests/painel.cjs` com pedidos fictícios (soma do mês, comparação com o mesmo ponto, frase, gráficos com mês vazio, sem emoji); 31/31.
- Conferido no navegador com os dados reais, com o código novo carregado só na aba, nas duas telas.
