import { Outlet, useNavigate } from 'react-router-dom';
import './WebLayout.css';

export default function WebLayout() {
  const navigate = useNavigate();

  return (
    <div className="web-container">
      <nav className="web-navbar">
        <div className="web-brand" onClick={() => navigate('/WebHome')}>
          <h1>CINERAMA</h1>
        </div>
        <div className="web-nav-links">
          <button className="nav-link" onClick={() => navigate('/web/peliculas')}>Peliculas</button>
          <button className="nav-link" onClick={() => navigate('/web/cines')}>Cines</button>
          <button className="nav-link highlight" onClick={() => navigate('/web/login')}>Iniciar Sesión</button>
        </div>
      </nav>
      
      <div className="web-content-area">
        <Outlet />
      </div>

      {/* Footer Público */}
      <footer className="web-footer">
        <div className="footer-top">
          <div className="footer-col brand-col">
            <h2 className="footer-logo">Cinerama</h2>
            <p className="footer-desc">
              La cadena de cines peruana que te acompaña desde 2005, brindándote el mejor entretenimiento.
            </p>
            <p className="footer-copy">© 2025 Cinerama.</p>
          </div>
          
          <div className="footer-col links-col">
            <h3>Nosotros</h3>
            <ul>
              <li onClick={() => navigate('/web/peliculas')}>Cartelera</li>
              <li onClick={() => navigate('/web/cines')}>Cines</li>
            </ul>
          </div>

          <div className="footer-col social-col">
            <h3>Redes Sociales</h3>
            <p>Entérate de nuestras novedades y promociones.</p>
            <div className="social-icons">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.23-2.5.83-5.11 2.82-6.57 1.83-1.38 4.26-1.77 6.46-1.07v4.11c-1.04-.38-2.22-.32-3.17.26-.84.49-1.43 1.34-1.55 2.3-.15 1.17.41 2.37 1.41 2.97 1.01.6 2.32.61 3.33.02 1.15-.65 1.84-1.93 1.86-3.26.04-5.69.02-11.39.02-17.09z"/></svg>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="payment-methods">
            <span>Pagos 100% seguros con</span>
            <div className="payment-icons">
              <span className="pay-card">VISA</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
