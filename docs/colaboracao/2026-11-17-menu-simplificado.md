# Menu simplificado: categorias novas e sub-abas (17/11)

Pedido do Vinícius: reorganizar as categorias, reduzir a quantidade de abas e colocar uma dentro da outra quando fizer sentido.

## Como ficou
| Categoria | Abas |
|---|---|
| (topo) | Início · **Meu dia** (sub-abas: Meu dia, Checklist do dia) |
| Vendas | Funil (CRM) · Clientes · **Vendas** (Painel de vendas, Pedidos) · Situação dos pedidos · Monitoria de preços |
| Financeiro | Boletos em atraso · **Créditos e brindes** (Créditos e vales, Brindes) · Remuneração |
| Atendimento | WhatsApp · Caixa de e-mails · Assistência (OS) |
| Marketing | Tráfego · Calendário de marketing · Avaliações |
| Operação | Mercado Livre · Visão geral do estoque · Expedição · Estoque · TV do estoque · Compras · Cadastro de produtos |
| Equipe | Solicitações · **Supervisão** (Supervisão, Visão da equipe, Feedbacks) · Metas e números |
| Sistema | **Configurações** (Configurações, Logs) · Como usar |

- Menu do dono: de 34 para 28 itens. Saíram do menu Checklist, Pedidos, Brindes, Visão da equipe, Feedbacks e Logs, que agora são sub-abas.
- Mercado Livre foi para Operação, junto do resto do Fefão. Mudou só o lugar no menu; nada dentro da aba mudou.
- Avaliações foi para Marketing, porque é reputação.

## Como funciona
- Nenhuma tela foi apagada nem alterada. `MENU_GRUPOS` (main.js) diz quem mora dentro de quem.
  - O menu mostra só a aba principal, com o número somado das sub-abas, e ela fica marcada quando qualquer sub-aba está aberta.
  - O `topo()` desenha a barra de sub-abas.
  - Os endereços antigos (`#/checklist`, `#/logs`…) continuam valendo.
- Permissões iguais às de antes: as regras de cada aba agora ficam todas em `abaVisivel()`.
  - Se só uma sub-aba é visível, o menu mostra o nome dela. Exemplo: o vendedor vê "Feedbacks", não "Supervisão".

## Validação
- `tests/menu.cjs`: o vendedor vê as mesmas abas de antes, a aba principal fica marcada, título de grupo vazio some, o dono não vê sub-aba no menu e a barra de sub-abas aparece; 32/32.
- Conferido no navegador com o login do dono (menu, Checklist dentro do Meu dia, Logs dentro de Configurações, Visão da equipe dentro de Supervisão).

## Ideias para a próxima rodada (dependem do Vinícius)
- Situação dos pedidos dentro de Vendas. É área do Fefão, então não mexi.
- TV do estoque dentro de Visão geral do estoque (área do Fefão).
- Monitoria de preços dentro de Vendas.

## Segunda rodada (mesmo PR): categorias que abrem e fecham
- Cada categoria do menu virou um botão que abre e fecha (seta). A categoria da aba atual fica sempre aberta.
  As demais lembram o estado neste navegador (`localStorage.menuAbertas`). Fechada, a categoria mostra a soma das pendências.
- A aba aberta mostra embaixo dela as sub-abas, clicáveis (`.menu-sub`).
- Mais 3 abas para dentro de outras: Monitoria de preços → Vendas; Metas e números → Supervisão;
  Como usar → botão "?" no rodapé da barra. A categoria Sistema fica só para o dono (Configurações).
- Barra recolhida: todas as categorias abertas, só com os ícones e sem sub-itens.
- Testes: `menu.cjs` cobre categorias (a atual aberta, as outras fechadas, categoria vazia some) e os sub-itens; 32/32.

## Terceira rodada: Operação do Fefão organizada (com o ok do Vinícius)
- Situação dos pedidos → dentro de **Vendas** (Painel, Pedidos, Situação, Monitoria).
- **Estoque** = Visão geral + Estoque + TV do estoque. A sub-aba TV continua abrindo a TV em outra janela.
- **Compras e produtos** = Compras e fornecedores + Cadastro de produtos.
- Operação passou de 7 para 4 itens: Mercado Livre, Expedição, Estoque, Compras e produtos. Nada mudou dentro das telas do Fefão.
