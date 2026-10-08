import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import io from 'socket.io-client';
import styles from '../../assets/css/usuario/noti.module.css';
import { 
  FaBell, 
  FaCheckCircle, 
  FaTrash,
  FaSyncAlt,
  FaExclamationTriangle
} from 'react-icons/fa';

export default function NotificacionesUsuario() {
  const { user, loading: authLoading, fetchWithAuth, token } = useAuth();
  
  // Estados principales
  const [notificaciones, setNotificaciones] = useState([]);
  const [filtradas, setFiltradas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [noLeidas, setNoLeidas] = useState(0);
  const [error, setError] = useState(null);
  
  // Estados para filtros
  const [filtroTipo, setFiltroTipo] = useState('todas');
  
  // Referencia para Socket.io
  const socketRef = useRef(null);

  // Tipos de notificaciones
  const TIPOS_NOTIFICACION = {
    PUNTOS: 'puntos',
    CANJE: 'canje',
    PROMOCION: 'promocion',
    SISTEMA: 'sistema',
    RECORDATORIO: 'recordatorio'
  };

  // ✅ SOCKET.IO - Escuchar nuevas notificaciones en tiempo real (URL relativa)
  useEffect(() => {
    // Limpiar socket anterior
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!user?.id || !token) {
      console.log('⏳ Esperando usuario o token para conectar socket notificaciones...');
      return;
    }

    console.log('🔌 Conectando socket notificaciones...');
    
    socketRef.current = io({
      path: '/socket.io/',
      transports: ['websocket'],
      auth: { token: token },
      query: { userId: user.id }
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Socket notificaciones conectado');
      socketRef.current.emit('join_room', `user_${user.id}`);
    });

    // ✅ Escuchar nuevas notificaciones
    socketRef.current.on('nueva_notificacion', (data) => {
      console.log('📢 Nueva notificación recibida:', data);
      if (data.user_id === user.id || data.user_id === user.id.toString()) {
        // Agregar la nueva notificación al estado
        const nuevaNotificacion = {
          id: data.id || Date.now(),
          tipo: data.tipo || TIPOS_NOTIFICACION.SISTEMA,
          titulo: data.titulo || 'Nueva notificación',
          mensaje: data.mensaje || 'Tienes una nueva notificación',
          fecha: data.fecha || new Date().toISOString(),
          leida: false,
          importante: data.importante || false,
          icono: getIconoPorTipo(data.tipo),
          color: getColorPorTipo(data.tipo)
        };
        
        setNotificaciones(prev => [nuevaNotificacion, ...prev]);
        setNoLeidas(prev => prev + 1);
        
        // Mostrar toast o alerta visual
        mostrarToastNotificacion(nuevaNotificacion);
      }
    });

    // ✅ Escuchar cuando una notificación es marcada como leída desde otro lugar
    socketRef.current.on('notificacion_leida', (data) => {
      console.log('📢 Notificación marcada como leída:', data);
      if (data.user_id === user.id) {
        setNotificaciones(prev => 
          prev.map(n => n.id === data.notificacion_id ? { ...n, leida: true } : n)
        );
        setNoLeidas(prev => Math.max(0, prev - 1));
      }
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Error socket notificaciones:', error.message);
    });

    return () => {
      if (socketRef.current) {
        console.log('🔌 Desconectando socket notificaciones');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.id, token]);

  // Función para mostrar toast de nueva notificación
  const mostrarToastNotificacion = (notificacion) => {
    const toast = document.createElement('div');
    toast.className = styles.toastNotificacion;
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">${notificacion.icono}</span>
        <div>
          <strong>${notificacion.titulo}</strong>
          <p style="margin: 0; font-size: 12px;">${notificacion.mensaje.substring(0, 50)}...</p>
        </div>
      </div>
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: white;
      border-left: 4px solid ${notificacion.color};
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      cursor: pointer;
      animation: slideIn 0.3s ease;
    `;
    
    toast.onclick = () => {
      toast.remove();
      // Puedes abrir el modal o algo similar
    };
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  };

  // ✅ Cargar notificaciones desde la API (URL relativa)
  const cargarNotificaciones = async () => {
    if (!user || !user.id) return;
    
    setCargando(true);
    setError(null);
    
    try {
      console.log('🔍 Cargando notificaciones para usuario ID:', user.id);
      
      const response = await fetchWithAuth(`/api/usuario/${user.id}/notificaciones?limite=50`);
      
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
      
      console.log('📡 Respuesta API notificaciones:', data);
      
      if (!data.success) {
        throw new Error(data.message || 'Error al cargar notificaciones');
      }
      
      const notificacionesProcesadas = data.data.notificaciones.map(notificacion => ({
        id: notificacion.id,
        tipo: notificacion.tipo,
        titulo: notificacion.titulo || getTituloPorTipo(notificacion.tipo),
        mensaje: notificacion.mensaje || getMensajePorTipo(notificacion.tipo),
        fecha: notificacion.fecha,
        leida: Boolean(notificacion.leida),
        importante: Boolean(notificacion.importante),
        icono: notificacion.icono || getIconoPorTipo(notificacion.tipo),
        color: notificacion.color || getColorPorTipo(notificacion.tipo)
      }));
      
      setNotificaciones(notificacionesProcesadas);
      setFiltradas(notificacionesProcesadas);
      setNoLeidas(data.data.estadisticas?.no_leidas || 0);
      
    } catch (err) {
      console.error('❌ Error cargando notificaciones:', err);
      setError(err.message);
      
      const notificacionesEjemplo = obtenerDatosEjemplo();
      setNotificaciones(notificacionesEjemplo);
      setFiltradas(notificacionesEjemplo);
      setNoLeidas(notificacionesEjemplo.filter(n => !n.leida).length);
      
    } finally {
      setCargando(false);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    if (authLoading) return;
    
    if (!user || !user.id) {
      setError('Usuario no identificado');
      setCargando(false);
      return;
    }
    
    cargarNotificaciones();
  }, [user, authLoading, fetchWithAuth]);

  // Funciones auxiliares para procesar datos
  const getTituloPorTipo = (tipo) => {
    const titulos = {
      [TIPOS_NOTIFICACION.PUNTOS]: '🎉 Puntos Acreditados',
      [TIPOS_NOTIFICACION.CANJE]: '✅ Canje Procesado',
      [TIPOS_NOTIFICACION.PROMOCION]: '🔥 Nueva Promoción',
      [TIPOS_NOTIFICACION.SISTEMA]: '🔄 Actualización del Sistema',
      [TIPOS_NOTIFICACION.RECORDATORIO]: '⏰ Recordatorio Importante'
    };
    return titulos[tipo] || '📢 Nueva Notificación';
  };

  const getMensajePorTipo = (tipo) => {
    const mensajes = {
      [TIPOS_NOTIFICACION.PUNTOS]: 'Se han procesado tus puntos correctamente.',
      [TIPOS_NOTIFICACION.CANJE]: 'Tu canje ha sido procesado exitosamente.',
      [TIPOS_NOTIFICACION.PROMOCION]: '¡Tenemos una nueva promoción para ti!',
      [TIPOS_NOTIFICACION.SISTEMA]: 'El sistema ha sido actualizado con nuevas funciones.',
      [TIPOS_NOTIFICACION.RECORDATORIO]: 'No olvides revisar esta información importante.'
    };
    return mensajes[tipo] || 'Tienes una nueva notificación en tu sistema.';
  };

  const getIconoPorTipo = (tipo) => {
    const iconos = {
      [TIPOS_NOTIFICACION.PUNTOS]: '💰',
      [TIPOS_NOTIFICACION.CANJE]: '🎁',
      [TIPOS_NOTIFICACION.PROMOCION]: '🔥',
      [TIPOS_NOTIFICACION.SISTEMA]: '🔄',
      [TIPOS_NOTIFICACION.RECORDATORIO]: '⏰'
    };
    return iconos[tipo] || '🔔';
  };

  const getColorPorTipo = (tipo) => {
    const colores = {
      [TIPOS_NOTIFICACION.PUNTOS]: '#10b981',
      [TIPOS_NOTIFICACION.CANJE]: '#3b82f6',
      [TIPOS_NOTIFICACION.PROMOCION]: '#ef4444',
      [TIPOS_NOTIFICACION.SISTEMA]: '#8b5cf6',
      [TIPOS_NOTIFICACION.RECORDATORIO]: '#ec4899'
    };
    return colores[tipo] || '#6b7280';
  };

  // Función para obtener datos de ejemplo
  const obtenerDatosEjemplo = () => {
    return [
      {
        id: 1,
        tipo: TIPOS_NOTIFICACION.PUNTOS,
        titulo: '🎉 ¡Puntos Dobles Activados!',
        mensaje: 'Tus compras en supermercados acumularán el doble de puntos este fin de semana',
        fecha: '2024-01-30T14:30:00',
        leida: false,
        importante: true,
        icono: '💰',
        color: '#10b981'
      },
      {
        id: 2,
        tipo: TIPOS_NOTIFICACION.CANJE,
        titulo: '✅ Canje Aprobado',
        mensaje: 'Tu solicitud de canje por "Audífonos Bluetooth" ha sido aprobada.',
        fecha: '2024-01-29T11:15:00',
        leida: true,
        importante: false,
        icono: '🎁',
        color: '#3b82f6'
      },
      {
        id: 3,
        tipo: TIPOS_NOTIFICACION.PROMOCION,
        titulo: '🔥 50% de descuento',
        mensaje: 'Visita nuestras tiendas participantes y obtén 50% de descuento usando tus puntos',
        fecha: '2024-01-28T09:45:00',
        leida: false,
        importante: false,
        icono: '🔥',
        color: '#ef4444'
      }
    ];
  };

  // Filtrar notificaciones
  useEffect(() => {
    let resultado = [...notificaciones];
    
    if (filtroTipo === 'no-leidas') {
      resultado = resultado.filter(n => !n.leida);
    }
    
    resultado.sort((a, b) => {
      if (a.leida !== b.leida) {
        return a.leida ? 1 : -1;
      }
      return new Date(b.fecha) - new Date(a.fecha);
    });
    
    setFiltradas(resultado);
  }, [notificaciones, filtroTipo]);

  // Formatear fecha
  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Reciente';
    
    try {
      const fecha = new Date(fechaStr);
      if (isNaN(fecha.getTime())) return 'Fecha inválida';
      
      const ahora = new Date();
      const diferenciaMs = ahora - fecha;
      const diferenciaMin = Math.floor(diferenciaMs / 60000);
      const diferenciaHoras = Math.floor(diferenciaMs / 3600000);
      const diferenciaDias = Math.floor(diferenciaMs / 86400000);

      if (diferenciaMin < 60) {
        return `Hace ${diferenciaMin} min`;
      } else if (diferenciaHoras < 24) {
        return `Hace ${diferenciaHoras} h`;
      } else if (diferenciaDias < 7) {
        return `Hace ${diferenciaDias} d`;
      } else {
        return fecha.toLocaleDateString('es-EC', {
          day: 'numeric',
          month: 'short'
        });
      }
    } catch (err) {
      return 'Fecha inválida';
    }
  };

  // ✅ Eliminar notificación (URL relativa)
  const eliminarNotificacion = async (id) => {
    if (!window.confirm('¿Eliminar esta notificación?')) return;
    
    try {
      const response = await fetchWithAuth(`/api/usuario/${user.id}/notificaciones/${id}`, {
        method: 'DELETE'
      });
      
      if (response.status === 403) {
        console.error('❌ Error 403: Token inválido');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      
      const actualizadas = notificaciones.filter(n => n.id !== id);
      setNotificaciones(actualizadas);
      
      const nuevasNoLeidas = actualizadas.filter(n => !n.leida).length;
      setNoLeidas(nuevasNoLeidas);
      
    } catch (err) {
      console.error('Error eliminando notificación:', err);
      alert('No se pudo eliminar la notificación. Intenta de nuevo.');
    }
  };

  // ✅ Marcar como leída (URL relativa)
  const marcarComoLeida = async (id) => {
    try {
      const response = await fetchWithAuth(`/api/usuario/${user.id}/notificaciones/${id}/leer`, {
        method: 'PUT'
      });
      
      if (response.status === 403) {
        console.error('❌ Error 403: Token inválido');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        const actualizadas = notificaciones.map(n => 
          n.id === id ? { ...n, leida: true } : n
        );
        
        setNotificaciones(actualizadas);
        
        const nuevasNoLeidas = actualizadas.filter(n => !n.leida).length;
        setNoLeidas(nuevasNoLeidas);
      }
    } catch (err) {
      console.error('Error marcando notificación como leída:', err);
    }
  };

  // Obtener texto según tipo
  const getTipoTexto = (tipo) => {
    const textos = {
      [TIPOS_NOTIFICACION.PUNTOS]: 'Puntos',
      [TIPOS_NOTIFICACION.CANJE]: 'Canjes',
      [TIPOS_NOTIFICACION.PROMOCION]: 'Promociones',
      [TIPOS_NOTIFICACION.SISTEMA]: 'Sistema',
      [TIPOS_NOTIFICACION.RECORDATORIO]: 'Recordatorios'
    };
    return textos[tipo] || 'Notificación';
  };

  // Recargar datos
  const recargarDatos = () => {
    cargarNotificaciones();
  };

  // Mostrar estado de carga del contexto
  if (authLoading) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Verificando autenticación...</p>
      </div>
    );
  }

  // Verificar autenticación
  if (!user) {
    return (
      <div className={styles.errorContainer}>
        <FaExclamationTriangle className={styles.errorIcono} />
        <h3>No autenticado</h3>
        <p>Debes iniciar sesión para ver esta página</p>
      </div>
    );
  }

  // Mostrar estado de carga de datos
  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando notificaciones...</p>
      </div>
    );
  }

  // Mostrar error si existe
  if (error && notificaciones.length === 0) {
    return (
      <div className={styles.errorContainer}>
        <FaExclamationTriangle className={styles.errorIcono} />
        <h3>Error al cargar notificaciones</h3>
        <p>{error}</p>
        <button onClick={recargarDatos} className={styles.reintentarBtn}>
          <FaSyncAlt /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.notificacionesContainer}>
      {/* Encabezado */}
      <div className={styles.encabezado}>
        <div className={styles.tituloSection}>
          <div className={styles.tituloConRecarga}>
            <h1>
              <FaBell className={styles.tituloIcono} />
              Centro de Notificaciones
            </h1>
            <button 
              onClick={recargarDatos} 
              className={styles.recargarBtn}
              title="Actualizar notificaciones"
            >
              <FaSyncAlt />
            </button>
          </div>
          <p className={styles.subtitulo}>
            Mantente al día con tus puntos, canjes y promociones
          </p>
        </div>
        
        <div className={styles.accionesHeader}>
          <div className={styles.contadorBadge}>
            <span className={styles.contadorNumero}>{noLeidas}</span>
            <span className={styles.contadorTexto}>no leídas</span>
          </div>
        </div>
      </div>

      {/* Mensaje de error (si existe pero tenemos datos) */}
      {error && (
        <div className={styles.errorBanner}>
          <FaExclamationTriangle /> {error} - Mostrando datos almacenados
        </div>
      )}

      {/* Filtros */}
      <div className={styles.filtrosSection}>
        <div className={styles.filtrosGrid}>
          <button 
            onClick={() => setFiltroTipo('todas')}
            className={`${styles.filtroBtn} ${filtroTipo === 'todas' ? styles.active : ''}`}
          >
            <FaBell /> Todas ({notificaciones.length})
          </button>
          
          <button 
            onClick={() => setFiltroTipo('no-leidas')}
            className={`${styles.filtroBtn} ${filtroTipo === 'no-leidas' ? styles.active : ''}`}
          >
            <FaBell /> No leídas ({noLeidas})
          </button>
        </div>
      </div>

      {/* Lista de notificaciones */}
      <div className={styles.notificacionesLista}>
        {filtradas.length === 0 ? (
          <div className={styles.sinNotificaciones}>
            <FaBell className={styles.sinIcono} />
            <h3>No hay notificaciones</h3>
            <p>
              {filtroTipo === 'no-leidas' 
                ? '¡Genial! Has leído todas tus notificaciones.' 
                : 'No hay notificaciones disponibles.'}
            </p>
            <button 
              onClick={recargarDatos}
              className={styles.reintentarBtn}
            >
              <FaSyncAlt /> Recargar
            </button>
          </div>
        ) : (
          filtradas.map(notificacion => (
            <div 
              key={notificacion.id}
              className={`${styles.notificacionCard} ${!notificacion.leida ? styles.noLeida : ''} ${notificacion.importante ? styles.importante : ''}`}
              onClick={() => !notificacion.leida && marcarComoLeida(notificacion.id)}
              style={{ cursor: !notificacion.leida ? 'pointer' : 'default' }}
            >
              <div className={styles.notificacionIcono} style={{ backgroundColor: notificacion.color + '20' }}>
                <span className={styles.iconoEmoji}>{notificacion.icono}</span>
              </div>
              
              <div className={styles.notificacionContenido}>
                <div className={styles.notificacionHeader}>
                  <div>
                    <h4 className={styles.notificacionTitulo}>{notificacion.titulo}</h4>
                    <p className={styles.notificacionMensaje}>{notificacion.mensaje}</p>
                  </div>
                  
                  <div className={styles.notificacionMeta}>
                    <span className={styles.notificacionFecha}>
                      {formatearFecha(notificacion.fecha)}
                    </span>
                    <span className={styles.notificacionTipo}>
                      {getTipoTexto(notificacion.tipo)}
                    </span>
                  </div>
                </div>
                
                <div className={styles.accionesExtra}>
                  {!notificacion.leida && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        marcarComoLeida(notificacion.id);
                      }}
                      className={styles.leerBtn}
                      title="Marcar como leída"
                    >
                      <FaCheckCircle />
                    </button>
                  )}
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      eliminarNotificacion(notificacion.id);
                    }}
                    className={styles.eliminarBtn}
                    title="Eliminar notificación"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
              
              {!notificacion.leida && (
                <div className={styles.indicadorNoLeida}></div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}