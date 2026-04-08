/**
 * supabase-client.js — Orbit
 *
 * Inicializa o client do Supabase (via CDN UMD).
 * Expõe `db` como global para todos os módulos do projeto.
 */

const SUPABASE_URL      = 'https://bgfazlzbbglcggepameu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnZmF6bHpiYmdsY2dnZXBhbWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzcxNjUsImV4cCI6MjA4ODE1MzE2NX0.8Yc8V883qd0B11HcECys-8_db-EkH74af8gCk5RO7to';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
