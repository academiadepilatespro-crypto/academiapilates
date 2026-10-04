/* Autenticação compartilhada do Pilates Pro.
 * A sessão válida é sempre a sessão do Supabase Auth; localStorage serve apenas para cache visual.
 */
(function () {
  const SESSION_KEY = "usuario";

  function limparSessaoLocal() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function redirecionarLogin() {
    const caminho = window.location.pathname;
    if (caminho.endsWith("/index.html") || caminho.endsWith("/")) return;
    const destino = window.location.pathname.includes("/html/")
      ? "../index.html"
      : "index.html";
    window.location.replace(destino);
  }

  window.requireAuthenticatedUser = async function requireAuthenticatedUser(
    supabaseClient,
  ) {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();
      if (authError || !user || !user.email) throw authError || new Error("Sessão expirada");

      const { data: profile, error: profileError } = await supabaseClient
        .from("usuarios")
        .select("id, nome, email, telefone, cargo, avatar_url, role, ativo")
        .eq("email", user.email)
        .eq("ativo", true)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("Usuário sem perfil ativo");

      window.usuarioAutenticado = profile;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
      } catch (_) {}
      return profile;
    } catch (error) {
      console.warn("Sessão inválida:", error?.message || error);
      limparSessaoLocal();
      try {
        await supabaseClient.auth.signOut({ scope: "local" });
      } catch (_) {}
      redirecionarLogin();
      return null;
    }
  };

  window.signOutPilates = async function signOutPilates(supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } finally {
      limparSessaoLocal();
      redirecionarLogin();
    }
  };
})();
