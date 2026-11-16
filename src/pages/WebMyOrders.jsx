import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ordersApi } from '../api/orders';
import OrderCode from '../components/OrderCode';
import { OrderFacts, StatusBadge } from '../components/OrderParts';
import './WebOrders.css';

const PAGE_SIZE = 10;
const TABS = [
  { id: 'upcoming', label: 'Próximas', empty: 'No tienes entradas próximas.' },
  { id: 'past', label: 'Anteriores', empty: 'No tienes entradas anteriores.' },
];
export default function WebMyOrders() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'past' ? 'past' : 'upcoming';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const [result, setResult] = useState({ key: '', ok: false, data: null });
  const [reload, setReload] = useState(0);
  const [counts, setCounts] = useState(null);
  const titleRef = useRef(null);
  const tabRefs = useRef({});
  const key = `${tab}:${page}:${reload}`;

  useEffect(() => {
    let off = false;
    ordersApi.mine({ scope: tab, page, pageSize: PAGE_SIZE }).then((res) => {
      if (off) return;
      setResult({ key, ok: res.ok, data: res.ok ? res.data : null });
      if (res.ok) setCounts(res.data.counts);
    });
    return () => { off = true; };
  }, [tab, page, key]);

  // Estado derivado: cargando mientras el resultado guardado no corresponde a la pestana/pagina pedida.
  const state = { status: result.key !== key ? 'loading' : result.ok ? 'ok' : 'error', data: result.key === key ? result.data : null };
  const load = () => setReload((n) => n + 1);

  useEffect(() => { document.title = 'Mis entradas · Cinerama'; titleRef.current?.focus(); }, []);

  const go = (next) => setParams(next, { replace: true });
  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n === null) return;
    e.preventDefault();
    go(TABS[n].id === 'upcoming' ? {} : { tab: TABS[n].id });
    tabRefs.current[TABS[n].id]?.focus();
  };

  const d = state.data;
  const cur = TABS.find((t) => t.id === tab);
  return (
    <main className="orders-page">
      <h2 className="orders-title" tabIndex={-1} ref={titleRef}>Mis entradas</h2>
      <p className="orders-lead">Tus compras simuladas. No enviamos correo: aquí puedes volver a ver el código de cada orden.</p>

      <div className="orders-tabs" role="tablist" aria-label="Tus entradas" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-controls="orders-panel"
            aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
            className={`orders-tab${tab === t.id ? ' active' : ''}`}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            onClick={() => go(t.id === 'upcoming' ? {} : { tab: t.id })}
          >
            {t.label}{counts ? ` (${counts[t.id]})` : ''}
          </button>
        ))}
      </div>

      <div id="orders-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="orders-panel">
        {state.status === 'loading' && !d && <p className="orders-state" role="status">Cargando tus entradas…</p>}
        {state.status === 'error' && (
          <div className="orders-state" role="alert">
            <p>No pudimos cargar tus entradas. Revisa tu conexión e inténtalo de nuevo.</p>
            <button type="button" className="btn-outline" onClick={load}>Reintentar</button>
          </div>
        )}
        {state.status !== 'error' && d && d.orders.length === 0 && (
          <div className="orders-empty">
            <p>{cur.empty}</p>
            <p>{tab === 'upcoming' ? 'Cuando compres entradas aparecerán aquí.' : 'Aquí verás las funciones que ya pasaron y las reembolsadas.'}</p>
            <Link className="btn-solid orders-link-btn" to="/web/peliculas">Ver la cartelera</Link>
          </div>
        )}
        {state.status !== 'error' && d && d.orders.length > 0 && (
          <ul className="orders-list" aria-busy={state.status === 'loading'}>
            {d.orders.map((o) => (
              <li key={o.code}>
                <article className="order-card" aria-labelledby={`t-${o.code}`}>
                  <header className="order-card-head">
                    <h3 id={`t-${o.code}`}>{o.screening.movieTitle}</h3>
                    <StatusBadge order={o} />
                  </header>
                  <OrderFacts order={o} />
                  <OrderCode code={o.code} />
                  <Link className="btn-outline orders-link-btn" to={`/web/mis-entradas/${o.code}`} aria-label={`Ver entrada de ${o.screening.movieTitle}, código ${o.code}`}>Ver entrada</Link>
                </article>
              </li>
            ))}
          </ul>
        )}
        {d && d.totalPages > 1 && (
          <nav className="orders-pager" aria-label="Páginas de entradas">
            <button type="button" className="btn-outline" disabled={d.page <= 1} onClick={() => go({ ...(tab === 'past' ? { tab } : {}), ...(d.page > 2 ? { page: d.page - 1 } : {}) })}>Anterior</button>
            <span role="status">Página {d.page} de {d.totalPages}</span>
            <button type="button" className="btn-outline" disabled={d.page >= d.totalPages} onClick={() => go({ ...(tab === 'past' ? { tab } : {}), page: d.page + 1 })}>Siguiente</button>
          </nav>
        )}
      </div>
    </main>
  );
}
