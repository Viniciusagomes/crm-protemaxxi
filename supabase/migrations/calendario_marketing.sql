-- Calendário de marketing: itens por dia (post, reels, anúncio, campanha...) no dia de quem tem a permissão "calendario".
-- Só para quem tem a permissão "calendario" (seg.tem_calendario). Quem vê e inclui: a própria pessoa, o supervisor dela (e a cadeia acima) e o dono, pela mesma árvore de seg.pessoas_visiveis().
-- O item que o supervisor ou o dono passou para a pessoa: ela só muda o andamento e a observação; tirar ou reescrever é com quem passou.

create table if not exists public.calendario (
  id bigserial primary key,
  pessoa_id text not null references public.pessoas(id) on delete cascade,
  data date not null,
  titulo text not null check (length(btrim(titulo)) between 1 and 300),
  canal text not null default 'outro' check (canal in ('instagram','facebook','google','site','ml','whatsapp','email','loja','design','outro')),
  status text not null default 'a_fazer' check (status in ('a_fazer','fazendo','revisar','feito')),
  descricao text check (length(descricao) <= 4000),
  link text check (length(link) <= 1000),
  obs text check (length(obs) <= 2000),          -- observação da própria pessoa (andamento, dúvida)
  ordem int not null default 0,
  feito_em timestamptz,
  feito_por text,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists calendario_pessoa_data on public.calendario (pessoa_id, data);

/** Quem criou e quando terminou ficam por conta do banco; o item passado por outra pessoa só muda andamento e observação. */
create or replace function seg.calendario_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare eu text := seg.minha_pessoa();
begin
  if tg_op = 'INSERT' then
    new.criado_por := eu; new.criado_em := now();
  else
    new.criado_por := old.criado_por; new.criado_em := old.criado_em; new.pessoa_id := old.pessoa_id;
    if eu = old.pessoa_id and coalesce(old.criado_por, '') <> eu and not public.eh_dono()
       and (new.titulo, new.data, new.canal, new.descricao, new.link, new.ordem)
           is distinct from (old.titulo, old.data, old.canal, old.descricao, old.link, old.ordem) then
      raise exception 'Este item foi passado pelo seu supervisor: você só muda o andamento e a observação.';
    end if;
  end if;
  if new.status = 'feito' and (tg_op = 'INSERT' or old.status <> 'feito') then new.feito_em := now(); new.feito_por := eu;
  elsif new.status <> 'feito' then new.feito_em := null; new.feito_por := null;
  else new.feito_em := old.feito_em; new.feito_por := old.feito_por; end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke execute on function seg.calendario_antes() from public, anon, authenticated;
drop trigger if exists calendario_antes on public.calendario;
create trigger calendario_antes before insert or update on public.calendario for each row execute function seg.calendario_antes();

/** O calendário só existe para quem tem a permissão "calendario": desligada, ninguém lê nem grava (os itens ficam guardados). */
create or replace function seg.tem_calendario(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (x.permissoes->>'calendario')::boolean from public.pessoas x where x.id = p and x.ativo), false)
$$;
revoke execute on function seg.tem_calendario(text) from public, anon;
grant execute on function seg.tem_calendario(text) to authenticated;

alter table public.calendario enable row level security;
drop policy if exists cal_sel on public.calendario;
create policy cal_sel on public.calendario for select to authenticated using (pessoa_id in (select seg.pessoas_visiveis()) and seg.tem_calendario(pessoa_id));
drop policy if exists cal_ins on public.calendario;
create policy cal_ins on public.calendario for insert to authenticated with check (pessoa_id in (select seg.pessoas_visiveis()) and seg.tem_calendario(pessoa_id));
drop policy if exists cal_upd on public.calendario;
create policy cal_upd on public.calendario for update to authenticated
  using (pessoa_id in (select seg.pessoas_visiveis()) and seg.tem_calendario(pessoa_id)) with check (pessoa_id in (select seg.pessoas_visiveis()) and seg.tem_calendario(pessoa_id));
drop policy if exists cal_del on public.calendario;
create policy cal_del on public.calendario for delete to authenticated
  using (pessoa_id in (select seg.pessoas_visiveis()) and seg.tem_calendario(pessoa_id) and (public.eh_dono() or pessoa_id <> seg.minha_pessoa() or criado_por = seg.minha_pessoa()));
revoke all on public.calendario from anon, public;
grant select, insert, update, delete on public.calendario to authenticated;
grant usage on sequence public.calendario_id_seq to authenticated;
