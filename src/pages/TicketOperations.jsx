import { useState } from 'react';
import { Search, RefreshCw, QrCode, X, CheckCircle, MapPin, Ticket as TicketIcon } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { halls } from '../data/store';

const statusConfig = {
  approved:  { label: 'Válido',    cls: 'badge-green' },
  refunded:  { label: 'Reembolsado',cls: 'badge-orange' },
  cancelled: { label: 'Cancelado', cls: 'badge-muted' },
  rejected:  { label: 'Rechazado', cls: 'badge-red' },
};
const ticketStatus = { approved: 'Válido', refunded: 'Reembolsado', rejected: 'Vencido', cancelled: 'Cancelado' };
const tabs = ['Pedidos', 'Boletos', 'Reembolsos', 'Validación', 'Venta Presencial'];

export default function TicketOperations() {
  const { activeOrders, activeScreenings, enabledMovies, activeBranch, processLocalSale, refundOrder, cancelOrder } = useCinema();

  const [activeTab, setActiveTab] = useState('Pedidos');
  const [search, setSearch] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [qrResult, setQrResult] = useState(null);

  // Estados locales para la venta presencial
  const [selectedMovieId, setSelectedMovieId] = useState('');
  const [selectedScreeningId, setSelectedScreeningId] = useState('');
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [checkoutSuccess, setCheckoutSuccess] = useState(null);

  const filtered = activeOrders.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.toLowerCase().includes(search.toLowerCase()) ||
    o.movieTitle.toLowerCase().includes(search.toLowerCase())
  );

  const refundable = activeOrders.filter(o => o.status === 'approved');
  const refunded = activeOrders.filter(o => o.status === 'refunded');

  const processRefund = (id) => refundOrder(id);
  const handleCancel = (id) => cancelOrder(id);

  const validateQR = () => {
    const order = activeOrders.find(o => o.id === qrInput.toUpperCase());
    if (order) {
      setQrResult({ found: true, order });
    } else {
      setQrResult({ found: false });
    }
  };

  const methodLabel = { credit_card: 'Tarjeta de Crédito', debit_card: 'Tarjeta de Débito', cash: 'Efectivo', mobile_pay: 'Pago Móvil / Yape' };
  const methodBadge = { credit_card: 'badge-blue', debit_card: 'badge-purple', cash: 'badge-muted', mobile_pay: 'badge-green' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operaciones de Taquilla</h1>
          <p className="page-subtitle">
            {activeBranch ? `Gestionando taquilla en ${activeBranch.name}` : 'Gestionando taquilla de la red'}
          </p>
        </div>
      </div>

      <div className="tabs mb-6">
        {tabs.map(t => (
          <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'Venta Presencial' ? 'Venta Presencial' : t}
            {t === 'Reembolsos' && <span className="badge badge-orange" style={{ marginLeft: 6 }}>{refunded.length}</span>}
          </button>
        ))}
      </div>

      {/* PEDIDOS */}
      {activeTab === 'Pedidos' && (
        <>
          <div className="flex-between mb-4">
            <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
              <Search size={15} color="var(--text-muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por ID, cliente, película..." />
            </div>
          </div>
          <div className="table-wrapper card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>ID Pedido</th><th>Película</th><th>Cliente</th><th>Asientos</th><th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const cfg = statusConfig[o.status] || statusConfig.approved;
                  return (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id}</td>
                      <td style={{ fontWeight: 600 }}>{o.movieTitle}</td>
                      <td>
                        <div className="flex gap-8">
                          <div className="avatar avatar-sm">{o.customer.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.customer}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{o.seats.join(', ')}</td>
                      <td style={{ color: 'var(--cinema-gold)', fontWeight: 700 }}>${o.amount}</td>
                      <td><span className={`badge ${methodBadge[o.method]}`}>{methodLabel[o.method]}</span></td>
                      <td><span className={`badge ${cfg.cls}`}>{cfg.label}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.date}</td>
                      <td>
                        <div className="flex gap-6">
                          {o.status === 'approved' && (
                            <>
                              <button className="icon-btn" title="Reembolsar" onClick={() => processRefund(o.id)}><RefreshCw size={13} /></button>
                              <button className="icon-btn danger" title="Cancelar" onClick={() => handleCancel(o.id)}><X size={13} /></button>
                            </>
                          )}
                          <button className="icon-btn" title="Ver QR" onClick={() => { setActiveTab('Validación'); setQrInput(o.id); }}><QrCode size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* BOLETOS */}
      {activeTab === 'Boletos' && (
        <div className="grid-3">
          {activeOrders.map(o => {
            const status = ticketStatus[o.status] || 'Válido';
            const statusCls = { 'Válido': 'badge-green', 'Reembolsado': 'badge-orange', 'Vencido': 'badge-red', 'Cancelado': 'badge-muted' };
            return (
              <div key={o.id} className="card" style={{ borderLeft: `3px solid ${o.status === 'approved' ? 'var(--emerald)' : o.status === 'refunded' ? 'var(--intense-orange)' : 'var(--border)'}` }}>
                <div className="flex-between mb-4">
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{o.id}</span>
                  <span className={`badge ${statusCls[status]}`}>{status}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{o.movieTitle}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{o.customer}</div>
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  {o.seats.map(s => <span key={s} className="tag">{s}</span>)}
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.date}</span>
                  <span style={{ fontWeight: 700, color: 'var(--cinema-gold)' }}>${o.amount}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REEMBOLSOS */}
      {activeTab === 'Reembolsos' && (
        <div className="table-wrapper card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>ID Pedido</th><th>Película</th><th>Cliente</th><th>Monto</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {[...refundable, ...refunded].map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id}</td>
                  <td style={{ fontWeight: 600 }}>{o.movieTitle}</td>
                  <td>{o.customer}</td>
                  <td style={{ color: 'var(--cinema-gold)', fontWeight: 700 }}>${o.amount}</td>
                  <td><span className={`badge ${o.status === 'refunded' ? 'badge-orange' : 'badge-green'}`}>{o.status === 'refunded' ? 'Reembolsado' : 'Elegible'}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.date}</td>
                  <td>
                    {o.status === 'approved' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => processRefund(o.id)}>
                        <RefreshCw size={13} /> Reembolsar
                      </button>
                    )}
                    {o.status === 'refunded' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Procesado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VALIDACIÓN */}
      {activeTab === 'Validación' && (
        <div style={{ display: 'flex', gap: 24 }}>
          <div className="card" style={{ flex: 1, maxWidth: 400 }}>
            <div className="section-title mb-4">Validador de Código QR</div>
            <div className="form-group">
              <label className="form-label">Ingresa ID de Pedido o escanea QR</label>
              <div className="flex gap-8">
                <input className="input" value={qrInput} onChange={e => setQrInput(e.target.value)} placeholder="TXN-001245" onKeyDown={e => e.key === 'Enter' && validateQR()} />
                <button className="btn btn-primary" onClick={validateQR}><QrCode size={16} /></button>
              </div>
            </div>
            {qrResult && (
              <div style={{ marginTop: 16 }}>
                {qrResult.found ? (
                  <div style={{ background: qrResult.order.status === 'approved' ? 'var(--emerald-dim)' : 'var(--action-red-dim)', border: `1px solid ${qrResult.order.status === 'approved' ? 'var(--emerald)' : 'var(--action-red)'}`, borderRadius: 10, padding: 16 }}>
                    <div className="flex gap-8 mb-4">
                      {qrResult.order.status === 'approved'
                        ? <CheckCircle size={20} color="var(--emerald)" />
                        : <X size={20} color="var(--action-red)" />}
                      <span style={{ fontWeight: 700, color: qrResult.order.status === 'approved' ? 'var(--emerald)' : 'var(--action-red)' }}>
                        {qrResult.order.status === 'approved' ? 'BOLETO VÁLIDO' : 'INVÁLIDO / USADO'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <p><strong>Película:</strong> {qrResult.order.movieTitle}</p>
                      <p><strong>Cliente:</strong> {qrResult.order.customer}</p>
                      <p><strong>Asientos:</strong> {qrResult.order.seats.join(', ')}</p>
                      <p><strong>Monto:</strong> ${qrResult.order.amount}</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--action-red-dim)', border: '1px solid var(--action-red)', borderRadius: 10, padding: 16, color: 'var(--action-red)' }}>
                    <X size={16} /> Pedido no encontrado
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="section-title mb-4">Validaciones Recientes</div>
            <div className="empty-state">
              <QrCode size={32} />
              <p>No hay validaciones aún el día de hoy</p>
            </div>
          </div>
        </div>
      )}

      {/* VENTA PRESENCIAL (TAQUILLA INTERACTIVA) */}
      {activeTab === 'Venta Presencial' && (
        <div style={{ display: 'flex', gap: 24, flexDirection: 'column' }}>
          {checkoutSuccess ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', maxWidth: 600, margin: '0 auto', border: '1px solid var(--emerald)', background: 'var(--emerald-dim)' }}>
              <div style={{ width: 56, height: 56, background: 'var(--emerald)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle size={32} color="white" />
              </div>
              <h2 style={{ fontSize: 20, marginBottom: 8, color: 'var(--emerald)' }}>¡Compra Registrada Exitosamente!</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
                El boleto local ha sido generado con el código de transacción <strong>{checkoutSuccess.id}</strong>.
              </p>
              <div style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 10, textAlign: 'left', marginBottom: 24, border: '1px solid var(--border)' }}>
                <p style={{ marginBottom: 6 }}><strong>Película:</strong> {checkoutSuccess.movieTitle}</p>
                <p style={{ marginBottom: 6 }}><strong>Cine / Sede:</strong> {checkoutSuccess.branch}</p>
                <p style={{ marginBottom: 6 }}><strong>Asientos:</strong> {checkoutSuccess.seats.join(', ')}</p>
                <p style={{ marginBottom: 6 }}><strong>Monto Total:</strong> <span style={{ color: 'var(--cinema-gold)', fontWeight: 800 }}>${checkoutSuccess.amount}</span></p>
                <p style={{ marginBottom: 6 }}><strong>Cliente:</strong> {checkoutSuccess.customer}</p>
                <p style={{ marginBottom: 6 }}><strong>Método de Pago:</strong> {methodLabel[checkoutSuccess.method]}</p>
              </div>
              <button className="btn btn-primary" onClick={() => {
                setCheckoutSuccess(null);
                setSelectedSeats([]);
                setCustomerName('');
                setCustomerEmail('');
              }}>Nueva Venta</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {/* Columna Izquierda: Filtros y Datos de Venta */}
              <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="card">
                  <div className="section-title mb-4">1. Seleccionar Película y Función</div>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">Película</label>
                    <select className="select" style={{ width: '100%' }} value={selectedMovieId} onChange={e => { setSelectedMovieId(e.target.value); setSelectedScreeningId(''); setSelectedSeats([]); }}>
                      <option value="">Selecciona una película...</option>
                      {enabledMovies.filter(m => m.status === 'active').map(m => (
                        <option key={m.id} value={m.id}>{m.title}</option>
                      ))}
                    </select>
                  </div>
                  {selectedMovieId && (
                    <div className="form-group">
                      <label className="form-label">Función Disponible</label>
                      <select className="select" style={{ width: '100%' }} value={selectedScreeningId} onChange={e => { setSelectedScreeningId(e.target.value); setSelectedSeats([]); }}>
                        <option value="">Selecciona horario...</option>
                        {activeScreenings
                          .filter(s => s.movieId === Number(selectedMovieId) && (s.status === 'active' || s.status === 'scheduled'))
                          .map(s => {
                            const h = halls.find(x => x.id === s.hallId);
                            return <option key={s.id} value={s.id}>{s.date} — {s.startTime} ({h?.name} - {s.format})</option>;
                          })}
                      </select>
                    </div>
                  )}
                </div>

                {selectedScreeningId && (
                  <div className="card">
                    <div className="section-title mb-4">3. Datos del Cliente y Cobro</div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Nombre del Cliente</label>
                      <input className="input" style={{ width: '100%' }} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ej: Carlos Méndez" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label">Email (Opcional)</label>
                      <input className="input" style={{ width: '100%' }} value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="carlos@mail.com" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Método de Pago</label>
                      <select className="select" style={{ width: '100%' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                        <option value="cash">Efectivo (Pago en Caja)</option>
                        <option value="debit_card">Tarjeta de Débito</option>
                        <option value="credit_card">Tarjeta de Crédito</option>
                        <option value="mobile_pay">Pago Móvil / QR</option>
                      </select>
                    </div>

                    {selectedSeats.length > 0 && (() => {
                      const scr = activeScreenings.find(s => s.id === Number(selectedScreeningId));
                      const total = selectedSeats.reduce((sum, seat) => {
                        return sum + (scr?.price || 0);
                      }, 0);
                      return (
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Monto por {selectedSeats.length} asiento(s):</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--cinema-gold)' }}>${total}</div>
                          </div>
                          <button className="btn btn-primary" onClick={() => {
                            const res = processLocalSale(Number(selectedScreeningId), selectedSeats, customerName, customerEmail, paymentMethod);
                            if (res) setCheckoutSuccess(res);
                          }}>Confirmar y Cobrar</button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Columna Derecha: Mapa de Asientos Interactivos en Tiempo Real */}
              {selectedScreeningId ? (() => {
                const scr = activeScreenings.find(s => s.id === Number(selectedScreeningId));
                // Cruzar con los pedidos existentes para ver cuáles están ocupados
                const scrOrders = activeOrders.filter(o => o.screeningId === scr?.id && o.status === 'approved');
                const occupied = new Set();
                scrOrders.forEach(o => {
                  o.seats.forEach(s => occupied.add(s));
                });

                const COLS = 10; const ROWS = 8;
                const seatColor = { available: 'var(--surface-2)', selected: 'var(--action-red)', occupied: 'rgba(255,255,255,0.05)' };
                const seatBorder = { available: 'var(--border)', selected: 'var(--action-red)', occupied: 'rgba(255,255,255,0.02)' };

                const toggleSeatSelect = (seatName) => {
                  if (occupied.has(seatName)) return;
                  setSelectedSeats(p => p.includes(seatName) ? p.filter(x => x !== seatName) : [...p, seatName]);
                };

                return (
                  <div className="card" style={{ flex: 1.3, minWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div className="section-title mb-6" style={{ width: '100%', textAlign: 'center' }}>2. Selecciona Asientos en Tiempo Real</div>
                    <div style={{ marginBottom: 24, textAlign: 'center', width: '100%' }}>
                      <div style={{ height: 6, background: 'var(--action-red-dim)', border: '1px solid var(--action-red)', borderRadius: 4, margin: '0 auto 8px', width: '70%' }} />
                      <p style={{ fontSize: 10, color: 'var(--action-red)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>Pantalla de la Sala</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 32px)`, gap: 8, marginBottom: 24 }}>
                      {Array.from({ length: ROWS }).map((_, r) =>
                        Array.from({ length: COLS }).map((_, c) => {
                          const rowLetter = String.fromCharCode(65 + r);
                          const seatName = `${rowLetter}${c + 1}`;
                          const isOccupied = occupied.has(seatName);
                          const isSelected = selectedSeats.includes(seatName);
                          
                          let state = 'available';
                          if (isOccupied) state = 'occupied';
                          else if (isSelected) state = 'selected';

                          return (
                            <button
                              key={seatName}
                              disabled={isOccupied}
                              onClick={() => toggleSeatSelect(seatName)}
                              title={isOccupied ? `${seatName} (Ocupado)` : isSelected ? `${seatName} (Seleccionado)` : `${seatName} (Disponible)`}
                              style={{
                                width: 32, height: 32, borderRadius: 6,
                                border: `2px solid ${seatBorder[state]}`,
                                background: seatColor[state], 
                                cursor: isOccupied ? 'not-allowed' : 'pointer',
                                opacity: isOccupied ? 0.25 : 1,
                                transition: 'all 0.15s', fontSize: 9,
                                color: isSelected ? 'white' : 'var(--text-muted)', 
                                fontWeight: isSelected ? 800 : 500,
                              }}
                            >
                              {seatName}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid var(--border)', background: 'var(--surface-2)' }} />
                        Regular
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid var(--action-red)', background: 'var(--action-red)' }} />
                        Tu Selección
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--border)', opacity: 0.25 }} />
                        Ocupado
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="card" style={{ flex: 1.3, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Selecciona una película y una función de los menús de la izquierda para desplegar la visualización de butacas libres y ocupadas.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
