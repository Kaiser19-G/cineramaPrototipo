import './WebPages.css';
import { Link } from 'react-router-dom';

export default function WebNotFound() {
  return (
    <main className="legal-page not-found">
      <h2 className="legal-title">Página no encontrada</h2>
      <p>La dirección que buscas no existe o fue movida.</p>
      <p><Link to="/WebHome">Ir al inicio</Link></p>
    </main>
  );
}
