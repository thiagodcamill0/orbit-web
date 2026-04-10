/**
 * auth-guard.js — Orbit
 *
 * Valida sessão, redireciona para login se necessário e carrega
 * os dados do usuário (profile + workspace) para uso global.
 *
 * Expõe o objeto global `OrbitSession` após inicialização:
 *   OrbitSession.user        → objeto do Supabase Auth (id, email, etc.)
 *   OrbitSession.profile     → linha da tabela profiles
 *   OrbitSession.workspaceId → UUID do workspace do usuário
 *
 * Ordem de carregamento obrigatória no HTML:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/config.js"></script>
 *   <script src="js/supabase-client.js"></script>
 *   <script src="js/auth-guard.js"></script>
 *   <script src="js/[pagina].js"></script>     ← ou type="module"
 *
 * Uso nas páginas:
 *   // Aguarda o guard terminar antes de rodar lógica que depende de sessão
 *   document.addEventListener('orbitSessionReady', () => {
 *     const { workspaceId } = OrbitSession;
 *     // ... carregar dados do banco
 *   });
 */

const OrbitSession = {
  user:        null,
  profile:     null,
  workspaceId: null,
};

(async () => {
  // ── 1. Verificar sessão ────────────────────────────────────────────────────
  const { data: { session }, error: sessionError } = await db.auth.getSession();

  if (sessionError || !session) {
    window.location.href = 'login.html';
    return;
  }

  OrbitSession.user = session.user;

  // ── 2. Carregar profile ────────────────────────────────────────────────────
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    // Profile deveria ter sido criado pelo trigger handle_new_user.
    // Se não existe, algo falhou no signup — redireciona para login limpo.
    await db.auth.signOut();
    window.location.href = 'login.html';
    return;
  }

  OrbitSession.profile = profile;

  // ── 3. Carregar workspace ──────────────────────────────────────────────────
  const { data: membership, error: membershipError } = await db
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (membershipError || !membership) {
    await db.auth.signOut();
    window.location.href = 'login.html';
    return;
  }

  OrbitSession.workspaceId = membership.workspace_id;

  // ── 4. Preencher sidebar com dados reais ───────────────────────────────────
  _fillSidebarUser(profile);

  // ── 5. Sinalizar que a sessão está pronta ─────────────────────────────────
  document.dispatchEvent(new CustomEvent('orbitSessionReady'));
})();

/**
 * Preenche os elementos do sidebar com nome e avatar do usuário.
 * Funciona em todas as páginas que seguem o padrão de sidebar do Orbit.
 */
function _fillSidebarUser(profile) {
  const nameEl   = document.querySelector('.sidebar .user-name');
  const roleEl   = document.querySelector('.sidebar .user-role');
  const avatarEl = document.querySelector('.sidebar .user-avatar');

  if (nameEl)   nameEl.textContent = profile.display_name ?? 'Usuário';
  if (roleEl)   roleEl.textContent = 'Administrador';

  if (avatarEl && profile.avatar_url) {
    avatarEl.innerHTML = `<img src="${profile.avatar_url}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
  }
  // Se não tem avatar_url, mantém o SVG padrão que já existe no HTML.
}
