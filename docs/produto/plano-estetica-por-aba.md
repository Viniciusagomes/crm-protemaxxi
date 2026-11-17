# Plano de estética da Intranet — 20 melhorias por aba (17/11/2026)

Objetivo: tirar a "cara de feito por IA" e deixar a Intranet com aparência de **produto vendável** (SaaS de gestão para
lojas de segurança eletrônica). Só visual e usabilidade: nenhuma regra de negócio muda sem pedido do Vinícius.

## Princípios que valem para todas as abas (fazer primeiro — mudam tudo de uma vez)

1. **Ícones de verdade no lugar de emoji** (traço fino, mesmo peso, uma só família). Emoji no menu e nos títulos é o
   principal sinal de "feito por IA".
2. **Uma escala de espaçamento** (4/8/12/16/24/32) e **uma escala de fonte** (12/13/14/16/20/26). Nada de tamanho solto.
3. **Números com algarismos tabulares** (`font-variant-numeric: tabular-nums`) em tabelas, KPIs e valores em R$.
4. **Cor com função, não decoração**: verde = bom/ação principal, âmbar = atenção, vermelho = problema. O resto em cinzas.
5. **Menos caixas dentro de caixas**: card só quando agrupa algo; listas e tabelas "respiram" no fundo da página.
6. **Botões em 3 níveis** (principal sólido, secundário contorno, terciário só texto) e no máximo 1 principal por tela.
7. **Textos curtos sem exclamação e sem emoji** ("Nenhum pedido atrasado" no lugar de "Tudo em dia! 👏").
8. **Estados vazios desenhados** (ilustração simples + uma frase + um botão), não só "Nada aqui".
9. **Carregamento com esqueleto** (blocos cinzas pulsando) no lugar de "Carregando…".
10. **Foco visível e navegação por teclado** (anel verde de foco, atalhos `/` busca, `g` + letra para abas).
11. **Tabelas com cabeçalho fixo**, linhas zebradas leves, colunas numéricas alinhadas à direita.
12. **Avatar com iniciais** para pessoas e clientes (como no WhatsApp novo), em todo lugar.
13. **Datas relativas** ("há 12 min", "ontem 14:30") com data completa no `title`.
14. **Animações curtas** (150–200 ms) só em abrir/fechar painel e trocar de aba; respeitar "reduzir movimento".
15. **Modo escuro revisado** com contraste AA em todos os textos.
16. **Logo + nome do cliente-empresa** no topo do menu (pronto para "white label" quando vender).
17. **Página de login com marca** (foto/ilustração de segurança, frase de valor, rodapé com versão).
18. **Tela no celular** pensada para o vendedor: barra inferior, cards em vez de tabelas largas.
19. **Impressão/PDF bonitos** (relatórios, OS, pedidos) com cabeçalho da empresa.
20. **Guia de estilo vivo** (página interna só para o dono) mostrando cores, botões, tabelas — base para vender o produto.

---

## Início
1. Saudação com nome e data por extenso, sem emoji.
2. KPIs em faixa única com número grande, variação vs. mês anterior (seta + %).
3. Mini-gráfico (sparkline) de 30 dias embaixo de cada KPI de venda.
4. Cards de atalho com ícone de traço e texto curto, todos do mesmo tamanho.
5. Bloco "Precisa da sua atenção" (atrasos, aprovações) ordenado por gravidade.
6. Cores de status só no indicador, não no card inteiro.
7. Barra de progresso de meta mais fina, com marcador "onde deveria estar hoje".
8. Esqueleto de carregamento nos KPIs.
9. Grid responsivo de 4 → 2 → 1 colunas.
10. Valores em R$ sem centavos nos KPIs (centavos só em detalhe).
11. Tooltip explicando cada KPI ao passar o mouse.
12. Linha do tempo "Hoje na loja" (pedidos, OS, conversas) em vez de lista solta.
13. Estado vazio desenhado para quem não tem metas.
14. Avatares da equipe online no topo (quem está trabalhando agora).
15. Separadores de seção com título pequeno em caixa alta e espaçamento generoso.
16. Card de remuneração com número grande e detalhamento recolhível.
17. Cor de fundo da página levemente diferente dos cards (profundidade sem sombra pesada).
18. Botão "Personalizar início" (escolher e ordenar cards) — preparação para produto.
19. Rodapé discreto com hora da última sincronização com o Tiny.
20. Versão para TV/monitor da loja com fonte maior.

## Meu dia
1. Agenda em linha do tempo vertical por hora.
2. Atrasadas destacadas com faixa lateral vermelha, não fundo inteiro.
3. Checkbox grande e animado ao concluir.
4. Agrupamento: Atrasadas · Hoje · Próximos dias, com contadores.
5. Prospecção do dia em cards com avatar do cliente e botão de WhatsApp.
6. Indicador de progresso do dia (x de y feitos) em anel.
7. Arrastar para reagendar (visual de "segurar e soltar").
8. Ícones por tipo de atividade (ligação, visita, WhatsApp, e-mail).
9. Etiqueta de origem da lista (site, recompra, inativo) com cor discreta.
10. Mensagem de fim de dia quando tudo está feito (sem emoji).
11. Filtro rápido em chips (Tudo, Ligações, Visitas, WhatsApp).
12. Data por extenso no topo com setas para dia anterior/seguinte.
13. Campo de resultado da prospecção como menu em pílulas.
14. Atalhos de teclado (j/k para navegar, x para concluir).
15. Versão celular com cartões deslizáveis.
16. Tempo desde o último contato com o cliente em cinza ao lado do nome.
17. Contador regressivo para compromissos com hora marcada.
18. Cores consistentes com o Funil (mesma etapa = mesma cor).
19. Estado vazio desenhado ("Agenda livre").
20. Resumo semanal recolhível no fim da página.

## Funil (CRM)
1. Quadro kanban com colunas de largura fixa e rolagem horizontal suave.
2. Card de negócio com valor em destaque, cliente, dias parado e avatar do vendedor.
3. Cor da borda superior da coluna por etapa (paleta única).
4. Soma de valor e quantidade no topo de cada coluna.
5. Arrastar com sombra e "fantasma" no lugar de destino.
6. Negócio parado há muito tempo com indicador âmbar/vermelho discreto.
7. Painel lateral de detalhe (em vez de modal) com histórico em linha do tempo.
8. Filtros em chips (vendedor, período, origem) fixos no topo.
9. Visão alternativa em lista/tabela com alternância por ícone.
10. Probabilidade de fechamento como barra fina no card.
11. Funil visual (gráfico de afunilamento) no topo, recolhível.
12. Motivo de perda com ícones e cores neutras.
13. Busca instantânea por cliente/negócio.
14. Contagem de negócios ganhos no mês com micro-celebração discreta.
15. Avatares em vez de nomes escritos nos cards.
16. Datas relativas ("há 3 dias") nos cards.
17. Estado vazio por coluna ("Arraste um negócio para cá").
18. Cabeçalho de coluna fixo ao rolar.
19. Versão celular: uma coluna por vez com abas.
20. Atalho "Novo negócio" flutuante no celular.

## Vendas
1. Gráfico de barras por dia com linha de meta tracejada.
2. Paleta de gráfico própria (verde marca + cinzas), sem cores padrão de biblioteca.
3. Comparativo com mesmo período do mês anterior em cinza claro.
4. Ranking de vendedores com avatar e barra horizontal.
5. Números grandes com algarismos tabulares.
6. Seletor de período em pílulas (Hoje, 7 dias, Mês, Personalizado).
7. Tabela de pedidos com cabeçalho fixo e colunas numéricas à direita.
8. Tooltip rico nos gráficos (valor, pedidos, ticket médio).
9. Mix por canal (loja, ML, site) em barra empilhada, não pizza.
10. Ticket médio e margem em cards secundários menores.
11. Exportar em PDF com layout de relatório.
12. Destaque de produto mais vendido com foto.
13. Estado vazio para períodos sem venda.
14. Indicador de meta em anel com % no centro.
15. Cores de vendedor fixas em todos os gráficos.
16. Esqueleto de carregamento dos gráficos.
17. Legendas clicáveis para esconder séries.
18. Anotações em datas especiais (Black Friday, feriados).
19. Versão celular com gráfico rolável horizontalmente.
20. Rodapé com fonte dos dados e hora da atualização.

## Pedidos
1. Lista com número, cliente, valor e situação em colunas bem alinhadas.
2. Situação como "pílula" com ponto colorido, não fundo inteiro.
3. Painel lateral de detalhe do pedido (itens, pagamento, entrega) sem sair da lista.
4. Itens com miniatura do produto.
5. Linha do tempo do pedido (criado → pago → separado → enviado).
6. Busca por número/cliente com destaque do termo.
7. Filtros salvos ("Meus pedidos abertos").
8. Valores com tabular-nums e moeda alinhada.
9. Ícone de canal (loja, ML, site) ao lado do número.
10. Copiar número do pedido com um clique (feedback "copiado").
11. Paginação ou rolagem infinita com contador.
12. Linhas compactas/confortáveis (alternância de densidade).
13. Cabeçalho fixo e coluna do cliente fixa ao rolar horizontal.
14. Estado vazio por filtro.
15. Impressão do pedido em layout de documento.
16. Badge de desconto acima da regra em âmbar discreto.
17. Avatares de vendedor.
18. Hover mostrando observação interna.
19. Atalho para abrir no Tiny com ícone de link externo.
20. Celular: cards empilhados com valor em destaque.

## Situação dos pedidos
1. Trilha de etapas (stepper) horizontal em cada pedido.
2. Problema destacado com ícone de alerta e texto curto do motivo.
3. Agrupamento por etapa com contadores no topo.
4. Cores: cinza (normal), âmbar (atrasando), vermelho (problema).
5. Tempo em cada etapa ("separado há 2 dias").
6. Filtro "Só problemas" em destaque.
7. Ação principal por linha (um botão), demais no menu "⋯".
8. Animação suave ao mudar de etapa.
9. Visão quadro (kanban por etapa) opcional.
10. Avatar do responsável pela etapa.
11. Notas internas com ícone e contagem.
12. Removidos em seção recolhida com cinza claro.
13. Datas relativas.
14. Busca rápida.
15. Estado vazio "Nenhum pedido com problema".
16. Legenda das cores fixa no rodapé.
17. Cabeçalho fixo.
18. Celular: lista por etapa com abas.
19. Indicador de SLA (meta de prazo) por etapa.
20. Exportar lista de problemas em PDF.

## Boletos em atraso
1. Valor total em atraso em destaque no topo.
2. Faixas de atraso (1–7, 8–30, 30+) como barras.
3. Linha com cliente, vencimento, dias de atraso e valor alinhados.
4. Dias de atraso em pílula com cor por faixa.
5. Comprovante com miniatura e visualização lateral.
6. Botão de cobrança (WhatsApp/e-mail) com ícone, sem enviar sozinho.
7. Histórico de contatos de cobrança em linha do tempo.
8. Ordenação por valor ou atraso com setas no cabeçalho.
9. Filtro por vendedor com avatares.
10. Estado vazio "Nenhum boleto em atraso".
11. Valores tabulares.
12. Marcação "baixado" com animação e linha riscada.
13. Agrupamento por cliente com soma.
14. Exportar relatório para o financeiro.
15. Destaque de cliente reincidente (ícone discreto).
16. Datas por extenso no hover.
17. Cabeçalho fixo.
18. Celular: cards com botão de cobrança.
19. Gráfico de evolução da inadimplência no mês.
20. Rodapé com última atualização do Tiny.

## Clientes
1. Ficha com cabeçalho de perfil (avatar, nome, cidade, etiquetas).
2. Abas internas (Resumo, Pedidos, Conversas, Notas).
3. Valor comprado em 12 meses com mini-gráfico.
4. Linha do tempo única (pedidos, WhatsApp, ligações, OS).
5. Etiquetas coloridas discretas (VIP, técnico, inativo).
6. Busca com resultados agrupados (nome, documento, telefone).
7. Telefones com botões WhatsApp/ligar.
8. Endereço com mini mapa estático.
9. Vendedor responsável com avatar.
10. Indicador de "não contatar" claro e sóbrio.
11. Lista com densidade ajustável.
12. Ordenação por última compra/valor.
13. Estado vazio por busca.
14. Ações em menu "⋯" para não poluir.
15. Duplicados sugeridos com comparação lado a lado.
16. Datas relativas da última compra.
17. Copiar CPF/CNPJ com um clique.
18. Celular: ficha em tela cheia com ações fixas embaixo.
19. Impressão da ficha.
20. Avatar com logo da empresa quando houver site.

## Monitoria de preços
1. Tabela com preço nosso vs. concorrência e diferença em %.
2. Diferença com seta e cor (mais caro/mais barato).
3. Mini-gráfico de histórico de preço por produto.
4. Foto do produto na linha.
5. Filtro "Só onde estamos mais caros".
6. Agrupamento por categoria.
7. Logos dos concorrentes/canais.
8. Valores tabulares alinhados.
9. Hora da última coleta por fonte.
10. Destaque de mudanças nas últimas 24 h.
11. Estado vazio desenhado.
12. Exportar comparativo.
13. Cabeçalho fixo.
14. Tooltip com link do anúncio concorrente.
15. Faixa de preço ideal (mín./máx.) como barra.
16. Ordenação por maior diferença.
17. Cores neutras, só a diferença colorida.
18. Celular: card por produto.
19. Revisões com avatar de quem revisou.
20. Resumo no topo (x produtos acima, y abaixo).

## Avaliações
1. Nota média grande com estrelas desenhadas (não emoji).
2. Distribuição de notas em barras horizontais.
3. Comentários como cartões com avatar e data relativa.
4. Notas baixas com faixa lateral vermelha e status "tratado".
5. Filtro por nota em pílulas.
6. Evolução da nota no mês (linha).
7. Destaque de quem já avaliou no Google.
8. Resposta interna/tratativa em linha do tempo.
9. Estado vazio desenhado.
10. Exportar depoimentos bons para o marketing.
11. Página pública de avaliação com a marca (avaliar.html).
12. Ícones de canal (loja, ML).
13. Vendedor avaliado com avatar.
14. Datas por extenso no hover.
15. Contadores no topo (respondidas, pendentes).
16. Busca por cliente.
17. Celular: lista de cartões.
18. Cores suaves para notas 4–5.
19. Botão "marcar como tratado" com animação.
20. Selo de NPS calculado.

## Créditos e vales
1. Saldo por cliente em destaque.
2. Extrato em linha do tempo (entrada/saída).
3. Valores com sinal e cor (verde/vermelho) tabulares.
4. Aprovação pendente com faixa âmbar.
5. Avatar de quem pediu/aprovou.
6. Filtros por status em pílulas.
7. Comprovante/vale para imprimir com a marca.
8. Busca por cliente.
9. Estado vazio.
10. Resumo do mês (emitidos, usados).
11. Datas relativas.
12. Ações principais em botão único.
13. Cabeçalho fixo.
14. Celular: cards.
15. Validade do vale com contagem regressiva.
16. Ícones por tipo (vale, crédito, ajuste).
17. Tooltip com motivo.
18. Exportar extrato.
19. Confirmação visual ao aprovar.
20. Total em aberto no topo.

## Brindes
1. Catálogo com foto de cada brinde.
2. Estoque de brindes com barra.
3. Pedido de brinde em cards com status por etapa.
4. Aprovação com faixa âmbar.
5. Avatar de quem pediu.
6. Filtros por status.
7. Histórico por cliente.
8. Estado vazio desenhado.
9. Datas relativas.
10. Ícones de etapa (pedido, aprovado, separado, entregue).
11. Resumo de custo do mês.
12. Busca.
13. Celular: cards.
14. Confirmação animada ao entregar.
15. Contadores no topo.
16. Cores neutras.
17. Impressão de etiqueta.
18. Tooltip com motivo do brinde.
19. Alerta de estoque baixo discreto.
20. Ordenação por data.

## Mercado Livre
1. Perguntas como caixa de entrada (lista + painel de resposta).
2. Foto do anúncio ao lado da pergunta.
3. Tempo sem resposta com cor (como no WhatsApp).
4. Respostas prontas com "/".
5. Reclamações com faixa vermelha e prazo.
6. Anúncios em grade com foto, preço, estoque e status.
7. Reputação (termômetro) desenhada no topo.
8. Pedidos com etiqueta de envio e prazo de postagem.
9. Contagem regressiva da postagem.
10. Filtros em pílulas.
11. Logo ML discreto.
12. Estado vazio "Nenhuma pergunta pendente".
13. Datas relativas.
14. Valores tabulares.
15. Visão celular para responder rápido.
16. Destaque de anúncio pausado.
17. Métricas de visitas/conversão por anúncio.
18. Cabeçalho fixo.
19. Atalhos de teclado para responder.
20. Rodapé com última sincronização.

## Tráfego (Google Ads)
1. KPIs (investimento, cliques, conversões, CPA) em faixa única.
2. Gráfico de investimento vs. conversões no período.
3. Fila de aprovação como lista de cartões "antes → depois".
4. Status de campanha com ponto colorido.
5. Termos de pesquisa com ação rápida (negativar) via fila.
6. Paleta de gráfico própria.
7. Comparativo com período anterior.
8. Tooltip explicando cada métrica para leigo.
9. Recomendações do Google com selo e impacto estimado.
10. Filtros por campanha.
11. Tabelas com cabeçalho fixo.
12. Valores tabulares.
13. Estado vazio.
14. Exportar relatório para reunião.
15. Destaque de anomalia (CPA subiu) em âmbar.
16. Ícones por tipo de campanha.
17. Datas relativas nas mudanças.
18. Celular: KPIs + fila.
19. Mapa de calor por hora/dia.
20. Rodapé com última coleta.

## Visão geral do estoque
1. Cards de categoria com valor e quantidade.
2. Barras de cobertura (dias de estoque).
3. Alertas de ruptura em faixa vermelha discreta.
4. Fotos dos produtos.
5. Curva ABC desenhada.
6. Filtros por categoria.
7. Busca instantânea.
8. Valores tabulares.
9. Estado vazio.
10. Gráfico de giro no mês.
11. Destaque de parado há muito tempo.
12. Tooltip com último fornecedor.
13. Exportar.
14. Cabeçalho fixo.
15. Celular: cards.
16. Cores neutras.
17. Indicador de reposição sugerida.
18. Datas relativas da última entrada.
19. Resumo no topo.
20. Rodapé com sincronização.

## Expedição
1. Quadro por etapa (a separar, separado, faturado, despachado).
2. Card do pedido com prazo e transportadora (logo).
3. Contagem regressiva para coleta/postagem.
4. Atrasados com faixa vermelha.
5. Checklist de separação com caixas grandes.
6. Leitura de código de barras com feedback visual/sonoro.
7. Etiqueta para imprimir com a marca.
8. Filtros por canal.
9. Avatar de quem separou.
10. Ocorrências com ícone e linha do tempo.
11. Estado vazio "Tudo despachado".
12. Modo tela cheia para a bancada.
13. Fonte maior no modo bancada.
14. Datas relativas.
15. Cores consistentes com Situação dos pedidos.
16. Contadores no topo.
17. Celular/tablet: cards grandes.
18. Confirmação animada ao despachar.
19. Pagamento pendente com faixa âmbar.
20. Rodapé com última atualização.

## Estoque
1. Tabela com foto, código, saldo e mínimo.
2. Saldo abaixo do mínimo em pílula vermelha.
3. Contagem com teclado numérico grande.
4. Histórico de movimentação em linha do tempo.
5. Filtros por local/categoria.
6. Busca por código de barras.
7. Valores tabulares.
8. Estado vazio.
9. Alertas agrupados no topo.
10. Plano de contagem com progresso.
11. Divergência de contagem destacada.
12. Cabeçalho fixo.
13. Celular: modo contagem em tela cheia.
14. Exportar.
15. Tooltip com custo médio.
16. Ícones por tipo de movimento.
17. Datas relativas.
18. Confirmação ao salvar contagem.
19. Cores neutras.
20. Resumo no topo.

## TV do estoque
1. Layout de painel para TV (16:9) com fonte grande.
2. Tema escuro de alto contraste.
3. Rotação automática entre painéis.
4. Relógio e data no canto.
5. Contadores grandes (a separar, atrasados).
6. Cores de status bem distintas à distância.
7. Logo da empresa.
8. Animação suave na troca.
9. Sem botões visíveis.
10. Lista de próximos despachos.
11. Destaque piscante leve para atraso.
12. Meta do dia em anel grande.
13. Ranking de separação do dia.
14. Aviso de sem conexão.
15. Ajuste automático de escala.
16. Ícones grandes de traço.
17. Rodapé com última atualização.
18. Modo "noite" com brilho menor.
19. QR code para abrir no celular.
20. Mensagem de "tudo em dia" sóbria.

## Compras e fornecedores
1. Oportunidades como cards com status e prazo.
2. Comparativo de propostas lado a lado (preço, prazo, frete).
3. Vencedor destacado com selo.
4. Fornecedor com logo/avatar e nota.
5. Linha do tempo da ordem de compra.
6. Filtros por status.
7. Valores tabulares.
8. Estado vazio.
9. Portal do fornecedor com a marca e visual limpo.
10. Prazo de resposta com contagem regressiva.
11. Busca.
12. Exportar ordem de compra em PDF bonito.
13. Avatares de quem criou/aprovou.
14. Datas relativas.
15. Cabeçalho fixo.
16. Celular: cards.
17. Ícones por etapa.
18. Confirmação animada ao escolher vencedor.
19. Resumo do mês (economia obtida).
20. Cores neutras.

## Cadastro de produtos
1. Formulário em etapas (dados, fotos, fiscal, preço).
2. Upload de fotos com arrastar e soltar e pré-visualização.
3. Campos agrupados em seções com títulos.
4. Validação em tempo real (GTIN, NCM) com mensagem clara.
5. Pendências em lista de verificação.
6. Pré-visualização do anúncio (como fica no ML/site).
7. Busca de produto existente antes de criar.
8. Estado vazio.
9. Atalhos para copiar de produto parecido.
10. Ícones por tipo de campo.
11. Salvamento automático com indicador "salvo".
12. Mensagens de erro em vermelho sóbrio junto do campo.
13. Celular: etapas em tela cheia.
14. Contadores no topo.
15. Datas relativas.
16. Fotos em grade com reordenação.
17. Campos obrigatórios marcados com discrição.
18. Tooltip com ajuda fiscal.
19. Confirmação ao publicar.
20. Histórico de alterações.

## WhatsApp
(Feito no PR #31: visual de app, aba Esperando, respostas com "/", bolhas, citação, ficha lateral.) Próximos:
1. Modelos aprovados pela Meta com botão "Retomar com modelo".
2. Gravação de áudio pelo navegador.
3. Emojis e reações nas mensagens.
4. Responder citando (deslizar/botão na bolha).
5. Busca dentro da conversa.
6. Etiquetas de funil na conversa.
7. Lembrete "me chama amanhã".
8. Enviar orçamento/pedido do Tiny direto do chat.
9. Catálogo rápido de produtos.
10. Transcrição de áudio.
11. Resumo da conversa ao transferir.
12. Indicador "digitando" da equipe (quem está com a conversa aberta).
13. Painel de saúde do WhatsApp (token, falhas).
14. Arquivar conversas paradas.
15. Mídia em galeria na ficha.
16. Fixar conversas.
17. Atalhos de teclado (Ctrl+K busca, Alt+↑↓ conversa).
18. Som de notificação próprio.
19. Relatório de tempo de resposta.
20. Instalar como app (PWA) com notificação no celular.

## Solicitações
1. Caixa de entrada com lista + painel de detalhe.
2. Status em pílulas com ponto colorido.
3. Prioridade com ícone de bandeira.
4. Comentários em formato de conversa.
5. Anexos com miniatura.
6. Avatar de solicitante e responsável.
7. Prazo com contagem regressiva.
8. Filtros (para mim, que eu pedi, todas).
9. Estado vazio "Nada pendente".
10. Datas relativas.
11. Criar solicitação em painel lateral rápido.
12. Modelos de solicitação frequentes.
13. Notificação de novo comentário com destaque.
14. Busca.
15. Celular: cards.
16. Confirmação animada ao concluir.
17. Histórico em linha do tempo.
18. Cabeçalho fixo.
19. Contadores no topo.
20. Cores neutras.

## Caixa de e-mails
1. Layout de cliente de e-mail (lista + leitura).
2. Remetente com avatar/iniciais.
3. Não lidos em negrito com ponto verde.
4. Anexos com ícones por tipo.
5. Prévia do texto na lista.
6. Busca com filtros (remetente, anexo).
7. Arquivar com deslizar no celular.
8. Datas relativas.
9. Estado vazio desenhado.
10. Orçamento gerado com selo "rascunho".
11. Etiquetas por tipo (assistência, fornecedor).
12. Leitura com tipografia confortável.
13. Atalhos de teclado (j/k, e para arquivar).
14. Cabeçalho fixo.
15. Contadores por pasta.
16. Celular: lista e leitura em telas separadas.
17. Imagens bloqueadas por padrão com botão "mostrar".
18. Impressão limpa.
19. Indicador de sincronização.
20. Cores neutras.

## Assistência (OS)
1. Quadro por status (recebido, em análise, orçamento, pronto, entregue).
2. Card com foto do equipamento e cliente.
3. Prazo com contagem e cor.
4. Linha do tempo da OS com fotos.
5. Orçamento como documento bonito (PDF/página pública com marca).
6. Página pública da OS (os.html) com a identidade da loja.
7. Etiqueta de entrada para imprimir com QR code.
8. Filtros por técnico e status.
9. Avatar do técnico.
10. Estado vazio.
11. Busca por número/cliente/serial.
12. Datas relativas.
13. RMA com ícone e etapa própria.
14. Celular: fotos direto da câmera.
15. Confirmação animada ao entregar.
16. Cabeçalho fixo.
17. Contadores no topo.
18. Valores tabulares.
19. Garantia com selo e validade.
20. Cores consistentes com Situação dos pedidos.

## Checklist do dia
1. Lista com caixas grandes e animação ao marcar.
2. Progresso do dia em anel.
3. Tarefas críticas com ícone e faixa.
4. Agrupamento por turno.
5. Sequência de dias cumpridos (constância) discreta.
6. Estado concluído com mensagem sóbria.
7. Celular primeiro (uso em pé).
8. Datas por extenso.
9. Conferência com avatar de quem conferiu.
10. Histórico do mês em calendário de calor.
11. Atalhos de teclado.
12. Tarefas atrasadas em destaque.
13. Cores neutras.
14. Tooltip com instrução da tarefa.
15. Foto como comprovação (opcional).
16. Contadores no topo.
17. Folga com visual próprio.
18. Ordenação por horário.
19. Confirmação ao concluir tudo.
20. Impressão da lista.

## Calendário de marketing
1. Visão mês com cards coloridos por canal.
2. Visão semana com horários.
3. Arrastar para remarcar.
4. Miniatura do criativo no card.
5. Status (rascunho, aprovado, publicado) em pílula.
6. Filtros por canal/pessoa.
7. Avatar do responsável.
8. Datas comemorativas pré-marcadas.
9. Painel lateral de detalhe.
10. Estado vazio.
11. Legenda de cores fixa.
12. Hoje destacado.
13. Celular: visão lista.
14. Exportar mês em PDF.
15. Contagem de posts por canal no mês.
16. Ícones de canal (Instagram, Google, etc.).
17. Datas relativas.
18. Confirmação ao aprovar.
19. Cores suaves.
20. Atalhos de teclado (←/→ mês).

## Supervisão
1. Cards por pessoa com avatar, metas e checklist.
2. Indicadores em anel (adesão, metas).
3. Alertas de quem precisa de atenção.
4. Comparativo da equipe em barras.
5. Linha do tempo de feedbacks.
6. Filtros por período.
7. Organograma desenhado.
8. Estado vazio.
9. Datas relativas.
10. Cores de status consistentes.
11. Detalhe em painel lateral.
12. Valores tabulares.
13. Celular: cards.
14. Exportar relatório de supervisão.
15. Ícones de traço.
16. Tooltip explicando indicadores.
17. Cabeçalho fixo.
18. Contadores no topo.
19. Destaque de evolução (seta).
20. Cores neutras.

## Visão da equipe
1. Grade de pessoas com avatar e status do dia.
2. Mapa de calor da adesão no mês.
3. Ranking com barras.
4. Quem está trabalhando agora (ponto verde).
5. KPIs da equipe no topo.
6. Filtros por setor.
7. Painel lateral por pessoa.
8. Estado vazio.
9. Datas relativas.
10. Cores consistentes.
11. Valores tabulares.
12. Celular: lista.
13. Exportar.
14. Tooltip.
15. Ícones de traço.
16. Comparativo mês anterior.
17. Cabeçalho fixo.
18. Destaque de aniversários/tempo de casa discreto.
19. Organização por setor com títulos.
20. Rodapé com atualização.

## Metas e números
1. Metas em cards com anel de progresso.
2. Ritmo necessário por dia ("faltam R$ x/dia").
3. Linha de projeção no gráfico.
4. Histórico de metas batidas em calendário.
5. Cores: no ritmo / atenção / abaixo.
6. Valores tabulares.
7. Filtro por pessoa/período.
8. Tooltip explicando o cálculo.
9. Estado vazio.
10. Datas relativas.
11. Celular: cards.
12. Exportar.
13. Ícones de traço.
14. Comparativo com mês anterior.
15. Destaque de meta batida (sóbrio).
16. Cabeçalho fixo.
17. Painel lateral de detalhe.
18. Contadores no topo.
19. Gráfico acumulado do mês.
20. Rodapé com atualização.

## Remuneração / Meu ganho
1. Número grande do ganho previsto.
2. Composição em barra empilhada (fixo, variável, bônus).
3. Detalhamento por regra recolhível.
4. Simulador "se eu vender mais R$ x".
5. Histórico mensal em barras.
6. Valores tabulares.
7. Tooltip explicando cada regra.
8. Projeção vs. realizado.
9. Cores neutras com verde só no ganho.
10. Estado vazio.
11. Exportar holerite-prévia em PDF.
12. Datas por extenso.
13. Celular: card único.
14. Ícones de traço.
15. Comparativo mês anterior.
16. Destaque de bônus atingido.
17. Painel lateral de detalhe.
18. Cabeçalho fixo.
19. Privacidade: valores ocultáveis (olho).
20. Rodapé com regra vigente.

## Feedbacks
1. Linha do tempo de feedbacks por pessoa.
2. Tipos com ícone (elogio, ajuste, combinado).
3. Avatar de quem deu/recebeu.
4. Filtros por tipo.
5. Estado vazio.
6. Datas relativas.
7. Combinados com prazo e status.
8. Celular: cards.
9. Busca.
10. Cores neutras.
11. Editor com formatação simples.
12. Privacidade clara (quem vê).
13. Contadores no topo.
14. Exportar.
15. Tooltip.
16. Confirmação ao registrar.
17. Agrupamento por mês.
18. Cabeçalho fixo.
19. Ícones de traço.
20. Rodapé discreto.

## Configurações
1. Menu lateral interno por assunto (Empresa, Pessoas, Integrações, Segurança).
2. Cartões de integração com logo e status (conectado/erro).
3. Formulários com seções e ajuda curta.
4. Salvamento com indicador "salvo".
5. Pessoas em tabela com avatar e permissões em chips.
6. Permissões em matriz visual (pessoa × aba).
7. Zona de perigo separada em vermelho sóbrio.
8. Busca de configuração.
9. Estado vazio.
10. Celular: lista de seções.
11. Ícones de traço.
12. Tooltip explicando cada opção.
13. Datas relativas (última alteração).
14. Confirmação ao salvar.
15. Logo e cores da empresa (preparação white label).
16. Página de segurança (2FA, sessões ativas).
17. Cabeçalho fixo.
18. Cores neutras.
19. Exportar/importar configurações.
20. Rodapé com versão do sistema.

## Logs
1. Tabela com hora, pessoa (avatar), ação e detalhe.
2. Filtros por pessoa, tipo e período.
3. Ícones por tipo de ação.
4. Detalhe "antes → depois" em painel lateral.
5. Datas relativas com exata no hover.
6. Busca.
7. Estado vazio.
8. Cores por gravidade discretas.
9. Exportar.
10. Cabeçalho fixo.
11. Paginação.
12. Celular: lista.
13. Agrupamento por dia.
14. Destaque de ações sensíveis.
15. Tooltip.
16. Copiar ID.
17. Fonte monoespaçada só nos dados técnicos.
18. Contadores no topo.
19. Cores neutras.
20. Rodapé com retenção dos logs.

## Como usar (ajuda)
1. Central de ajuda com busca.
2. Artigos curtos por aba com imagens.
3. Vídeos curtos (gif) de cada fluxo.
4. Tour guiado na primeira vez.
5. Atalhos de teclado em página própria.
6. Novidades (changelog) com datas.
7. Ícones de traço.
8. Estado vazio na busca.
9. Celular: lista de artigos.
10. Contato com suporte em destaque.
11. Perguntas frequentes recolhíveis.
12. Tipografia de leitura confortável.
13. Links entre artigos.
14. Breadcrumb.
15. Glossário (CPA, SLA, ticket médio).
16. Avaliação do artigo (útil/não).
17. Imprimir artigo.
18. Cores neutras.
19. Atualização por data.
20. Rodapé com versão.
