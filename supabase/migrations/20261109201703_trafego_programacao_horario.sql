-- Tráfego (09/11/2026): tipo novo na fila de propostas do Google Ads (só o dono aprova).
--  programacao_horario  anúncios só entre inicio_hora e fim_hora, todos os dias (com desfazer: remove os critérios criados)
alter table public.gads_acoes drop constraint if exists gads_acoes_tipo_check;
alter table public.gads_acoes add constraint gads_acoes_tipo_check check (tipo in
  ('negativa_campanha', 'remover_negativa', 'pausar_palavra', 'orcamento_dia', 'local_presenca', 'vincular_extensoes', 'telefone_chamada',
   'anuncio_textos', 'lance_campanha', 'status_campanha', 'campanha_pesquisa', 'programacao_horario'));
