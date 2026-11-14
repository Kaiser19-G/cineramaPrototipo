import { useEffect, useRef, useState } from 'react';
import './WebPages.css';
import './WebClaim.css';
import { Link, useLocation } from 'react-router-dom';
import AuthField from '../components/AuthField';
import { claimsApi } from '../api/claims';

const formatDate = (ms) => new Date(ms).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });

function Result({ data }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const reason = data.reason;
  const reasonLine = reason && (reason.text || reason.note) && (
    <p><strong>Motivo:</strong> {reason.text}{reason.note ? <> <em>Nota del revisor: {reason.note}</em></> : null}</p>
  );
  let title; let body;
  switch (data.status) {
    case 'pending':
      title = 'En revisión';
      body = (
        <>
          <p>Recibimos tu reclamo el {formatDate(data.submittedAt)}. Una persona del equipo lo está revisando.</p>
          <p>Vuelve a consultar más tarde con tu código. Si no se resuelve antes del {formatDate(data.expiresAt)}, el reclamo vence y se borran tus fotos.</p>
        </>
      );
      break;
    case 'approved':
      title = 'Aprobado';
      body = (
        <>
          <p>Resolvimos tu reclamo el {formatDate(data.resolvedAt)}: verificamos que eres el titular. Tu DNI quedó libre.</p>
          <p>
            Ya puedes <Link to="/web/registro">crear tu cuenta</Link> con tu DNI usando <strong>el mismo correo del reclamo</strong>.
            Está reservado para ese correo hasta el {formatDate(data.reservedUntil)}.
          </p>
          <p>Borramos tus fotos y tu carta.</p>
        </>
      );
      break;
    case 'rejected':
      title = 'No aprobado';
      body = (
        <>
          <p>Resolvimos tu reclamo el {formatDate(data.resolvedAt)} y no pudimos aprobarlo.</p>
          {reasonLine}
          <p>Borramos tus fotos y tu carta. Puedes <Link to="/web/reclamo-dni">presentar un reclamo nuevo</Link> corrigiendo lo indicado.</p>
        </>
      );
      break;
    case 'superseded':
      title = 'Cerrado';
      body = (
        <>
          <p>Cerramos este reclamo porque otro reclamo por el mismo DNI ya fue resuelto. Borramos tus fotos y tu carta.</p>
          <p>Si tu DNI ya está libre, puedes <Link to="/web/registro">crear tu cuenta</Link>. Si no, <Link to="/web/reclamo-dni">presenta un reclamo nuevo</Link>.</p>
        </>
      );
      break;
    case 'expired':
      title = 'Vencido';
      body = (
        <>
          <p>Este reclamo venció sin completarse o sin ser resuelto. Borramos lo que habías enviado.</p>
          <p>Puedes <Link to="/web/reclamo-dni">presentar un reclamo nuevo</Link>.</p>
        </>
      );
      break;
    default:
      title = 'Sin terminar de enviar';
      body = <p>Empezaste este reclamo pero no se terminó de enviar. <Link to="/web/reclamo-dni">Vuelve a presentarlo</Link>.</p>;
  }
  return (
    <div className="claim-result" tabIndex={-1} ref={ref} data-testid="claim-result">
      <h3>{title}</h3>
      {body}
    </div>
  );
}

export default function WebClaimStatus() {
  const location = useLocation();
  const [code, setCode] = useState(typeof location.state?.code === 'string' ? location.state.code : '');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(null);

  const submit = async (ev) => {
    ev.preventDefault();
    setError(''); setData(null);
    if (!code.trim()) { setError('Ingresa el código que recibiste al enviar tu reclamo.'); codeRef.current?.focus(); return; }
    setBusy(true);
    const res = await claimsApi.status(code);
    setBusy(false);
    if (res.ok) { setData(res.data); return; }
    const msg = res.error === 'not_found' ? 'No encontramos un reclamo con ese código. Revisa que esté completo (12 letras y números).'
      : res.error === 'too_many_attempts' ? `Hiciste demasiados intentos. Espera ${Math.max(1, Math.ceil((res.data.retryAfter ?? 900) / 60))} minutos e inténtalo de nuevo.`
        : res.error === 'network' ? 'No pudimos conectar con el servidor. Inténtalo de nuevo.'
          : 'No pudimos consultar el reclamo. Inténtalo de nuevo.';
    setError(msg);
    codeRef.current?.focus();
  };

  return (
    <div className="web-page-center">
      <div className="auth-card claim-card">
        <h2 className="auth-title">Estado de tu reclamo de DNI</h2>
        <p className="auth-lead">Escribe el código que te dimos al enviar el reclamo. No mostramos datos personales en esta página.</p>
        <form className="auth-form" onSubmit={submit} noValidate>
          <AuthField
            id="status-code" label="Código de reclamo" autoComplete="off" spellCheck={false} autoCapitalize="characters"
            placeholder="XXXX-XXXX-XXXX" maxLength={20} value={code} inputRef={codeRef}
            hint="12 letras y números, con o sin guiones. Puedes escribirlo en minúsculas."
            onChange={(e) => { setCode(e.target.value); setError(''); }} error={error || undefined}
          />
          <button type="submit" className="btn-auth" disabled={busy}>{busy ? 'Consultando…' : 'Consultar estado'}</button>
        </form>
        {data && <Result data={data} />}
        <p className="auth-switch"><Link to="/web/reclamo-dni">Presentar un reclamo nuevo</Link></p>
      </div>
    </div>
  );
}
