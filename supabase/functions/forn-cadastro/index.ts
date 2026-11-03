// Cadastro do fornecedor pelo convite de uso único (página pública fornecedor.html?c=<convite>).
//  POST { convite, email, senha, dados: { nome, contato, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, cidade, uf } }
// Cria o login (e-mail e senha) e o fornecedor. O CNPJ vem sempre do convite, nunca do navegador.
// Se o cadastro falhar depois de criar o login, o login criado aqui é apagado.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OBRIGATORIOS = ["nome", "telefone", "whatsapp", "cep", "logradouro", "numero", "bairro", "cidade", "uf"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não aceito" }, 405);
  let b: { convite?: string; email?: string; senha?: string; dados?: Record<string, unknown> };
  try { b = await req.json(); } catch { return json({ erro: "pedido inválido" }, 400); }
  const convite = String(b.convite ?? ""), email = String(b.email ?? "").trim().toLowerCase(), senha = String(b.senha ?? "");
  if (!/^[a-f0-9]{32,}$/.test(convite)) return json({ erro: "Convite inválido." }, 400);
  if (!EMAIL.test(email) || email.length > 160) return json({ erro: "Digite um e-mail válido." }, 400);
  if (senha.length < 8 || senha.length > 72 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return json({ erro: "A senha precisa ter pelo menos 8 caracteres, com letras e números." }, 400);

  const dados = b.dados ?? {};
  if (OBRIGATORIOS.some((k) => !String(dados[k] ?? "").trim())) return json({ erro: "Preencha todos os campos obrigatórios." }, 400);

  const { data: cv, error: e1 } = await sb.rpc("forn_convite_ver", { p_convite: convite });
  if (e1) { console.error("convite", e1.message); return json({ erro: "Não foi possível conferir o convite. Tente de novo." }, 500); }
  if (!cv) return json({ erro: "Este convite não vale mais (já foi usado ou venceu). Peça um novo à equipe de compras." }, 410);

  const { data: criado, error: e2 } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { tipo: "fornecedor" } });
  if (e2 || !criado?.user) {
    if (/already|registered|exists/i.test(e2?.message ?? "")) {
      await sb.rpc("forn_convite_tentativa", { p_convite: convite });
      return json({ erro: "Este e-mail já tem acesso. Use outro e-mail para o portal." }, 409);
    }
    if (/password|weak/i.test(e2?.message ?? "")) return json({ erro: "Esta senha é fraca. Escolha outra." }, 400);
    console.error("login", e2?.message);
    return json({ erro: "Não foi possível criar o login. Tente de novo." }, 500);
  }

  const { error: e3 } = await sb.rpc("forn_cadastrar", { p_convite: convite, p: { ...dados, email }, p_user: criado.user.id });
  if (e3) {
    let e4 = null;
    for (let i = 0; i < 3; i++) { ({ error: e4 } = await sb.auth.admin.deleteUser(criado.user.id)); if (!e4) break; }
    if (e4) console.error("login órfão", criado.user.id, e4.message);
    if (e3.code === "P0001") return json({ erro: e3.message }, 400);
    if (e3.code === "23505") return json({ erro: "Este CNPJ já é fornecedor cadastrado." }, 409);
    console.error("cadastro", e3.message);
    return json({ erro: "Não foi possível concluir o cadastro. Tente de novo." }, 500);
  }
  return json({ ok: true });
});
