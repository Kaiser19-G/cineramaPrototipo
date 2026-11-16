import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCinema } from '../context/CinemaContext';
import { SALES_PERMS, hasAnyPerm } from '../shared/permissions';
import SellTab from './taquilla/SellTab';
import ValidateTab from './taquilla/ValidateTab';
import OrdersTab from './taquilla/OrdersTab';
import './MovieManagement.css';
import './Taquilla.css';

// Taquilla: venta en mostrador, validacion de entradas en la puerta y reembolso individual. Cada pestana se muestra
// solo a quien tiene el permiso; el servidor es quien decide (permisos y sede).
export default function TicketOperations() {
  const { user } = useAuth();
  const { activeBranch, isAdminCentral } = useCinema();
  const can = (p) => !!user?.perms?.includes(p);
  const tabs = [
    can('process_sale') && { id: 'sell', label: 'Vender' },
    can('validate_ticket') && { id: 'validate', label: 'Validar' },
    (hasAnyPerm(user, SALES_PERMS) || can('process_refund')) && { id: 'orders', label: can('process_refund') ? 'Órdenes y reembolsos' : 'Órdenes' },
  ].filter(Boolean);
  const [chosen, setChosen] = useState(null);
  const current = tabs.find((t) => t.id === chosen)?.id ?? tabs[0]?.id;
  const headingRef = useRef(null);
  const tabRefs = useRef({});
  useEffect(() => { document.title = 'Taquilla · Cinerama'; headingRef.current?.focus(); }, []);

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.id === current);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    setChosen(tabs[n].id);
    tabRefs.current[tabs[n].id]?.focus();
  };

  return (
    <div className="mv-page tq-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Taquilla</h1>
          <p className="page-subtitle">
            Ventas en mostrador, validación de entradas y reembolsos{isAdminCentral ? (activeBranch ? ` · ${activeBranch.name}` : ' · toda la red') : ''}. Los pagos son simulados.
          </p>
        </div>
      </div>

      {tabs.length === 0 ? (
        <div className="us-notice" role="alert"><p>Tu rol no tiene acciones de Taquilla.</p></div>
      ) : (
        <>
          <div className="tabs tq-tabs" role="tablist" aria-label="Secciones de Taquilla" onKeyDown={onKeyDown}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" id={`tq-tab-${t.id}`} aria-selected={current === t.id} aria-controls={`tq-panel-${t.id}`}
                tabIndex={current === t.id ? 0 : -1} className={`tab ${current === t.id ? 'active' : ''}`} ref={(el) => { tabRefs.current[t.id] = el; }}
                onClick={() => setChosen(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {tabs.map((t) => (
            <div key={t.id} role="tabpanel" id={`tq-panel-${t.id}`} aria-labelledby={`tq-tab-${t.id}`} hidden={current !== t.id} className="tq-tabpanel">
              {t.id === 'sell' && <SellTab active={current === 'sell'} headingRef={headingRef} />}
              {t.id === 'validate' && <ValidateTab active={current === 'validate'} />}
              {t.id === 'orders' && <OrdersTab canRefund={can('process_refund')} />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
