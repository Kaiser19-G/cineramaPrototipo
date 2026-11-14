import { useMemo, useRef, useState, useEffect } from 'react';
import './WebPages.css';
import './WebClaim.css';
import { Link } from 'react-router-dom';
import AuthField from '../components/AuthField';
import FieldError from '../components/FieldError';
import FileField from '../components/FileField';
import { claimsApi } from '../api/claims';
import { prepareImage } from '../utils/claimImage';
import { EMAIL_RE, normalizeDni, normalizePhone, normalizeName, isDni, isPhone } from '../shared/validators';

const FILES = [
  { kind: 'dni_front', label: 'Foto del DNI por delante', required: true,
    hint: 'Que se lea el número y el nombre. Sin reflejos ni dedos tapando datos. JPG, PNG o WebP, hasta 5 MB.' },
  { kind: 'dni_back', label: 'Foto del DNI por detrás', required: true,
    hint: 'La otra cara del documento, bien iluminada. JPG, PNG o WebP, hasta 5 MB.' },
  { kind: 'letter', label: 'Foto de la carta firmada', required: true,
    hint: 'Escrita a mano o impresa, pero con tu firma. Usa el texto modelo de arriba. JPG, PNG o WebP, hasta 5 MB.' },
  { kind: 'selfie', label: 'Selfie sosteniendo tu DNI', required: false,
    hint: 'Ayuda a revisar tu reclamo más rápido. JPG, PNG o WebP, hasta 5 MB.' },
];
const FIELD_ORDER = ['name', 'dni', 'email', 'phone', 'dni_front', 'dni_back', 'letter', 'consent'];
const FIELD_ID = {
  name: 'claim-name', dni: 'claim-dni', email: 'claim-email', phone: 'claim-phone',
  dni_front: 'claim-dni_front', dni_back: 'claim-dni_back', letter: 'claim-letter', selfie: 'claim-selfie', consent: 'claim-consent',
};

const FILE_ERRORS = {
  heic: 'Esta foto está en formato HEIC (iPhone), que no podemos usar. Cámbiala a JPG: en el iPhone, Ajustes > Cámara > Formatos > "Más compatible", y vuelve a tomarla. O elige otra foto.',
  type: 'Este archivo no es una imagen válida. Usa una foto JPG, PNG o WebP.',
  too_large: 'La imagen es demasiado grande: el máximo es 5 MB. Elige una foto más liviana o tómala de nuevo.',
};
const SERVER_FILE_ERRORS = {
  heic_not_supported: FILE_ERRORS.heic,
  unsupported_type: FILE_ERRORS.type,
  corrupt_file: 'No pudimos leer esta imagen (parece dañada o incompleta). Elige otra.',
  too_large: FILE_ERRORS.too_large,
  file_empty: 'El archivo está vacío. Elige otra foto.',
};

const spoken = (code) => code.replace(/-/g, ', ').replace(/[A-Z0-9]/g, (c) => c + ' ').replace(/ ,/g, ',').trim();

function Done({ code }) {
  const headingRef = useRef(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { headingRef.current?.focus(); }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied('Código copiado.'); } catch { setCopied('No se pudo copiar. Selecciona el código y cópialo a mano.'); }
  };
  const download = () => {
    const blob = new Blob([`Código de reclamo de DNI (Cinerama): ${code}\nConsulta el estado en la página "Estado del reclamo".\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'codigo-reclamo-cinerama.txt';
    a.click();
    URL.revokeObjectURL(url);
    setCopied('Se descargó el archivo con tu código.');
  };

  return (
    <div className="web-page-center">
      <div className="auth-card claim-card">
        <h2 className="auth-title" tabIndex={-1} ref={headingRef}>Recibimos tu reclamo</h2>
        <p className="auth-lead">
          Una persona del equipo lo revisará. <strong>Guarda este código ahora</strong>: es la única forma de consultar el
          estado, porque no podemos avisarte por correo ni por SMS. No podemos recuperarlo si lo pierdes.
        </p>
        <div className="claim-code-box">
          <p className="claim-code-label">Tu código de reclamo</p>
          <p className="claim-code" data-testid="claim-code">
            <span aria-hidden="true">{code}</span>
            <span className="sr-only">{spoken(code)}</span>
          </p>
        </div>
        <div className="claim-actions">
          <button type="button" className="btn-auth claim-btn" onClick={copy}>Copiar código</button>
          <button type="button" className="claim-btn-secondary" onClick={download}>Descargar como archivo</button>
        </div>
        <p className="sr-only" role="status">{copied}</p>
        {copied && <p className="field-hint" aria-hidden="true">{copied}</p>}
        <p className="auth-switch">
          <Link to="/web/reclamo-dni/estado" state={{ code }}>Consultar el estado del reclamo</Link>
        </p>
        <p className="field-hint">
          Cuando se resuelva, borramos tus fotos y tu carta. Si no se resuelve en 30 días, el reclamo vence y también se borran.
        </p>
      </div>
    </div>
  );
}

export default function WebClaim() {
  const [f, setF] = useState({ name: '', dni: '', email: '', phone: '', consent: false });
  const [files, setFiles] = useState({});       // kind -> { blob, name, size, url }
  const [fileErr, setFileErr] = useState({});    // kind -> mensaje
  const [fileBusy, setFileBusy] = useState({});  // kind -> true mientras se prepara
  const [fileStatus, setFileStatus] = useState({});
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [phase, setPhase] = useState('idle');    // idle | working | done
  const [progress, setProgress] = useState(null); // { kind, pct }
  const [announce, setAnnounce] = useState('');
  const [doneCode, setDoneCode] = useState(null);
  const formErrorRef = useRef(null);
  const draft = useRef(null);                    // { code, key, sent:Set } del borrador ya creado en el servidor
  const lastBucket = useRef(-1);
  const urls = useRef(new Set());

  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);
  // El foco se pide por ref y se aplica tras el render: mientras se envia el fieldset esta deshabilitado
  // y un campo deshabilitado no puede recibirlo.
  const pendingFocus = useRef(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    document.getElementById(FIELD_ID[pendingFocus.current])?.focus();
    pendingFocus.current = null;
  });
  const [, setFocusTick] = useState(0);
  const focusField = (k) => { pendingFocus.current = k; setFocusTick((t) => t + 1); };
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const errors = useMemo(() => {
    const e = {};
    if (normalizeName(f.name).length < 2) e.name = 'Ingresa tu nombre completo, como figura en tu DNI.';
    else if (normalizeName(f.name).length > 100) e.name = 'El nombre es demasiado largo (máximo 100 caracteres).';
    const dni = normalizeDni(f.dni);
    if (!dni) e.dni = 'Ingresa el DNI que reclamas.';
    else if (!isDni(dni)) e.dni = 'El DNI debe tener exactamente 8 dígitos numéricos.';
    const email = f.email.trim();
    if (!email) e.email = 'Ingresa tu correo.';
    else if (!EMAIL_RE.test(email)) e.email = 'Ese correo no tiene un formato válido (ej: nombre@dominio.com).';
    if (!f.phone.trim()) e.phone = 'Ingresa tu celular.';
    else if (!isPhone(normalizePhone(f.phone))) e.phone = 'El celular debe tener 9 dígitos y empezar en 9 (ej: 987654321).';
    for (const { kind, label, required } of FILES) {
      if (required && !files[kind]) e[kind] = `Adjunta: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
    }
    if (!f.consent) e.consent = 'Debes aceptar el tratamiento de tus datos personales para presentar el reclamo.';
    return e;
  }, [f, files]);

  if (phase === 'done' && doneCode) return <Done code={doneCode} />;

  const shown = (k) => {
    if (FILES.some((x) => x.kind === k)) return fileErr[k] || (submitted ? errors[k] : undefined);
    if (serverErrors[k]) return serverMsg[k];
    return (touched[k] || submitted) ? errors[k] : undefined;
  };
  const serverMsg = {
    dni: <>No hay ninguna cuenta con este DNI, así que no hace falta un reclamo. <Link to="/web/registro">Crea tu cuenta</Link>.</>,
  };
  const markTouched = (k) => setTouched((t) => ({ ...t, [k]: true }));
  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((p) => ({ ...p, [k]: value }));
    setServerErrors((s) => (s[k] ? { ...s, [k]: undefined } : s));
    setFormError('');
  };

  const setStatusFor = (kind, text) => setFileStatus((s) => ({ ...s, [kind]: text }));

  const pickFile = async (kind, file) => {
    setFileErr((e) => ({ ...e, [kind]: undefined }));
    setFileBusy((b) => ({ ...b, [kind]: true }));
    setStatusFor(kind, 'Preparando la imagen…');
    const res = await prepareImage(file);
    setFileBusy((b) => ({ ...b, [kind]: false }));
    if (res.error) {
      setFileErr((e) => ({ ...e, [kind]: FILE_ERRORS[res.error] }));
      setStatusFor(kind, '');
      focusField(kind);
      return;
    }
    const url = URL.createObjectURL(res.blob);
    urls.current.add(url);
    setFiles((p) => {
      if (p[kind]) { URL.revokeObjectURL(p[kind].url); urls.current.delete(p[kind].url); }
      return { ...p, [kind]: { blob: res.blob, name: file.name, size: res.blob.size, url } };
    });
    draft.current?.sent.delete(kind);
    setStatusFor(kind, `Archivo listo: ${file.name}.`);
    focusField(kind);
  };

  const removeFile = (kind) => {
    setFiles((p) => {
      if (p[kind]) { URL.revokeObjectURL(p[kind].url); urls.current.delete(p[kind].url); }
      const n = { ...p }; delete n[kind]; return n;
    });
    draft.current?.sent.delete(kind);
    setFileErr((e) => ({ ...e, [kind]: undefined }));
    setStatusFor(kind, 'Archivo quitado.');
    if (kind === 'selfie' && draft.current) claimsApi.removeSelfie(draft.current.code);
    focusField(kind);
  };

  const failFile = (kind, msg) => {
    setFileErr((e) => ({ ...e, [kind]: msg }));
    focusField(kind);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (phase === 'working') return;
    setSubmitted(true);
    setFormError('');
    const firstBad = FIELD_ORDER.find((k) => errors[k]);
    if (firstBad) { focusField(firstBad); return; }

    setPhase('working');
    setAnnounce('Enviando tu reclamo…');
    const body = {
      name: normalizeName(f.name), dni: normalizeDni(f.dni), email: f.email.trim(), phone: normalizePhone(f.phone), consent: true,
    };
    const key = JSON.stringify(body);
    const fail = (msg) => { setPhase('idle'); setProgress(null); setAnnounce(''); setFormError(msg); };

    // 1. Borrador (si los datos cambiaron desde el ultimo intento, se crea uno nuevo).
    if (!draft.current || draft.current.key !== key) {
      const res = await claimsApi.create(body);
      if (!res.ok) {
        setPhase('idle'); setAnnounce('');
        if (res.error === 'no_account_for_dni') { setServerErrors({ dni: 'no_account_for_dni' }); focusField('dni'); return; }
        if (res.error === 'validation') return fail('Algunos datos no son válidos. Revisa el formulario e inténtalo de nuevo.');
        if (res.error === 'too_many_open') return fail('Ya hay varios reclamos abiertos para este DNI. Espera a que se resuelvan.');
        if (res.error === 'too_many_attempts') {
          const min = Math.max(1, Math.ceil((res.data.retryAfter ?? 900) / 60));
          return fail(`Hiciste demasiados intentos. Espera ${min >= 120 ? `${Math.ceil(min / 60)} horas` : `${min} ${min === 1 ? 'minuto' : 'minutos'}`} e inténtalo de nuevo.`);
        }
        if (res.error === 'claims_full') return fail('Por ahora no podemos recibir más reclamos. Inténtalo más tarde.');
        if (res.error === 'network') return fail('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
        return fail('No pudimos iniciar el reclamo. Inténtalo de nuevo en unos segundos.');
      }
      draft.current = { code: res.data.code, key, sent: new Set() };
    }
    const d = draft.current;

    // 2. Archivos, uno por uno, con progreso anunciado cada 25 %.
    const todo = FILES.filter(({ kind }) => files[kind] && !d.sent.has(kind));
    for (const [i, { kind, label }] of todo.entries()) {
      lastBucket.current = -1;
      setProgress({ kind, pct: 0 });
      setAnnounce(`Subiendo ${label.toLowerCase()} (${i + 1} de ${todo.length}).`);
      const res = await claimsApi.upload(d.code, kind, files[kind].blob, (pct) => {
        setProgress({ kind, pct });
        const bucket = Math.floor(pct / 25);
        if (bucket !== lastBucket.current && pct < 100) { lastBucket.current = bucket; setAnnounce(`${label}: ${bucket * 25} %.`); }
      });
      setProgress(null);
      if (res.ok) { d.sent.add(kind); continue; }
      setPhase('idle');
      if (res.error === 'draft_expired' || res.error === 'not_found') {
        draft.current = null;
        setAnnounce('');
        return setFormError('El envío tardó demasiado y se canceló. Pulsa "Enviar reclamo" para empezar de nuevo.');
      }
      const msg = SERVER_FILE_ERRORS[res.error]
        ?? (res.error === 'network' ? 'No pudimos subir esta imagen por un problema de conexión. Inténtalo de nuevo.'
          : res.error === 'busy' ? 'El servidor está ocupado. Inténtalo de nuevo en unos segundos.'
            : res.error === 'too_many_attempts' ? 'Hiciste demasiados intentos. Espera unos minutos.'
              : 'No pudimos subir esta imagen. Inténtalo de nuevo.');
      setAnnounce(`Error en ${label.toLowerCase()}: ${msg}`);
      failFile(kind, msg);
      return undefined;
    }

    // 3. Enviar.
    setAnnounce('Terminando el envío…');
    const sent = await claimsApi.submit(d.code);
    if (!sent.ok) {
      setPhase('idle'); setAnnounce('');
      if (sent.error === 'missing_files') {
        d.sent.clear();
        return fail('Faltó subir algún archivo. Pulsa "Enviar reclamo" otra vez.');
      }
      if (sent.error === 'draft_expired' || sent.error === 'not_found') draft.current = null;
      return fail('No pudimos terminar el envío. Pulsa "Enviar reclamo" para intentarlo de nuevo.');
    }
    setAnnounce('Reclamo enviado.');
    setDoneCode(d.code);
    setPhase('done');
    return undefined;
  };

  const busy = phase === 'working';
  const dniText = normalizeDni(f.dni) || '[tu DNI]';
  const letter = `Yo, ${normalizeName(f.name) || '[tu nombre completo]'}, con DNI N.º ${dniText}, declaro que soy el titular de este documento de identidad y que no creé la cuenta de Cinerama que usa mi número. Pido ayuda para recuperar o conseguir mi cuenta.\n\nFecha: ____ / ____ / ________\nFirma: ______________________`;

  const copyLetter = async () => {
    try { await navigator.clipboard.writeText(letter); setAnnounce('Texto de la carta copiado.'); } catch { setAnnounce('No se pudo copiar el texto. Selecciónalo y cópialo a mano.'); }
  };

  return (
    <div className="web-page-center">
      <div className="auth-card claim-card">
        <h2 className="auth-title">Reclamo de DNI usado por otra persona</h2>
        <p className="auth-lead">
          Si alguien creó una cuenta con tu DNI, pídenos ayuda. Una persona del equipo revisará tus documentos. Si se
          aprueba, la cuenta que usaba tu DNI se suspende y tu DNI queda libre para que te registres. Todos los campos
          son obligatorios salvo la selfie.
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <fieldset className="claim-fieldset" disabled={busy}>
            <legend className="claim-legend">1. Tus datos</legend>
            <AuthField
              id={FIELD_ID.name} label="Nombre completo" autoComplete="name" placeholder="Como figura en tu DNI"
              value={f.name} onChange={set('name')} onBlur={() => markTouched('name')} error={shown('name')}
            />
            <AuthField
              id={FIELD_ID.dni} label="DNI que reclamas" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="off"
              placeholder="8 dígitos" value={f.dni}
              hint="Es el número de tu DNI. Lo guardamos tal cual solo mientras se revisa el reclamo; al resolverlo lo borramos."
              onChange={set('dni')} onBlur={() => markTouched('dni')} error={shown('dni')}
            />
            <AuthField
              id={FIELD_ID.email} label="Correo" type="email" inputMode="email" autoComplete="email" placeholder="correo@ejemplo.com"
              hint="Con este correo podrás registrarte si se aprueba tu reclamo: tu DNI quedará reservado 7 días para él."
              value={f.email} onChange={set('email')} onBlur={() => markTouched('email')} error={shown('email')}
            />
            <AuthField
              id={FIELD_ID.phone} label="Celular" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={16}
              placeholder="987654321" value={f.phone} onChange={set('phone')} onBlur={() => markTouched('phone')} error={shown('phone')}
            />
          </fieldset>

          <fieldset className="claim-fieldset" disabled={busy}>
            <legend className="claim-legend">2. Carta firmada</legend>
            <p className="field-hint">
              Escribe a mano o imprime este texto, fírmalo y tómale una foto. Se aceptan las dos formas: lo importante es la
              firma.
            </p>
            <blockquote className="claim-letter" id="claim-letter-text">
              {letter.split('\n').map((line, i) => <span key={i}>{line}<br /></span>)}
            </blockquote>
            <button type="button" className="claim-btn-secondary" onClick={copyLetter}>Copiar el texto de la carta</button>
          </fieldset>

          <fieldset className="claim-fieldset" disabled={busy}>
            <legend className="claim-legend">3. Fotos</legend>
            {FILES.map(({ kind, label, hint, required }) => (
              <FileField
                key={kind} id={FIELD_ID[kind]} label={label} hint={hint} required={required}
                value={files[kind]} busy={fileBusy[kind]} error={shown(kind)} statusText={fileStatus[kind]}
                progress={progress?.kind === kind ? progress.pct : null}
                onPick={(file) => pickFile(kind, file)} onRemove={() => removeFile(kind)}
              />
            ))}
          </fieldset>

          <div className="form-group">
            <label className="check-row" htmlFor={FIELD_ID.consent}>
              <input
                id={FIELD_ID.consent} name={FIELD_ID.consent} type="checkbox" disabled={busy}
                checked={f.consent} onChange={set('consent')} onBlur={() => markTouched('consent')}
                aria-required="true" aria-invalid={Boolean(shown('consent'))}
                aria-describedby={shown('consent') ? `${FIELD_ID.consent}-err` : undefined}
              />
              <span>
                Acepto que Cinerama trate estos datos y fotos para revisar mi reclamo, según la{' '}
                <Link to="/web/privacidad" target="_blank" rel="noopener noreferrer">
                  Política de datos personales<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </Link>
                {' '}(Ley N.º 29733). Entiendo que, si se aprueba, la cuenta que usaba mi DNI se suspende.
              </span>
            </label>
            {shown('consent') && <FieldError id={`${FIELD_ID.consent}-err`} message={shown('consent')} />}
          </div>

          <p className="sr-only" role="status">{announce}</p>
          {busy && <p className="field-hint claim-working" aria-hidden="true">{announce}</p>}
          {formError && <div className="form-error" tabIndex={-1} ref={formErrorRef} role="alert">{formError}</div>}

          <button type="submit" className="btn-auth" aria-disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar reclamo'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Ya presentaste un reclamo? <Link to="/web/reclamo-dni/estado">Consulta su estado con tu código</Link>
        </p>
      </div>
    </div>
  );
}
