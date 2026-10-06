import React, { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react';
import io from 'socket.io-client';
import styles from "../../assets/css/adm/noti.module.css";

// ✅ Usar rutas relativas - el proxy de Nginx manejará la redirección
const API_URL = ''; // Vacío para usar rutas relativas

export default function Noti() {
  // Estados
  const [solicitudes, setSolicitudes] = useState([]);
  const [solicitudesColab, setSolicitudesColab] = useState([]);
  const [notificacionesCanje, setNotificacionesCanje] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterType, setFilterType] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [valorPunto, setValorPunto] = useState(0.005);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const isInitialMount = useRef(true);

  // ✅ MODAL DE SOLICITUD
  const [modalVisible, setModalVisible] = useState(false);
  const [solicitudModal, setSolicitudModal] = useState(null);

  // ✅ ESTADOS PARA REGISTRO DE VENTAS
  const [ventas, setVentas] = useState([]);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [ventaModalVisible, setVentaModalVisible] = useState(false);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);

  // ✅ NUEVOS ESTADOS PARA FILTROS DE VENTAS
  const [filtroEmprendimiento, setFiltroEmprendimiento] = useState('todos');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroTipoFechaI, setFiltroTipoFechaI] = useState('dia');

  // ✅ ESTADO PARA EMPRENDIMIENTOS
  const [emprendimientos, setEmprendimientos] = useState([]);

  // Obtener token de autenticación
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }, []);

  // Convertir puntos a USD
  const puntosToUSD = useCallback((puntos) => {
    if (!puntos || puntos === 0) return '0.00';
    return (puntos * valorPunto).toFixed(2);
  }, [valorPunto]);

  // ✅ FUNCIÓN PARA FORMATEAR MONEDA
  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto || 0);
  };

  // ✅ FUNCIÓN PARA OBTENER EMPRENDIMIENTOS
  const fetchEmprendimientos = useCallback(async () => {
    try {
      const response = await fetch('/api/notificaciones/emprendimientos', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setEmprendimientos(data.emprendimientos || []);
      }
    } catch (error) {
      console.error('Error fetching emprendimientos:', error);
    }
  }, [getAuthHeaders]);

  // ✅ FUNCIÓN PARA OBTENER VENTAS
  const fetchVentas = useCallback(async () => {
    setVentasLoading(true);
    try {
      const response = await fetch('/api/notificaciones/ventas', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setVentas(data.ventas || []);
      } else {
        console.error('Error al cargar ventas:', data.message);
        setVentas([]);
      }
    } catch (error) {
      console.error('Error fetching ventas:', error);
      setVentas([]);
    } finally {
      setVentasLoading(false);
    }
  }, [getAuthHeaders]);

  // ✅ VENTAS FILTRADAS
  const ventasFiltradas = useMemo(() => {
    let resultado = [...ventas];

    if (filtroEmprendimiento !== 'todos') {
      resultado = resultado.filter(v => 
        v.emprendimiento_id === parseInt(filtroEmprendimiento)
      );
    }

    if (filtroFechaInicio && filtroFechaFin) {
      const inicio = new Date(filtroFechaInicio);
      const fin = new Date(filtroFechaFin);
      fin.setHours(23, 59, 59);
      
      resultado = resultado.filter(v => {
        const fechaVenta = new Date(v.fecha);
        return fechaVenta >= inicio && fechaVenta <= fin;
      });
    }

    return resultado;
  }, [ventas, filtroEmprendimiento, filtroFechaInicio, filtroFechaFin]);

  // ✅ CALCULAR ESTADÍSTICAS DE VENTAS CON GANANCIA REAL
  const estadisticasVentas = useMemo(() => {
    if (ventasFiltradas.length === 0) {
      return {
        totalVentas: 0,
        totalIngresos: 0,
        totalGanancias: 0,
        promedioVenta: 0,
        cantidadVentas: 0
      };
    }

    const totalIngresos = ventasFiltradas.reduce((sum, v) => sum + (v.total || 0), 0);
    const cantidadVentas = ventasFiltradas.length;
    const promedioVenta = totalIngresos / cantidadVentas;
    
    // ✅ GANANCIA REAL desde el backend
    const totalGanancias = ventasFiltradas.reduce((sum, v) => sum + (v.ganancia_real || 0), 0);

    return {
      totalVentas: cantidadVentas,
      totalIngresos,
      totalGanancias,
      promedioVenta,
      cantidadVentas
    };
  }, [ventasFiltradas]);

  // Combinar solicitudes y notificaciones de canje
  const todasLasNotificaciones = useMemo(() => {
    const solicitudesFormateadas = (solicitudes || []).map(s => {
      let mensaje = '';
      const userName = s.user_name || 'Usuario';
      const puntos = (s.puntos_requeridos || 0).toLocaleString();
      
      if (s.tipo_canje === 'efectivo') {
        mensaje = `${userName} solicita canjear ${puntos} puntos por $${s.monto_usd || puntosToUSD(s.puntos_requeridos)} USD`;
      } else if (s.tipo_canje === 'premio') {
        const premioNombre = s.premio_nombre || 'Premio';
        const stockRestante = s.metadata?.stock_restante || s.stock_restante || 'N/A';
        mensaje = `${userName} canjeó "${premioNombre}" (${s.puntos_requeridos || 0} pts) - Stock restante: ${stockRestante}`;
      } else if (s.tipo_canje === 'mixto') {
        mensaje = `${userName} solicita canjear ${puntos} puntos en pago mixto`;
      } else if (s.tipo_canje === 'solo_puntos') {
        mensaje = `${userName} solicita canjear ${puntos} puntos por puntos`;
      } else {
        mensaje = `${userName} solicita canjear ${puntos} puntos por "${s.premio_nombre || 'Premio'}"`;
      }

      return {
        id: `solicitud-${s.id}`,
        type: 'solicitud',
        originalId: s.id,
        user_name: s.user_name || 'Usuario',
        user_rol: s.user_rol || 'usuario',
        telefono: s.telefono || 'No registrado',
        email: s.email || 'No registrado',
        direccion: s.direccion || 'No registrada',
        tipo_canje: s.tipo_canje || 'premio',
        puntos_requeridos: s.puntos_requeridos || 0,
        premio_nombre: s.premio_nombre || 'Premio',
        estado: s.estado || 'pendiente',
        fecha: s.fecha_solicitud || new Date().toISOString(),
        fecha_procesamiento: s.fecha_procesamiento,
        motivo_rechazo: s.motivo_rechazo,
        metadata: s.metadata || {},
        monto_usd: s.monto_usd || s.valor_dinero,
        origen_soli: s.origen_soli || 'usuario',
        empresa_nombre: s.empresa_nombre,
        departamento: s.departamento,
        valor_dinero: s.valor_dinero,
        stock_restante: s.stock_restante || s.metadata?.stock_restante || null,
        title: s.tipo_canje === 'efectivo' ? 'Solicitud de Canje en Efectivo' : 
               s.tipo_canje === 'mixto' ? 'Solicitud de Canje Mixto' :
               s.tipo_canje === 'solo_puntos' ? 'Solicitud de Canje de Puntos' : 
               s.tipo_canje === 'premio' ? '🎁 Canje de Premio' : 'Solicitud de Canje de Premio',
        message: mensaje,
        timestamp: s.fecha_solicitud || new Date().toISOString(),
        status: s.estado || 'pendiente',
        read: s.estado !== 'pendiente'
      };
    });

    const notificacionesFiltradas = (notificacionesCanje || []).filter(n => {
      const mensaje = n.message || '';
      return mensaje.includes('canjeó') || 
             mensaje.includes('Canjeó') ||
             (n.title && n.title.includes('Canje de premio'));
    });

    const notificacionesFormateadas = notificacionesFiltradas.map(n => ({
      id: `noti-${n.id}`,
      type: 'notificacion',
      originalId: n.id,
      title: n.title || '🎁 Canje de premio',
      message: n.message || 'Canje completado',
      timestamp: n.timestamp || new Date().toISOString(),
      status: 'completado',
      read: true,
      origen_soli: n.origen_soli || 'usuario'
    }));

    return [...solicitudesFormateadas, ...notificacionesFormateadas].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  }, [solicitudes, notificacionesCanje, puntosToUSD]);

  // Obtener solicitudes de colaboradores
  const fetchSolicitudesColab = useCallback(async () => {
    try {
      const response = await fetch('/api/notificaciones/lista-solicitudes', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        const colabSolicitudes = (data.solicitudes || []).filter(s => s.origen_soli === 'colab');
        setSolicitudesColab(colabSolicitudes);
      }
    } catch (error) {
      console.error('Error fetching solicitudes colab:', error);
    }
  }, [getAuthHeaders]);

  // Contar pendientes
  const updatePendingCount = useCallback(() => {
    const pending = (solicitudes || []).filter(s => s.estado === 'pendiente').length;
    setUnreadCount(pending);
  }, [solicitudes]);

  useEffect(() => {
    updatePendingCount();
  }, [solicitudes, updatePendingCount]);

  // Obtener configuración de puntos
  const fetchConfigPuntos = useCallback(async () => {
    try {
      const response = await fetch('/api/notificaciones/config-puntos', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success && data.valor_punto) {
        setValorPunto(data.valor_punto);
      }
    } catch (error) {
      console.error('Error fetching config puntos:', error);
    }
  }, [getAuthHeaders]);

  // Obtener solicitudes (todas)
  const fetchSolicitudes = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/notificaciones/lista-solicitudes', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        setSolicitudes(data.solicitudes || []);
      }
    } catch (error) {
      console.error('Error fetching solicitudes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  // Obtener notificaciones
  const fetchNotificaciones = useCallback(async () => {
    try {
      const response = await fetch('/api/notificaciones/?adminId=1', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.success) {
        const canjes = (data.notificaciones || []).filter(n => {
          const mensaje = n.message || '';
          const titulo = n.title || '';
          const esAprobacion = mensaje.includes('APROBADO') || mensaje.includes('aprobado') || titulo.includes('aprobado');
          const esRechazo = mensaje.includes('RECHAZADO') || mensaje.includes('rechazado') || titulo.includes('rechazado');
          const esSolicitudEnviada = mensaje.includes('solicitud de canje ha sido enviada') || titulo.includes('Solicitud enviada');
          const esCanjeAprobado = titulo.includes('Canje aprobado');
          
          return (mensaje.includes('canjeó') || titulo.includes('Canje de premio')) && 
                 !esAprobacion && !esRechazo && !esSolicitudEnviada && !esCanjeAprobado;
        });
        setNotificacionesCanje(canjes || []);
      }
    } catch (error) {
      console.error('Error fetching notificaciones:', error);
    }
  }, [getAuthHeaders]);

  // ✅ FUNCIÓN DE RECARGA COMPLETA
  const refreshAllData = useCallback(async () => {
    console.log('🔄 Recargando todos los datos...');
    await Promise.all([
      fetchSolicitudes(),
      fetchSolicitudesColab(),
      fetchNotificaciones(),
      fetchVentas(),
      fetchEmprendimientos()
    ]);
    updatePendingCount();
    console.log('✅ Datos recargados completamente');
  }, [fetchSolicitudes, fetchSolicitudesColab, fetchNotificaciones, fetchVentas, fetchEmprendimientos, updatePendingCount]);

  // ✅ ACTUALIZACIONES OPTIMIZADAS
  const actualizarSolicitud = useCallback((solicitudId, nuevosDatos) => {
    setSolicitudes(prev => prev.map(s => 
      s.id === solicitudId ? { ...s, ...nuevosDatos } : s
    ));
    setSolicitudesColab(prev => prev.map(s => 
      s.id === solicitudId ? { ...s, ...nuevosDatos } : s
    ));
    setUnreadCount(prev => {
      if (nuevosDatos.estado === 'pendiente') return prev + 1;
      if (nuevosDatos.estado === 'aprobado' || nuevosDatos.estado === 'rechazado') {
        return Math.max(0, prev - 1);
      }
      return prev;
    });
  }, []);

  // Eliminar notificación
  const deleteNotification = async (id, type) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta notificación?')) {
      return;
    }

    try {
      let notificationId = id;
      
      if (type === 'solicitud' && id.toString().startsWith('solicitud-')) {
        notificationId = id.toString().replace('solicitud-', '');
      } else if (type === 'notificacion' && id.toString().startsWith('noti-')) {
        notificationId = id.toString().replace('noti-', '');
      }
      
      const response = await fetch(`/api/notificaciones/${notificationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        const result = await response.json();
        alert(`⚠️ ${result.message || 'Error al eliminar'}`);
        return;
      }

      if (type === 'solicitud') {
        setSolicitudes(prev => prev.filter(s => s.id !== parseInt(notificationId)));
        setSolicitudesColab(prev => prev.filter(s => s.id !== parseInt(notificationId)));
      } else if (type === 'notificacion') {
        setNotificacionesCanje(prev => prev.filter(n => n.id !== parseInt(notificationId)));
      }

      alert('✅ Notificación eliminada correctamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar la notificación');
    }
  };

  // Conectar Socket.io
  useEffect(() => {
    const token = localStorage.getItem('token');
    const newSocket = io('/', {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      auth: { token }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Conectado a Socket.IO');
      setIsSocketConnected(true);
      newSocket.emit('join_room', 'admin', (response) => {
        console.log('📡 Unido a sala admin:', response);
      });
    });

    newSocket.on('disconnect', () => {
      console.log('⚠️ Socket desconectado');
      setIsSocketConnected(false);
    });

    newSocket.on('reconnect', () => {
      console.log('🔄 Socket reconectado, uniéndose a admin');
      setIsSocketConnected(true);
      newSocket.emit('join_room', 'admin');
      refreshAllData();
    });

    newSocket.emit('test_connection', { message: 'Probando conexión desde admin' });
    newSocket.on('test_response', (data) => {
      console.log('🧪 Test response del servidor:', data);
    });

    newSocket.on('room_joined', (data) => {
      console.log('✅ Confirmación de unión a sala:', data);
    });

    newSocket.on('nueva_solicitud_canje', (solicitud) => {
      console.log('📨 [SOCKET] Nueva solicitud recibida:', solicitud);
      
      const nuevaSolicitud = {
        id: solicitud.solicitud_id,
        user_name: solicitud.usuario_nombre || 'Usuario',
        user_rol: solicitud.usuario_rol || 'usuario',
        tipo_canje: solicitud.tipo_canje || 'premio',
        puntos_requeridos: solicitud.puntos || 0,
        premio_nombre: solicitud.premio_nombre || solicitud.detalles?.premio_nombre || null,
        stock_restante: solicitud.stock_restante || solicitud.detalles?.stock_restante || null,
        estado: 'pendiente',
        fecha_solicitud: new Date().toISOString(),
        origen_soli: solicitud.origen_soli || 'usuario',
        empresa_nombre: solicitud.empresa_nombre || null,
        departamento: solicitud.departamento || null,
        metadata: solicitud.detalles || {}
      };
      
      setSolicitudes(prev => [nuevaSolicitud, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      if (solicitud.origen_soli === 'colab') {
        setSolicitudesColab(prev => [nuevaSolicitud, ...prev]);
      }
    });

    newSocket.on('nueva_notificacion', (notificacion) => {
      console.log('📨 [SOCKET] Nueva notificación:', notificacion);
      const mensaje = notificacion.message || '';
      if (mensaje.includes('canjeó') || notificacion.title?.includes('Canje de premio')) {
        setNotificacionesCanje(prev => [notificacion, ...(prev || [])]);
      }
    });

    newSocket.on('solicitud_procesada', (data) => {
      console.log('📢 [SOCKET] Solicitud procesada:', data);
      const nuevosDatos = {
        estado: data.estado,
        fecha_procesamiento: new Date().toISOString(),
        motivo_rechazo: data.motivo || null
      };
      actualizarSolicitud(data.solicitud_id, nuevosDatos);
    });

    newSocket.on('puntos_actualizados', (data) => {
      console.log('📢 [SOCKET] Puntos actualizados:', data);
    });

    newSocket.on('canje_procesado', (data) => {
      console.log('📢 [SOCKET] Canje procesado para usuario:', data);
    });

    newSocket.on('valor_punto_actualizado', (data) => {
      console.log('📢 [SOCKET] Valor punto actualizado:', data);
      if (data.valor_punto) {
        setValorPunto(data.valor_punto);
      }
    });

    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchConfigPuntos();
      refreshAllData();
    }

    return () => {
      if (newSocket) {
        newSocket.off('connect');
        newSocket.off('disconnect');
        newSocket.off('reconnect');
        newSocket.off('nueva_solicitud_canje');
        newSocket.off('nueva_notificacion');
        newSocket.off('solicitud_procesada');
        newSocket.off('puntos_actualizados');
        newSocket.off('canje_procesado');
        newSocket.off('valor_punto_actualizado');
        newSocket.off('test_response');
        newSocket.off('room_joined');
        newSocket.disconnect();
      }
    };
  }, [refreshAllData, fetchConfigPuntos, actualizarSolicitud]);

  // Filtrar items
  const filteredItems = useMemo(() => {
    if (filterType === 'colab') return [];
    if (filterType === 'ventas') return [];
    
    return (todasLasNotificaciones || []).filter(item => {
      if (filterType === 'all') return true;
      if (filterType === 'pendiente') return item.status === 'pendiente';
      if (filterType === 'aprobado') return item.status === 'aprobado';
      if (filterType === 'rechazado') return item.status === 'rechazado';
      if (filterType === 'completado') return item.status === 'completado';
      return true;
    });
  }, [todasLasNotificaciones, filterType]);

  // Aprobar solicitud
  const approveRequest = async (id) => {
    try {
      const response = await fetch(`/api/notificaciones/aprobar-solicitud/${id}`, { 
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ adminId: 1 })
      });
      
      if (!response.ok) {
        const result = await response.json();
        alert(`⚠️ ${result.message || 'Error al aprobar'}`);
        return;
      }
      
      actualizarSolicitud(id, { 
        estado: 'aprobado',
        fecha_procesamiento: new Date().toISOString()
      });
      alert('✅ Solicitud aprobada');
      setModalVisible(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al aprobar');
    }
  };

  // Rechazar solicitud
  const rejectRequest = async (id) => {
    const solicitud = (solicitudes || []).find(s => s.id === id);
    if (!solicitud) return;
    
    const reason = prompt(`Motivo del rechazo para ${solicitud.user_name || 'usuario'}:`);
    if (!reason) return;

    try {
      const response = await fetch(`/api/notificaciones/rechazar-solicitud/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ adminId: 1, reason })
      });

      if (!response.ok) return;

      actualizarSolicitud(id, { 
        estado: 'rechazado',
        fecha_procesamiento: new Date().toISOString(),
        motivo_rechazo: reason
      });
      alert('❌ Solicitud rechazada');
      setModalVisible(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al rechazar');
    }
  };

  const getTypeIcon = (item) => {
    if (item.type === 'solicitud') {
      if (item.tipo_canje === 'efectivo') return '💰';
      if (item.tipo_canje === 'mixto') return '💳';
      if (item.tipo_canje === 'solo_puntos') return '🔄';
      return '🎁';
    }
    return '🎁';
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'pendiente': return '#f59e0b';
      case 'aprobado': return '#10b981';
      case 'rechazado': return '#ef4444';
      case 'completado': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'pendiente': return '⏳ Pendiente';
      case 'aprobado': return '✅ Aprobada';
      case 'rechazado': return '❌ Rechazada';
      case 'completado': return '🎁 Canje Completado';
      default: return '📋 Info';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMins = Math.floor((now - date) / 60000);
      const diffHours = Math.floor((now - date) / 3600000);
      const diffDays = Math.floor((now - date) / 86400000);

      if (diffMins < 60) return `Hace ${diffMins} min`;
      if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
      if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
      return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return 'Fecha inválida';
    }
  };

  // ✅ FUNCIÓN PARA ABRIR MODAL DE SOLICITUD
  const abrirModal = (solicitud) => {
    if (!solicitud || solicitud.type !== 'solicitud') return;
    setSolicitudModal(solicitud);
    setModalVisible(true);
    document.body.style.overflow = 'hidden';
  };

  // ✅ FUNCIÓN PARA CERRAR MODAL DE SOLICITUD
  const cerrarModal = () => {
    setModalVisible(false);
    setSolicitudModal(null);
    document.body.style.overflow = 'auto';
  };

  // ✅ FUNCIÓN PARA ABRIR MODAL DE VENTA
  const abrirVentaModal = (venta) => {
    setVentaSeleccionada(venta);
    setVentaModalVisible(true);
    document.body.style.overflow = 'hidden';
  };

  // ✅ FUNCIÓN PARA CERRAR MODAL DE VENTA
  const cerrarVentaModal = () => {
    setVentaModalVisible(false);
    setVentaSeleccionada(null);
    document.body.style.overflow = 'auto';
  };

  // ✅ Cerrar modal con ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && modalVisible) {
        cerrarModal();
      }
      if (e.key === 'Escape' && ventaModalVisible) {
        cerrarVentaModal();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalVisible, ventaModalVisible]);

  // Componente de tabla para colaboradores
  const TablaColaboradores = () => {
    return (
      <div className={styles.colabTableContainer}>
        <h3>🤝 Canjes de Colaboradores</h3>
        {(solicitudesColab || []).length === 0 ? (
          <div className={styles.emptyState}>
            <p>📭 No hay canjes de colaboradores</p>
          </div>
        ) : (
          <table className={styles.colabTable}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Usuario</th>
                <th>Tipo Canje</th>
                <th>Puntos</th>
                <th>Equivalente USD</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(solicitudesColab || []).map((solicitud) => (
                <Fragment key={solicitud.id}>
                  <tr className={styles.colabRow}>
                    <td className={styles.empresaCell}>
                      <strong>{solicitud.empresa_nombre || solicitud.metadata?.nombre_tienda || 'Empresa no especificada'}</strong>
                    </td>
                    <td>
                      <div>{solicitud.user_name}</div>
                      <small className={styles.emailSmall}>{solicitud.email || 'Sin email'}</small>
                    </td>
                    <td>
                      {solicitud.tipo_canje === 'mixto' ? '💳 Mixto' : 
                       solicitud.tipo_canje === 'solo_puntos' ? '🔄 Solo Puntos' : 
                       solicitud.tipo_canje === 'efectivo' ? '💰 Efectivo' : '🎁 Premio'}
                    </td>
                    <td className={styles.puntosCell}>{(solicitud.puntos_requeridos || 0).toLocaleString()} pts</td>
                    <td className={styles.usdCell}>${puntosToUSD(solicitud.puntos_requeridos || 0)} USD</td>
                    <td>{formatDate(solicitud.fecha_procesamiento || solicitud.fecha_solicitud)}</td>
                    <td>
                      <span 
                        className={styles.statusTag}
                        style={{ backgroundColor: getStatusColor(solicitud.estado) }}
                      >
                        {getStatusText(solicitud.estado)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className={styles.detailsBtn}
                          onClick={() => abrirModal({
                            ...solicitud,
                            type: 'solicitud',
                            id: `solicitud-${solicitud.id}`,
                            originalId: solicitud.id
                          })}
                        >
                          👁️ Ver
                        </button>
                        <button 
                          onClick={() => deleteNotification(`solicitud-${solicitud.id}`, 'solicitud')}
                          className={styles.deleteBtn}
                          style={{ backgroundColor: '#ef4444', color: 'white', padding: '0.3rem 0.6rem' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  // ✅ COMPONENTE DE TABLA DE VENTAS CON FILTROS Y ESTADÍSTICAS
  const TablaVentas = () => {
    return (
      <div className={styles.colabTableContainer}>
        <h3>📊 Registro de Ventas</h3>
        
        {/* ✅ FILTROS DE VENTAS */}
        <div className={styles.filtrosVentas}>
          <div className={styles.filtroGrupo}>
            <label>Emprendimiento:</label>
            <select 
              value={filtroEmprendimiento} 
              onChange={(e) => setFiltroEmprendimiento(e.target.value)}
              className={styles.filtroSelect}
            >
              <option value="todos">Todos los emprendimientos</option>
              {emprendimientos.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          
          <div className={styles.filtroGrupo}>
            <label>Fecha Desde:</label>
            <input 
              type="date" 
              value={filtroFechaInicio} 
              onChange={(e) => setFiltroFechaInicio(e.target.value)}
              className={styles.filtroInput}
            />
          </div>
          
          <div className={styles.filtroGrupo}>
            <label>Fecha Hasta:</label>
            <input 
              type="date" 
              value={filtroFechaFin} 
              onChange={(e) => setFiltroFechaFin(e.target.value)}
              className={styles.filtroInput}
            />
          </div>
          
          <button 
            onClick={() => {
              setFiltroEmprendimiento('todos');
              setFiltroFechaInicio('');
              setFiltroFechaFin('');
            }}
            className={styles.limpiarFiltrosBtn}
          >
            🗑️ Limpiar filtros
          </button>
        </div>

        {/* ✅ ESTADÍSTICAS DE VENTAS CON GANANCIA REAL */}
        <div className={styles.estadisticasVentas}>
          <div className={styles.estadisticaCard}>
            <span className={styles.estadisticaLabel}>📊 Total Ventas</span>
            <span className={styles.estadisticaValor}>{estadisticasVentas.cantidadVentas}</span>
          </div>
          <div className={styles.estadisticaCard}>
            <span className={styles.estadisticaLabel}>💰 Total Ingresos</span>
            <span className={styles.estadisticaValor} style={{ color: '#10b981' }}>
              {formatearMoneda(estadisticasVentas.totalIngresos)}
            </span>
          </div>
          <div className={styles.estadisticaCard}>
            <span className={styles.estadisticaLabel}>📈 Ganancia Real</span>
            <span className={styles.estadisticaValor} style={{ color: '#3b82f6' }}>
              {formatearMoneda(estadisticasVentas.totalGanancias)}
            </span>
          </div>
          <div className={styles.estadisticaCard}>
            <span className={styles.estadisticaLabel}>📊 Promedio por Venta</span>
            <span className={styles.estadisticaValor} style={{ color: '#8b5cf6' }}>
              {formatearMoneda(estadisticasVentas.promedioVenta)}
            </span>
          </div>
        </div>

        {/* ✅ TABLA DE VENTAS */}
        {ventasLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>Cargando ventas...</p>
          </div>
        ) : (ventasFiltradas || []).length === 0 ? (
          <div className={styles.emptyState}>
            <p>📭 No hay ventas con los filtros seleccionados</p>
          </div>
        ) : (
          <table className={styles.colabTable}>
            <thead>
              <tr>
                <th>Emprendimiento</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(ventasFiltradas || []).map((venta) => (
                <tr key={venta.id} className={styles.colabRow}>
                  <td className={styles.empresaCell}>
                    <strong>{venta.emprendimiento_nombre || 'Sin nombre'}</strong>
                  </td>
                  <td>
                    <div>{venta.cliente_nombre || 'Cliente'}</div>
                    <small className={styles.emailSmall}>{venta.cliente_telefono || 'Sin teléfono'}</small>
                  </td>
                  <td className={styles.usdCell}>
                    <strong>{formatearMoneda(venta.total)}</strong>
                  </td>
                  <td>{formatDate(venta.fecha)}</td>
                  <td>
                    <button 
                      className={styles.detailsBtn}
                      onClick={() => abrirVentaModal(venta)}
                    >
                      👁️ Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  // Calcular contadores
  const pendingCount = (todasLasNotificaciones || []).filter(i => i.status === 'pendiente').length;
  const approvedCount = (todasLasNotificaciones || []).filter(i => i.status === 'aprobado').length;
  const rejectedCount = (todasLasNotificaciones || []).filter(i => i.status === 'rechazado').length;
  const completedCount = (todasLasNotificaciones || []).filter(i => i.status === 'completado').length;
  const colabCount = (solicitudesColab || []).length;
  const ventasCount = (ventas || []).length;

  return (
    <div className={styles.notificationsContainer}>
      <div className={styles.notificationsHeader}>
        <h1>🎁 Gestión de Canjes</h1>
        <span className={styles.unreadBadge}>{unreadCount} pendiente(s)</span>
        {!isSocketConnected && (
          <span className={styles.connectionStatus} style={{ color: '#ef4444', marginLeft: '1rem', fontSize: '0.8rem' }}>
            ⚠️ Desconectado
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className={styles.filtersSection}>
        <div className={styles.filterButtons}>
          <button 
            onClick={() => setFilterType('all')} 
            className={filterType === 'all' ? styles.active : ''}
          >
            📋 Todas ({(todasLasNotificaciones || []).length})
          </button>
          <button 
            onClick={() => setFilterType('pendiente')} 
            className={filterType === 'pendiente' ? styles.active : ''}
          >
            ⏳ Pendientes ({pendingCount})
          </button>
          <button 
            onClick={() => setFilterType('aprobado')} 
            className={filterType === 'aprobado' ? styles.active : ''}
          >
            ✅ Aprobadas ({approvedCount})
          </button>
          <button 
            onClick={() => setFilterType('rechazado')} 
            className={filterType === 'rechazado' ? styles.active : ''}
          >
            ❌ Rechazadas ({rejectedCount})
          </button>
          <button 
            onClick={() => setFilterType('completado')} 
            className={filterType === 'completado' ? styles.active : ''}
          >
            🎁 Canjes Completados ({completedCount})
          </button>
          <button 
            onClick={() => setFilterType('colab')} 
            className={filterType === 'colab' ? styles.active : ''}
          >
            🤝 Colaboradores ({colabCount})
          </button>
          <button 
            onClick={() => setFilterType('ventas')} 
            className={filterType === 'ventas' ? styles.active : ''}
          >
            📊 Ventas ({ventasCount})
          </button>
        </div>
      </div>

      {/* Lista combinada, Tabla de Colaboradores o Tabla de Ventas */}
      {filterType === 'colab' ? (
        <TablaColaboradores />
      ) : filterType === 'ventas' ? (
        <TablaVentas />
      ) : (
        <div className={styles.notificationsList}>
          {isLoading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner}></div>
              <p>Cargando...</p>
            </div>
          ) : (filteredItems || []).length === 0 ? (
            <div className={styles.emptyState}>
              <p>📭 No hay elementos</p>
            </div>
          ) : (
            (filteredItems || []).map(item => (
              <div 
                key={item.id} 
                className={`${styles.notificationItem} ${item.status === 'pendiente' ? styles.unread : ''}`}
                data-origen={item.origen_soli || 'usuario'}
              >
                <div className={styles.notificationIcon}>
                  {getTypeIcon(item)}
                </div>
                <div className={styles.notificationContent}>
                  <div className={styles.notificationHeader}>
                    <h4>{item.title}</h4>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className={styles.timestamp}>{formatDate(item.timestamp)}</span>
                      {item.type !== 'solicitud' && (
                        <button 
                          onClick={() => deleteNotification(item.id, item.type)}
                          className={styles.deleteBtnSmall}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            cursor: 'pointer', 
                            fontSize: '1.2rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#fee2e2'}
                          onMouseLeave={(e) => e.target.style.background = 'none'}
                          title="Eliminar notificación"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.notificationUserSection}>
                    <div className={styles.userAvatarSmall}>👤</div>
                    <p className={styles.notificationMessage}>{item.message}</p>
                  </div>
                  <div className={styles.notificationFooter}>
                    <span 
                      className={styles.statusTag}
                      style={{ backgroundColor: getStatusColor(item.status) }}
                    >
                      {getStatusText(item.status)}
                    </span>
                  </div>
                  <button 
                    className={styles.verDetallesBtn}
                    onClick={() => abrirModal(item)}
                  >
                    👁️ Ver detalles completos
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ✅ MODAL DE DETALLES DE SOLICITUD */}
      {modalVisible && solicitudModal && (
        <div className={styles.modalOverlay} onClick={cerrarModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{solicitudModal.title}</h3>
              <button className={styles.modalClose} onClick={cerrarModal}>×</button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.userInfoSection}>
                <h4>👤 Información del Cliente</h4>
                <div className={styles.userDetails}>
                  <div><strong>Nombre:</strong> {solicitudModal.user_name || 'Usuario'}</div>
                  <div><strong>Rol:</strong> {solicitudModal.user_rol || 'usuario'}</div>
                  <div><strong>Origen:</strong> {solicitudModal.origen_soli === 'colab' ? '🤝 Colaborador' : '👤 Usuario'}</div>
                  <div><strong>Teléfono:</strong> {solicitudModal.telefono || 'No registrado'}</div>
                  <div><strong>Email:</strong> {solicitudModal.email || 'No registrado'}</div>
                  <div><strong>Dirección:</strong> {solicitudModal.direccion || 'No registrada'}</div>
                </div>
              </div>

              <div className={styles.requestDetails}>
                <h4>📋 Detalles de la Transacción</h4>
                <div className={styles.detailsGrid}>
                  <div><span>Tipo:</span> <strong>
                    {solicitudModal.tipo_canje === 'efectivo' ? '💰 Efectivo' : 
                     solicitudModal.tipo_canje === 'mixto' ? '💳 Mixto' :
                     solicitudModal.tipo_canje === 'solo_puntos' ? '🔄 Solo Puntos' : '🎁 Premio'}
                  </strong></div>
                  <div><span>Puntos:</span> <strong>{(solicitudModal.puntos_requeridos || 0).toLocaleString()} pts</strong></div>
                  <div><span>Valor USD:</span> <strong>${puntosToUSD(solicitudModal.puntos_requeridos || 0)} USD</strong></div>
                  {solicitudModal.tipo_canje === 'efectivo' && solicitudModal.monto_usd && (
                    <div><span>Monto:</span> <strong>${solicitudModal.monto_usd} USD</strong></div>
                  )}
                  {solicitudModal.tipo_canje === 'mixto' && solicitudModal.valor_dinero && (
                    <div><span>Efectivo:</span> <strong>${solicitudModal.valor_dinero} USD</strong></div>
                  )}
                  {solicitudModal.tipo_canje === 'premio' && solicitudModal.premio_nombre && (
                    <div><span>Premio:</span> <strong>{solicitudModal.premio_nombre}</strong></div>
                  )}
                  {solicitudModal.stock_restante && (
                    <div><span>Stock restante:</span> <strong>{solicitudModal.stock_restante}</strong></div>
                  )}
                  {(solicitudModal.tipo_canje === 'solo_puntos' || solicitudModal.tipo_canje === 'mixto') && solicitudModal.empresa_nombre && (
                    <div><span>Empresa:</span> <strong>{solicitudModal.empresa_nombre}</strong></div>
                  )}
                  {solicitudModal.departamento && (
                    <div><span>Departamento:</span> <strong>{solicitudModal.departamento}</strong></div>
                  )}
                  <div><span>Fecha:</span> <strong>{formatDate(solicitudModal.fecha)}</strong></div>
                </div>
                {solicitudModal.motivo_rechazo && (
                  <div style={{ marginTop: '1rem' }}><strong>❌ Motivo:</strong> {solicitudModal.motivo_rechazo}</div>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              {solicitudModal.estado === 'pendiente' && (
                <>
                  <button onClick={() => approveRequest(solicitudModal.originalId)} className={styles.approveBtn}>✅ Aprobar</button>
                  <button onClick={() => rejectRequest(solicitudModal.originalId)} className={styles.rejectBtn}>❌ Rechazar</button>
                </>
              )}
              <button 
                onClick={() => {
                  deleteNotification(solicitudModal.id, solicitudModal.type);
                  cerrarModal();
                }} 
                className={styles.deleteBtn}
              >
                🗑️ Eliminar
              </button>
              <button onClick={cerrarModal} className={styles.btnCerrarModal}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ MODAL DE DETALLES DE VENTA CON GANANCIA REAL */}
      {ventaModalVisible && ventaSeleccionada && (
        <div className={styles.modalOverlay} onClick={cerrarVentaModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>📊 Detalles de Venta - {ventaSeleccionada.numero || 'Sin número'}</h3>
              <button className={styles.modalClose} onClick={cerrarVentaModal}>×</button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.userInfoSection}>
                <h4>🏪 Información de la Venta</h4>
                <div className={styles.userDetails}>
                  <div><strong>Emprendimiento:</strong> {ventaSeleccionada.emprendimiento_nombre || 'Sin nombre'}</div>
                  <div><strong>Número Factura:</strong> {ventaSeleccionada.numero || 'N/A'}</div>
                  <div><strong>Fecha:</strong> {formatDate(ventaSeleccionada.fecha)}</div>
                  <div><strong>Hora:</strong> {ventaSeleccionada.hora || 'N/A'}</div>
                  <div><strong>Método Pago:</strong> {ventaSeleccionada.metodo_pago || 'No especificado'}</div>
                  <div><strong>Estado:</strong> {ventaSeleccionada.estado || 'completado'}</div>
                </div>
              </div>

              <div className={styles.userInfoSection} style={{ borderLeftColor: '#f4a261' }}>
                <h4>👤 Información del Cliente</h4>
                <div className={styles.userDetails}>
                  <div><strong>Nombre:</strong> {ventaSeleccionada.cliente_nombre || 'Cliente'}</div>
                  <div><strong>Teléfono:</strong> {ventaSeleccionada.cliente_telefono || 'No registrado'}</div>
                  <div><strong>Email:</strong> {ventaSeleccionada.cliente_email || 'No registrado'}</div>
                  <div><strong>Dirección:</strong> {ventaSeleccionada.cliente_direccion || 'No registrada'}</div>
                </div>
              </div>

              <div className={styles.requestDetails}>
                <h4>💰 Detalles Financieros</h4>
                <div className={styles.detailsGrid}>
                  <div><span>Subtotal:</span> <strong>{formatearMoneda(ventaSeleccionada.subtotal)}</strong></div>
                  <div><span>IVA:</span> <strong>{formatearMoneda(ventaSeleccionada.impuesto)}</strong></div>
                  <div><span>Total:</span> <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>{formatearMoneda(ventaSeleccionada.total)}</strong></div>
                  <div><span>Pago Recibido:</span> <strong>{formatearMoneda(ventaSeleccionada.pago_recibido)}</strong></div>
                  <div><span>Vuelto:</span> <strong>{formatearMoneda(ventaSeleccionada.vuelto)}</strong></div>
                  <div><span>Puntos Otorgados:</span> <strong>{(ventaSeleccionada.puntos_otorgados || 0).toLocaleString()} pts</strong></div>
                  <div><span>Referencia:</span> <strong>{ventaSeleccionada.referencia || 'N/A'}</strong></div>
                  {/* ✅ GANANCIA REAL EN MODAL */}
                  <div><span>Ganancia Real:</span> <strong style={{ color: '#3b82f6', fontSize: '1.1rem' }}>
                    {formatearMoneda(ventaSeleccionada.ganancia_real)}
                  </strong></div>
                </div>
              </div>

              {(ventaSeleccionada.items && ventaSeleccionada.items.length > 0) && (
                <div className={styles.requestDetails} style={{ borderLeftColor: '#8b5cf6' }}>
                  <h4>📦 Productos</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className={styles.colabTable} style={{ fontSize: 'var(--font-xs)' }}>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Precio</th>
                          <th>Subtotal</th>
                          <th>Ganancia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ventaSeleccionada.items || []).map((item, index) => (
                          <tr key={index}>
                            <td>{item.codigo || 'N/A'}</td>
                            <td>{item.nombre || 'Producto'}</td>
                            <td>{item.cantidad || 0}</td>
                            <td>{formatearMoneda(item.precio)}</td>
                            <td>{formatearMoneda(item.subtotal)}</td>
                            <td style={{ color: '#3b82f6' }}>
                              {formatearMoneda(item.ganancia_item || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button onClick={cerrarVentaModal} className={styles.btnCerrarModal}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}