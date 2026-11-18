# Páginas da equipe (18/11)

Pedido do Vinícius: melhorar as páginas que faltavam no mesmo padrão do Início e do Meu dia (números com gráfico, sem poluir).
Este PR cobre a área Equipe e Configurações. Créditos, Brindes, E-mails, Tráfego e Calendário vão no PR seguinte.

- **Visão da equipe** (`vGeral`):
  - números no topo no padrão do Início: vendas da equipe com comparação e linha de 30 dias, projeção x meta, marketplaces e checklist de hoje;
  - placar de vendas em barras (`painEquipe`), checklist da equipe nos últimos 7 dias em % (`painChkSemana`) e "Precisa de atenção" no formato de lista com ícone (`painDeAlerta`);
  - o organograma ficou recolhido no fim da página.
- **Supervisão**: resumo no topo (checklist hoje e no mês, quantas tarefas cobrar, quantos dias sem o "conferido"). A referência "O que cobrar de cada um" ficou recolhida. O botão Imprimir abre o que está recolhido antes de imprimir.
- **Metas**: resumo com indicadores no ritmo, em risco (70–99%) e abaixo de 70%, com os nomes, e os dias úteis restantes. Cada pessoa tem um anel com a média da projeção. Lógica em `metasSituacao` (mensal usa o realizado; meta zero e indicadores de média ficam de fora).
- **Remuneração**: números no padrão novo, coluna "Composição" (fixo, própria produção e equipe) em cada pessoa, nota legal recolhida.
- **Feedbacks** (só para quem tem equipe): registros dos últimos 30 dias por tipo (clicar filtra), lista de "Conversa 1:1" com a data do último 1:1 de cada pessoa (vermelho acima de 30 dias; clicar já prepara o registro de 1:1) e filtro por tipo no histórico.
- **Configurações**: as abas viraram sub-abas no padrão novo.
- Nenhuma regra, cálculo de remuneração ou permissão mudou. Nada novo no banco.
- **Validação:**
  - `tests/paginas-equipe.cjs`; 37/37;
  - prévia no site com os dados reais, sem gravar nada (Visão da equipe, Supervisão, Metas, Remuneração e Feedbacks).
- Ajustes da prévia:
  - a classe `alerta` do cartão pegava o estilo global de aviso e virou `pede`;
  - dois "Felipe" nas Metas agora aparecem com o sobrenome;
  - a coluna Composição apertava os nomes e ficou estreita.
