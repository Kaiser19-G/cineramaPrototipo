// Etiquetas sobre el póster: "Estreno" (calculado por fecha), "Preventa" y "Próximamente".
// Siempre con texto visible, nunca solo con color. Dentro de un botón con aria-label, el texto
// se incluye en el nombre accesible con movieLabel().
export default function PosterTags({ movie }) {
  return (
    <>
      {movie.premiere && <div className="diagonal-tag">Estreno</div>}
      {movie.presale && <span className="poster-chip poster-chip-presale">Preventa</span>}
      {!movie.presale && movie.status === 'upcoming' && <span className="poster-chip poster-chip-soon">Próximamente</span>}
    </>
  );
}
