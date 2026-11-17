# Páginas: lote Vendas e Financeiro (17/11)

- **Funil (CRM)**:
  - sub-abas no padrão novo (Funil, Lista, Recuperar, Pedidos para ligar, Indicadores);
  - busca instantânea no quadro, que só esconde os cards e não redesenha a tela;
  - "há X d" no card, que fica âmbar depois de 30 dias;
  - "Funil por etapa" desenhado no topo dos Indicadores.
- **Pedidos**: resumo por situação (quantidade e valor). Clicar filtra pela situação e clicar de novo tira o filtro (`pedSitRapido`).
- **Boletos em atraso**: "Tempo de atraso" com o valor por faixa (até 30, 31 a 60, 61 a 90 e mais de 90 dias).
- **Clientes** e **Assistência**: sub-abas no padrão novo, sem emoji.
- Nenhuma regra mudou. Teste: `tests/paginas-vendas.cjs`; 33/33. Conferido no navegador com os dados reais.

## Lote 2: Solicitações e Avaliações (PR seguinte, depende deste)
- **Solicitações**:
  - resumo no topo: em aberto, atrasadas, concluídas no mês e tempo médio aberta. Não aparece no quadro de RMA (`soTipo`).
  - as caixas (Para mim, Que eu pedi…) viraram sub-abas, com o número em destaque;
  - o título da solicitação ficou sem emoji.
- **Avaliações**: "Distribuição das notas" (barras de 1 a 5 estrelas, com quantidade e %), entre os números e a lista de insatisfeitos.
