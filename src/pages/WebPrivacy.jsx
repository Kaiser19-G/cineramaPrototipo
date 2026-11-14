import './WebPages.css';
import { Link } from 'react-router-dom';
import { POLICY_VERSION } from '../shared/policy';

// BORRADOR sin revision legal. Describe lo que el prototipo hace de verdad.
export default function WebPrivacy() {
  return (
    <main className="legal-page">
      <h2 className="legal-title">Política de datos personales</h2>
      <p className="legal-draft" role="note">
        <strong>Borrador sin revisión legal.</strong> Este texto describe lo que hace este prototipo académico y
        no reemplaza una política revisada por un abogado. Versión: {POLICY_VERSION}.
      </p>

      <h2>1. Qué es este sitio</h2>
      <p>
        Cinerama es un prototipo académico de una cadena de cines. No es un servicio comercial: no se venden
        entradas reales, no se cobra ningún pago y funciona solo en una red local.
      </p>

      <h2>2. Qué datos te pedimos</h2>
      <ul>
        <li>Nombre y apellido.</li>
        <li>DNI (8 dígitos).</li>
        <li>Correo electrónico.</li>
        <li>Celular (9 dígitos).</li>
        <li>Una contraseña.</li>
        <li>La fecha y hora en que aceptaste esta política, y la versión que aceptaste.</li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear tu cuenta e identificarte cuando inicias sesión.</li>
        <li>
          Mantener una sola cuenta por persona: el DNI, el correo y el celular no pueden repetirse. El objetivo es
          evitar que una misma persona acapare entradas en las preventas (en una fase futura habrá un máximo de
          entradas por cuenta y por película).
        </li>
        <li>Confirmar que el celular es tuyo mediante un código de verificación.</li>
      </ul>
      <p>No usamos tus datos para publicidad ni los combinamos con otras fuentes.</p>

      <h2>4. Cómo los guardamos</h2>
      <ul>
        <li>
          <strong>DNI:</strong> no guardamos tu número. Guardamos una huella irreversible (un código calculado con una
          clave secreta del servidor) y los últimos 3 dígitos. Sirve para detectar que el mismo DNI no se use dos
          veces; no podemos ver ni mostrar tu número completo.
        </li>
        <li><strong>Contraseña:</strong> se guarda cifrada con un algoritmo de un solo sentido (scrypt); nadie puede leerla.</li>
        <li>
          <strong>Nombre, correo y celular:</strong> se guardan tal cual en la base de datos local del prototipo.
        </li>
        <li>
          <strong>Verificación del celular simulada:</strong> no se envía ningún SMS. El código aparece en pantalla,
          marcado como simulación.
        </li>
        <li>
          <strong>Sesión:</strong> usamos una única cookie necesaria para mantener tu sesión iniciada (no es accesible
          desde scripts). No usamos cookies de publicidad ni de seguimiento.
        </li>
      </ul>

      <h2>5. Con quién los compartimos</h2>
      <p>Con nadie. El prototipo no envía datos a terceros ni a servicios externos.</p>

      <h2>6. Cuánto tiempo los conservamos</h2>
      <p>
        Un registro que no se verifica se borra automáticamente a los 30 minutos. Las cuentas verificadas se
        conservan mientras exista la base de datos del prototipo; todavía no hay una opción para borrar tu cuenta
        desde el sitio.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        La Ley N.º 29733 (Ley de Protección de Datos Personales del Perú) te reconoce derechos de acceso,
        rectificación, cancelación y oposición sobre tus datos. En este prototipo todavía no existe un canal
        automatizado para ejercerlos; en una versión real aquí se indicaría el contacto del titular del banco de datos.
      </p>

      <h2>8. Tu consentimiento</h2>
      <p>
        Aceptar esta política es voluntario, pero sin aceptarla no podemos crear tu cuenta. Guardamos la fecha y la
        versión del texto que aceptaste.
      </p>

      <p><Link to="/web/registro">Volver al registro</Link></p>
    </main>
  );
}
