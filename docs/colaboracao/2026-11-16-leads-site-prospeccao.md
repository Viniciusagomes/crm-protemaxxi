# Leads da landing page na campanha de prospecção (16/11/2026)

Pedido do Vinícius: conferir quais leads da landing page (lista colada do painel da página, 03/11 a 16/11) são novos
de verdade e distribuir igualmente entre os vendedores, na campanha do dia de cada um.

## Conferência (feita no banco, por telefone: DDD + 8 últimos dígitos)

38 leads na lista →
- 4 com telefone inválido ou incompleto: descartados.
- 1 repetido (Davilson: formulário 11/11 e chatbot 09/11): contado uma vez.
- 5 já conversando no WhatsApp da Intranet (4 com o Felipe Menezes, 1 com o Pedro): fora da campanha.
- Nenhum bateu com cliente/contato do Tiny.
- **28 novos** → inseridos em `prospeccao` em 16/11, lista `site`, rodízio por ordem de chegada:
  Pedro 10, Felipe Menezes 9, Felipe Moreira 9.

Cada linha: `cliente_chave = 'site:55<telefone>'` (não existe em `clientes`), `cliente_nome` (vazio quando o lead não
deu nome), `motivo` com data, canal, perfil, interesse e telefone, `dados` com `fone`, `origem`, `canal`, `perfil`,
`interesse`, `chegou_em`.

## Tela (`js/carteira.js`, `?v=20261116a`)

- Lista `site` = "🌐 Lead do site".
- O card usa `dados.fone` quando a chave não é de cliente cadastrado, então o botão "Chamar no WhatsApp" funciona.
- Nome sem link para a ficha (não há cliente cadastrado); "Lead sem nome" quando vier vazio.
- Mensagem pronta própria ("Vi que você deixou seu contato no nosso site com interesse em …").
- Até o merge, o telefone já aparece no texto do motivo.

## Validação

- `tests/leads-site.cjs` novo; `node tests/rodar-todos.cjs` 25/25.
- Sem revisão do Codex (não instalado neste PC).

## Para o Codex

Se um dia os leads da página forem gravados direto pelo site, usar a mesma lista `site` e a chave `site:55<fone>`.
