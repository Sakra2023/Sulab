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
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
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
      
      console.log("✅ Usuario de Google:", {
        email: user.email,
        displayName: user.displayName,
        uid: user.uid,
        photoURL: user.photoURL
      });
      
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
      
      // ✅ Usar ruta relativa /api/google (Nginx proxy)
      const response = await fetch('/api/google', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
      });

      const data = await response.json();
      console.log("📥 Respuesta del backend:", data);
      
      if (data.success) {
        alert('Registro con Google exitoso. Ahora puedes iniciar sesión.');
        navigate('/login');
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
        setError('Error al registrarse con Google: ' + (err.message || 'Error desconocido'));
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
        
        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
            />
            Acepto los <Link to="/terminos" target="_blank" className={styles.link}>Términos y Condiciones</Link>
          </label>
        </div>
        
        <button 
          type="submit" 
          disabled={cargando}
          className={cargando ? styles.buttonDisabled : styles.button}
        >
          {cargando ? 'Registrando...' : 'Registrarse'}
        </button>
      </form>

      <div className={styles.divider}>
        <span>O regístrate con</span>
      </div>

      <button
        onClick={handleGoogleRegister}
        disabled={cargando}
        className={styles.googleButton}
      >
        <FcGoogle className={styles.googleIcon} />
        Google
      </button>
      
      <div className={styles.linkContainer}>
        <p>¿Ya tienes cuenta? <Link to="/login" className={styles.link}>Inicia sesión aquí</Link></p>
        <p><Link to="/" className={styles.link}>← Volver al inicio</Link></p>
      </div>
    </div>
  );
}