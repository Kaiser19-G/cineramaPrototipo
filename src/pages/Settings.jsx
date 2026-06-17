import { useState } from 'react';
import { Save, Bell, Lock, Globe, CreditCard, Plug } from 'lucide-react';

const tabs = ['General', 'Precios', 'Impuestos', 'Notificaciones', 'Seguridad', 'Integraciones'];
const tabIcons = { General: Globe, Precios: CreditCard, Impuestos: CreditCard, Notificaciones: Bell, Seguridad: Lock, Integraciones: Plug };

export default function Settings() {
  const [activeTab, setActiveTab] = useState('General');
  const [saved, setSaved] = useState(false);
  const [general, setGeneral] = useState({ cinemaName: 'Cinerama', timezone: 'America/Lima', currency: 'USD', locale: 'es-ES', email: 'admin@cinerama.com' });
  const [pricing, setPricing] = useState({ base2D: 18, base3D: 25, weekendSurcharge: 10, holidaySurcharge: 20 });
  const [taxes, setTaxes] = useState({ vatRate: 18, includeVAT: true, taxLabel: 'IGV' });
  const [notif, setNotif] = useState({ emailAlerts: true, paymentFailures: true, lowOccupancy: true, systemErrors: true, dailyReport: false });
  const [security, setSecurity] = useState({ sessionTimeout: 30, twoFactor: false, loginAttempts: 5 });

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const Field = ({ label, children }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
  const Toggle = ({ checked, onChange, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--action-red)' : 'var(--surface-2)',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 23 : 3, transition: 'left 0.2s' }} />
      </button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Configuración del sistema y preferencias</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={15} /> {saved ? '¡Guardado!' : 'Guardar Cambios'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24 }}>
        {/* Nav vertical */}
        <div className="card" style={{ padding: 8, alignSelf: 'start' }}>
          {tabs.map(t => {
            const Icon = tabIcons[t];
            return (
              <button key={t} className={`nav-item ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}
                style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 8, marginBottom: 2 }}>
                <Icon size={15} /> {t}
              </button>
            );
          })}
        </div>

        <div className="card">
          {activeTab === 'General' && (
            <>
              <div className="section-title mb-4">Configuración General</div>
              <div className="form-row">
                <Field label="Nombre del Cine"><input className="input" value={general.cinemaName} onChange={e => setGeneral(p => ({ ...p, cinemaName: e.target.value }))} /></Field>
                <Field label="Email de Contacto"><input className="input" value={general.email} onChange={e => setGeneral(p => ({ ...p, email: e.target.value }))} /></Field>
              </div>
              <div className="form-row">
                <Field label="Zona Horaria">
                  <select className="select" style={{ width: '100%' }} value={general.timezone} onChange={e => setGeneral(p => ({ ...p, timezone: e.target.value }))}>
                    <option value="America/Lima">América/Lima (UTC-5)</option>
                    <option value="America/New_York">América/New_York (UTC-5)</option>
                    <option value="Europe/Madrid">Europa/Madrid (UTC+1)</option>
                  </select>
                </Field>
                <Field label="Moneda">
                  <select className="select" style={{ width: '100%' }} value={general.currency} onChange={e => setGeneral(p => ({ ...p, currency: e.target.value }))}>
                    <option value="USD">USD — Dólar Estadounidense</option>
                    <option value="PEN">PEN — Sol Peruano</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {activeTab === 'Precios' && (
            <>
              <div className="section-title mb-4">Precios Base de Boletos</div>
              <div className="grid-3">
                {[['base2D','2D'],['base3D','3D']].map(([key, label]) => (
                  <Field key={key} label={`Precio ${label} ($)`}>
                    <input className="input" type="number" value={pricing[key]} onChange={e => setPricing(p => ({ ...p, [key]: e.target.value }))} />
                  </Field>
                ))}
              </div>
              <div className="divider" />
              <div className="section-title mb-4">Recargos (%)</div>
              <div className="form-row">
                <Field label="Recargo Fin de Semana (%)"><input className="input" type="number" value={pricing.weekendSurcharge} onChange={e => setPricing(p => ({ ...p, weekendSurcharge: e.target.value }))} /></Field>
                <Field label="Recargo Días Festivos (%)"><input className="input" type="number" value={pricing.holidaySurcharge} onChange={e => setPricing(p => ({ ...p, holidaySurcharge: e.target.value }))} /></Field>
              </div>
            </>
          )}

          {activeTab === 'Impuestos' && (
            <>
              <div className="section-title mb-4">Configuración de Impuestos</div>
              <div className="form-row">
                <Field label="Etiqueta de Impuesto"><input className="input" value={taxes.taxLabel} onChange={e => setTaxes(p => ({ ...p, taxLabel: e.target.value }))} /></Field>
                <Field label="Tasa de IVA (%)"><input className="input" type="number" value={taxes.vatRate} onChange={e => setTaxes(p => ({ ...p, vatRate: e.target.value }))} /></Field>
              </div>
              <Toggle label="Incluir IVA en precios mostrados" checked={taxes.includeVAT} onChange={v => setTaxes(p => ({ ...p, includeVAT: v }))} />
            </>
          )}

          {activeTab === 'Notificaciones' && (
            <>
              <div className="section-title mb-4">Preferencias de Notificación</div>
              <Toggle label="Alertas por correo electrónico de eventos críticos" checked={notif.emailAlerts} onChange={v => setNotif(p => ({ ...p, emailAlerts: v }))} />
              <Toggle label="Notificaciones de pagos fallidos" checked={notif.paymentFailures} onChange={v => setNotif(p => ({ ...p, paymentFailures: v }))} />
              <Toggle label="Alertas de baja ocupación" checked={notif.lowOccupancy} onChange={v => setNotif(p => ({ ...p, lowOccupancy: v }))} />
              <Toggle label="Notificaciones de errores del sistema" checked={notif.systemErrors} onChange={v => setNotif(p => ({ ...p, systemErrors: v }))} />
              <Toggle label="Resumen de ingresos diario" checked={notif.dailyReport} onChange={v => setNotif(p => ({ ...p, dailyReport: v }))} />
            </>
          )}

          {activeTab === 'Seguridad' && (
            <>
              <div className="section-title mb-4">Configuración de Seguridad</div>
              <div className="form-row">
                <Field label="Tiempo límite de sesión (minutos)"><input className="input" type="number" value={security.sessionTimeout} onChange={e => setSecurity(p => ({ ...p, sessionTimeout: e.target.value }))} /></Field>
                <Field label="Max. intentos de acceso"><input className="input" type="number" value={security.loginAttempts} onChange={e => setSecurity(p => ({ ...p, loginAttempts: e.target.value }))} /></Field>
              </div>
              <Toggle label="Requerir Autenticación de Dos Pasos" checked={security.twoFactor} onChange={v => setSecurity(p => ({ ...p, twoFactor: v }))} />
            </>
          )}

          {activeTab === 'Integraciones' && (
            <>
              <div className="section-title mb-4">Integraciones de Terceros</div>
              {[
                { name: 'Pagos con Stripe', status: 'Conectado', cls: 'badge-green', desc: 'Procesa pagos en línea vía Stripe' },
                { name: 'SMS con Twilio', status: 'No configurado', cls: 'badge-muted', desc: 'Envía confirmaciones de tickets por SMS' },
                { name: 'Correos con SendGrid', status: 'Conectado', cls: 'badge-green', desc: 'Envía correos electrónicos transaccionales' },
                { name: 'Analíticas en Firebase', status: 'Desconectado', cls: 'badge-orange', desc: 'Sigue analíticas de comportamiento de usuarios' },
                { name: 'Google Calendar', status: 'No configurado', cls: 'badge-muted', desc: 'Sincroniza programaciones de salas' },
              ].map((intg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{intg.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{intg.desc}</div>
                  </div>
                  <div className="flex gap-12">
                    <span className={`badge ${intg.cls}`}>{intg.status}</span>
                    <button className="btn btn-secondary btn-sm">Configurar</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
