import { useState } from 'react';
import './WebPages.css';
import { useNavigate } from 'react-router-dom';

export default function WebAuth() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      // Si el usuario es administrador, podemos redirigirlo al dashboard
      // Si es un cliente normal, al home web
      navigate('/dashboard'); 
    } else {
      navigate('/web');
    }
  };

  return (
    <div className="web-page-center">
      <div className="auth-card">
        <div className="auth-tabs">
          <button 
            className={`auth-tab ${isLogin ? 'active' : ''}`} 
            onClick={() => setIsLogin(true)}
          >
            Iniciar Sesión
          </button>
          <button 
            className={`auth-tab ${!isLogin ? 'active' : ''}`} 
            onClick={() => setIsLogin(false)}
          >
            Registrarse
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-row">
              <div className="form-group">
                <label>Nombre</label>
                <input type="text" placeholder="Tu nombre" required />
              </div>
              <div className="form-group">
                <label>Apellido</label>
                <input type="text" placeholder="Tu apellido" required />
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label>Correo</label>
            <input type="email" placeholder="correo@ejemplo.com" required />
          </div>
          
          <div className="form-group">
            <label>Contraseña</label>
            <input type="password" placeholder="••••••••" required />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label>Confirmar contraseña</label>
              <input type="password" placeholder="••••••••" required />
            </div>
          )}

          <button type="submit" className="btn-auth">
            {isLogin ? 'Iniciar Sesión' : 'Registrarse'}
          </button>
        </form>
      </div>
    </div>
  );
}
