import { AlertTriangle } from 'lucide-react';

// Piezas compartidas por Pagos, Reportes y Dashboard (lecturas reales de ventas).

// Estado de una lectura: cargando (role=status), bloqueo por contraseña de demostración, error con reintento.
// Devuelve null cuando la lectura está lista (el llamador pinta los datos).
export function QueryGate({ query, what, demoBlockText }) {
  if (query.status === 'loading' && !query.data) return <p className="sl-status-line" role="status">Cargando {what}…</p>;
  if (query.status !== 'error') return null;
  const { error } = query;
  if (error === 'demo_password') {
    return (
      <div className="us-notice" role="alert">
        <h2>Pantalla bloqueada por seguridad</h2>
        <p>{demoBlockText ?? 'Esta pantalla muestra datos de clientes, así que no se abre mientras el administrador central conserve la contraseña de demostración.'}</p>
        <p>Cambia la contraseña desde una terminal, en la carpeta del proyecto:</p>
        <pre className="us-code" tabIndex={0}>npm run set-password -- admin@cinerama.com</pre>
        <p>Al terminar se cierran las sesiones abiertas de ese usuario: vuelve a iniciar sesión y recarga esta página.</p>
      </div>
    );
  }
  const text = error === 'forbidden' ? 'No tienes permiso para ver esta información.'
    : error === 'unauthenticated' ? 'Tu sesión terminó. Inicia sesión de nuevo.'
      : error === 'validation' ? 'Los filtros elegidos no son válidos. Revisa las fechas.'
        : `No se pudo cargar ${what}.`;
  return (
    <div className="us-notice sl-error" role="alert">
      <p><AlertTriangle size={16} aria-hidden="true" /> {text}</p>
      {error !== 'forbidden' && error !== 'unauthenticated' && <button type="button" className="btn btn-secondary btn-sm" onClick={query.retry}>Reintentar</button>}
    </div>
  );
}

export function Pager({ page, pages, total, onPage, label }) {
  return (
    <nav className="us-pager" aria-label={`Paginación de ${label}`}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Anterior</button>
      <span aria-live="polite">Página {page} de {pages} · {total} {total === 1 ? 'resultado' : 'resultados'}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>Siguiente</button>
    </nav>
  );
}

