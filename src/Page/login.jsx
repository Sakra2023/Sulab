import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import styles from '../assets/css/login.module.css';
import { FcGoogle } from 'react-icons/fc';

// ✅ Usar rutas relativas - el proxy de Nginx manejará la redirección
const API_URL = ''; // Vacío para usar rutas relativas

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [contra, setContra] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState('');
  const [mensajeRecuperar, setMensajeRecuperar] = useState('');
  
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  // Auto-limpiar mensaje de error después de 5 segundos
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Auto-limpiar mensaje de recuperación después de 5 segundos
  useEffect(() => {
    if (mensajeRecuperar) {
      const timer = setTimeout(() => {
        setMensajeRecuperar('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [mensajeRecuperar]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      // ✅ Usar ruta relativa /api/login (Nginx proxy)
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, contra })
      });

      const data = await response.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        if (loginUser) {
          loginUser(data.user, data.token);
        }
        
        if (data.user.rol === 'admin') {
          window.location.href = '/admin';
        } else if (data.user.rol === 'colab') {
          window.location.href = '/Colab';
        } else {
          window.location.href = '/usuario';
        }
      } else {
        setError(data.message || 'Error en credenciales');
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  const handleRecuperarSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMensajeRecuperar('');
    setCargando(true);

    try {
      // ✅ Usar ruta relativa /api/forgot-password (Nginx proxy)
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRecuperar })
      });

      const data = await response.json();

      if (data.success) {
        setMensajeRecuperar('Se ha enviado un enlace de recuperación a tu correo electrónico.');
        setEmailRecuperar('');
        setTimeout(() => setModoRecuperar(false), 3000);
      } else {
        setError(data.message || 'Error al enviar el correo');
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setCargando(true);
    
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userData = {
        email: user.email,
        googleId: user.uid,
        photoURL: user.photoURL
      };
      
      // ✅ Usar ruta relativa /api/login-google (Nginx proxy)
      const response = await fetch('/api/login-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      const data = await response.json();
      
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        if (loginUser) {
          loginUser(data.user, data.token);
        }
        
        if (data.user.rol === 'admin') {
          window.location.href = '/admin';
        } else if (data.user.rol === 'colab') {
          window.location.href = '/Colab';
        } else {
          window.location.href = '/usuario';
        }
      } else {
        setError(data.message || 'Error al autenticar con Google');
      }
    } catch (err) {
      console.error('❌ Error en login con Google:', err);
      
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Ventana de Google cerrada. Por favor, intenta de nuevo.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('El navegador bloqueó la ventana emergente. Por favor, permite ventanas emergentes para este sitio.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Dominio no autorizado. Verifica la configuración de Firebase.');
      } else {
        setError('Error al iniciar sesión con Google: ' + (err.message || 'Error desconocido'));
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>
        {modoRecuperar ? 'Recuperar Contraseña' : 'Iniciar Sesión'}
      </h2>
      
      {error && <div className={styles.error}>{error}</div>}
      {mensajeRecuperar && <div className={styles.success}>{mensajeRecuperar}</div>}
      
      {!modoRecuperar ? (
        <>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Nombre o Email:</label>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
                placeholder="Ej: edi o correo@ejemplo.com"
                className={styles.input}
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>Contraseña:</label>
              <input
                type="password"
                value={contra}
                onChange={(e) => setContra(e.target.value)}
                required
                placeholder="••••••••"
                className={styles.input}
              />
              <button 
                type="button" 
                onClick={() => setModoRecuperar(true)} 
                className={styles.forgotLink}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            
            <button 
              type="submit" 
              disabled={cargando}
              className={cargando ? styles.buttonDisabled : styles.button}
            >
              {cargando ? 'Cargando...' : 'Ingresar'}
            </button>
          </form>

          <div className={styles.divider}>
            <span>O continúa con</span>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={cargando}
            className={styles.googleButton}
          >
            <FcGoogle className={styles.googleIcon} />
            Google
          </button>
          
          <div className={styles.linkContainer}>
            <p>¿No tienes cuenta? <Link to="/register" className={styles.link}>Regístrate aquí</Link></p>
            <p><Link to="/" className={styles.link}>← Volver al inicio</Link></p>
          </div>
        </>
      ) : (
        <>
          <form onSubmit={handleRecuperarSubmit}>
            <div className={styles.formGroup}>
              <label>Email:</label>
              <input
                type="email"
                value={emailRecuperar}
                onChange={(e) => setEmailRecuperar(e.target.value)}
                required
                placeholder="tu@email.com"
                className={styles.input}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={cargando}
              className={cargando ? styles.buttonDisabled : styles.button}
            >
              {cargando ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
          </form>
          
          <div className={styles.linkContainer}>
            <button 
              onClick={() => setModoRecuperar(false)} 
              className={styles.linkButton}
            >
              ← Volver al inicio de sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}