# WhatsApp com cara de app + revisão de segurança (17/11/2026)

## WhatsApp (js/atendimento.js, css/app.css)

Tela refeita no estilo do WhatsApp (claro e escuro), sem mudar banco nem Edge Function:

- Lista com avatar (iniciais, cor fixa por número), prévia, hora, bolinha verde de não lidas.
- **Aba "Esperando"**: conversas abertas (minhas ou sem dono) cuja última mensagem é do cliente, a mais antiga primeiro.
  Etiqueta de tempo de espera em cada conversa: verde < 5 min, amarelo 5–15 min, vermelho > 15 min. Atualiza a cada minuto.
- Conversa: separador de dia (Hoje/Ontem/data), bolhas com "rabinho", tiques ✓/✓✓/azul, citação da mensagem respondida,
  nome do perfil em cima da resposta, nota interna amarela, foto ampliada ao clicar, áudio com 1×/1,5×/2×, documento com ícone.
- Caixa de texto: cresce com o texto; **"/" abre as respostas prontas** (setas + Enter/Tab), com variáveis
  `{nome}`, `{vendedor}`, `{saudacao}`; botão de nota interna (modo amarelo); fora das 24 h o Enter salva nota.
- Respostas prontas: botão "Criar pacote inicial" (7 textos) quando não há nenhuma.
- Ficha do cliente vira painel lateral (botão ⓘ ou clique no nome). No celular: lista ou conversa, com botão voltar.
- Regras mantidas: nada é enviado sozinho; janela de 24 h; expediente/atendimento direto; transferir/assumir/encerrar.

## Segurança

- Varredura do repositório e de todo o histórico do git: **nenhum segredo**. Único JWT é a `anonKey` (role `anon`, pública).
- Teste como `anon` (transação revertida) em todas as tabelas/views com grant: **0 linhas visíveis** em todas.
  Views são `security_invoker`. Buckets `anexos`, `emails`, `whatsapp` privados com políticas.
- Migration `20261117021206_seguranca_search_path_fixo.sql` (aplicada): `search_path` fixo nas 9 funções do alerta
  `function_search_path_mutable` (mesmo caminho que já usavam).
- Ficou para o Vinícius (painel do Supabase › Auth): ligar **Leaked password protection**.
- Funções `SECURITY DEFINER` executáveis por `anon` são as das páginas públicas com token (OS, avaliação, fornecedor):
  esperado. Revisão fina das 59 executáveis por `authenticated` fica para a rodada de pentest.

## Validação

- `node tests/rodar-todos.cjs`: 27/27 (novo `tests/whatsapp-visual.cjs`).
- Prévia local com dados fictícios (claro/escuro, "/" com variáveis) conferida no navegador.
- Sem revisão do Codex (não instalado neste PC).
