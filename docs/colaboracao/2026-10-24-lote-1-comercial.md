# Lote comercial 1 — aprovado e implementado em 24/10/2026

## Escopo aprovado (dez passos)

1. Prospecção, Meu dia e Supervisão compartilham a contagem de contatos; pular fica separado.
2. Meu dia/Supervisão carregam o resumo diário independentemente da abertura da campanha, com consulta paginada sujeita à RLS. Falha aparece como indisponibilidade, sem inventar zero.
3. `prospeccao_registrar` grava resultado, histórico e retorno em uma transação; valida resultado esperado, bloqueia concorrência por linha e não duplica uma requisição repetida. Corrigir o resultado encerra o retorno anterior sem apagar o histórico. Alterar retorno cujo autor não pode ser editado falha integralmente e explica a restrição.
4. Conclusão de atividade oferece resultado e próximo passo no mesmo formulário. `atividade_concluir` salva conclusão, interação e nova atividade atomicamente; também é idempotente. O operador pode concluir sem novo retorno, mantendo o alerta de negócio sem atividade quando aplicável.
5. Cobranças automáticas `cobrar:%` de negócios encerrados são arquivadas, sem marcar como feitas. Backfill: 18 atividades. Trigger trata fechamentos futuros e inserções tardias. Follow-ups manuais encerrados vão para revisão (manter/arquivar); pós-vendas e tarefas gerais permanecem. Meu dia possui lista de arquivadas, e a ficha mantém histórico.
6. `crm_ganhos` deixa de fechar por compra coincidente, valor parcial ou sobreposição de itens. `v_crm_revisoes` indica pedidos posteriores e propostas com itens em comum para conferência humana; indícios não provam relação causal. A conclusão explícita importada do orçamento no Tiny continua reconhecida pelo sincronizador existente.
7. `crm_limpeza` deixa de perder negócios por inatividade ou semelhança de propostas. Mais de 15 dias sem movimento gera alerta de recuperação no Funil/Meu dia. Não reabre retroativamente negócios já encerrados.
8. `v_clientes` agrega pedidos não cancelados entre hoje menos 12 meses e hoje (inclusive), usando data de São Paulo. Mantém primeira compra histórica para não chamar cliente antigo de novo. Contagem, frequência, total e vendedor predominante usam a mesma janela. Paginação da carteira tem desempate por chave.
9. WhatsApp de avaliação fica pendente com `preparado_em` ao abrir a mensagem. Só o botão de confirmação registra envio manual, sem atestar entrega/leitura. Registros antigos sem essa preparação aparecem como envio não verificado, sem reenvio automático. A prospecção continua exigindo registro explícito do resultado.
10. Toda nota de 1 a 5 recebe a mesma opção pública do Google e relato privado. Sai o redirecionamento automático por nota alta. Notas baixas continuam na fila de tratamento. Pré-seleção por e-mail ainda exige confirmação humana, para evitar avaliação por robôs de links.

## Melhoria adicional aprovada: linguagem das mensagens

- Usa dias civis, sem intervalos exatos incômodos: hoje, ontem, há alguns dias, há algumas semanas, há alguns meses, há cerca de um ano, há mais de um ano, há alguns anos.
- Exemplo: 243 dias vira “há alguns meses”. Data inválida, ausente ou futura omite a expressão.
- Referência temporal somente junto do item identificado da compra correspondente. Texto por finalidade: complemento, reposição, retomada, indicação ou projeto de instalador.
- Evita presumir instalação ainda em curso, falta de acessórios, estoque disponível, compatibilidade e condições comerciais. Sem dados de produto, a retomada não inventa uma compra.
- O vendedor pode revisar. Rascunho e posição de edição sobrevivem a redesenhos; abrir WhatsApp não soma contato nem envia automaticamente.

## Migração e validação

- Migração gerada pela CLI e aplicada pelo conector: versão remota `20261024145407`, nome `lote_1_comercial`. Arquivo local alinhado à versão aplicada.
- Complemento `20261024150020_crm_movimento_atividade`: concluir um contato de tarefa automática renova o movimento do negócio; apenas gerar a tarefa não renova. Trigger passa a usar SECURITY INVOKER e search_path fixo. O teste autenticado confirma a criação sem movimento e a conclusão com movimento.
- Novas RPCs são `SECURITY INVOKER`, `search_path` fixo, `anon/PUBLIC` sem execução. Nova view usa `security_invoker=true`; regras de acesso existentes não foram ampliadas.
- Testes Node: `comercial-lote-1.cjs`, `colaboradores.cjs`, `email-access.cjs`, `email-archives.cjs`.
- Integração real: `tests/comercial-lote-1.sql`, em transação revertida, com identidade autenticada de vendedor/RLS. Cobriu resultado + retorno, retry, conflito, pular sem nova interação, bloqueio de outra carteira, erro sem conclusão parcial, conclusão com próximo passo, cobrança encerrada/tardia e alerta de inatividade sem perda. Nenhum contato externo foi enviado.
- Carteira: 3.505 clientes e R$ 3.405.648,45; soma conferida contra os pedidos elegíveis na consulta de validação (fotografia da data, sujeita às vendas posteriores).
- View de revisão: 95 negócios abertos, 2 com pedidos para conferir, nenhum em risco por inatividade na fotografia. Plano administrativo da consulta executou em cerca de 1,25 ms; não representa todas as sessões/RLS em produção.
- Assessoria de segurança antes/depois sem aumento dos avisos: 2 tabelas sem política, 9 funções com search_path mutável, 11 funções públicas definer, 36 funções definer autenticadas, proteção de senha vazada desligada. São avisos preexistentes, fora deste lote. A assessoria de desempenho mantém dívidas antigas de índices/políticas; o índice novo ainda aparece como não usado por ser recém-criado.
- Recursos da interface: `20261024b` em index.html e avaliar.html.

## Continuidade com Claude

Consultar esta migração e este PR antes de alterar campanha, conclusão de atividade, automações de fechamento, carteira e avaliações. Não reintroduzir heurísticas de ganho/perda nem confirmação de WhatsApp pela simples abertura da conversa. Este arquivo e o GitHub compartilham o contexto; não há confirmação de recebimento pela sessão do Claude. O lote 2 ainda depende de aprovação do responsável.
