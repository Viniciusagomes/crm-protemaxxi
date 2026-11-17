# WhatsApp (páginas, reenvio, saúde) + visual de 4 abas (17/11/2026, madrugada)

Feito na retomada automática combinada com o Vinícius. Só WhatsApp teve função nova; nas outras abas, só visual.

## WhatsApp (js/atendimento.js)

- **Mensagens em páginas de 50**: abre a conversa com as 50 últimas; "Carregar mensagens anteriores" no topo ou rolando
  até o começo busca mais 50 (sem duplicar, mantendo a posição da tela). Antes eram até 1000 de uma vez.
- **Falhou → motivo em português** (131047 janela de 24 h, 131026 sem WhatsApp, 190 token, 131056/131048 limite…;
  o texto original da Meta fica no `title`) + botão **"Tentar de novo"**, que reenvia pela `whatsapp-enviar` só ao
  clicar (respeita a janela de 24 h; arquivo só se foi a própria pessoa que subiu).
- **Painel "Saúde"** (só dono): última mensagem recebida (alerta com +12 h), último envio OK, falhas e mídias sem
  arquivo nas últimas 24 h, com lista clicável que abre a conversa.
- **Otimização**: o menu lateral só é redesenhado quando muda (antes a cada evento do tempo real).

## Visual (Início, Meu dia, Funil, Pedidos)

- Esqueleto de carregamento (`esqueleto()` em util.js) no Funil e no Meu dia.
- Estados vazios sem emoji, cartão vazio tracejado e mais leve.
- Pedidos: situação em pílula com ponto colorido (`pedSitCls`: cancelado vermelho, entregue/faturado verde,
  aberto/aprovado âmbar) — só visual.
- KPIs com rótulo em caixa alta pequena e leve elevação ao passar o mouse; números tabulares.

## Validação

- `node tests/rodar-todos.cjs`: 29/29 (novos `tests/whatsapp-saude.cjs` e `tests/visual-abas.cjs`).
- Sem revisão do Codex (não instalado). Não testado com login real: conferir com Ctrl+F5 depois do merge.

## Pedidos (17/11, tarde)

- Faixa de números no topo (pedidos sem cancelados, total, ticket médio, clientes) calculada da própria lista filtrada.
- Vendedor com iniciais na cor dele; canal em pílula (Loja / e-commerce).
- Detalhe do pedido: cabeçalho com número grande e situação em pílula, quadro de dados (data, vendedor, canal, pagamento),
  cliente clicável, itens com código embaixo, totais (produtos, desconto, frete, total). Esqueleto enquanto carrega.
- Situação dos pedidos ficou de fora (mostra dados da expedição; o Vinícius pediu para não mexer em ML/expedição/estoque).

## Clientes (17/11, tarde)

- Lista: iniciais do cliente (cor fixa pelo nome), vendedor com iniciais, "dias sem comprar" em pílula, WhatsApp como ícone.
- Sub-abas sem emoji. Esqueleto enquanto carrega.
- Ficha: cabeçalho de perfil (iniciais grandes, nome, documento/cidade, selo Ativo/Para reativar, vendedor, botão WhatsApp),
  contatos com ícones de traço (novo ícone telefone), pedidos com situação em pílula.
## Funil (17/11, tarde)

- Sub-abas sem emoji. Colunas do kanban com ponto de cor da etapa, contagem em pílula e soma em destaque.
- Cartões mais limpos: iniciais do vendedor, faixa fina vermelha (sem atividade) / âmbar (atrasada), próxima atividade com ícone.
- Só no .kanban-crm (o kanban da Assistência não muda).

## Emoji → ícones em toda a Intranet (17/11, tarde)

- `util.js`: `EMOJI_ICONE` + `trocarEmojis()` + MutationObserver: depois de cada desenho, os emoji conhecidos da interface viram
  ícones de traço (`icone()`); os decorativos (🎉 👏 🚀…) somem. Uma peça central em vez de editar ~950 emoji em 38 arquivos.
- Fica de fora: o que pessoas escreveram (.wa-msgs, prévia do WhatsApp, .coment p, leitura de e-mail), campos/opções de
  formulário e as abas do estoque/expedição/ML/compras/cadastro (pedido do Vinícius: área do Fefão).
- Para excluir um trecho específico: classe `sem-icone`.

## Início (17/11, tarde)

- Saudação sem exclamação; primeiro número (vendas da loja / minhas vendas) em destaque escuro; cartões com mesma altura.
- Links das seções ("ver todas", "clientes"…) discretos com seta.

## Acabamento geral, lote 2 (17/11, tarde)

- Sem o tracinho verde embaixo de todo título (sinal de "modelo pronto"); títulos e seções com espaçamento mais calmo.
- Janelas: fundo desfocado, entrada suave, botão fechar redondo. Filtros em pílulas mais leves. Campos com cantos iguais.
- Avisos (alerta ruim/med/ok): cartão branco com faixa colorida à esquerda (antes fundo inteiro colorido).
- Seções recolhíveis (details) com seta própria.

## Meu dia e Prospecção (17/11, lote 3)

- Atividades com marcador redondo e linha mais limpa, prospecção em cartões com hierarquia clara, contadores de segmento sóbrios.

## Solicitações e Caixa de e-mails (17/11, lote 3)

- Quadro de solicitações com colunas leves e cartões com elevação; comentários em formato de conversa; e-mails com lista mais limpa e leitura confortável. Corrige: o conversor de emoji não mexe no corpo dos e-mails.
