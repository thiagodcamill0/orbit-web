/**
 * login.js — Orbit Auth
 *
 * Separa UI de lógica de autenticação.
 * Para conectar ao backend, implemente a função `AuthService.login()`.
 */

/* ─── Auth Service ───────────────────────────────────────────────────────────
 * Substitua o corpo de `login()` pela chamada real ao seu backend.
 * O contrato de retorno deve ser mantido.
 */
const AuthService = {
  /**
   * @param {{ email: string, password: string }} credentials
   * @returns {Promise<{ token: string, user: object }>}
   */
  async login({ email, password }) {
    // TODO: substituir pela chamada real ao backend
    // Exemplo com fetch:
    //
    // const res = await fetch('/api/auth/login', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password }),
    // });
    // if (!res.ok) {
    //   const err = await res.json().catch(() => ({}));
    //   throw new Error(err.message || 'Falha na autenticação');
    // }
    // return res.json();

    // Simulação para desenvolvimento
    await new Promise(r => setTimeout(r, 1200));
    if (email === 'demo@orbit.ai' && password === 'orbit123') {
      return { token: 'demo-token', user: { name: 'Demo', email } };
    }
    throw new Error('E-mail ou senha incorretos.');
  },

  saveSession(token, remember) {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('orbit_token', token);
  },

  getToken() {
    return localStorage.getItem('orbit_token') || sessionStorage.getItem('orbit_token');
  },

  isAuthenticated() {
    return Boolean(this.getToken());
  },

  logout() {
    localStorage.removeItem('orbit_token');
    sessionStorage.removeItem('orbit_token');
    window.location.href = 'login.html';
  },
};

/* ─── Redirect se já autenticado ────────────────────────────────────────────
 * Remove este bloco se quiser desabilitar o redirect automático.
 */
if (AuthService.isAuthenticated()) {
  window.location.href = 'index.html';
}

/* ─── UI Controller ─────────────────────────────────────────────────────── */
const LoginUI = (() => {
  const form       = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const pwInput    = document.getElementById('password');
  const rememberCb = document.getElementById('rememberMe');
  const togglePw   = document.getElementById('togglePw');
  const eyeIcon    = document.getElementById('eyeIcon');
  const loginBtn   = document.getElementById('loginBtn');
  const btnText    = loginBtn.querySelector('.login-btn-text');
  const spinner    = document.getElementById('loginSpinner');
  const banner     = document.getElementById('loginErrorBanner');
  const bannerText = document.getElementById('loginErrorText');

  /* ── Validação ─────────────────────────────────────────────── */
  function validateEmail(value) {
    if (!value.trim()) return 'O e-mail é obrigatório.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Informe um e-mail válido.';
    return null;
  }

  function validatePassword(value) {
    if (!value) return 'A senha é obrigatória.';
    if (value.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    return null;
  }

  function setFieldError(fieldId, errorId, message) {
    const group = document.getElementById(fieldId);
    const span  = document.getElementById(errorId);
    if (message) {
      group.classList.add('has-error');
      span.textContent = message;
    } else {
      group.classList.remove('has-error');
      span.textContent = '';
    }
  }

  /* ── Loading state ─────────────────────────────────────────── */
  function setLoading(state) {
    loginBtn.disabled = state;
    btnText.textContent = state ? 'Entrando…' : 'Entrar';
    spinner.hidden = !state;
  }

  /* ── Banner de erro ────────────────────────────────────────── */
  function showError(message) {
    bannerText.textContent = message;
    banner.hidden = false;
  }

  function hideError() {
    banner.hidden = true;
  }

  /* ── Toggle senha ──────────────────────────────────────────── */
  togglePw.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    eyeIcon.innerHTML = isHidden
      ? /* olho fechado */
        `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
         <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
         <line x1="1" y1="1" x2="23" y2="23"/>`
      : /* olho aberto */
        `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
         <circle cx="12" cy="12" r="3"/>`;
  });

  /* ── Limpa erros ao digitar ────────────────────────────────── */
  emailInput.addEventListener('input', () => {
    setFieldError('fieldEmail', 'emailError', null);
    hideError();
  });
  pwInput.addEventListener('input', () => {
    setFieldError('fieldPassword', 'passwordError', null);
    hideError();
  });

  /* ── Submit ────────────────────────────────────────────────── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = emailInput.value.trim();
    const password = pwInput.value;
    const remember = rememberCb.checked;

    const emailErr = validateEmail(email);
    const pwErr    = validatePassword(password);

    setFieldError('fieldEmail',    'emailError',    emailErr);
    setFieldError('fieldPassword', 'passwordError', pwErr);

    if (emailErr || pwErr) return;

    hideError();
    setLoading(true);

    try {
      const { token } = await AuthService.login({ email, password });
      AuthService.saveSession(token, remember);
      window.location.href = 'index.html';
    } catch (err) {
      showError(err.message || 'Ocorreu um erro. Tente novamente.');
      setLoading(false);
      pwInput.value = '';
      pwInput.focus();
    }
  });

  /* ── Esqueci minha senha ───────────────────────────────────── */
  document.getElementById('forgotLink').addEventListener('click', (e) => {
    e.preventDefault();
    // TODO: abrir fluxo de recuperação de senha
    alert('Recuperação de senha: em breve.');
  });

})();
