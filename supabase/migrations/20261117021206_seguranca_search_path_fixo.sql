-- Segurança: search_path fixo nas 9 funções apontadas pelo Supabase (function_search_path_mutable).
-- Mesmo caminho que elas já usavam por padrão (public, extensions); só deixa de depender de quem chama.
alter function public.unaccent_simples(text) set search_path = public, extensions;
alter function public.limpa_envio_servico() set search_path = public, extensions;
alter function seg.negocio_carimbos() set search_path = public, extensions;
alter function seg.boleto_carimbos() set search_path = public, extensions;
alter function seg.fone_norm(text) set search_path = public, extensions;
alter function seg.chave_cliente(text,text) set search_path = public, extensions;
alter function seg.mudancas(jsonb,jsonb) set search_path = public, extensions;
alter function seg.fone_tiny(text) set search_path = public, extensions;
alter function seg.sol_responsaveis() set search_path = public, extensions;
