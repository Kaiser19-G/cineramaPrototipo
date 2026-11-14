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
      <p>
        Si presentas un <a href="#reclamo">reclamo por un DNI usado por otra persona</a> (sección 9) te pedimos además
        fotos de tu DNI y una carta firmada; ahí el tratamiento es distinto y se explica aparte.
      </p>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear tu cuenta e identificarte cuando inicias sesión.</li>
        <li>
          Mantener una sola cuenta por persona: el DNI, el correo y el celular no pueden repetirse. El objetivo es
          evitar que una misma persona acapare entradas en las preventas (en una fase futura habrá un máximo de
          entradas por cuenta y por película).
        </li>
        <li>Confirmar que el celular es tuyo mediante un código de verificación.</li>
        <li>
          Suspender una cuenta cuando se aprueba un reclamo de DNI sobre el documento con el que se creó (sección 9).
        </li>
      </ul>
      <p>No usamos tus datos para publicidad ni los combinamos con otras fuentes.</p>

      <h2>4. Cómo los guardamos</h2>
      <ul>
        <li>
          <strong>DNI:</strong> no guardamos tu número. Guardamos una huella irreversible (un código calculado con una
          clave secreta del servidor) y los últimos 3 dígitos. Sirve para detectar que el mismo DNI no se use dos
          veces; no podemos ver ni mostrar tu número completo. <strong>Única excepción:</strong> si presentas un reclamo
          por tu DNI, guardamos el número en claro y las fotos de tu documento solo mientras se revisa (sección 9).
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
        Un registro que no se verifica se borra automáticamente a los 30 minutos. Los plazos de los reclamos de DNI
        están en la sección 9. Las cuentas verificadas se
        conservan mientras exista la base de datos del prototipo; todavía no hay una opción para borrar tu cuenta
        desde el sitio. Una cuenta suspendida por un reclamo aprobado también se conserva (suspendida).
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        La Ley N.º 29733 (Ley de Protección de Datos Personales del Perú) te reconoce derechos de acceso,
        rectificación, cancelación y oposición sobre tus datos. En este prototipo todavía no existe un canal
        automatizado para ejercerlos; en una versión real aquí se indicaría el contacto del titular del banco de datos.
        Para un reclamo en curso, el código te permite consultar su estado.
      </p>

      <h2>8. Tu consentimiento</h2>
      <p>
        Aceptar esta política es voluntario, pero sin aceptarla no podemos crear tu cuenta. Guardamos la fecha y la
        versión del texto que aceptaste.
      </p>

      <h2 id="reclamo">9. Reclamo por un DNI usado por otra persona</h2>
      <p>
        Si alguien creó una cuenta con tu DNI, puedes presentar un reclamo en <Link to="/web/reclamo-dni">el formulario
        de reclamo</Link>. Esto es lo que ocurre con tus datos:
      </p>
      <ul>
        <li>
          <strong>Qué pedimos:</strong> nombre, DNI (en claro), correo, celular, foto del DNI por delante y por detrás,
          una carta firmada (escrita a mano o impresa, con tu firma) y, si quieres, una selfie sosteniendo el DNI.
        </li>
        <li>
          <strong>Para qué:</strong> comprobar que eres el titular del DNI. No los usamos para nada más.
        </li>
        <li>
          <strong>Quién los ve:</strong> solo el administrador central, con sesión iniciada. Ninguna otra persona del
          personal ni otros clientes.
        </li>
        <li>
          <strong>Dónde se guardan:</strong> en el equipo donde corre este prototipo, en una carpeta privada fuera del
          proyecto, nunca en una carpeta pública del sitio. No se envían a terceros. En esta red local la conexión no está
          cifrada (HTTP).
        </li>
        <li>
          <strong>Cuánto tiempo:</strong> al resolver el reclamo (aprobado o rechazado) borramos las fotos, la carta, el
          número de DNI en claro, tu nombre, tu correo y tu celular. Un reclamo que no se termina de enviar se borra a la
          hora; uno que nadie resuelve vence y se borra a los 30 días.
        </li>
        <li>
          <strong>Qué conservamos:</strong> solo el resultado: el estado, las fechas, el motivo, la huella irreversible del
          DNI, sus últimos 3 dígitos y quién lo resolvió. Si se aprueba, también la huella de tu correo, durante 7 días, para
          que solo tú puedas registrar ese DNI en ese plazo.
        </li>
        <li>
          <strong>Código de reclamo:</strong> al enviarlo te damos un código para consultar el estado en la página de{' '}
          <Link to="/web/reclamo-dni/estado">estado del reclamo</Link>. No tenemos correo ni SMS para avisarte, y no podemos
          recuperar el código si lo pierdes. Guardamos solo una huella del código, no el código.
        </li>
        <li>
          <strong>Consecuencia para otra persona:</strong> si el reclamo se aprueba, la cuenta que usaba ese DNI se
          suspende (sus sesiones se cierran y no podrá iniciar sesión) y el DNI queda libre. Una persona revisa cada reclamo,
          pero puede equivocarse; por eso la decisión queda registrada.
        </li>
      </ul>
      <p><strong>Limitaciones que debes conocer:</strong></p>
      <ul>
        <li>
          Las fotos pueden traer metadatos (como la ubicación donde se tomaron). Tu navegador intenta quitarlos antes de
          enviarlas, pero el servidor no los elimina de lo que recibe: no podemos garantizarlo si tu navegador no puede
          procesar la imagen.
        </li>
        <li>
          Borrar un archivo lo quita del disco, pero no garantizamos un borrado seguro del almacenamiento ni de copias de
          seguridad que haga el equipo.
        </li>
        <li>
          Si el borrado de un archivo falla, queda marcado y el servidor lo reintenta cada hora; mientras tanto nadie
          puede verlo.
        </li>
      </ul>

      <p><Link to="/web/registro">Volver al registro</Link></p>
    </main>
  );
}
