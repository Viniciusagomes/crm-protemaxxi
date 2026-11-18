# Contas a pagar (18/11)

Pedido do Vinícius: os boletos da Supritec vieram numa planilha e quase nenhum estava na Intranet. Antes disso, os boletos
a pagar só entravam por e-mail (`boletos@`), e desde 22/10 nenhum tinha sido marcado como pago.

## O que muda
- **Aba nova "Contas a pagar"** (Financeiro, `#/contas`, `js/contas.js`). **Só os donos** (`SO_DONO`; no banco, `eh_dono()`).
  - Números: em aberto, vencidas, esta semana (até domingo), próximos 30 dias. Gráficos "Vence por semana" (8 semanas) e "Por fornecedor".
  - Lista por grupo (vencidas, esta semana, depois, sem vencimento), com Paga, Ignorar (e-mail), Excluir (planilha/manual) e Copiar linha. Aba "Pagas (90 dias)", com Desfazer.
  - **Importar planilha do fornecedor** (.xls, .xlsx, .ods, .csv, ou linhas coladas do Excel):
    - acha sozinha as colunas de vencimento, valor (prefere "líquido"), documento e parcela;
    - mostra a prévia antes de gravar, e a linha de total fica de fora;
    - opção (marcada por padrão) de que o que venceu antes de hoje entre como pago.
    - A planilha é lida **no navegador** com o SheetJS 0.20.3 (`js/vendor/xlsx.full.min.js`, cópia do CDN oficial, sha256 `cc0151…6f41`), carregado só ao importar.
    - O servidor de funções não aceita importar do `cdn.sheetjs.com`, e o pacote do npm (0.18.5) tem falhas conhecidas ao ler arquivos de terceiros.
  - **Lançar conta** à mão.
- **Banco** (`20261118185957_contas_pagar_aba`, aplicada):
  - `boletos_pagar` ganhou `origem` (email/planilha/manual), `documento`, `parcela` e `criado_por`, e `linha` passou a aceitar vazio;
  - políticas de insert/delete só para donos (delete só do que não veio do e-mail);
  - RPC `contas_pagar_importar` (definer, só dono): pula o que já foi importado e, se o boleto da parcela já chegou por e-mail, só completa documento/parcela nele;
  - gatilho `boletos_pagar_casar`: quando o boleto chega por e-mail depois, junta com a parcela da planilha (mesmo valor e vencimento, CNPJ compatível, só se houver uma);
  - `seg.cnpj_valido`;
  - limpeza dos CNPJs lidos errado;
  - pedido do Vinícius: tudo que venceu antes de 18/11 conta como pago.
- **Leitura do boleto por e-mail** (`email-entrada` v12, publicada):
  - o CNPJ do beneficiário passa a exigir os dígitos verificadores certos e ignora os números da linha digitável;
  - antes, o fim do código de barras (vencimento + valor) passava por CNPJ, e por isso 11 de 20 boletos estavam sem fornecedor;
  - ação nova `reler_boletos` (só servidor), já rodada: **os 20 boletos ficaram com fornecedor e CNPJ certos**.
- **E-mail das 17h** (`contas-pagar` v6, publicada; a cópia entrou no repositório agora):
  - inclui as parcelas sem boleto (mostra o documento);
  - o link vai para Contas a pagar.
  - O teste (`{teste:true}`) passou e ligou 12 boletos às notas (antes era 1).
- Caixa de e-mails › Boletos: aviso com botão para a aba nova. A lista e o "ligar nota" continuam lá.

## Validação
- `tests/contas-pagar.cjs`: leitura da planilha (formato Supritec com dados fictícios, cabeçalho mais abaixo, colado do Excel), datas e números de célula, resumo por semana/fornecedor, regras do banco, CNPJ do boleto. 40/40.
- Prévia no portal com os dados reais (sem gravar): os números da aba e a planilha real da Supritec (30 parcelas, R$ 147.145,91, 7 vencidas antes de hoje, total fora).
- **Ainda não importei a Supritec**: fica para depois do merge, pela aba, com o Vinícius vendo.

## Para depois
- O Hewerton entra como dono quando for cadastrado (nome e e-mail com o Vinícius).
- Contas do Tiny: não usam (Vinícius, 18/11).
