// Nombre accesible del botón de un póster: incluye las etiquetas visibles (preventa, próximamente, estreno).
export function movieLabel(movie) {
  const extra = movie.presale ? ', en preventa' : movie.status === 'upcoming' ? ', próximamente' : movie.premiere ? ', estreno' : '';
  return `Ver detalle de ${movie.title}${extra}`;
}
