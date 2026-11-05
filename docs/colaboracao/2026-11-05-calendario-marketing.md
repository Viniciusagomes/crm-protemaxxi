# Calendário de marketing (05/11/2026)

## Pedido
O Vinícius quer um calendário de marketing no dia do Vinicius Gonçalves (estagiário de marketing), do tipo Notion ou Todoist,
em que ele e o Marcos (supervisor) acompanhem o trabalho e incluam itens por dia.

## O que mudou
- **Banco:** tabela nova `calendario` (migration `*_calendario_marketing.sql`). Cada item tem pessoa, dia, título, canal, andamento
  (a fazer, em produção, para revisar, feito), briefing, link e a observação da pessoa.
  - A RLS usa `seg.pessoas_visiveis()`: a própria pessoa, a cadeia de supervisores acima dela e o dono.
  - O trigger `seg.calendario_antes` grava `criado_por`, `feito_em` e `feito_por` e não deixa trocar a pessoa do item.
  - No item que o supervisor passou, a pessoa só muda o andamento e a observação.
  - Excluir: quem criou, o supervisor ou o dono. A pessoa não exclui o item que recebeu.
- **Permissão:** `permissoes.calendario` na pessoa (Configurações › Acessos › "Calendário de marketing"). Vale também no banco (`seg.tem_calendario` nas quatro políticas): com ela desligada, ninguém lê nem grava, e os itens ficam guardados.
- **Tela** (`js/calendario.js`, aba **📅 Calendário de marketing** no grupo Equipe):
  - visão do mês em grade, com cor por canal, e visão em lista;
  - o "+" em cada dia inclui itens, e o item pode ser arrastado para outro dia;
  - "O que fazer" aceita uma linha por item;
  - "Repetir": todo dia útil por 1 semana, toda semana por 4 ou 8 semanas, ou todo mês por 3 meses (máximo de 60 itens de uma vez).
- **Card "📅 Calendário de marketing"** no Meu dia (as duas versões) e no Checklist da pessoa, no dia escolhido. Mostra os atrasados, e tanto o checkbox quanto o andamento podem ser mudados ali mesmo.
- Versões no `index.html`: `app.css`, `equipe.js`, `crm.js`, `main.js` e o novo `calendario.js`.

## Validação
- `tests/calendario.cjs` cobre:
  - as datas do repetir, inclusive mês curto e fim de semana;
  - as linhas viram itens;
  - quem enxerga o calendário;
  - o card escapa o texto e não mostra link que não seja http(s);
  - a grade fecha em semanas completas;
  - a regra do item passado pelo supervisor no formulário, ao gravar e ao arrastar;
  - o insert não manda `criado_por`;
  - o atrasado sai da lista ao ser concluído.
- `tests/email-access.cjs` e `tests/checklist-meu-dia.cjs` ganharam um stub para as funções novas.
- `node tests/rodar-todos.cjs`: 19/19.
- Banco: a migration foi simulada numa transação desfeita no fim, com os logins reais do Marcos, do Vinicius G., da Diana e do dono (aal2).
  - O Marcos inclui no calendário do Vinicius G., mas não no do dono.
  - O Vinicius G. muda o andamento do item que recebeu e fica gravado como `feito_por`. Reescrever o título é barrado. O item que ele mesmo criou, ele edita.
  - O Vinicius G. não exclui o item do Marcos, não inclui no calendário da Diana e não consegue trocar a pessoa do item.
  - A Diana não vê nada. O Marcos sem aal2 também não vê nada.
  - Reabrir o item limpa o `feito_por`. O Marcos exclui.
- Revisão do Codex, com três achados, todos corrigidos:
  - a permissão não era conferida no banco;
  - o item novo do supervisor não aparecia em tela já aberta (agora entra na atualização de 10 min e ao voltar para a aba);
  - na virada do dia, a lista de atrasados ficava velha (o cache passou a valer só no dia em que foi carregado).
  - Nova simulação no banco: com a permissão desligada, o Marcos vê 0 e não inclui; a Diana, que não tem permissão, também fica barrada.
- Prévia visual com dados fictícios, no tema escuro e no celular (375px): a tela não estoura a largura.

## Fora
- A migration ainda não foi aplicada em produção: aguarda o OK do Vinícius. Depois disso, ligar `permissoes.calendario` no `vinicius_g`.
- Não há notificação quando alguém inclui item. A pessoa vê o item no Meu dia.
