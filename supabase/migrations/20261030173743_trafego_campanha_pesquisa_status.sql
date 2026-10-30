-- Tráfego (30/10/2026): mais dois tipos na fila de propostas do Google Ads (só o dono aprova).
--  status_campanha    ativar ou pausar uma campanha (com desfazer)
--  campanha_pesquisa  criar uma campanha de Pesquisa completa, SEMPRE pausada (grupos, palavras, negativas, anúncios, extensões)
alter table public.gads_acoes drop constraint if exists gads_acoes_tipo_check;
alter table public.gads_acoes add constraint gads_acoes_tipo_check check (tipo in
  ('negativa_campanha', 'remover_negativa', 'pausar_palavra', 'orcamento_dia', 'local_presenca', 'vincular_extensoes', 'telefone_chamada',
   'anuncio_textos', 'lance_campanha', 'status_campanha', 'campanha_pesquisa'));
