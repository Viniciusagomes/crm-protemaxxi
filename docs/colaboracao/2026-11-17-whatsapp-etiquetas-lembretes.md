# WhatsApp: etiquetas, lembretes e cliente achado pelo telefone com/sem o 9 (17/11)

## O que mudou
- **Banco** (migration `20261117175914_whatsapp_etiquetas_lembretes`, já aplicada):
  - `wa_conversas` ganhou `etiquetas text[]`, `lembrete_em`, `lembrete_txt`, `lembrete_por`.
  - `seg.wa_cliente_por_fone`: acha o cliente em `cliente_telefones` com o celular com ou sem o 9 depois do DDD.
    O `wa_entrada` passou a usar essa função (o resto dele está igual). Ligou mais 3 conversas antigas (6 → 9 de 96).
  - RPCs `wa_etiquetas` (só aceita a lista fixa) e `wa_lembrete` (um por conversa; data nula = concluído).
    As duas usam `seg.wa_conv_minha`, a mesma checagem de permissão do `wa_ligar_cliente`. Sem `execute` para `anon/PUBLIC`.
    São `SECURITY DEFINER` como as outras `wa_*`, porque a RLS da tabela só libera leitura.
- **Tela**:
  - A ficha lateral ganhou as etiquetas (clique liga e desliga) e o lembrete (dia e hora, "+2 h", "Amanhã 9h", "Concluído").
  - A lista mostra as etiquetas e o lembrete; acima dela aparecem chips para filtrar pelas etiquetas em uso.
  - Aba nova **Lembretes**: os meus, do que vence primeiro. Quando um vence, avisa uma vez (aviso + notificação do navegador).

## Validação
- `tests/whatsapp-etiquetas.cjs` (a lista do front é igual à do banco, filtros, aba, aviso único, ficha); 30/30.
- Prévia com dados de exemplo conferida no navegador.

## Fora
- As mensagens prontas aprovadas pela Meta ainda não existem; os textos esperam o Vinícius aprovar.
- Revisão do Codex: o `codex` não está instalado neste PC (exit 127), então a entrega saiu sem revisão cruzada.

## Correção: abas do WhatsApp (17/11, tarde)

- A aba "Esperando", quando tinha gente esperando, recebia a classe `alerta`. É o mesmo nome do quadro de aviso global,
  que no acabamento geral (#41) ganhou borda e faixa lateral, e a aba herdou esse visual.
  A classe da aba virou `urgente`. Não há outro uso de `alerta` fora dos quadros de aviso de verdade (conferido no js/).
- As 6 abas agora ficam numa grade de 3 por linha, todas do mesmo tamanho.
- Teste: `whatsapp-etiquetas.cjs` barra o uso de `alerta` na aba.
