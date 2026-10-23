-- Marcos mantém consulta e marcação de leitura, sem arquivar/desarquivar.
create or replace function seg.emails_proteger_arquivamento()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user = 'authenticated' then
    if new.arquivado is distinct from old.arquivado and public.eu() = 'marcos' then
      raise exception 'Seu acesso permite consultar os e-mails, mas não arquivar ou desarquivar.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function seg.emails_proteger_arquivamento() from public, anon, authenticated;

create trigger emails_proteger_arquivamento
before update of arquivado on public.emails
for each row execute function seg.emails_proteger_arquivamento();
