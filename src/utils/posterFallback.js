// H-08 (evaluación heurística): los pósters se cargan desde el sitio externo
// de Cinerama; cuando la imagen falla, la tarjeta quedaba vacía. Esto oculta
// la imagen rota y muestra el título sobre un fondo de color en su lugar,
// usando el contenedor que ya envuelve cada <img> (sin estado de React por
// imagen: se marca solo la instancia que realmente falló).
export function handlePosterError(e) {
  const img = e.currentTarget;
  const parent = img.parentElement;
  if (!parent) return;
  img.style.display = 'none';
  parent.classList.add('poster-fallback');
  const title = img.dataset.fallbackTitle || '';
  if (title) parent.setAttribute('data-title', title);
}
