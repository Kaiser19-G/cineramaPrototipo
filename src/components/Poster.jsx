import { useEffect, useRef } from 'react';
import { handlePosterError } from '../utils/posterFallback';

// Póster de una película. Si no tiene URL (o la imagen falla) se muestra el título sobre un fondo,
// igual que antes con handlePosterError.
export default function Poster({ movie, alt = '', ...rest }) {
  const ref = useRef(null);
  const missing = !movie.poster;
  useEffect(() => {
    if (missing && ref.current) handlePosterError({ currentTarget: ref.current });
  }, [missing]);
  return (
    <img
      ref={ref}
      src={movie.poster || undefined}
      alt={alt}
      data-fallback-title={movie.title}
      onError={handlePosterError}
      {...rest}
    />
  );
}
