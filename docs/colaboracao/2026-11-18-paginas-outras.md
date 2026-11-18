# Outras páginas (18/11)

Continuação de `2026-11-18-paginas-equipe.md` (este PR vem em cima daquele). Mesmo padrão: números no topo (`painKpi`), barras (`painDist`) e explicações longas recolhidas.

- **Créditos**: números no padrão novo (crédito em aberto, aguardando aprovação, saldo negativo com o valor, maior saldo) e "Maiores saldos" em barras (clicar abre o extrato). O "Como funciona" e a nota sobre o Tiny ficaram recolhidos.
- **Brindes**: números no topo (custo no mês, aguardando aprovação, para separar, estoque baixo ≤ 3). O "Custo dos brindes no mês" virou barras por vendedor.
- **E-mails**: as caixas viraram sub-abas com o número de não lidos. Nos Boletos, os números ficaram no padrão novo, com "Sem nota ligada".
- **Tráfego**:
  - as abas viraram sub-abas;
  - os números têm linha dos dias do período (gasto, cliques, conversões);
  - "Gasto por dia" passou a usar classes CSS em vez de estilo solto, com eixo e legenda;
  - o período virou seletor.
- **Calendário**:
  - números no topo (feitos no mês e % do que vencia até hoje, em produção, para revisar, atrasados);
  - "Por canal" em barras com a cor de cada canal, que também serve de legenda da grade;
  - título sem emoji.
- **Configurações**: as abas internas viraram pílulas (`.subabas.sec`), porque a tela já mostra as sub-abas do grupo (Configurações/Logs) e ficariam duas linhas iguais.
- `painDist` aceita `cor` (só `#hex`; outra coisa é ignorada).
- Nenhuma regra, permissão ou tabela mudou.
- **Validação:**
  - `tests/paginas-outras.cjs`; o `tests/calendario.cjs` agora carrega as peças do painel; 38/38;
  - prévia no site com os dados reais, sem gravar nada (Créditos, Brindes, E-mails/Boletos, Tráfego, Calendário e Configurações).
