// ResetPassword.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import styles from '../assets/css/recuperarContra.module.css';

const API_URL = import.meta.env.VITE_API_URL 

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 2000);
      return () => clearTimeout(timer);
    }
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('❌ Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('❌ La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setCargando(true);

    try {
      const response = await fetch(`${API_URL}/api/reset-password/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('✅ Contraseña actualizada correctamente');
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setError(data.message || '❌ Error al actualizar la contraseña');
      }
    } catch (err) {
      setError('❌ Error de conexión con el servidor');
      console.error(err);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Restablecer Contraseña</h2>
      
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label>Nueva Contraseña:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Mínimo 6 caracteres"
            className={styles.input}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label>Confirmar Contraseña:</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Repite tu nueva contraseña"
            className={styles.input}
          />
        </div>
        
        <button 
          type="submit" 
          disabled={cargando}
          className={cargando ? styles.buttonDisabled : styles.button}
        >
          {cargando ? 'Actualizando...' : 'Actualizar Contraseña'}
        </button>
      </form>
      
      <div className={styles.linkContainer}>
        <Link to="/login" className={styles.link}>
          ← Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}