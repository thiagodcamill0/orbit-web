(() => {
  const sidebar = document.querySelector('.sidebar');
  const btn     = document.querySelector('.sidebar-toggle-btn');
  const KEY     = 'sidebar-collapsed';

  // Restore persisted state without transition (instant on load)
  if (localStorage.getItem(KEY) === 'true') {
    sidebar.style.transition = 'none';
    sidebar.classList.add('collapsed');
    // Re-enable transitions after paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { sidebar.style.transition = ''; });
    });
  }

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem(KEY, sidebar.classList.contains('collapsed'));
  });
})();
