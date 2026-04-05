/* ─── Mock user ────────────────────────────────── */

const user = {
  name:   localStorage.getItem('profile-name')  ?? 'Usuário',
  avatar: localStorage.getItem('profile-avatar') ?? null,
};

/* ─── Toast ────────────────────────────────────── */

function toast(msg, type = 'success', duration = 3000) {
  const icons = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    loading: `<svg class="toast-icon spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>`,
  };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icons[type]}<span class="toast-msg">${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  if (duration > 0) {
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 200);
    }, duration);
  }
  return () => el.remove();
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── Init display ─────────────────────────────── */

function applyUser() {
  document.getElementById('avatarName').textContent  = user.name;
  document.getElementById('nameDisplay').textContent = user.name;
  document.getElementById('nameInput').value         = user.name;
  document.getElementById('sidebarName').textContent = user.name;

  const PERSON = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.5"/><path d="M3 20.5c0-4.14 4.03-7.5 9-7.5s9 3.36 9 7.5"/></svg>`;
  const circle  = document.getElementById('avatarCircle');
  const sidebar = document.getElementById('sidebarAvatar');

  if (user.avatar) {
    circle.innerHTML  = `<img src="${user.avatar}" alt="avatar" />`;
    sidebar.innerHTML = `<img src="${user.avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm)"/>`;
  } else {
    circle.innerHTML  = PERSON;
    sidebar.innerHTML = PERSON;
  }
}

applyUser();

/* ─── Avatar ───────────────────────────────────── */

const avatarInput   = document.getElementById('avatarInput');
const avatarOverlay = document.getElementById('avatarOverlay');
const avatarBtn     = document.getElementById('avatarBtn');

function triggerAvatarPicker() { avatarInput.click(); }

avatarOverlay.addEventListener('click', triggerAvatarPicker);
avatarBtn.addEventListener('click', triggerAvatarPicker);

avatarInput.addEventListener('change', () => {
  const file = avatarInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    user.avatar = e.target.result;
    localStorage.setItem('profile-avatar', user.avatar);
    applyUser();
    toast('Foto atualizada');
  };
  reader.readAsDataURL(file);
  avatarInput.value = '';
});

/* ─── Edit name ────────────────────────────────── */

const editNameBtn  = document.getElementById('editNameBtn');
const cancelNameBtn= document.getElementById('cancelNameBtn');
const saveNameBtn  = document.getElementById('saveNameBtn');
const nameEditWrap = document.getElementById('nameEditWrap');
const nameInput    = document.getElementById('nameInput');

function openNameEdit() {
  nameInput.value = user.name;
  nameEditWrap.classList.add('open');
  editNameBtn.textContent = '';
  requestAnimationFrame(() => nameInput.focus());
}

function closeNameEdit() {
  nameEditWrap.classList.remove('open');
  editNameBtn.textContent = 'Editar';
}

editNameBtn.addEventListener('click', openNameEdit);
cancelNameBtn.addEventListener('click', closeNameEdit);

saveNameBtn.addEventListener('click', async () => {
  const val = nameInput.value.trim();
  if (!val) { toast('O nome não pode estar vazio', 'error'); return; }

  saveNameBtn.disabled = true;
  saveNameBtn.textContent = '...';

  await wait(700);

  user.name = val;
  localStorage.setItem('profile-name', val);
  applyUser();
  closeNameEdit();
  toast('Nome atualizado');
  saveNameBtn.disabled = false;
  saveNameBtn.textContent = 'Salvar';
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  saveNameBtn.click();
  if (e.key === 'Escape') closeNameEdit();
});

/* ─── Password ─────────────────────────────────── */

const passwordToggle  = document.getElementById('passwordToggle');
const passwordForm    = document.getElementById('passwordForm');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const savePasswordBtn   = document.getElementById('savePasswordBtn');

function closePasswordForm() {
  passwordForm.classList.remove('open');
  passwordToggle.classList.remove('open');
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value     = '';
  document.getElementById('confirmPassword').value = '';
}

passwordToggle.addEventListener('click', () => {
  const isOpen = passwordForm.classList.contains('open');
  if (isOpen) {
    closePasswordForm();
  } else {
    passwordForm.classList.add('open');
    passwordToggle.classList.add('open');
    requestAnimationFrame(() => document.getElementById('currentPassword').focus());
  }
});

cancelPasswordBtn.addEventListener('click', closePasswordForm);

savePasswordBtn.addEventListener('click', async () => {
  const current  = document.getElementById('currentPassword').value;
  const next     = document.getElementById('newPassword').value;
  const confirm  = document.getElementById('confirmPassword').value;

  if (!current || !next || !confirm) {
    toast('Preencha todos os campos', 'error'); return;
  }
  if (next.length < 8) {
    toast('A senha deve ter ao menos 8 caracteres', 'error'); return;
  }
  if (next !== confirm) {
    toast('As senhas não coincidem', 'error'); return;
  }

  savePasswordBtn.disabled = true;
  const dismiss = toast('Salvando...', 'loading', 0);
  await wait(1000);
  dismiss();

  closePasswordForm();
  toast('Senha alterada com sucesso');
  savePasswordBtn.disabled = false;
});

/* ─── Logout ───────────────────────────────────── */

document.getElementById('logoutBtn').addEventListener('click', async () => {
  const dismiss = toast('Saindo...', 'loading', 0);
  await wait(800);
  dismiss();
  // mock: just reload
  window.location.href = 'index.html';
});
