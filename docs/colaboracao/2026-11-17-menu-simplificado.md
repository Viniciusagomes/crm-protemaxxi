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
