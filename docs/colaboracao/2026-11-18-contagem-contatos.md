# Contagem sem aprovação e contatos de clientes sem dono (18/11)

## Contagem de estoque sem aprovação (pedido do Vinícius: quem conta é o Fefão e está autorizado)
- Só configuração, sem mexer na função `estoque`:
  - `config.expedicao.ajuste_auto_max_unid = 10000000`, então toda diferença conta como "pequena" e é corrigida no Tiny na hora;
  - `ajuste_auto_sem_aprovacao = true`.
- Tela da Contagem (`expedicao.js`): o texto explicativo diz "corrige sozinha qualquer diferença, sem precisar de aprovação"
  quando a opção está ligada.
- A contagem que já estava esperando (4684015, Tiny -408 → contado 21) **não foi aplicada automaticamente**: fica para o
  Vinícius clicar em Aprovar, porque corrige o estoque no Tiny.
- Para voltar a pedir aprovação: tirar `ajuste_auto_sem_aprovacao` e voltar `ajuste_auto_max_unid` para 5.

## Contatos (migration `20261118123412_contatos_clientes_sem_dono`, aplicada)
- `cliente_telefones`: além do que já via (clientes dos seus pedidos, prospecção, negócios e os telefones que cadastrou),
  **o vendedor** (pessoa com vendedor do Tiny) vê os telefones de clientes **sem venda e sem proposta (negócio não perdido)
  de vendedor ativo**: `seg.cliente_sem_dono(chave)` e `seg.sou_vendedor()`.
- Na prática, o vendedor vê cerca de 16.700 dos 18.624 telefones. Cliente de outro vendedor ativo continua fechado.
- Validado como o Pedro (transação desfeita): vê o cliente sem dono e não vê o cliente do Felipe Menezes.
