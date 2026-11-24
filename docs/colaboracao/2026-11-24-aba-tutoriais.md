# Aba Tutoriais (24/11/2026)

Pedido do Vinícius: subir os vídeos tutoriais (um por tela) numa aba "Tutoriais" da Intranet, e ir publicando conforme ele aprovar.
Decisão dele: os vídeos ficam no **Supabase privado**, e não no repositório (que é público).

## O que mudou
- **Banco** (migration `20261124191221_tutoriais_aba`, já aplicada):
  - tabela `tutoriais` (ordem, título, descrição, arquivo, duração, publicado);
  - bucket **privado** `tutoriais` (só MP4, até 50 MB).
  - RLS:
    - quem tem login lê os publicados, e o dono lê todos;
    - só o dono grava na tabela e envia, troca ou apaga arquivos;
    - o vídeo só abre se a linha dele estiver publicada (ou para o dono).
  - Os 6 tutoriais aprovados (Início, Meu dia, Funil, Clientes, Vendas, Contas a pagar) já entraram como publicados, com os nomes `01-inicio.mp4` … `06-contas-a-pagar.mp4`.
- **Tela** (`js/tutoriais.js`, novo):
  - aba "Tutoriais" no menu, logo depois de Meu dia, para todos os perfis;
  - cada cartão tem título, duração, descrição e o player;
  - o vídeo abre por link assinado de 1 hora e começa no quadro de abertura.
  - **Só o dono** vê "⬆ Enviar vídeo / Trocar vídeo" (sobe o MP4 com o nome da tabela, sem passar pelo painel do Supabase), "Publicar / Ocultar" e a tag "rascunho".
- `js/main.js`: item do menu, rota, `tutoriais` na lista de abas de todos os perfis e as ações `tutPublicar` / `tutArquivo`.
- `js/util.js`: ícone `tutoriais` (tela com play).
- `index.html`: `tutoriais.js?v=20261124a`; `util.js` e `main.js` subiram para `?v=20261124a`.

## Validação
- `tests/tutoriais.cjs` (novo):
  - o vendedor vê só o publicado, sem botões;
  - o dono vê o rascunho, "Enviar vídeo" quando o arquivo não está no bucket, e "Publicar/Ocultar";
  - a formatação da duração.
- `tests/menu.cjs` atualizado com o novo item.
- `node tests/rodar-todos.cjs`: 42/42.
- Prévia numa cópia isolada (sem rede, dados fictícios), como dono e como vendedor: menu, cartões e player funcionando.
- Sem revisão do Codex (não instalado neste PC).

## Para publicar os vídeos
Depois do merge, na aba Tutoriais, o Vinícius clica em "⬆ Enviar vídeo" em cada cartão e escolhe o MP4 correspondente. Os arquivos prontos, com faststart, ficam na pasta local `tutoriais-video/_para-subir/`, fora do repositório. Os próximos vídeos entram como linha nova na tabela (`publicado = false`) e ele publica quando aprovar.

## Para o Codex
Se mexer na aba, mantenha o bucket privado e o link assinado. Não colocar MP4 no repositório.
