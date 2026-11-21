let toastTimer = null;
export const showToast = (msg, isError = false) => {
  const el = document.getElementById('lxToast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
  void el.offsetWidth;
  el.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    toastTimer = setTimeout(() => { el.textContent = ''; }, 400);
  }, isError ? 4200 : 2600);
};
