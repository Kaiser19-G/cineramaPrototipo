import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../api/admin';
import { useCinema } from '../context/CinemaContext';

// Botón para poner una sala en mantenimiento o quitarla, con confirmación. Solo aparece a quien tiene permiso
// (gerente en su sede, administrador central en cualquiera); el servidor lo vuelve a comprobar.
export default function HallStatusControl({ hall, onDone }) {
  const { can, refreshAll } = useCinema();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.showModal(); }, [open]);
  if (!(can('block_hall') || can('edit_hall'))) return null;
  const toMaintenance = hall.status === 'active';

  const run = async () => {
    setBusy(true); setError('');
    const res = await adminApi.halls.setStatus(hall.id, toMaintenance ? 'maintenance' : 'active');
    setBusy(false);
    if (res.ok) {
      refreshAll();
      ref.current?.close();
      onDone?.(toMaintenance ? `${hall.name} quedó en mantenimiento.` : `${hall.name} volvió a estar activa.`);
      return;
    }
    if (res.error === 'has_future_screenings') {
      const first = res.data.screenings?.[0];
      setError(`No se puede: la sala tiene ${res.data.count} función(es) futura(s) sin cancelar${first ? ` (la primera, el ${first.date} a las ${first.startTime})` : ''}. Cancélalas o muévelas antes.`);
    } else setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
  };

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setError(''); setOpen(true); }}>
        {toMaintenance ? 'Poner en mantenimiento' : 'Quitar mantenimiento'}<span className="sr-only">: {hall.name}</span>
      </button>
      {open && (
        <dialog ref={ref} className="mv-dialog" style={{ width: 'min(520px, calc(100vw - 32px))' }} aria-labelledby={`hall-dlg-${hall.id}`} onClose={() => setOpen(false)}>
          <h2 id={`hall-dlg-${hall.id}`}>{toMaintenance ? `Poner ${hall.name} en mantenimiento` : `Quitar el mantenimiento de ${hall.name}`}</h2>
          <p>
            {toMaintenance
              ? 'Mientras esté en mantenimiento no se podrán programar funciones en esta sala. Si ya tiene funciones futuras, primero hay que cancelarlas.'
              : 'La sala volverá a poder usarse para programar funciones.'}
          </p>
          {error && <p className="mv-error-text" role="alert">{error}</p>}
          <div className="mv-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Guardando…' : toMaintenance ? 'Poner en mantenimiento' : 'Quitar mantenimiento'}</button>
          </div>
        </dialog>
      )}
    </>
  );
}
