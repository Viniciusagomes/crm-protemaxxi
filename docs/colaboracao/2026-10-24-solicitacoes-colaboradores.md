# Solicitações dos colaboradores — 24/10/2026

## Alterações

- Solicitação #9: quadros de RMA e assistência mostram Análise → Envio assistência → Aguardando peça → Retorno técnica → Aguardando cliente. Recebimento e etapas de encerramento foram mantidos. No quadro antigo, os nomes anteriores são reconhecidos sem regravar os registros. Não houve mudança nas transições permitidas das OS.
- Solicitação #16: meta de 50 clientes por vendedor/dia; cotas 10 complemento, 12 recompra, 15 reativação, 5 indicação e 8 instalador. O gerador completa listas parciais sem apagar resultados e respeita o limite total e as exclusões de frequência. Contatos manuais dos últimos 30 dias também impedem nova inclusão.
- As sugestões de mensagem usam um produto real da última compra, quando disponível. Sem item importado, usam texto de acompanhamento sem inventar produtos, estoque ou promoções. O vendedor revisa e envia pelo WhatsApp como antes.
- Solicitação #15: filtros Todos / Não contatados / Contatados / Pulados, indicação visual e data do registro. Pular não soma no progresso de contatos.
- Solicitação #17: clientes do segmento de atenção com ligação, WhatsApp, visita ou e-mail registrado nos últimos 30 dias passam a Em acompanhamento. Notas e pulos não contam. As notas RFM e a curva ABC permanecem baseadas nas compras; a categoria de acompanhamento expira após o prazo. O prazo de 30 dias foi apresentado ao responsável como padrão durante a implementação.
- Evidência das imagens de celular: o contato do Tiny já contém o celular do Leandro Lima Prado e a tabela `cliente_telefones` já o vincula à mesma chave do pedido 75879. O único cadastro dele com pedido da loja está coberto. Não foi necessário alterar o Tiny nem mesclar cadastros por nome.
- Recursos atualizados para `20261024a`.

## Validação

- `tests/colaboradores.cjs`: ordem e compatibilidade de RMA, mudança de categoria com cache, expiração, exclusão de notas/pulos, mensagens personalizadas e filtros/progresso.
- Regressões de acesso e arquivados dos e-mails continuam passando.
- Simulação do gerador em transação revertida: 50 registros para cada um dos três vendedores, todos com item da compra recente, resultados anteriores preservados, zero duplicados e segunda execução idempotente.
- Revisão do SQL preserva os predicados existentes de acesso do gerador. A tentativa adicional de teste com troca de contexto autenticado foi interrompida por erro `Invalid or expired requestState` do conector; não é considerada uma validação concluída.

## Continuidade com Claude

Consultar esta alteração antes de modificar campanha, RFM, filtros ou etapas de RMA. O compartilhamento de contexto é feito por este registro e pelo pull request; a sessão do Claude ainda não confirmou recebimento.
