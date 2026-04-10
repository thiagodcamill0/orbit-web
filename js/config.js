/**
 * config.js — Orbit
 *
 * Ponto central de configuração. É o ÚNICO arquivo que muda entre
 * localhost e produção. Todos os outros módulos leem daqui.
 *
 * Para produção: troque os valores abaixo ou substitua este arquivo
 * no deploy. Nunca espalhe URL/key diretamente em outros arquivos.
 */

const ORBIT_CONFIG = {
  supabase: {
    url:     'https://bgfazlzbbglcggepameu.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnZmF6bHpiYmdsY2dnZXBhbWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NzcxNjUsImV4cCI6MjA4ODE1MzE2NX0.8Yc8V883qd0B11HcECys-8_db-EkH74af8gCk5RO7to',
  },

  // URL base da aplicação. Usada para redirects de auth (ex: email confirm).
  // Em localhost: deixar como ''. Em produção: 'https://seudominio.com'
  appUrl: '',
};
