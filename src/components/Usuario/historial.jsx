import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import io from 'socket.io-client';
import styles from '../../assets/css/usuario/histo.module.css';
import { 
  FaHistory, 
  FaFilter, 
  FaDownload, 
  FaTimes, 
  FaSearch,
  FaCalendarAlt,
  FaStore,
  FaSortUp,
  FaSortDown,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaEye,
  FaArrowUp,
  FaArrowDown,
  FaExchangeAlt,
  FaGift,
  FaCoins,
  FaShoppingCart,
  FaTag,
  FaSyncAlt,
  FaExclamationTriangle
} from 'react-icons/fa';

export default function HistorialTransacciones() {
  // Obtener usuario, token y fetchWithAuth del contexto de autenticación
  const { user, loading: authLoading, fetchWithAuth, token } = useAuth();
  
  // Estados principales
  const [transacciones, setTransacciones] = useState([]);
  const [filtradas, setFiltradas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados para filtros
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtros, setFiltros] = useState({
    tipo: 'todos',
    fechaDesde: '',
    fechaHasta: '',
    tienda: '',
    estado: 'todos',
    puntosMin: '',
    puntosMax: ''
  });
  
  // Estado para ordenamiento
  const [orden, setOrden] = useState({
    campo: 'fecha',
    direccion: 'desc'
  });
  
  // Estado para detalle modal
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [transaccionDetalle, setTransaccionDetalle] = useState(null);
  
  // Referencia para Socket.io
  const socketRef = useRef(null);
  
  // Tipos de transacciones
  const TIPOS_TRANSACCION = {
    COMPRA: 'compra',
    CANJE: 'canje',
    TRANSFERENCIA: 'transferencia',
    PROMOCION: 'promocion',
    EXPIRACION: 'expiracion',
    AJUSTE: 'ajuste'
  };

  // ✅ SOCKET.IO - Escuchar eventos en tiempo real
  useEffect(() => {
    // Limpiar socket anterior
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (!user?.id || !token) {
      console.log('⏳ Esperando usuario o token para conectar socket historial...');
      return;
    }

    console.log('🔌 Conectando socket historial...');
    
    socketRef.current = io(import.meta.env.VITE_API_URL, {
      transports: ['websocket'],
      auth: { token: token },
      query: { userId: user.id }
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Socket historial conectado');
      socketRef.current.emit('join_room', `user_${user.id}`);
    });

    // ✅ Escuchar nuevas transacciones
    socketRef.current.on('nueva_transaccion', (data) => {
      console.log('📢 Nueva transacción recibida en historial:', data);
      if (data.user_id === user.id) {
        // Recargar automáticamente cuando hay nueva transacción
        cargarTransacciones();
      }
    });

    // ✅ Escuchar actualizaciones de puntos
    socketRef.current.on('puntos_actualizados', (data) => {
      console.log('📢 Puntos actualizados, recargando historial:', data);
      if (data.user_id === user.id) {
        cargarTransacciones();
      }
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Error socket historial:', error.message);
    });

    return () => {
      if (socketRef.current) {
        console.log('🔌 Desconectando socket historial');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.id, token]);

  // Función para cargar transacciones desde la API
  const cargarTransacciones = async () => {
    if (!user || !user.id) return;
    
    setCargando(true);
    setError(null);
    
    try {
      console.log('🔍 Cargando transacciones para usuario ID:', user.id);
      
      const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/api/usuario/${user.id}/transacciones?limite=100`);
      
      // Manejar error 403 (token expirado o inválido)
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
      
      console.log('📡 Respuesta API transacciones:', data);
      
      if (!data.success) {
        throw new Error(data.message || 'Error al cargar transacciones');
      }
      
      // Procesar datos de la API para adaptarlos al formato del componente
      const transaccionesProcesadas = data.data.transacciones.map(transaccion => {
        // Adaptar el campo 'detalles' JSON si existe
        let detallesExtra = {};
        if (transaccion.detalles) {
          try {
            detallesExtra = typeof transaccion.detalles === 'string' 
              ? JSON.parse(transaccion.detalles) 
              : transaccion.detalles;
          } catch (err) {
            console.warn('Error parseando detalles:', err);
          }
        }
        
        // Determinar estructura según tipo
        const transaccionBase = {
          id: transaccion.id,
          tipo: transaccion.tipo,
          referencia: transaccion.referencia || `TRANS-${transaccion.id}`,
          tienda: transaccion.tienda || 'Sistema',
          fecha: transaccion.fecha,
          puntos: transaccion.puntos,
          puntosUsados: transaccion.puntos_usados || 0,
          estado: transaccion.estado || 'completado'
        };
        
        // Agregar detalles específicos según tipo
        switch(transaccion.tipo) {
          case TIPOS_TRANSACCION.COMPRA:
            return {
              ...transaccionBase,
              items: detallesExtra.items || [
                { nombre: 'Compra general', cantidad: 1, subtotal: Math.abs(transaccion.puntos) * 2 }
              ]
            };
            
          case TIPOS_TRANSACCION.CANJE:
            return {
              ...transaccionBase,
              producto: detallesExtra.producto || 'Producto canjeado'
            };
            
          case TIPOS_TRANSACCION.TRANSFERENCIA:
            return {
              ...transaccionBase,
              transferencia: detallesExtra.transferencia || {
                destino: detallesExtra.destino || 'Usuario',
                email: detallesExtra.email || 'sin@email.com',
                mensaje: detallesExtra.mensaje || 'Transferencia'
              }
            };
            
          case TIPOS_TRANSACCION.PROMOCION:
            return {
              ...transaccionBase,
              promocion: detallesExtra.descripcion || 'Promoción aplicada'
            };
            
          case TIPOS_TRANSACCION.EXPIRACION:
            return {
              ...transaccionBase,
              motivo: detallesExtra.motivo || 'Puntos por vencer'
            };
            
          case TIPOS_TRANSACCION.AJUSTE:
            return {
              ...transaccionBase,
              motivo: detallesExtra.motivo || 'Ajuste del sistema'
            };
            
          default:
            return transaccionBase;
        }
      });
      
      setTransacciones(transaccionesProcesadas);
      setFiltradas(transaccionesProcesadas);
      
    } catch (err) {
      console.error('❌ Error cargando transacciones:', err);
      setError(err.message);
      
      // Datos de ejemplo como respaldo
      const transaccionesEjemplo = obtenerDatosEjemplo();
      setTransacciones(transaccionesEjemplo);
      setFiltradas(transaccionesEjemplo);
      
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
    
    cargarTransacciones();
  }, [user, authLoading, fetchWithAuth]);

  // Función para obtener datos de ejemplo (respaldo)
  const obtenerDatosEjemplo = () => {
    return [
      {
        id: 1,
        tipo: TIPOS_TRANSACCION.COMPRA,
        referencia: 'COMP-2024-001234',
        tienda: 'Supermercado Mega',
        fecha: '2024-01-30T14:30:00',
        puntos: 1250,
        puntosUsados: 0,
        estado: 'completado',
        items: [
          { nombre: 'Productos de supermercado', cantidad: 1, subtotal: 2500 }
        ]
      },
      {
        id: 2,
        tipo: TIPOS_TRANSACCION.CANJE,
        referencia: 'CANJ-2024-005678',
        tienda: 'Tienda Online',
        fecha: '2024-01-29T11:15:00',
        puntos: 0,
        puntosUsados: 5000,
        estado: 'completado',
        producto: 'Audífonos Bluetooth Premium'
      },
      {
        id: 3,
        tipo: TIPOS_TRANSACCION.PROMOCION,
        referencia: 'PROM-2024-009876',
        tienda: 'Sistema',
        fecha: '2024-01-28T09:00:00',
        puntos: 500,
        puntosUsados: 0,
        estado: 'completado',
        promocion: 'Bono de bienvenida'
      }
    ];
  };

  // Aplicar filtros y ordenamiento
  useEffect(() => {
    let resultado = [...transacciones];
    
    // Aplicar filtros
    if (filtros.tipo !== 'todos') {
      resultado = resultado.filter(t => t.tipo === filtros.tipo);
    }
    
    if (filtros.fechaDesde) {
      resultado = resultado.filter(t => new Date(t.fecha) >= new Date(filtros.fechaDesde));
    }
    
    if (filtros.fechaHasta) {
      resultado = resultado.filter(t => new Date(t.fecha) <= new Date(filtros.fechaHasta));
    }
    
    if (filtros.tienda) {
      resultado = resultado.filter(t => 
        t.tienda.toLowerCase().includes(filtros.tienda.toLowerCase())
      );
    }
    
    if (filtros.estado !== 'todos') {
      resultado = resultado.filter(t => t.estado === filtros.estado);
    }
    
    if (filtros.puntosMin) {
      const min = parseInt(filtros.puntosMin);
      resultado = resultado.filter(t => t.puntos >= min);
    }
    
    if (filtros.puntosMax) {
      const max = parseInt(filtros.puntosMax);
      resultado = resultado.filter(t => t.puntos <= max);
    }
    
    // Aplicar ordenamiento
    resultado.sort((a, b) => {
      let valorA, valorB;
      
      switch (orden.campo) {
        case 'fecha':
          valorA = new Date(a.fecha);
          valorB = new Date(b.fecha);
          break;
        case 'puntos':
          valorA = a.puntos;
          valorB = b.puntos;
          break;
        case 'tienda':
          valorA = a.tienda.toLowerCase();
          valorB = b.tienda.toLowerCase();
          break;
        case 'tipo':
          valorA = a.tipo;
          valorB = b.tipo;
          break;
        default:
          return 0;
      }
      
      if (orden.direccion === 'asc') {
        return valorA > valorB ? 1 : -1;
      } else {
        return valorA < valorB ? 1 : -1;
      }
    });
    
    setFiltradas(resultado);
  }, [transacciones, filtros, orden]);

  // Calcular estadísticas
  const estadisticas = useMemo(() => {
    if (transacciones.length === 0) {
      return {
        totalPuntos: 0,
        totalCanjes: 0,
        transaccionesMes: 0,
        tiendasVisitadas: 0,
        puntosObtenidos: 0,
        puntosUsados: 0
      };
    }
    
    const totalPuntos = transacciones.reduce((sum, t) => sum + t.puntos, 0);
    const totalCanjes = transacciones.filter(t => t.tipo === TIPOS_TRANSACCION.CANJE).length;
    
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    const transaccionesMes = transacciones.filter(t => 
      new Date(t.fecha) >= ultimos30Dias
    ).length;
    
    const tiendasUnicas = new Set(transacciones.map(t => t.tienda));
    const tiendasVisitadas = tiendasUnicas.size;
    
    const puntosObtenidos = transacciones.reduce((sum, t) => sum + Math.max(t.puntos, 0), 0);
    const puntosUsados = transacciones.reduce((sum, t) => sum + Math.max(t.puntosUsados, 0), 0);
    
    return {
      totalPuntos,
      totalCanjes,
      transaccionesMes,
      tiendasVisitadas,
      puntosObtenidos,
      puntosUsados
    };
  }, [transacciones]);

  // ✅ CORRECCIÓN DEFINITIVA: Formatear fecha EXACTA (solo horas y minutos, sin segundos)
  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    
    try {
      // Limpiar la fecha: eliminar todo después de los minutos
      let fechaLimpia = fechaStr;
      
      // Si tiene T (formato ISO), reemplazar por espacio
      if (fechaLimpia.includes('T')) {
        fechaLimpia = fechaLimpia.replace('T', ' ');
      }
      
      // Si tiene . (milisegundos), eliminar
      if (fechaLimpia.includes('.')) {
        fechaLimpia = fechaLimpia.split('.')[0];
      }
      
      // Separar fecha y hora
      const partes = fechaLimpia.split(' ');
      if (partes.length < 2) {
        // Solo fecha, sin hora
        const [year, month, day] = partes[0].split('-');
        const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const mesNombre = meses[parseInt(month) - 1];
        return `${day} ${mesNombre} ${year}`;
      }
      
      const fechaParte = partes[0];
      const horaParte = partes[1];
      
      // ✅ Eliminar segundos: tomar solo HH:MM
      const horaMinutos = horaParte.substring(0, 5);
      
      // Formatear fecha
      const [year, month, day] = fechaParte.split('-');
      const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const mesNombre = meses[parseInt(month) - 1];
      
      return `${day} ${mesNombre} ${year}, ${horaMinutos}`;
    } catch (err) {
      console.warn('Error formateando fecha:', err);
      return fechaStr;
    }
  };

  // Obtener icono según tipo
  const getTipoIcono = (tipo) => {
    switch (tipo) {
      case TIPOS_TRANSACCION.COMPRA:
        return <FaShoppingCart />;
      case TIPOS_TRANSACCION.CANJE:
        return <FaGift />;
      case TIPOS_TRANSACCION.TRANSFERENCIA:
        return <FaExchangeAlt />;
      case TIPOS_TRANSACCION.PROMOCION:
        return <FaTag />;
      case TIPOS_TRANSACCION.EXPIRACION:
        return <FaClock />;
      case TIPOS_TRANSACCION.AJUSTE:
        return <FaCoins />;
      default:
        return <FaHistory />;
    }
  };

  // Obtener color según tipo
  const getTipoColor = (tipo) => {
    switch (tipo) {
      case TIPOS_TRANSACCION.COMPRA:
        return '#3b82f6';
      case TIPOS_TRANSACCION.CANJE:
        return '#8b5cf6';
      case TIPOS_TRANSACCION.TRANSFERENCIA:
        return '#10b981';
      case TIPOS_TRANSACCION.PROMOCION:
        return '#f59e0b';
      case TIPOS_TRANSACCION.EXPIRACION:
        return '#ef4444';
      case TIPOS_TRANSACCION.AJUSTE:
        return '#6b7280';
      default:
        return '#374151';
    }
  };

  // Obtener texto según tipo
  const getTipoTexto = (tipo) => {
    const textos = {
      [TIPOS_TRANSACCION.COMPRA]: 'Compra',
      [TIPOS_TRANSACCION.CANJE]: 'Canje',
      [TIPOS_TRANSACCION.TRANSFERENCIA]: 'Transferencia',
      [TIPOS_TRANSACCION.PROMOCION]: 'Promoción',
      [TIPOS_TRANSACCION.EXPIRACION]: 'Expiración',
      [TIPOS_TRANSACCION.AJUSTE]: 'Ajuste'
    };
    return textos[tipo] || 'Transacción';
  };

  // Obtener estado (solo para modal)
  const getEstadoInfo = (estado) => {
    const info = {
      completado: { texto: 'Completado', color: '#10b981', icono: <FaCheckCircle /> },
      pendiente: { texto: 'Pendiente', color: '#f59e0b', icono: <FaClock /> },
      rechazado: { texto: 'Rechazado', color: '#ef4444', icono: <FaTimesCircle /> },
      procesando: { texto: 'Procesando', color: '#3b82f6', icono: <FaClock /> }
    };
    return info[estado] || { texto: estado, color: '#6b7280', icono: <FaHistory /> };
  };

  // Recargar datos
  const recargarDatos = () => {
    cargarTransacciones();
  };

  // Limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({
      tipo: 'todos',
      fechaDesde: '',
      fechaHasta: '',
      tienda: '',
      estado: 'todos',
      puntosMin: '',
      puntosMax: ''
    });
  };

  // Mostrar detalle
  const mostrarDetalle = (transaccion) => {
    setTransaccionDetalle(transaccion);
    setDetalleVisible(true);
  };

  // Cambiar ordenamiento
  const cambiarOrden = (campo) => {
    setOrden(prev => ({
      campo,
      direccion: prev.campo === campo && prev.direccion === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Exportar datos
  const exportarDatos = () => {
    const dataStr = JSON.stringify(filtradas, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `historial-transacciones-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
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
        <p>Cargando historial de transacciones...</p>
      </div>
    );
  }

  // Mostrar error si existe
  if (error && transacciones.length === 0) {
    return (
      <div className={styles.errorContainer}>
        <FaExclamationTriangle className={styles.errorIcono} />
        <h3>Error al cargar transacciones</h3>
        <p>{error}</p>
        <button onClick={recargarDatos} className={styles.reintentarBtn}>
          <FaSyncAlt /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.historialContainer}>
      {/* Encabezado */}
      <div className={styles.encabezado}>
        <div className={styles.tituloSection}>
          <div className={styles.tituloConRecarga}>
            <h1>
              <FaHistory className={styles.tituloIcono} />
              Historial de Transacciones
            </h1>
            <button 
              onClick={recargarDatos} 
              className={styles.recargarBtn}
              title="Actualizar datos"
            >
              <FaSyncAlt />
            </button>
          </div>
          <p className={styles.subtitulo}>
            Revisa todas tus transacciones de puntos LabPoints
          </p>
        </div>
        
        <div className={styles.accionesHeader}>
          <button 
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className={styles.filtrosToggleBtn}
          >
            <FaFilter /> {mostrarFiltros ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          </button>
          
          <button 
            onClick={exportarDatos}
            className={styles.exportarBtn}
          >
            <FaDownload /> Exportar
          </button>
        </div>
      </div>

      {/* Mensaje de error (si existe pero tenemos datos) */}
      {error && (
        <div className={styles.errorBanner}>
          <FaExclamationTriangle /> {error} - Mostrando datos almacenados
        </div>
      )}

      {/* Estadísticas rápidas */}
      <div className={styles.estadisticasRapidas}>
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
            <FaCoins />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Puntos Obtenidos</h3>
            <p className={styles.estadisticaValor}>
              +{estadisticas.puntosObtenidos.toLocaleString('es-EC')}
            </p>
            <p className={styles.estadisticaDetalle}>Total acumulado</p>
          </div>
        </div>
        
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#f0f9ff', color: '#0369a1' }}>
            <FaGift />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Canjes Realizados</h3>
            <p className={styles.estadisticaValor}>{estadisticas.totalCanjes}</p>
            <p className={styles.estadisticaDetalle}>Total de canjes</p>
          </div>
        </div>
        
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
            <FaCalendarAlt />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Últimos 30 Días</h3>
            <p className={styles.estadisticaValor}>{estadisticas.transaccionesMes}</p>
            <p className={styles.estadisticaDetalle}>Transacciones</p>
          </div>
        </div>
        
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
            <FaStore />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Tiendas Visitadas</h3>
            <p className={styles.estadisticaValor}>{estadisticas.tiendasVisitadas}</p>
            <p className={styles.estadisticaDetalle}>Establecimientos diferentes</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      {mostrarFiltros && (
        <div className={styles.filtrosSection}>
          <div className={styles.filtrosGrid}>
            <div className={styles.filtroGrupo}>
              <label>
                <FaTag className={styles.filtroIcono} /> Tipo de Transacción
              </label>
              <select 
                value={filtros.tipo}
                onChange={(e) => setFiltros(prev => ({ ...prev, tipo: e.target.value }))}
                className={styles.filtroSelect}
              >
                <option value="todos">Todos los tipos</option>
                <option value={TIPOS_TRANSACCION.COMPRA}>Compra</option>
                <option value={TIPOS_TRANSACCION.CANJE}>Canje</option>
                <option value={TIPOS_TRANSACCION.TRANSFERENCIA}>Transferencia</option>
                <option value={TIPOS_TRANSACCION.PROMOCION}>Promoción</option>
                <option value={TIPOS_TRANSACCION.EXPIRACION}>Expiración</option>
                <option value={TIPOS_TRANSACCION.AJUSTE}>Ajuste</option>
              </select>
            </div>
            
            <div className={styles.filtroGrupo}>
              <label>
                <FaCalendarAlt className={styles.filtroIcono} /> Fecha Desde
              </label>
              <input 
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => setFiltros(prev => ({ ...prev, fechaDesde: e.target.value }))}
                className={styles.filtroInput}
              />
            </div>
            
            <div className={styles.filtroGrupo}>
              <label>
                <FaCalendarAlt className={styles.filtroIcono} /> Fecha Hasta
              </label>
              <input 
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => setFiltros(prev => ({ ...prev, fechaHasta: e.target.value }))}
                className={styles.filtroInput}
              />
            </div>
            
            <div className={styles.filtroGrupo}>
              <label>
                <FaStore className={styles.filtroIcono} /> Tienda
              </label>
              <input 
                type="text"
                value={filtros.tienda}
                onChange={(e) => setFiltros(prev => ({ ...prev, tienda: e.target.value }))}
                className={styles.filtroInput}
                placeholder="Buscar tienda..."
              />
            </div>
            
            <div className={styles.filtroGrupo}>
              <label>
                <FaCheckCircle className={styles.filtroIcono} /> Estado
              </label>
              <select 
                value={filtros.estado}
                onChange={(e) => setFiltros(prev => ({ ...prev, estado: e.target.value }))}
                className={styles.filtroSelect}
              >
                <option value="todos">Todos los estados</option>
                <option value="completado">Completado</option>
                <option value="pendiente">Pendiente</option>
                <option value="rechazado">Rechazado</option>
                <option value="procesando">Procesando</option>
              </select>
            </div>
            
            <div className={styles.filtroGrupo}>
              <label>
                <FaCoins className={styles.filtroIcono} /> Puntos Mínimos
              </label>
              <input 
                type="number"
                value={filtros.puntosMin}
                onChange={(e) => setFiltros(prev => ({ ...prev, puntosMin: e.target.value }))}
                className={styles.filtroInput}
                placeholder="0"
                min="0"
              />
            </div>
            
            <div className={styles.filtroGrupo}>
              <label>
                <FaCoins className={styles.filtroIcono} /> Puntos Máximos
              </label>
              <input 
                type="number"
                value={filtros.puntosMax}
                onChange={(e) => setFiltros(prev => ({ ...prev, puntosMax: e.target.value }))}
                className={styles.filtroInput}
                placeholder="10000"
                min="0"
              />
            </div>
          </div>
          
          <div className={styles.filtrosAcciones}>
            <button 
              onClick={limpiarFiltros}
              className={styles.limpiarBtn}
            >
              <FaTimes /> Limpiar Filtros
            </button>
            
            <div className={styles.contadorResultados}>
              Mostrando {filtradas.length} de {transacciones.length} transacciones
            </div>
          </div>
        </div>
      )}

      {/* Tabla de transacciones */}
      <div className={styles.tablaSection}>
        <div className={styles.tablaHeader}>
          <h3>Transacciones Recientes</h3>
          
          <div className={styles.ordenamiento}>
            <span>Ordenar por:</span>
            <select 
              value={orden.campo}
              onChange={(e) => cambiarOrden(e.target.value)}
              className={styles.ordenSelect}
            >
              <option value="fecha">Fecha</option>
              <option value="puntos">Puntos</option>
              <option value="tienda">Tienda</option>
              <option value="tipo">Tipo</option>
            </select>
            
            <button 
              onClick={() => cambiarOrden(orden.campo)}
              className={styles.ordenBtn}
            >
              {orden.direccion === 'asc' ? <FaSortUp /> : <FaSortDown />}
            </button>
          </div>
        </div>
        
        {filtradas.length === 0 ? (
          <div className={styles.sinResultados}>
            <FaSearch style={{ fontSize: '48px', color: '#d1d5db', marginBottom: '15px' }} />
            <p>No se encontraron transacciones con los filtros aplicados.</p>
            <button 
              onClick={limpiarFiltros}
              className={styles.limpiarBtn}
              style={{ margin: '0 auto' }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className={styles.tablaContainer}>
            <table className={styles.tablaTransacciones}>
              <thead>
                <tr>
                  <th>Tienda / Destino</th>
                  <th>Fecha y Hora</th>
                  <th>Puntos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(transaccion => (
                  <tr key={transaccion.id}>
                    <td className={styles.tiendaCell}>
                      <div 
                        className={styles.tiendaIcono}
                        style={{ backgroundColor: getTipoColor(transaccion.tipo) + '20', color: getTipoColor(transaccion.tipo) }}
                      >
                        {getTipoIcono(transaccion.tipo)}
                      </div>
                      <div className={styles.tiendaInfo}>
                        <span className={styles.tiendaNombre}>
                          {transaccion.tienda}
                        </span>
                        <span className={styles.tiendaTipo}>
                          {getTipoTexto(transaccion.tipo)}
                        </span>
                      </div>
                    </td>
                    
                    <td className={styles.fechaCell}>
                      {formatearFecha(transaccion.fecha)}
                    </td>
                    
                    <td>
                      <div className={styles.puntosContainer}>
                        {transaccion.puntos > 0 && (
                          <span className={styles.puntosObtenidos}>
                            <FaArrowUp style={{ marginRight: '4px' }} />
                            +{transaccion.puntos.toLocaleString('es-EC')}
                          </span>
                        )}
                        {transaccion.puntosUsados > 0 && (
                          <span className={styles.puntosUsados}>
                            <FaArrowDown style={{ marginRight: '4px' }} />
                            -{transaccion.puntosUsados.toLocaleString('es-EC')}
                          </span>
                        )}
                        {transaccion.puntos === 0 && transaccion.puntosUsados === 0 && (
                          <span className={styles.montoNeutro}>
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    
                    <td>
                      <button 
                        onClick={() => mostrarDetalle(transaccion)}
                        className={styles.detalleBtn}
                        title="Ver detalles"
                      >
                        <FaEye />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      {detalleVisible && transaccionDetalle && (
        <div className={styles.detalleOverlay} onClick={() => setDetalleVisible(false)}>
          <div className={styles.detalleModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detalleHeader}>
              <div className={styles.detalleTitulo}>
                <div 
                  className={styles.detalleIcono}
                  style={{ backgroundColor: getTipoColor(transaccionDetalle.tipo) }}
                >
                  {getTipoIcono(transaccionDetalle.tipo)}
                </div>
                <div>
                  <h3>{getTipoTexto(transaccionDetalle.tipo)}</h3>
                  <p className={styles.detalleReferencia}>{transaccionDetalle.referencia}</p>
                </div>
              </div>
              
              <button 
                onClick={() => setDetalleVisible(false)}
                className={styles.cerrarBtn}
              >
                ×
              </button>
            </div>
            
            <div className={styles.detalleBody}>
              <div className={styles.detalleGrid}>
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Fecha y Hora</span>
                  <span className={styles.detalleValor}>
                    {formatearFecha(transaccionDetalle.fecha)}
                  </span>
                </div>
                
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Tienda / Destino</span>
                  <span className={styles.detalleValor}>{transaccionDetalle.tienda}</span>
                </div>
                
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Tipo de Transacción</span>
                  <span className={styles.detalleValor}>
                    <span style={{ color: getTipoColor(transaccionDetalle.tipo), fontWeight: '600' }}>
                      {getTipoTexto(transaccionDetalle.tipo)}
                    </span>
                  </span>
                </div>
                
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Puntos Obtenidos</span>
                  <span className={styles.detalleValor}>
                    {transaccionDetalle.puntos > 0 ? (
                      <span style={{ color: '#10b981', fontWeight: '600' }}>
                        +{transaccionDetalle.puntos.toLocaleString('es-EC')}
                      </span>
                    ) : (
                      <span style={{ color: '#6b7280' }}>—</span>
                    )}
                  </span>
                </div>
                
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Puntos Usados</span>
                  <span className={styles.detalleValor}>
                    {transaccionDetalle.puntosUsados > 0 ? (
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>
                        -{transaccionDetalle.puntosUsados.toLocaleString('es-EC')}
                      </span>
                    ) : (
                      <span style={{ color: '#6b7280' }}>—</span>
                    )}
                  </span>
                </div>
                
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Estado</span>
                  <span className={styles.detalleValor}>
                    <span 
                      className={styles.estadoBadge}
                      style={{ 
                        backgroundColor: getEstadoInfo(transaccionDetalle.estado).color,
                        fontSize: '13px'
                      }}
                    >
                      {getEstadoInfo(transaccionDetalle.estado).icono} 
                      {getEstadoInfo(transaccionDetalle.estado).texto}
                    </span>
                  </span>
                </div>
                
                <div className={styles.detalleItem}>
                  <span className={styles.detalleLabel}>Saldo Neto</span>
                  <span className={styles.detalleValor}>
                    {transaccionDetalle.puntos - transaccionDetalle.puntosUsados >= 0 ? (
                      <span style={{ color: '#10b981', fontWeight: '600' }}>
                        +{(transaccionDetalle.puntos - transaccionDetalle.puntosUsados).toLocaleString('es-EC')}
                      </span>
                    ) : (
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>
                        {(transaccionDetalle.puntos - transaccionDetalle.puntosUsados).toLocaleString('es-EC')}
                      </span>
                    )}
                  </span>
                </div>
              </div>
              
              {/* Secciones específicas según tipo */}
              {transaccionDetalle.items && (
                <div className={styles.itemsSection}>
                  <h4>Detalles de Compra</h4>
                  <div className={styles.itemsLista}>
                    {transaccionDetalle.items.map((item, index) => (
                      <div key={index} className={styles.itemCard}>
                        <span className={styles.itemNombre}>{item.nombre}</span>
                        <div className={styles.itemDetalles}>
                          <span>Cantidad: {item.cantidad}</span>
                          <span>Subtotal: ${item.subtotal.toLocaleString('es-EC')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {transaccionDetalle.producto && (
                <div className={styles.productoSection}>
                  <h4>Producto Canjeado</h4>
                  <p className={styles.productoNombre}>{transaccionDetalle.producto}</p>
                </div>
              )}
              
              {transaccionDetalle.transferencia && (
                <div className={styles.transferenciaSection}>
                  <h4>Información de Transferencia</h4>
                  <div className={styles.transferenciaInfo}>
                    <div className={styles.transferenciaItem}>
                      <span>Destinatario:</span>
                      <strong>{transaccionDetalle.transferencia.destino}</strong>
                    </div>
                    <div className={styles.transferenciaItem}>
                      <span>Email:</span>
                      <strong>{transaccionDetalle.transferencia.email}</strong>
                    </div>
                    <div className={styles.transferenciaItem}>
                      <span>Mensaje:</span>
                      <strong>{transaccionDetalle.transferencia.mensaje}</strong>
                    </div>
                  </div>
                </div>
              )}
              
              {transaccionDetalle.promocion && (
                <div className={styles.productoSection}>
                  <h4>Detalles de Promoción</h4>
                  <p className={styles.productoNombre}>{transaccionDetalle.promocion}</p>
                </div>
              )}
              
              {transaccionDetalle.motivo && (
                <div className={styles.productoSection}>
                  <h4>Motivo</h4>
                  <p className={styles.productoNombre}>{transaccionDetalle.motivo}</p>
                </div>
              )}
            </div>
            
            <div className={styles.detalleAcciones}>
              <button 
                onClick={() => setDetalleVisible(false)}
                className={styles.accionBtn}
              >
                <FaTimes /> Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}