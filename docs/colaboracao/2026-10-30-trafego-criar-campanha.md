# Tráfego · criar campanha de Pesquisa e ativar/pausar pela fila — 30/10/2026 (Claude)

Pedido do Vinícius: criar a campanha de Pesquisa "distribuidor Haiz em Campinas" (documento `ENTREGA-FINAL.md`) e,
já que a fila não tinha como pausar o Demand Gen, também ativar/pausar campanhas. Tudo continua pela fila `gads_acoes`:
**só o dono aprova** e o Google valida antes ("Testar no Google").

## O que mudou

- **Migration** `20261030173743_trafego_campanha_pesquisa_status` (já aplicada): `gads_acoes_tipo_check` aceita
  `status_campanha` e `campanha_pesquisa`.
- **`gads-aplicar`** (função publicada, versão 7; cópia em `supabase/functions/gads-aplicar/`):
  - `status_campanha {campanha_id, status: ENABLED|PAUSED}`: só ativa/pausa (nunca remove); guarda o estado anterior para
    desfazer; o resultado mostra o orçamento diário que volta a valer.
  - `campanha_pesquisa {nome, orcamento_dia, cpc_max, local, url_final, negativas, grupos[], sitelinks[], frases_destaque[]}`:
    uma única chamada atômica `googleAds:mutate` com IDs temporários negativos (orçamento, campanha, local por raio,
    idioma, negativas, grupos, palavras, anúncio responsivo, sitelinks e frases de destaque). "Testar" usa `validateOnly`.
  - `remover_campanha_nova`: só como **desfazer** da criação; recusa se a campanha já teve impressão (aí é pausar).
- **`campanha.js`** (JS puro, para o teste em Node ler o mesmo código): monta e confere tudo. A campanha **sempre nasce
  `PAUSED`** (não há opção de nascer ativa), só Rede de Pesquisa (sem parceiros e sem Display), "presença", "Maximizar
  cliques" com teto de CPC, correspondência **frase ou exata** (ampla é recusada), orçamento limitado por
  `config.gads.limite_nova_campanha_dia` (padrão R$ 50), textos conferidos (títulos 30, descrições 90, sitelinks 25,
  destaques 25, sem repetição).
- **`js/trafego.js`** (`?v=20261030f`): `trDescAcao` descreve as duas ações novas (campanha com resumo, orçamento, raio,
  grupos e palavras; ativar com aviso de gasto). Textos escapados.
- **`tests/campanha-pesquisa.cjs`**: montador (operações, IDs temporários criados antes de usados, pausada, micros,
  proximidade, negativas, 22 recusas, limites exatos) e a descrição na tela.

## Propostas criadas no banco (dados da conta, não vão para o repositório)

- nº 32: campanha "PESQ | Haiz Switches | Campinas 30km" (R$ 30/dia, nasce pausada). **Validada no Google (validateOnly): ok.**
- nº 33: pausar o Demand Gen "(D) Institucional - Revenda" (compensa o gasto novo). Validada: ok.

## O que ficou de fora

- Display/remarketing da seção 4 do documento (depende de lista de ~100 visitantes).
- Descrições dos sitelinks (o Google exige as duas linhas ou nenhuma; o documento tem só uma).
- Conta de conversão por campanha ("só Lead - WhatsApp"): com "Maximizar cliques" não otimiza por conversão.
- Planejador de Palavras-chave (volume): não há função de leitura ainda.

## Validação

- `node tests/rodar-todos.cjs`: 14/14.
- Migration aplicada e função publicada; `testar` pelo servidor (x-sync-secret) nas propostas 32 e 33: `ok`.
- Nenhuma campanha foi criada e nada mudou na conta: só validação.

## Revisão do Codex

`codex exec` (gpt-6.1-sol, somente leitura), 1 rodada: payload do Google, IDs temporários, ordem das operações e
`validateOnly` sem erro; a campanha só nasce `PAUSED`; SQL ok. Achou 3 pontos, **todos corrigidos** (função publicada v8):

- **P1** XSS na tela de Propostas: `negativas`/`sitelinks`/`frases_destaque` usavam `.length` sem checar o tipo.
  Agora só contagem de arrays (`trDescAcao`); teste com objetos malformados.
- **P1** `status_campanha` com `status: "enabled"` aparecia como "PAUSAR" na tela e o servidor (que convertia para
  maiúsculas) ativava. Agora o servidor exige exatamente `ENABLED`/`PAUSED` e a tela mostra "SITUAÇÃO INVÁLIDA".
- **P2** `lance_campanha` em campanha nova (`TARGET_SPEND` = Maximizar cliques) trocava o lance sem como desfazer.
  Agora recusa com mensagem; mude pelo painel do Google.

Fora do escopo (já existia): `pausar_palavra` também converte a caixa do status; vale alinhar numa próxima.

## Para o Codex

- Ao mexer no `gads-aplicar`, mantenha a cópia em `supabase/functions/gads-aplicar/` igual à publicada (incluindo
  `comum.ts` e `campanha.js`).
- Ativar uma campanha é decisão de gasto do Vinícius: não crie ação que ative sozinha.
