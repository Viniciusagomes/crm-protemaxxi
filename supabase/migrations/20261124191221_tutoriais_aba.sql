-- Aba Tutoriais (24/11, pedido do Vinícius): vídeos curtos de cada tela, guardados num bucket PRIVADO.
-- Quem tem login vê os publicados; só o dono vê os rascunhos, envia arquivos e publica/oculta.
create table if not exists public.tutoriais (
  id bigint generated always as identity primary key,
  ordem int not null,
  titulo text not null,
  descricao text,
  arquivo text not null unique,
  duracao_s numeric,
  publicado boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.tutoriais enable row level security;
create policy tutoriais_ler on public.tutoriais for select to authenticated using (publicado or public.eh_dono());
create policy tutoriais_dono on public.tutoriais for all to authenticated using (public.eh_dono()) with check (public.eh_dono());
revoke all on public.tutoriais from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutoriais', 'tutoriais', false, 52428800, array['video/mp4'])
on conflict (id) do nothing;

-- assistir: só o arquivo de um tutorial publicado (ou qualquer um, para o dono)
create policy tutoriais_sel on storage.objects for select to authenticated
  using (bucket_id = 'tutoriais' and exists (select 1 from public.tutoriais t where t.arquivo = objects.name and (t.publicado or public.eh_dono())));
create policy tutoriais_ins on storage.objects for insert to authenticated with check (bucket_id = 'tutoriais' and public.eh_dono());
create policy tutoriais_upd on storage.objects for update to authenticated using (bucket_id = 'tutoriais' and public.eh_dono()) with check (bucket_id = 'tutoriais' and public.eh_dono());
create policy tutoriais_del on storage.objects for delete to authenticated using (bucket_id = 'tutoriais' and public.eh_dono());

insert into public.tutoriais (ordem, titulo, descricao, arquivo, duracao_s, publicado) values
 (1, 'Tela Início', 'Conferir a atualização do Tiny, checar os alertas, entender os cartões do mês e abrir a fila de hoje.', '01-inicio.mp4', 20.3, true),
 (2, 'Meu dia', 'Para fazer agora, retornos combinados na Fila e leads, leads dos anúncios e o Checklist do dia.', '02-meu-dia.mp4', 23.6, true),
 (3, 'Funil (CRM)', 'Quadro do funil, cartão com a próxima atividade, aba Lista e Novo negócio.', '03-funil-crm.mp4', 23.0, true),
 (4, 'Clientes', 'Carteira e busca, ficha do cliente, Para reativar, Melhores clientes e Prospecção de hoje.', '04-clientes.mp4', 22.2, true),
 (5, 'Vendas', 'Período, Mês atual, cartões dos vendedores e o detalhe de cada um.', '05-vendas.mp4', 21.0, true),
 (6, 'Contas a pagar', 'Vencidas e Esta semana, Vence por semana, lista Em aberto e Pagas (90 dias).', '06-contas-a-pagar.mp4', 20.2, true)
on conflict (arquivo) do nothing;
