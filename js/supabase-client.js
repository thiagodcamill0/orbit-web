/**
 * supabase-client.js — Orbit
 *
 * Inicializa o client do Supabase (via CDN UMD).
 * Lê configuração de config.js — nunca hardcode URL/key aqui.
 * Expõe `db` como global para todos os módulos do projeto.
 *
 * Ordem de carregamento obrigatória:
 *   1. supabase CDN
 *   2. config.js
 *   3. supabase-client.js
 *   4. auth-guard.js (páginas protegidas)
 *   5. script da página
 */

const db = supabase.createClient(
  ORBIT_CONFIG.supabase.url,
  ORBIT_CONFIG.supabase.anonKey
);
