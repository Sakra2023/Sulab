import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import io from 'socket.io-client';
import styles from '../../assets/css/usuario/resumen.module.css';
import { 
  FaCoins, FaStore, FaCalendarAlt, FaChartLine, FaClock, FaCrown, 
  FaSyncAlt, FaExclamationTriangle, FaUserEdit, FaTimes, FaCheck,
  FaEye, FaEyeSlash, FaInfoCircle, FaUser, FaGoogle, FaCamera
} from 'react-icons/fa';

let socket = null;

export default function ResumenPuntos() {
  const { user, loading: authLoading, fetchWithAuth, token } = useAuth();

  const [datosUsuario, setDatosUsuario] = useState(null);
  const [datosPuntos, setDatosPuntos] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [valorPunto, setValorPunto] = useState(0.005);
  const [usuarioTieneContraseña, setUsuarioTieneContraseña] = useState(true);
  const socketRef = useRef(null);

  // Estados para el modal de canje
  const [mostrarCanje, setMostrarCanje] = useState(false);
  const [puntosACanjear, setPuntosACanjear] = useState(0);
  const [tipoCanje, setTipoCanje] = useState('efectivo');
  
  // Estados para premios
  const [premiosDisponibles, setPremiosDisponibles] = useState([]);
  const [premioSeleccionado, setPremioSeleccionado] = useState(null);
  const [cargandoPremios, setCargandoPremios] = useState(false);

  // Estados para edición de perfil (MODAL)
  const [mostrarModalPerfil, setMostrarModalPerfil] = useState(false);
  const [mostrarContraseñaAnterior, setMostrarContraseñaAnterior] = useState(false);
  const [mostrarContraseñaNueva, setMostrarContraseñaNueva] = useState(false);
  const [mostrarConfirmarContraseña, setMostrarConfirmarContraseña] = useState(false);
  
  // Estados para la foto de perfil
  const [fotoPerfil, setFotoPerfil] = useState(null);
  const [previewFoto, setPreviewFoto] = useState('');

  // Datos del formulario de perfil
  const [formPerfil, setFormPerfil] = useState({
    nombre: '',
    email: '',
    celular: '',
    direccion: '',
    contraseña_anterior: '',
    contraseña_nueva: '',
    confirmar_contraseña: ''
  });

  // Función helper para obtener URL completa de imagen
  const getImagenUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${import.meta.env.VITE_API_URL}${url}`;
  };

  // Cargar datos del usuario al iniciar
  useEffect(() => {
    if (user) {
      setFormPerfil(prev => ({
        ...prev,
        nombre: user.nombre || user.usuario?.split(' ')[0] || '',
        email: user.email || '',
        celular: user.celular || user.telefono || '',
        direccion: user.direccion || ''
      }));
      setUsuarioTieneContraseña(!user.google_id);
    }
  }, [user]);

  // ✅ Inicializar Socket.io con actualización en tiempo real
  useEffect(() => {
    // Limpiar socket anterior si existe
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!user?.id || !token) {
      console.log('⏳ Esperando usuario o token para conectar socket...');
      return;
    }

    console.log('🔌 Conectando socket con token:', token.substring(0, 20) + '...');
    
    socketRef.current = io(import.meta.env.VITE_API_URL, {
      transports: ['websocket'],
      auth: { token: token },
      query: { userId: user.id }
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Socket conectado correctamente');
      socketRef.current.emit('join_room', `user_${user.id}`);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Error de conexión socket:', error.message);
      if (error.message.includes('token') || error.message.includes('autenticación')) {
        console.error('Token inválido en socket');
      }
    });

    socketRef.current.on('valor_punto_actualizado', (data) => {
      console.log('📢 Valor de punto actualizado:', data);
      setValorPunto(data.valor_punto || data.nuevo_valor || 0.005);
      
      if (data.valor_punto) {
        const nuevoValorUSD = (data.valor_punto * 100).toFixed(2);
        const mensaje = `El valor del punto ha cambiado a ${nuevoValorUSD} puntos por 1 USD`;
        
        const toast = document.createElement('div');
        toast.className = styles.toastNotificacion;
        toast.innerHTML = `💰 ${mensaje}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      }
    });

    // ✅ CORRECCIÓN: Actualización en tiempo real de puntos después de canje
    socketRef.current.on('puntos_actualizados', (data) => {
      console.log('📢 Puntos actualizados:', data);
      if (data.user_id === user.id) {
        // ✅ Forzar actualización del estado correctamente
        setDatosPuntos(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            puntos_totales: data.puntos_totales,
            puntos_nivel_actual: data.puntos_totales,
            puntos_restantes: data.puntos_totales
          };
        });
        
        // ✅ También actualizar puntosTotales usado en el modal
        setPuntosACanjear(prev => prev);
      }
    });

    // ✅ Escuchar nuevas notificaciones del sistema
    socketRef.current.on('nueva_notificacion', (data) => {
      console.log('📢 Nueva notificación:', data);
      if (data.user_id === user.id) {
        const toast = document.createElement('div');
        toast.className = styles.toastNotificacion;
        toast.innerHTML = `📬 ${data.titulo}: ${data.mensaje}`;
        
        if (data.tipo === 'canje') {
          toast.style.backgroundColor = '#10b981';
        } else if (data.importante) {
          toast.style.backgroundColor = '#f59e0b';
        }
        
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      }
    });

    socketRef.current.on('nueva_transaccion', (data) => {
      console.log('📢 Nueva transacción:', data);
      if (data.user_id === user.id) {
        console.log('Nueva transacción recibida para el usuario');
      }
    });

    // ✅ CORRECCIÓN: Escuchar actualizaciones de premios - SIEMPRE recargar
    socketRef.current.on('premios_actualizados', (data) => {
      console.log('📢 Premios actualizados:', data);
      cargarPremios(); // ✅ Siempre recargar, sin importar si el modal está abierto
    });

    socketRef.current.on('premio_creado', (data) => {
      console.log('📢 Nuevo premio disponible:', data);
      cargarPremios(); // ✅ Siempre recargar
      
      // Notificación visual si el modal NO está abierto
      if (!mostrarCanje) {
        const toast = document.createElement('div');
        toast.className = styles.toastNotificacion;
        toast.innerHTML = `🎁 Nuevo premio disponible: ${data.premio?.nombre || 'Premio'}`;
        toast.style.backgroundColor = '#3b82f6';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      }
    });

    socketRef.current.on('premio_actualizado', (data) => {
      console.log('📢 Premio actualizado:', data);
      cargarPremios(); // ✅ Siempre recargar
      
      // Notificación visual si el modal NO está abierto
      if (!mostrarCanje) {
        const toast = document.createElement('div');
        toast.className = styles.toastNotificacion;
        toast.innerHTML = `🎁 Los premios han sido actualizados`;
        toast.style.backgroundColor = '#8b5cf6';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      }
    });

    socketRef.current.on('premio_eliminado', (data) => {
      console.log('📢 Premio eliminado:', data);
      cargarPremios(); // ✅ Siempre recargar
    });

    return () => {
      if (socketRef.current) {
        console.log('🔌 Desconectando socket');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.id, token]); // ✅ Eliminado mostrarCanje y tipoCanje de dependencias

  // Cargar premios cuando se abre el modal y se selecciona la opción "regalo"
  useEffect(() => {
    if (mostrarCanje && tipoCanje === 'regalo') {
      cargarPremios();
    }
  }, [mostrarCanje, tipoCanje]);

  // Limpiar preview de foto al cerrar modal
  useEffect(() => {
    if (!mostrarModalPerfil) {
      if (previewFoto) {
        URL.revokeObjectURL(previewFoto);
        setPreviewFoto('');
      }
      setFotoPerfil(null);
    }
  }, [mostrarModalPerfil]);

  // Cargar configuración de puntos al iniciar (ruta pública - sin autenticación)
  useEffect(() => {
    const cargarConfigPuntos = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/config-puntos`);
        const data = await response.json();
        if (data.success && data.config) {
          setValorPunto(parseFloat(data.config.valor_punto) || 0.005);
        }
      } catch (error) {
        console.error('Error cargando configuración:', error);
      }
    };
    cargarConfigPuntos();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !user.id) {
      setError('No se encontró información del usuario');
      setCargando(false);
      return;
    }

    const userId = user.id;

    const cargarDatosUsuario = async () => {
      setCargando(true);
      setError(null);

      try {
        console.log('🔍 Cargando datos para usuario ID:', userId);

        const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/usuario/${userId}/info`);

        if (response.status === 403) {
          console.error('❌ Error 403: Token inválido o expirado');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('📡 Respuesta API:', data);

        if (!data.success) {
          throw new Error(data.message || 'Error al cargar datos');
        }

        setDatosUsuario(data.data.usuario);
        setDatosPuntos(data.data.puntos);
        setUsuarioTieneContraseña(!data.data.usuario?.google_id);

        const ahora = new Date();
        const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        
        const puntosDelMes = (data.data.transacciones.recientes || [])
          .filter(t => new Date(t.fecha) >= primerDiaMes && t.puntos > 0)
          .reduce((sum, t) => sum + t.puntos, 0);

        setEstadisticas({
          puntosEsteMes: puntosDelMes,
          variacionMes: calcularVariacion(data.data.transacciones.recientes || []),
          tiendasVisitadas: data.data.transacciones.estadisticas?.total_compras || 0,
          antiguedadMeses: calcularAntiguedad(data.data.puntos?.fecha_registro || data.data.usuario.created_at),
          valorPromedio: valorPunto * 100,
          transaccionesMes: (data.data.transacciones.recientes || []).length,
          puntosGanados: data.data.transacciones.estadisticas?.puntos_totales_ganados || 0,
          puntosUsados: data.data.transacciones.estadisticas?.puntos_totales_usados || 0
        });

      } catch (err) {
        console.error('❌ Error cargando datos:', err);
        setError(err.message);

        setDatosUsuario({
          nombre: user.nombre || "Usuario",
          nivel: "Bronce"
        });
        setDatosPuntos({
          puntos_totales: 0,
          nivel: "Bronce",
          puntos_nivel_actual: 0,
          puntos_siguiente_nivel: 5000
        });
        setEstadisticas({
          puntosEsteMes: 0,
          variacionMes: 0,
          tiendasVisitadas: 0,
          antiguedadMeses: 0,
          valorPromedio: valorPunto * 100,
          transaccionesMes: 0,
          puntosGanados: 0,
          puntosUsados: 0
        });

      } finally {
        setCargando(false);
      }
    };

    cargarDatosUsuario();
  }, [user, authLoading, valorPunto, fetchWithAuth]);

  const cargarPremios = async () => {
    setCargandoPremios(true);
    try {
      const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/prem/premios/disponibles`);
      
      if (response.status === 403) {
        console.error('❌ Error 403 al cargar premios');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        setPremiosDisponibles(data.premios);
      } else {
        console.error('Error cargando premios:', data.message);
      }
    } catch (error) {
      console.error('Error cargando premios:', error);
    } finally {
      setCargandoPremios(false);
    }
  };

  const calcularVariacion = (transacciones) => {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const mesAnterior = mesActual === 0 ? 11 : mesActual - 1;
    const añoAnterior = mesActual === 0 ? ahora.getFullYear() - 1 : ahora.getFullYear();
    
    const primerDiaMesActual = new Date(ahora.getFullYear(), mesActual, 1);
    const primerDiaMesAnterior = new Date(añoAnterior, mesAnterior, 1);
    const ultimoDiaMesAnterior = new Date(añoAnterior, mesAnterior + 1, 0);
    
    const puntosMesActual = transacciones
      .filter(t => new Date(t.fecha) >= primerDiaMesActual && t.puntos > 0)
      .reduce((sum, t) => sum + t.puntos, 0);
      
    const puntosMesAnterior = transacciones
      .filter(t => new Date(t.fecha) >= primerDiaMesAnterior && new Date(t.fecha) <= ultimoDiaMesAnterior && t.puntos > 0)
      .reduce((sum, t) => sum + t.puntos, 0);
    
    if (puntosMesAnterior === 0) return 0;
    return Math.round(((puntosMesActual - puntosMesAnterior) / puntosMesAnterior) * 100);
  };

  const calcularAntiguedad = (fechaRegistro) => {
    if (!fechaRegistro) return 0;
    const registro = new Date(fechaRegistro);
    const ahora = new Date();
    const diferenciaMs = ahora - registro;
    const meses = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24 * 30));
    return Math.max(meses, 1);
  };

  const calcularProgresoNivel = () => {
    if (!datosPuntos) return 0;
    const { puntos_nivel_actual, puntos_siguiente_nivel } = datosPuntos;

    if (puntos_siguiente_nivel === 0) return 100;

    const nivelBase = puntos_siguiente_nivel - 5000;
    const puntosEnNivelActual = puntos_nivel_actual - nivelBase;
    const progreso = (puntosEnNivelActual / 5000) * 100;

    return Math.min(Math.max(progreso, 0), 100);
  };

  const getNivelColor = (nivel) => {
    if (!nivel) return '#6b7280';

    switch (nivel) {
      case 'Diamante': return '#a78bfa';
      case 'Oro': return '#fbbf24';
      case 'Plata': return '#d1d5db';
      case 'Bronce': return '#f97316';
      default: return '#6b7280';
    }
  };

  const getTarjetaGradient = () => {
    return 'linear-gradient(135deg, #102134 0%, #1a365d 50%, #2d4a7c 100%)';
  };

  const getSiguienteNivel = (nivelActual) => {
    if (!nivelActual) return 'Plata';

    switch (nivelActual) {
      case 'Bronce': return 'Plata';
      case 'Plata': return 'Oro';
      case 'Oro': return 'Diamante';
      case 'Diamante': return 'Máximo';
      default: return 'Plata';
    }
  };

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'No disponible';

    try {
      const fecha = new Date(fechaStr);
      if (isNaN(fecha.getTime())) return 'Fecha inválida';

      return fecha.toLocaleDateString('es-EC', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (err) {
      return 'Fecha inválida';
    }
  };

  const recargarDatos = async () => {
    if (!user || !user.id) return;

    setCargando(true);
    setError(null);

    try {
      const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/usuario/${user.id}/info`);
      
      if (response.status === 403) {
        console.error('❌ Error 403 al recargar datos');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      
      const data = await response.json();

      if (data.success) {
        setDatosUsuario(data.data.usuario);
        setDatosPuntos(data.data.puntos);
        
        setFormPerfil(prev => ({
          ...prev,
          nombre: data.data.usuario?.usuario || prev.nombre,
          email: data.data.usuario?.email || prev.email,
          celular: data.data.usuario?.telefono || '',
          direccion: data.data.usuario?.direccion || ''
        }));
        
        setUsuarioTieneContraseña(!data.data.usuario?.google_id);
        
        // ✅ También recargar premios si el modal está abierto
        if (mostrarCanje && tipoCanje === 'regalo') {
          cargarPremios();
        }
      }
    } catch (err) {
      setError('Error al recargar datos');
    } finally {
      setCargando(false);
    }
  };

  const calcularValorEfectivo = (puntos) => {
    return (puntos * valorPunto).toFixed(2);
  };

  const calcularPuntosPorUSD = () => {
    if (valorPunto === 0) return 0;
    return (1 / valorPunto).toFixed(0);
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen no puede superar los 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert('Solo se permiten imágenes');
        return;
      }
      setFotoPerfil(file);
      if (previewFoto) {
        URL.revokeObjectURL(previewFoto);
      }
      setPreviewFoto(URL.createObjectURL(file));
    }
  };

  const actualizarPerfil = async () => {
    if (!formPerfil.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formPerfil.email)) {
      alert('Ingresa un email válido');
      return;
    }
    
    if (formPerfil.celular && !/^09[0-9]{8}$/.test(formPerfil.celular)) {
      alert('Ingresa un número de celular válido con formato 099XXXXXXXX');
      return;
    }
    
    if (!formPerfil.nombre || formPerfil.nombre.trim().length < 3) {
      alert('Ingresa un nombre válido (mínimo 3 caracteres)');
      return;
    }
    
    if (!usuarioTieneContraseña) {
      if (formPerfil.contraseña_nueva || formPerfil.confirmar_contraseña || formPerfil.contraseña_anterior) {
        alert('Los usuarios registrados con Google no pueden cambiar la contraseña aquí. Usa Google para gestionar tu cuenta.');
        setFormPerfil(prev => ({
          ...prev,
          contraseña_anterior: '',
          contraseña_nueva: '',
          confirmar_contraseña: ''
        }));
        return;
      }
      
      try {
        const formData = new FormData();
        formData.append('nombre', formPerfil.nombre);
        formData.append('email', formPerfil.email);
        if (formPerfil.celular) formData.append('celular', formPerfil.celular);
        if (formPerfil.direccion) formData.append('direccion', formPerfil.direccion);
        if (fotoPerfil) formData.append('foto', fotoPerfil);
        
        const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/usuario/${user.id}/perfil`, {
          method: 'PUT',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert('✅ Perfil actualizado correctamente');
          setMostrarModalPerfil(false);
          recargarDatos();
        } else {
          alert(data.message || 'Error al actualizar el perfil');
        }
      } catch (err) {
        console.error('Error actualizando perfil:', err);
        alert('Error de conexión al actualizar el perfil');
      }
      return;
    }
    
    if (formPerfil.contraseña_nueva || formPerfil.confirmar_contraseña) {
      if (!formPerfil.contraseña_nueva || formPerfil.contraseña_nueva.length < 6) {
        alert('La nueva contraseña debe tener al menos 6 caracteres');
        return;
      }
      
      if (formPerfil.contraseña_nueva !== formPerfil.confirmar_contraseña) {
        alert('Las contraseñas no coinciden');
        return;
      }
      
      if (!formPerfil.contraseña_anterior) {
        alert('Debes ingresar tu contraseña actual para cambiarla');
        return;
      }
    }
    
    try {
      const formData = new FormData();
      formData.append('nombre', formPerfil.nombre);
      formData.append('email', formPerfil.email);
      if (formPerfil.celular) formData.append('celular', formPerfil.celular);
      if (formPerfil.direccion) formData.append('direccion', formPerfil.direccion);
      if (fotoPerfil) formData.append('foto', fotoPerfil);
      
      if (formPerfil.contraseña_nueva) {
        formData.append('contraseña_anterior', formPerfil.contraseña_anterior);
        formData.append('contraseña_nueva', formPerfil.contraseña_nueva);
      }
      
      const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/usuario/${user.id}/perfil`, {
        method: 'PUT',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ Perfil actualizado correctamente');
        setMostrarModalPerfil(false);
        setFormPerfil(prev => ({
          ...prev,
          contraseña_anterior: '',
          contraseña_nueva: '',
          confirmar_contraseña: ''
        }));
        recargarDatos();
      } else {
        alert(data.message || 'Error al actualizar el perfil');
      }
    } catch (err) {
      console.error('Error actualizando perfil:', err);
      alert('Error de conexión al actualizar el perfil');
    }
  };

  // ✅ CORRECCIÓN: handleCanjear usando fetch directo (evita doble stringify)
  const handleCanjear = async () => {
    if (tipoCanje === 'regalo') {
      if (!premioSeleccionado) {
        alert('Por favor, selecciona un premio');
        return;
      }
      
      try {
        // ✅ Usar fetch directo con el token
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/prem/usuario/${user.id}/canjear-premio`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ premioId: premioSeleccionado.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert(`✅ ¡Has canjeado ${premioSeleccionado.nombre}! Puntos restantes: ${data.puntos_restantes?.toLocaleString() || 'actualizados'}`);
          setMostrarCanje(false);
          setPremioSeleccionado(null);
          setPuntosACanjear(0);
        } else {
          alert(data.message || 'Error al canjear el premio');
        }
      } catch (error) {
        console.error('Error en canje:', error);
        alert('Error al procesar el canje');
      }
    } else {
      if (puntosACanjear <= 0 || puntosACanjear > puntosTotales) {
        alert('Ingresa una cantidad válida de puntos');
        return;
      }

      if (puntosACanjear < 100) {
        alert('El mínimo para canjear es 100 puntos');
        return;
      }

      const efectivo = calcularValorEfectivo(puntosACanjear);
      
      try {
        // ✅ Usar fetch directo con el token (evita doble stringify)
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/prem/usuario/${user.id}/solicitar-canje`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ puntos: puntosACanjear })
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert(`✅ Solicitud de canje enviada. ${puntosACanjear} puntos por $${efectivo} USD. Espera la aprobación del administrador.`);
          setMostrarCanje(false);
          setPuntosACanjear(0);
        } else {
          alert(data.message || 'Error al enviar solicitud de canje');
        }
      } catch (error) {
        console.error('Error en solicitud de canje:', error);
        alert('Error al procesar la solicitud');
      }
    }
  };

  if (authLoading) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Verificando autenticación...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.errorContainer}>
        <FaExclamationTriangle className={styles.errorIcono} />
        <h3>No autenticado</h3>
        <p>Debes iniciar sesión para ver esta página</p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando tu resumen de puntos...</p>
      </div>
    );
  }

  if (error && !datosUsuario) {
    return (
      <div className={styles.errorContainer}>
        <FaExclamationTriangle className={styles.errorIcono} />
        <h3>Error al cargar datos</h3>
        <p>{error}</p>
        <button onClick={recargarDatos} className={styles.reintentarBtn}>
          <FaSyncAlt /> Reintentar
        </button>
      </div>
    );
  }

  const nombreUsuario = datosUsuario?.usuario?.split(' ')[0] || user.usuario?.split(' ')[0] || 'Usuario';
  const nivelActual = datosPuntos?.nivel || 'Bronce';
  const puntosTotales = datosPuntos?.puntos_totales || 0;
  const puntosNivelActual = datosPuntos?.puntos_nivel_actual || 0;
  const puntosSiguienteNivel = datosPuntos?.puntos_siguiente_nivel || 5000;
  const progreso = calcularProgresoNivel();
  const siguienteNivel = getSiguienteNivel(nivelActual);
  const ultimoAcceso = datosPuntos?.ultimo_acceso || new Date().toISOString();
  const puntosPorUSD = calcularPuntosPorUSD();

  return (
    <div className={styles.resumenContainer}>
      <div className={styles.encabezado}>
        <div className={styles.infoUsuario}>
          <div className={styles.tituloConRecarga}>
            <div className={styles.avatarUsuario}>
              {previewFoto ? (
                <img src={previewFoto} alt="Avatar preview" />
              ) : datosUsuario?.foto_url ? (
                <img src={getImagenUrl(datosUsuario.foto_url)} alt="Avatar" />
              ) : (
                <div className={styles.avatarInicial}>
                  {nombreUsuario.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h1>¡Hola, {nombreUsuario}!</h1>
              <p className={styles.subtitulo}>Resumen actualizado de tus LabPoints</p>
            </div>
            <button
              onClick={recargarDatos}
              className={styles.recargarBtn}
              title="Actualizar datos"
            >
              <FaSyncAlt />
            </button>
          </div>
        </div>
        <div className={styles.fechaInfo}>
          <FaCalendarAlt className={styles.fechaIcono} />
          <span>Última actualización: {formatearFecha(ultimoAcceso)}</span>
        </div>
      </div>

      <div className={styles.editarPerfilContainer}>
        <button 
          onClick={() => setMostrarModalPerfil(true)}
          className={styles.editarPerfilBtn}
        >
          <FaUserEdit /> Editar Perfil
        </button>
      </div>

      {/* MODAL de edición de perfil */}
      {mostrarModalPerfil && (
        <div className={styles.modalOverlay} onClick={() => setMostrarModalPerfil(false)}>
          <div className={styles.modalPerfilContenido} onClick={e => e.stopPropagation()}>
            <div className={styles.modalPerfilHeader}>
              <h3>
                <FaUser className={styles.seccionIcono} />
                Editar Perfil
              </h3>
              <button 
                onClick={() => setMostrarModalPerfil(false)}
                className={styles.modalCerrarBtn}
                title="Cerrar"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className={styles.modalPerfilBody}>
              {/* Foto de perfil */}
              <div className={styles.formGrupo}>
                <label>Foto de perfil</label>
                <div className={styles.fotoContainer}>
                  <div className={styles.fotoPreviewWrapper}>
                    {previewFoto || datosUsuario?.foto_url ? (
                      <img 
                        src={previewFoto || getImagenUrl(datosUsuario?.foto_url)} 
                        className={styles.fotoPreview}
                        alt="Foto perfil"
                      />
                    ) : (
                      <div className={styles.fotoPlaceholder}>
                        {nombreUsuario.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <label className={styles.fotoUploadLabel}>
                      <FaCamera />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFotoChange}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  <small className={styles.helpText}>Formatos: JPG, PNG (máx. 5MB)</small>
                </div>
              </div>

              <div className={styles.formGrupo}>
                <label>Nombre completo *</label>
                <input
                  type="text"
                  value={formPerfil.nombre}
                  onChange={(e) => setFormPerfil({...formPerfil, nombre: e.target.value})}
                  className={styles.formInput}
                  placeholder="Tu nombre completo"
                  required
                />
              </div>
              
              <div className={styles.formGrupo}>
                <label>Email *</label>
                <input
                  type="email"
                  value={formPerfil.email}
                  onChange={(e) => setFormPerfil({...formPerfil, email: e.target.value})}
                  className={styles.formInput}
                  placeholder="tu@email.com"
                  required
                />
              </div>
              
              <div className={styles.formGrupo}>
                <label>Número de celular</label>
                <input
                  type="tel"
                  value={formPerfil.celular}
                  onChange={(e) => {
                    let valor = e.target.value.replace(/\D/g, '');
                    if (valor.length > 10) valor = valor.slice(0, 10);
                    setFormPerfil({...formPerfil, celular: valor});
                  }}
                  className={styles.formInput}
                  placeholder="0999999999"
                  maxLength="10"
                />
                <small className={styles.helpText}>Ejemplo: 0992852633 (10 dígitos, empieza con 09)</small>
              </div>
              
              <div className={styles.formGrupo}>
                <label>Dirección</label>
                <textarea
                  value={formPerfil.direccion}
                  onChange={(e) => setFormPerfil({...formPerfil, direccion: e.target.value})}
                  className={styles.formTextarea}
                  placeholder="Tu dirección completa"
                  rows="3"
                />
                <small className={styles.helpText}>Dirección de envío o facturación</small>
              </div>
              
              {!usuarioTieneContraseña && (
                <div className={styles.perfilInfo} style={{ backgroundColor: '#fef3c7', color: '#92400e', marginBottom: '1rem' }}>
                  <FaGoogle style={{ marginRight: '0.5rem' }} />
                  <span>Eres usuario de Google. No puedes cambiar tu contraseña aquí. Usa Google para gestionar tu cuenta.</span>
                </div>
              )}
              
              {usuarioTieneContraseña && (
                <>
                  <div className={styles.formDivider}>
                    <span>Cambiar contraseña (opcional)</span>
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Contraseña actual</label>
                    <div className={styles.passwordInput}>
                      <input
                        type={mostrarContraseñaAnterior ? "text" : "password"}
                        value={formPerfil.contraseña_anterior}
                        onChange={(e) => setFormPerfil({...formPerfil, contraseña_anterior: e.target.value})}
                        className={styles.formInput}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarContraseñaAnterior(!mostrarContraseñaAnterior)}
                        className={styles.verPassword}
                        title={mostrarContraseñaAnterior ? "Ocultar" : "Mostrar"}
                      >
                        {mostrarContraseñaAnterior ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Nueva contraseña</label>
                    <div className={styles.passwordInput}>
                      <input
                        type={mostrarContraseñaNueva ? "text" : "password"}
                        value={formPerfil.contraseña_nueva}
                        onChange={(e) => setFormPerfil({...formPerfil, contraseña_nueva: e.target.value})}
                        className={styles.formInput}
                        placeholder="Mínimo 6 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarContraseñaNueva(!mostrarContraseñaNueva)}
                        className={styles.verPassword}
                        title={mostrarContraseñaNueva ? "Ocultar" : "Mostrar"}
                      >
                        {mostrarContraseñaNueva ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Confirmar nueva contraseña</label>
                    <div className={styles.passwordInput}>
                      <input
                        type={mostrarConfirmarContraseña ? "text" : "password"}
                        value={formPerfil.confirmar_contraseña}
                        onChange={(e) => setFormPerfil({...formPerfil, confirmar_contraseña: e.target.value})}
                        className={styles.formInput}
                        placeholder="Confirma tu nueva contraseña"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarConfirmarContraseña(!mostrarConfirmarContraseña)}
                        className={styles.verPassword}
                        title={mostrarConfirmarContraseña ? "Ocultar" : "Mostrar"}
                      >
                        {mostrarConfirmarContraseña ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                </>
              )}
              
              <div className={styles.perfilInfo}>
                <FaInfoCircle />
                <span>{usuarioTieneContraseña ? 'Deja las contraseñas en blanco si no quieres cambiarlas' : 'Puedes editar tu nombre, email, celular y dirección'}</span>
              </div>
            </div>
            
            <div className={styles.modalPerfilFooter}>
              <button 
                onClick={() => setMostrarModalPerfil(false)}
                className={styles.cancelarBtn}
              >
                Cancelar
              </button>
              <button 
                onClick={actualizarPerfil}
                className={styles.guardarBtn}
              >
                <FaCheck /> Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          <FaExclamationTriangle /> {error} - Mostrando datos almacenados
        </div>
      )}

      <div className={styles.estadisticasGrid}>
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#10b98120' }}>
            <FaChartLine style={{ color: '#10b981' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Puntos este mes</h3>
            <p className={styles.estadisticaValor}>
              +{estadisticas?.puntosEsteMes?.toLocaleString() || '0'}
            </p>
            <p className={styles.estadisticaDetalle}>
              {estadisticas?.variacionMes > 0 ? '↑' : '↓'} {Math.abs(estadisticas?.variacionMes || 0)}% vs mes pasado
            </p>
          </div>
        </div>

        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#3b82f620' }}>
            <FaStore style={{ color: '#3b82f6' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Tiendas visitadas</h3>
            <p className={styles.estadisticaValor}>{estadisticas?.tiendasVisitadas || 0}</p>
            <p className={styles.estadisticaDetalle}>
              {Math.floor((estadisticas?.tiendasVisitadas || 0) / 3)} con puntos dobles
            </p>
          </div>
        </div>

        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#8b5cf620' }}>
            <FaClock style={{ color: '#8b5cf6' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Antigüedad</h3>
            <p className={styles.estadisticaValor}>{estadisticas?.antiguedadMeses || 0} meses</p>
            <p className={styles.estadisticaDetalle}>
              Desde {formatearFecha(datosPuntos?.fecha_registro)}
            </p>
          </div>
        </div>

        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#f59e0b20' }}>
            <FaCoins style={{ color: '#f59e0b' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Transacciones</h3>
            <p className={styles.estadisticaValor}>{estadisticas?.transaccionesMes || 0}</p>
            <p className={styles.estadisticaDetalle}>
              {estadisticas?.puntosGanados?.toLocaleString() || 0} pts ganados
            </p>
          </div>
        </div>
      </div>

      <div
        className={styles.tarjetaPrincipal}
        style={{ background: getTarjetaGradient() }}
      >
        <div className={styles.tarjetaPatron}></div>

        <div className={styles.tarjetaHeader}>
          <div className={styles.tituloPrincipal}>
            <FaCoins className={styles.iconoPrincipal} />
            <h2>Puntos Totales Disponibles</h2>
          </div>
          <div
            className={styles.nivelUsuario}
            style={{
              color: getNivelColor(nivelActual),
              background: 'rgba(255, 255, 255, 0.15)',
              border: `1px solid rgba(255, 255, 255, 0.25)`
            }}
          >
            <FaCrown className={styles.iconoNivel} />
            <span>{nivelActual}</span>
          </div>
        </div>

        <div className={styles.puntosDisplay}>
          <div className={styles.puntosValor}>
            <span className={styles.valorNumerico}>{puntosTotales.toLocaleString()}</span>
            <span className={styles.valorTexto}>LabPoints</span>
          </div>

          <div className={styles.puntosEquivalente}>
            <div className={styles.equivalenteContenedor}>
              <span className={styles.equivalenteIcono}>💵</span>
              <div>
                <span className={styles.equivalenteValor}>
                  ${calcularValorEfectivo(puntosTotales)} USD
                </span>
                <span className={styles.equivalenteTexto}>
                  {puntosPorUSD} pts = 1 USD
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.progresoSection}>
          <div className={styles.progresoInfo}>
            <span className={styles.progresoTexto}>
              Progreso hacia {siguienteNivel}
            </span>
            <span className={styles.progresoPorcentaje}>
              {Math.round(progreso)}%
            </span>
          </div>
          <div className={styles.progresoBarraContainer}>
            <div
              className={styles.progresoBarra}
              style={{
                width: `${progreso}%`,
                background: `linear-gradient(90deg, 
                  ${getNivelColor(nivelActual)} 0%, 
                  ${getNivelColor(nivelActual)}90 50%, 
                  ${getNivelColor(nivelActual)}70 100%)`,
                boxShadow: `0 0 15px ${getNivelColor(nivelActual)}50`
              }}
            ></div>
          </div>
          <div className={styles.progresoDetalle}>
            <span>{puntosNivelActual.toLocaleString()} / {puntosSiguienteNivel.toLocaleString()} puntos</span>
            <span>Faltan {(puntosSiguienteNivel - puntosNivelActual).toLocaleString()} pts</span>
          </div>
        </div>
      </div>

      <div className={styles.accionesRapidas}>
        <h3 className={styles.seccionTitulo}>Acciones Rápidas</h3>
        <div className={styles.accionesGrid}>
          <button
            className={styles.accionBoton}
            style={{ backgroundColor: '#10b981' }}
            onClick={() => setMostrarCanje(true)}
          >
            <FaCoins className={styles.accionIcono} />
            <span>Canjear puntos</span>
          </button>
        </div>
      </div>

      {/* Modal de canje */}
      {mostrarCanje && (
        <div className={styles.modalOverlay} onClick={() => setMostrarCanje(false)}>
          <div className={styles.modalContenido} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitulo}>Canjear LabPoints</h3>

            <div className={styles.modalOpciones}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="efectivo"
                  checked={tipoCanje === 'efectivo'}
                  onChange={(e) => {
                    setTipoCanje(e.target.value);
                    setPremioSeleccionado(null);
                  }}
                />
                <span>💵 Efectivo ({puntosPorUSD} puntos = 1 USD)</span>
              </label>

              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  value="regalo"
                  checked={tipoCanje === 'regalo'}
                  onChange={(e) => {
                    setTipoCanje(e.target.value);
                    setPuntosACanjear(0);
                  }}
                />
                <span>🎁 Premio</span>
              </label>
            </div>

            {tipoCanje === 'efectivo' ? (
              <div className={styles.modalInputGroup}>
                <label>Puntos a canjear:</label>
                <input
                  type="number"
                  min="100"
                  max={puntosTotales}
                  step="100"
                  value={puntosACanjear === 0 ? '' : puntosACanjear}
                  onChange={(e) => {
                    const valor = e.target.value === '' ? 0 : Number(e.target.value);
                    setPuntosACanjear(valor);
                  }}
                  className={styles.modalInput}
                  placeholder="Ingresa los puntos"
                  onFocus={(e) => e.target.select()}
                />
                <p className={styles.modalDetalle}>
                  Recibirás: ${calcularValorEfectivo(puntosACanjear)} USD
                </p>
                {puntosACanjear > puntosTotales && (
                  <p className={styles.modalError}>No tienes suficientes puntos</p>
                )}
                {puntosACanjear < 100 && puntosACanjear > 0 && (
                  <p className={styles.modalError}>Mínimo 100 puntos</p>
                )}
              </div>
            ) : (
              <div className={styles.modalPremiosSection}>
                <label>Selecciona tu premio:</label>
                {cargandoPremios ? (
                  <div className={styles.cargandoPremios}>Cargando premios...</div>
                ) : premiosDisponibles.length === 0 ? (
                  <div className={styles.sinPremios}>
                    No hay premios disponibles en este momento
                  </div>
                ) : (
                  <div className={styles.premiosLista}>
                    {premiosDisponibles.map(premio => (
                      <label
                        key={premio.id}
                        className={`${styles.premioItem} ${premioSeleccionado?.id === premio.id ? styles.premioSeleccionado : ''}`}
                      >
                        <input
                          type="radio"
                          name="premio"
                          checked={premioSeleccionado?.id === premio.id}
                          onChange={() => setPremioSeleccionado(premio)}
                          style={{ display: 'none' }}
                        />
                        <div className={styles.premioInfo}>
                          <strong>{premio.nombre}</strong>
                          <p className={styles.premioDescripcion}>{premio.descripcion}</p>
                          <span className={styles.premioPuntos}>
                            <FaCoins /> {premio.puntos.toLocaleString()} puntos
                          </span>
                          <small className={styles.premioStock}>Stock: {premio.stock}</small>
                        </div>
                        {premio.imagen && (
                          <img 
                            src={`${import.meta.env.VITE_API_URL}${premio.imagen}`}
                            alt={premio.nombre} 
                            className={styles.premioImagen}
                            onError={(e) => {
                              console.error('Error cargando imagen:', e.target.src);
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                )}
                {premioSeleccionado && (
                  <p className={styles.modalDetalle}>
                    Canjearás: <strong>{premioSeleccionado.nombre}</strong> por {premioSeleccionado.puntos} puntos
                  </p>
                )}
              </div>
            )}

            <div className={styles.modalBotones}>
              <button
                className={styles.modalCancelar}
                onClick={() => {
                  setMostrarCanje(false);
                  setPremioSeleccionado(null);
                  setPuntosACanjear(0);
                }}
              >
                Cancelar
              </button>
              <button
                className={styles.modalConfirmar}
                onClick={handleCanjear}
                disabled={
                  tipoCanje === 'efectivo' 
                    ? (puntosACanjear < 100 || puntosACanjear > puntosTotales)
                    : (!premioSeleccionado || premiosDisponibles.length === 0)
                }
              >
                Canjear ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}