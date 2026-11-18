# Segurança: rodada 2 do pentest (18/11)

- **Banco** (migration `20261118122539_seguranca_pentest_rodada2`, aplicada):
  - `seg.pode_assist()` (dono ou permissão `suporte`) passou a valer para escrever em todas as tabelas `at_*` e para ler `at_avisos`;
  - `at_os_sel` = `pode_assist()` ou `pode_mexer_cliente(cliente_chave)`;
  - `clitel_sel` = membro e (cadastrou o telefone, ou `pode_mexer_cliente`, ou tem negócio com o cliente);
    índice novo `prospeccao (cliente_chave, pessoa_id)`;
  - `config_sel`: `encargos` só o dono; `fiscal` com ecommerce/expedição; `contas_pagar` para a caixa `boletos`.
- **`ads-lead` v7** (publicada; cópia nova no repositório): o IP do limite vem do cabeçalho da conexão.
- **Site:**
  - CSP com `script-src` só para `cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/`;
  - CSP também em privacidade.html e termos.html;
  - telefones reais trocados por fictícios.
- **Validação:**
  - simulação em transação desfeita com Pedro (vendedor), Marcos (suporte), Vinícius (dono) e Felipe Menezes (supervisor);
  - tempos medidos nas consultas da tela;
  - `tests/seguranca.cjs`; 34/34.
- **Para o Codex:** a escrita na Assistência agora exige a permissão `suporte`. Quem precisar mexer em OS por outro caminho
  deve ganhar essa permissão ou usar uma função `SECURITY DEFINER` com checagem própria.
- **Fica de fora:**
  - esconder o e-mail e as permissões dos colegas (quebra o upsert de pessoas);
  - limpar o histórico do git (precisa de force push, decisão do Vinícius).
