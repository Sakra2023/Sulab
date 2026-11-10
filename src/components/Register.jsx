import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import styles from '../assets/css/login.module.css';
import { FcGoogle } from 'react-icons/fc';

// ✅ Usar rutas relativas - el proxy de Nginx manejará la redirección
const API_URL = ''; // Vacío para usar rutas relativas
console.log("API_URL:", API_URL);

export default function Register() {
  const [formData, setFormData] = useState({
    usuario: '',
    correo: '',
    contra: ''
  });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [showModal, setShowModal] = useState(false); // ✅ Estado para el Modal
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // ✅ Función para cerrar el modal y marcar automáticamente el check
  const handleCerrarModal = () => {
    setShowModal(false);
    setAceptaTerminos(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validaciones
    if (!formData.usuario || !formData.correo || !formData.contra) {
      setError('Todos los campos son obligatorios');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(formData.correo)) {
      setError('Formato de correo electrónico inválido');
      return;
    }

    if (formData.contra.length < 3) {
      setError('La contraseña debe tener al menos 3 caracteres');
      return;
    }

    if (!aceptaTerminos) {
      setError('Debes aceptar los Términos y Condiciones');
      return;
    }

    setCargando(true);

    try {
      // ✅ Usar ruta relativa /api/register (Nginx proxy)
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: formData.usuario,
          correo: formData.correo,
          contra: formData.contra,
          aceptaTerminos: true
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Registro exitoso. Ahora puedes iniciar sesión.');
        navigate('/login');
      } else {
        setError(data.message || 'Error en el registro');
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError('');

    if (!aceptaTerminos) {
      setError('Debes aceptar los Términos y Condiciones');
      return;
    }

    setCargando(true);

    try {
      console.log("🚀 Iniciando registro con Google...");

      // Iniciar sesión con Google popup
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Preparar datos para enviar al backend
      const userData = {
        nombreCompleto: user.displayName,
        nombreUsuario: user.displayName ? user.displayName.split(' ')[0] : user.email.split('@')[0],
        email: user.email,
        googleId: user.uid,
        photoURL: user.photoURL,
        aceptaTerminos: true
      };

      console.log("📤 Enviando datos al backend:", userData);

      // ✅ RUTA CORREGIDA: /api/registro/google
      const response = await fetch('/api/registro/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
      });

      const data = await response.json();
      console.log("📥 Respuesta del backend:", data);

      if (data.success && data.token) {
        // ✅ Loguear al usuario directamente en lugar de mandarlo al login
        // NOTA: Asegúrate de tener: const { loginUser } = useAuth(); arriba en tu componente
        if (typeof loginUser === 'function') {
          loginUser(data.user, data.token);
        }

        alert('¡Registro con Google exitoso! Bienvenido.');

        // Redirigir según el rol
        if (data.user.rol === 'admin') {
          window.location.href = '/admin';
        } else if (data.user.rol === 'colab') {
          window.location.href = '/Colab';
        } else {
          window.location.href = '/usuario';
        }
      } else {
        setError(data.message || 'Error al registrarse con Google');
      }
    } catch (err) {
      console.error('❌ Error en registro con Google:', err);

      // Manejar errores específicos de Firebase
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Ventana de Google cerrada. Por favor, intenta de nuevo.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('El navegador bloqueó la ventana emergente. Por favor, permite ventanas emergentes para este sitio.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Dominio no autorizado. Verifica la configuración de Firebase.');
      } else {
        // Este error puede ser si la respuesta no es JSON (ej. error 404 de Nginx)
        setError('Error al registrarse con Google. Revisa la consola para más detalles.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Crear Cuenta</h2>

      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label>Nombres:</label>
          <input
            type="text"
            name="usuario"
            value={formData.usuario}
            onChange={handleChange}
            required
            placeholder="Ej: juan123"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Correo electrónico:</label>
          <input
            type="email"
            name="correo"
            value={formData.correo}
            onChange={handleChange}
            required
            placeholder="ejemplo@correo.com"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>Contraseña:</label>
          <input
            type="password"
            name="contra"
            value={formData.contra}
            onChange={handleChange}
            required
            placeholder="Mínimo 3 caracteres"
            className={styles.input}
          />
        </div>

        {/* ✅ AQUÍ ESTÁ EL TEXTO LEGAL CON EL BOTÓN DEL MODAL */}
        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel} style={{ fontSize: '0.85rem', color: '#555', textAlign: 'justify', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              style={{ marginTop: '4px' }}
            />
            <span>
              He leído y acepto los{' '}
              <button 
                type="button" 
                onClick={() => setShowModal(true)} 
                style={{ background: 'none', border: 'none', color: '#007bff', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit', fontWeight: 'bold' }}
              >
                Términos y Condiciones
              </button>
              {' '}y autorizo el tratamiento de mis datos personales para la gestión de mi cuenta, el sistema de puntos y mi participación en el ranking de Sulabb.
            </span>
          </label>
        </div>

        {/* ✅ BOTÓN DE REGISTRO (Se deshabilita si no hay check) */}
        <button
          type="submit"
          disabled={cargando || !aceptaTerminos}
          className={(cargando || !aceptaTerminos) ? styles.buttonDisabled : styles.button}
        >
          {cargando ? 'Registrando...' : 'Registrarse'}
        </button>
      </form>

      <div className={styles.divider}>
        <span>O regístrate con</span>
      </div>

      {/* ✅ BOTÓN DE GOOGLE (Mantiene estilos, se oscurece y bloquea si no hay check) */}
      <button
        onClick={handleGoogleRegister}
        disabled={cargando || !aceptaTerminos}
        className={styles.googleButton}
        style={(cargando || !aceptaTerminos) ? { opacity: 0.5, cursor: 'not-allowed', filter: 'grayscale(100%)' } : {}}
      >
        <FcGoogle className={styles.googleIcon} />
        Google
      </button>

      <div className={styles.linkContainer}>
        <p>¿Ya tienes cuenta? <Link to="/login" className={styles.link}>Inicia sesión aquí</Link></p>
        <p><Link to="/" className={styles.link}>← Volver al inicio</Link></p>
      </div>

      {/* ✅ COMPONENTE MODAL (Ventana emergente con los términos) */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '10px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto', color: '#333', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0, color: '#222', borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Términos y Condiciones de Sulabb</h2>
            
            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', textAlign: 'justify' }}>
              <p><strong>1. Tratamiento de Datos:</strong> Al registrarse, el usuario otorga su consentimiento libre, previo, expreso e informado para que Sulabb recolecte, almacene y trate sus datos personales (nombre, correo, foto) para la gestión de la cuenta y el sistema de puntos.</p>
              
              <p><strong>2. Ranking Público:</strong> El usuario acepta explícitamente que su nombre de usuario, foto y cantidad de puntos sean visibles de forma pública en la sección "Top LabPoints" de la plataforma.</p>
              
              <p><strong>3. Red de Emprendimientos:</strong> El usuario acepta que, al momento de canjear un premio o acumular puntos, Sulabb pueda compartir los datos estrictamente necesarios (nombre y correo) con el emprendimiento afiliado correspondiente para validar la transacción.</p>

              <p><strong>4. Naturaleza de los Puntos:</strong> Los LabPoints no son dinero real, no tienen valor de cambio en efectivo y son de uso exclusivo dentro de la plataforma Sulabb.</p>
              
              <p><strong>5. Ley Aplicable:</strong> Estos términos se rigen bajo la Ley Orgánica de Protección de Datos Personales de la República del Ecuador.</p>
            </div>

            <div style={{ textAlign: 'right', marginTop: '25px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <button 
                onClick={handleCerrarModal}
                style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
              >
                Aceptar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}