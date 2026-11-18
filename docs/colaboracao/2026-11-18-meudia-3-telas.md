# Meu dia em 3 telas (18/11)

Pedido do Vinícius: o checklist estava grande e demorava para chegar nos leads.

- **Meu dia** (`vMeuDia`, resumo, em crm.js):
  - o anel do dia;
  - números: vendas do mês com comparação e linha de 30 dias, projeção x meta, propostas do mês (quantidade, valor,
    ganhas e perdidas, em aberto no funil) e atendimento do WhatsApp (conversas hoje, tempo de resposta hoje e na média
    de 7 dias, clientes esperando);
  - "Para fazer agora", com até 8 itens atrasados ou de hoje, cada um levando à fila;
  - progresso do checklist, calendário de marketing e ritmo do mês.
- **Fila e leads** (`vFilaDia`, nova rota `#/fila`): a tela de trabalho que já existia (fila, leads Google/Meta, campanhas,
  prospecção, telefones, próximos 7 dias), agora sem o checklist e o resumo na frente.
- **Checklist**: a tela de sempre (`#/checklist`).
- Sub-abas: Meu dia → Fila e leads → Checklist. A fila vem em segundo para ficar a um clique.
  O número de pendências do menu saiu do "Meu dia" e foi para a "Fila e leads".
- A fila só aparece para quem vende (vendedor do Tiny, "ver todas as vendas" ou dono). Os outros continuam com o Meu dia
  operacional (`vMeuDiaOp`) e o Checklist.
- No Início, "A fazer hoje" e "Precisa da sua atenção" agora levam à fila.
- **Banco** (migration `20261118132132_painel_atendimento`, aplicada): RPC `painel_atendimento(p_pessoa, p_dias)`,
  `SECURITY DEFINER`, liberada só para a própria pessoa, quem a supervisiona e o dono (`seg.pessoas_visiveis`).
  - O tempo de resposta conta do primeiro "oi" do cliente até a primeira resposta da loja, e só quando quem respondeu foi a própria pessoa.
- **Validação:**
  - `tests/meudia-3-telas.cjs`; 36/36;
  - prévia com os dados reais (Pedro: 3 conversas hoje, resposta em 10 min);
  - a RPC recusou os números de outro vendedor.
