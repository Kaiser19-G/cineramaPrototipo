import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { claimsApi } from '../api/claims';
import './Claims.css';

const KIND_LABEL = { dni_front: 'DNI por delante', dni_back: 'DNI por detrás', letter: 'Carta firmada', selfie: 'Selfie con el DNI' };
const STATUS = {
  pending: { label: 'Pendiente', cls: 'badge-gold' }, approved: { label: 'Aprobado', cls: 'badge-green' },
  rejected: { label: 'Rechazado', cls: 'badge-red' }, superseded: { label: 'Cerrado por otro reclamo', cls: 'badge-muted' },
  expired: { label: 'Vencido', cls: 'badge-muted' },
};
const REJECT_LABEL = {
  illegible: 'Fotos o carta ilegibles', mismatch: 'Los datos no coinciden con el documento',
  incomplete: 'Falta información (carta sin firma, falta una cara del DNI)', not_verifiable: 'No se pudo comprobar que sea el titular',
  other: 'Otro motivo (la nota es obligatoria)',
};
const WARN = {
  no_target: 'Ninguna cuenta usa hoy este DNI: aprobar solo reserva el DNI para quien reclama.',
  target_is_staff: 'La cuenta que usa este DNI es del personal. No se puede aprobar desde aquí.',
  target_active: 'La cuenta que usa este DNI está activa: al aprobar quedará suspendida y sus sesiones se cerrarán.',
  target_has_orders: 'La cuenta tiene compras registradas.',
  name_matches: 'El nombre de la cuenta coincide con el nombre del reclamo: la cuenta podría ser de la misma persona.',
  email_in_use: 'El correo del reclamo ya lo usa otra cuenta: quien reclama no podrá registrarse con él.',
  phone_in_use: 'El celular del reclamo ya lo usa otra cuenta: quien reclama no podrá registrarse con él.',
};
const fmt = (ms) => (ms ? new Date(ms).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

// Pantallas bloqueadas por la contrasena de demostracion, sesion vencida u otros errores.
function Blocked({ error }) {
  if (error === 'demo_password') {
    return (
      <div className="claims-notice claims-notice-warn" role="alert">
        <h2>Pantalla bloqueada por seguridad</h2>
        <p>
          Esta pantalla muestra fotos de documentos de identidad, así que no se abre mientras el administrador central
          conserve la contraseña de demostración (<code>Cinerama#2026</code>, publicada en el README).
        </p>
        <p>Cambia la contraseña desde una terminal, en la carpeta del proyecto:</p>
        <pre className="claims-code" tabIndex={0}>npm run set-password -- admin@cinerama.com</pre>
        <p>El comando te pide la contraseña nueva sin mostrarla. Al terminar se cierran las sesiones abiertas de ese usuario: vuelve a iniciar sesión y recarga esta página.</p>
      </div>
    );
  }
  if (error === 'unauthenticated' || error === 'forbidden') {
    return (
      <div className="claims-notice claims-notice-warn" role="alert">
        <h2>Tu sesión ya no es válida</h2>
        <p><Link to="/web/login">Inicia sesión de nuevo</Link> con una cuenta de administrador central.</p>
      </div>
    );
  }
  return <div className="claims-notice claims-notice-warn" role="alert"><p>No pudimos cargar los reclamos. Inténtalo de nuevo.</p></div>;
}

// ───────────────────────── Lista ─────────────────────────
export default function Claims() {
  const [tab, setTab] = useState('pending');
  const [state, setState] = useState({ loading: true });
  const headingRef = useRef(null);

  useEffect(() => {
    document.title = 'Reclamos de DNI · Cinerama';
    let cancelled = false;
    claimsApi.list(tab).then((res) => {
      if (!cancelled) setState(res.ok ? { claims: res.data.claims, pendingDeletes: res.data.pendingDeletes } : { error: res.error });
    });
    return () => { cancelled = true; };
  }, [tab]);
  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <div className="claims-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Reclamos de DNI</h1>
          <p className="page-subtitle">Personas que dicen que su DNI fue usado por otra cuenta</p>
        </div>
      </div>

      {state.error ? <Blocked error={state.error} /> : (
        <>
          <div className="tabs mb-4" role="group" aria-label="Filtrar reclamos">
            {[['pending', 'Pendientes'], ['resolved', 'Resueltos']].map(([k, label]) => (
              <button key={k} type="button" className={`tab ${tab === k ? 'active' : ''}`} aria-pressed={tab === k} onClick={() => { setState({ loading: true }); setTab(k); }}>{label}</button>
            ))}
          </div>
          {state.pendingDeletes > 0 && (
            <div className="claims-notice claims-notice-warn" role="alert">
              Quedan {state.pendingDeletes} archivo(s) por borrar de reclamos ya resueltos. El servidor reintenta cada hora; revisa los permisos del directorio de datos si persiste.
            </div>
          )}
          <p className="sr-only" role="status">{state.loading ? 'Cargando reclamos…' : `${state.claims.length} reclamos`}</p>
          {!state.loading && state.claims.length === 0 && (
            <div className="empty-state"><ShieldCheck size={40} aria-hidden="true" /><p>{tab === 'pending' ? 'No hay reclamos pendientes.' : 'Todavía no hay reclamos resueltos.'}</p></div>
          )}
          {!state.loading && state.claims.length > 0 && (
            <div className="table-wrapper card" style={{ padding: 0 }}>
              <table className="table">
                <caption className="sr-only">Reclamos de DNI {tab === 'pending' ? 'pendientes' : 'resueltos'}</caption>
                <thead>
                  <tr><th scope="col">Enviado</th><th scope="col">Nombre</th><th scope="col">DNI</th><th scope="col">Estado</th><th scope="col">Archivos</th><th scope="col"><span className="sr-only">Acción</span></th></tr>
                </thead>
                <tbody>
                  {state.claims.map((c) => (
                    <tr key={c.id}>
                      <td>{fmt(c.submittedAt)}</td>
                      <td>{c.name ?? <span className="text-muted">(borrado al resolver)</span>}</td>
                      <td><span aria-label={`terminado en ${c.dniHint}`}>•••••{c.dniHint}</span></td>
                      <td>
                        <span className={`badge ${STATUS[c.status]?.cls ?? 'badge-muted'}`}>{STATUS[c.status]?.label ?? c.status}</span>
                        {c.othersOpen > 0 && <span className="claims-dup"> · {c.othersOpen} más con este DNI</span>}
                      </td>
                      <td>{c.status === 'pending' ? c.files : '—'}</td>
                      <td><Link className="btn btn-secondary btn-sm" to={`/claims/${c.id}`}>Revisar<span className="sr-only"> reclamo {c.id}{c.name ? ` de ${c.name}` : ''}</span></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── Visor de imagen ─────────────────────────
function Viewer({ claimId, kind, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const url = claimsApi.fileUrl(claimId, kind);
  return (
    <dialog ref={ref} className="claims-dialog claims-viewer" aria-labelledby="viewer-title" onClose={onClose}>
      <div className="claims-dialog-head">
        <h2 id="viewer-title">{KIND_LABEL[kind]}</h2>
        <div className="claims-dialog-actions">
          <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer">Abrir en una pestaña nueva<span className="sr-only"> (se abre en otra pestaña)</span></a>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ref.current?.close()}>Cerrar</button>
        </div>
      </div>
      <div className="claims-viewer-scroll" tabIndex={0} aria-label="Imagen a tamaño completo, desplázate para ver todo">
        <img src={url} alt={`${KIND_LABEL[kind]} enviado por quien reclama`} />
      </div>
    </dialog>
  );
}

// ───────────────────────── Aprobar o rechazar ─────────────────────────
function Decision({ mode, detail, onClose, onDone }) {
  const ref = useRef(null);
  const [reason, setReason] = useState(mode === 'reject' ? '' : 'verified');
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const approve = mode === 'approve';
  const needAck = approve && detail.requiresAck;
  const strong = detail.warnings.includes('name_matches') || detail.warnings.includes('target_has_orders');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!approve && !reason) { setErr('Elige un motivo.'); return; }
    if (!approve && reason === 'other' && !note.trim()) { setErr('Escribe una nota: con "Otro motivo" es obligatoria.'); return; }
    if (needAck && !ack) { setErr('Marca la casilla para confirmar que entiendes que la cuenta quedará suspendida.'); return; }
    setBusy(true);
    const res = approve
      ? await claimsApi.approve(detail.id, { confirm: true, ackActiveAccount: ack, note })
      : await claimsApi.reject(detail.id, { reasonCode: reason, note });
    setBusy(false);
    if (res.ok) { ref.current?.close(); onDone(res.data); return; }
    const msg = { not_pending: 'Este reclamo ya fue resuelto por otra persona.', target_is_staff: 'La cuenta es del personal: no se puede aprobar desde aquí.',
      ack_required: 'Falta confirmar la suspensión de la cuenta.', demo_password: 'La pantalla está bloqueada por la contraseña de demostración.' }[res.error]
      ?? 'No se pudo completar la acción. Inténtalo de nuevo.';
    setErr(msg);
  };

  return (
    <dialog ref={ref} className="claims-dialog" aria-labelledby="decision-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <h2 id="decision-title">{approve ? 'Aprobar reclamo' : 'Rechazar reclamo'}</h2>
        {approve ? (
          <>
            <p>
              Al aprobar: {detail.target ? <>la cuenta <strong>{detail.target.name}</strong> ({detail.target.emailMasked}) <strong>se suspende</strong>, se cierran sus sesiones y el DNI queda libre,
              reservado 7 días para el correo del reclamo.</> : 'el DNI queda reservado 7 días para el correo del reclamo.'}
              {' '}Se borran las fotos y la carta. <strong>No se puede deshacer desde esta pantalla.</strong>
            </p>
            {strong && <p className="claims-strong" role="note">Atención: {detail.warnings.includes('name_matches') ? 'el nombre de la cuenta coincide con el del reclamo. ' : ''}{detail.warnings.includes('target_has_orders') ? 'La cuenta tiene compras.' : ''}</p>}
            {needAck && (
              <label className="claims-check">
                <input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); setErr(''); }} />
                <span>Entiendo que la cuenta de {detail.target.name} quedará suspendida.</span>
              </label>
            )}
          </>
        ) : (
          <>
            <p>Se borran las fotos y la carta. La cuenta no se toca. Quien reclamó verá el motivo.</p>
            <fieldset className="claims-fieldset">
              <legend>Motivo (obligatorio)</legend>
              {Object.entries(REJECT_LABEL).map(([k, label]) => (
                <label key={k} className="claims-check">
                  <input type="radio" name="reason" value={k} checked={reason === k} onChange={() => { setReason(k); setErr(''); }} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        <div className="claims-field">
          <label htmlFor="decision-note">Nota para quien reclamó {approve || reason !== 'other' ? '(opcional)' : '(obligatoria)'}</label>
          <textarea id="decision-note" rows={3} maxLength={300} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} aria-describedby="decision-note-hint" />
          <p id="decision-note-hint" className="claims-hint">Máximo 300 caracteres. La verá quien reclamó: no incluyas DNI, nombres completos ni otros datos personales.</p>
        </div>
        {err && <p className="claims-error" role="alert">{err}</p>}
        <div className="claims-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
          <button type="submit" className={`btn ${approve ? 'btn-primary' : 'btn-secondary'}`} disabled={busy}>{busy ? 'Guardando…' : approve ? 'Aprobar y suspender la cuenta' : 'Rechazar y borrar archivos'}</button>
        </div>
      </form>
    </dialog>
  );
}

// ───────────────────────── Detalle ─────────────────────────
export function ClaimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });
  const [viewer, setViewer] = useState(null);
  const [decision, setDecision] = useState(null);
  const [result, setResult] = useState('');
  const headingRef = useRef(null);
  const lastOpener = useRef(null);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    document.title = `Reclamo ${id} · Cinerama`;
    let cancelled = false;
    claimsApi.detail(id).then((res) => {
      if (!cancelled) setState(res.ok ? { detail: res.data } : { error: res.status === 404 ? 'not_found' : res.error });
    });
    return () => { cancelled = true; };
  }, [id, reloadKey]);
  const detailId = state.detail?.id;
  useEffect(() => { if (detailId) headingRef.current?.focus(); }, [detailId]);

  if (state.error === 'not_found') return <div className="claims-notice" role="alert"><p>No existe ese reclamo.</p><Link to="/claims">Volver a la lista</Link></div>;
  if (state.error) return <Blocked error={state.error} />;
  if (!state.detail) return <p role="status">Cargando reclamo…</p>;
  const d = state.detail;
  const pending = d.status === 'pending';

  const done = (data) => {
    const text = decision === 'approve'
      ? `Reclamo aprobado. ${data.targetSuspended ? 'La cuenta quedó suspendida y el DNI liberado.' : 'El DNI quedó reservado.'}${data.superseded ? ` Se cerraron ${data.superseded} reclamo(s) más del mismo DNI.` : ''}${data.filesPurged ? '' : ' Atención: algunos archivos no se pudieron borrar todavía; el servidor reintentará.'}`
      : `Reclamo rechazado.${data.filesPurged ? '' : ' Atención: algunos archivos no se pudieron borrar todavía; el servidor reintentará.'}`;
    setDecision(null);
    setResult(text);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="claims-page">
      <div className="page-header">
        <div>
          <p className="claims-back"><Link to="/claims">← Volver a la lista</Link></p>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Reclamo {d.id}</h1>
          <p className="page-subtitle"><span className={`badge ${STATUS[d.status]?.cls}`}>{STATUS[d.status]?.label}</span> · enviado {fmt(d.submittedAt)}</p>
        </div>
      </div>

      <p className="sr-only" role="status">{result}</p>
      {result && <div className="claims-notice" aria-hidden="true">{result}</div>}
      {d.deletePending && <div className="claims-notice claims-notice-warn" role="alert">Hay archivos de este reclamo pendientes de borrar. El servidor reintenta cada hora.</div>}

      {pending ? (
        <>
          <section className="card claims-section" aria-labelledby="sec-data">
            <h2 id="sec-data" className="section-title">Datos del reclamo</h2>
            <dl className="claims-dl">
              <dt>Nombre</dt><dd>{d.name}</dd>
              <dt>DNI declarado</dt><dd className="claims-mono">{d.dni}</dd>
              <dt>Correo</dt><dd>{d.email}</dd>
              <dt>Celular</dt><dd>{d.phone}</dd>
              <dt>Vence</dt><dd>{fmt(d.expiresAt)}</dd>
            </dl>
            <p className="claims-hint">Compara el nombre y el número con lo que se ve en la foto del DNI. El número en claro se borra al resolver.</p>
          </section>

          <section className="card claims-section" aria-labelledby="sec-files">
            <h2 id="sec-files" className="section-title">Archivos</h2>
            <ul className="claims-files">
              {d.files.map((f) => (
                <li key={f.kind}>
                  <button type="button" className="claims-thumb" onClick={(e) => { lastOpener.current = e.currentTarget; setViewer(f.kind); }}>
                    <img src={claimsApi.fileUrl(d.id, f.kind)} alt={`Miniatura: ${KIND_LABEL[f.kind]}`} loading="lazy" />
                    <span>{KIND_LABEL[f.kind]}</span>
                    <span className="claims-hint">{size(f.size)} · ver completo</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card claims-section" aria-labelledby="sec-target">
            <h2 id="sec-target" className="section-title">Cuenta que usa este DNI</h2>
            {d.target ? (
              <dl className="claims-dl">
                <dt>Nombre</dt><dd>{d.target.name}</dd>
                <dt>Correo</dt><dd>{d.target.emailMasked}</dd>
                <dt>Estado</dt><dd>{d.target.status}</dd>
                <dt>Alta</dt><dd>{fmt(d.target.createdAt)}</dd>
                <dt>Último acceso</dt><dd>{d.target.lastLogin ?? '—'}</dd>
                <dt>Compras</dt><dd>{d.target.orders}</dd>
              </dl>
            ) : <p>Ninguna cuenta usa hoy este DNI.</p>}
            {d.warnings.length > 0 && (
              <ul className="claims-warnings" aria-label="Avisos para el revisor">
                {d.warnings.map((w) => <li key={w}><strong>Aviso:</strong> {WARN[w] ?? w}</li>)}
              </ul>
            )}
            {d.otherOpenClaims.length > 0 && (
              <p>Otros reclamos pendientes por este DNI: {d.otherOpenClaims.map((o, i) => <span key={o.id}>{i ? ', ' : ''}<Link to={`/claims/${o.id}`}>reclamo {o.id}</Link></span>)}. Al aprobar uno, los demás se cierran.</p>
            )}
          </section>

          <div className="claims-decision-bar">
            <button type="button" className="btn btn-primary" disabled={d.warnings.includes('target_is_staff')} onClick={(e) => { lastOpener.current = e.currentTarget; setDecision('approve'); }}>Aprobar…</button>
            <button type="button" className="btn btn-secondary" onClick={(e) => { lastOpener.current = e.currentTarget; setDecision('reject'); }}>Rechazar…</button>
          </div>
        </>
      ) : (
        <section className="card claims-section" aria-labelledby="sec-res">
          <h2 id="sec-res" className="section-title">Resultado</h2>
          <dl className="claims-dl">
            <dt>Estado</dt><dd>{STATUS[d.status]?.label}</dd>
            <dt>Resuelto</dt><dd>{fmt(d.resolvedAt)}</dd>
            <dt>DNI (últimos 3)</dt><dd>•••••{d.dniHint}</dd>
            {d.reasonNote && (<><dt>Nota</dt><dd>{d.reasonNote}</dd></>)}
            {d.reservedUntil && (<><dt>DNI reservado hasta</dt><dd>{fmt(d.reservedUntil)}</dd></>)}
          </dl>
          <p className="claims-hint">Las fotos, la carta y los datos personales del reclamo ya se borraron.</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/claims')}>Volver a la lista</button>
        </section>
      )}

      {viewer && <Viewer claimId={d.id} kind={viewer} onClose={() => { setViewer(null); lastOpener.current?.focus(); }} />}
      {decision && <Decision mode={decision} detail={d} onClose={() => { setDecision(null); lastOpener.current?.focus(); }} onDone={done} />}
    </div>
  );
}
