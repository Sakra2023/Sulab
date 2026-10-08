import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { io } from 'socket.io-client';
import styles from '../../assets/css/colab/inicio.module.css';
import {
  FaChartLine, FaMoneyBillWave, FaUsers, FaBox,
  FaClock, FaArrowUp, FaArrowDown, FaBell, FaCalendarAlt, FaFire, FaStar,
  FaSync, FaFilter, FaChartBar, FaFileExport, FaCheck,
  FaEdit, FaTimes, FaSave, FaMapMarkerAlt,
  FaWhatsapp, FaInstagram, FaTiktok,
  FaCheckCircle, FaTrash
} from 'react-icons/fa';

export default function DashboardColab() {
  const { emprendimientoId, usuarioId } = useOutletContext();

  const [emprendimiento, setEmprendimiento] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [periodo, setPeriodo] = useState('hoy');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: '',
    ubicacion: '',
    ciudad: '',
    horario: '',
    whatsapp: '',
    instagram: '',
    tiktok: ''
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [nuevaAlerta, setNuevaAlerta] = useState(null);

  // ============================================
  // ESTADOS PARA FILTRO PERSONALIZADO
  // ============================================
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [modoPersonalizado, setModoPersonalizado] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const socketRef = useRef(null);
  const loadingRef = useRef(false);
  const emprendimientoIdRef = useRef(null);

  // Mantener ref actualizado para usarlo en callbacks de socket sin re-suscribir
  useEffect(() => {
    emprendimientoIdRef.current = emprendimiento?.id || null;
  }, [emprendimiento?.id]);

  // ============================================
  // FUNCIONES DE AUTENTICACIÓN
  // ============================================

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const redirectToLogin = () => {
    const shouldRedirect = window.confirm('Tu sesión ha expirado. ¿Deseas volver a iniciar sesión?');
    if (shouldRedirect) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  };

  const verificarToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin();
      return false;
    }
    return true;
  };

  // ✅ Inicializar Socket.io con URL relativa (mismo origen)
  useEffect(() => {
    if (!usuarioId || !emprendimiento?.id || !verificarToken()) return;

    const token = localStorage.getItem('token');
    const empId = emprendimiento.id;

    socketRef.current = io({
      path: '/socket.io/',
      transports: ['websocket'],
      auth: { token }
    });

    socketRef.current.on('connect', async () => {
      console.log('✅ Socket.IO conectado');
      socketRef.current.emit('join_room', `emprendimiento_${empId}`);
      socketRef.current.emit('join_room', `user_${usuarioId}`);

      try {
        await fetch(`/api/colab/unirse-sala`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ socketId: socketRef.current.id })
        });
        console.log(`✅ Unido a sala user_${usuarioId} desde backend`);
      } catch (error) {
        console.error('❌ Error al unirse a sala:', error);
      }
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Socket.IO error:', error);
    });

    socketRef.current.on('nueva_alerta', (alerta) => {
      console.log('🔔 Nueva alerta recibida:', alerta);

      const empIdActual = emprendimientoIdRef.current;
      if (empIdActual) {
        cargarAlertas(empIdActual);
      }

      if (!(alerta.tipo === 'canje' && alerta.detalle?.estado === 'pendiente')) {
        setNuevaAlerta(alerta);
        setTimeout(() => setNuevaAlerta(null), 5000);
      }
    });

    socketRef.current.on('metricas_actualizadas', (nuevasMetricas) => {
      console.log('📊 Métricas actualizadas:', nuevasMetricas);
      setMetricas(prev => ({ ...prev, ...nuevasMetricas }));
    });

    socketRef.current.on('emprendimiento_actualizado', (data) => {
      console.log('🏪 Emprendimiento actualizado:', data);
      const empIdActual = emprendimientoIdRef.current;
      if (data.id === empIdActual) {
        setEmprendimiento(prev => ({ ...prev, ...data }));
      }
    });

    socketRef.current.on('canje_procesado', (data) => {
      console.log('📡 CANJE PROCESADO RECIBIDO:', data);

      const empIdActual = emprendimientoIdRef.current;
      if (empIdActual) {
        cargarAlertas(empIdActual);
        cargarMetricas(empIdActual);
      }
    });

    socketRef.current.on('alerta_eliminada', (data) => {
      console.log('🗑️ Alerta eliminada recibida:', data);

      setAlertas(prev => prev.filter(a => a.id !== data.alerta_id));

      setTimeout(() => {
        const empIdActual = emprendimientoIdRef.current;
        if (empIdActual) {
          cargarAlertas(empIdActual);
        }
      }, 1000);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave_room', `emprendimiento_${empId}`);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [usuarioId, emprendimiento?.id]);

  // Cargar todos los datos
  useEffect(() => {
    if (usuarioId) {
      cargarDatosCompletos();
    } else {
      setError('No hay usuarioId disponible');
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, periodo, modoPersonalizado, fechaInicio, fechaFin]);

  const cargarDatosCompletos = async () => {
    if (!verificarToken()) return;
    if (loadingRef.current) return;

    loadingRef.current = true;
    setCargando(true);
    setError(null);

    try {
      const emprendimientoCargado = await cargarEmprendimiento();

      if (emprendimientoCargado?.id) {
        await Promise.all([
          cargarMetricas(emprendimientoCargado.id),
          cargarAlertas(emprendimientoCargado.id)
        ]);
      } else if (emprendimientoId) {
        await Promise.all([
          cargarMetricas(emprendimientoId),
          cargarAlertas(emprendimientoId)
        ]);
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      setError('Error al cargar los datos. Por favor, intenta de nuevo.');
    } finally {
      setCargando(false);
      loadingRef.current = false;
    }
  };

  // ✅ Cargar emprendimiento (URL relativa)
  const cargarEmprendimiento = async () => {
    if (!verificarToken()) return null;

    try {
      const response = await fetch(
        `/api/colab/emprendimiento/propietario/${usuarioId}?_=${Date.now()}`,
        { headers: getAuthHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return null;
      }

      const data = await response.json();

      if (data.success && data.emprendimiento) {
        setEmprendimiento(data.emprendimiento);
        setFormData({
          nombre: data.emprendimiento.nombre || '',
          categoria: data.emprendimiento.categoria || '',
          ubicacion: data.emprendimiento.ubicacion || '',
          ciudad: data.emprendimiento.ciudad || '',
          horario: data.emprendimiento.horario || '',
          whatsapp: data.emprendimiento.whatsapp || '',
          instagram: data.emprendimiento.instagram || '',
          tiktok: data.emprendimiento.tiktok || ''
        });
        return data.emprendimiento;
      } else {
        throw new Error(data.message || 'No se encontró el emprendimiento');
      }
    } catch (error) {
      console.error('Error al cargar emprendimiento:', error);
      throw error;
    }
  };

  // ✅ Cargar métricas (URL relativa)
  const cargarMetricas = async (id) => {
    if (!verificarToken()) return;

    try {
      let url;

      // ✅ Si está en modo personalizado y tiene fechas válidas
      if (modoPersonalizado && fechaInicio && fechaFin) {
        url = `/api/colab/metricas/${id}?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}&_=${Date.now()}`;
      } else {
        url = `/api/colab/metricas/${id}?periodo=${periodo}&_=${Date.now()}`;
      }

      const response = await fetch(url, { headers: getAuthHeaders() });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();

      if (data.success) {
        setMetricas(data.metricas);
      } else {
        console.warn('No se pudieron cargar las métricas:', data.message);
        setMetricas(null);
      }
    } catch (error) {
      console.error('Error al cargar métricas:', error);
      setMetricas(null);
    }
  };

  // ✅ Cargar alertas (URL relativa)
  const cargarAlertas = async (id) => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(
        `/api/colab/alertas/${id}?_=${Date.now()}`,
        { headers: getAuthHeaders() }
      );

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();

      if (data.success) {
        setAlertas(data.alertas || []);
      } else {
        console.warn('No se pudieron cargar las alertas:', data.message);
        setAlertas([]);
      }
    } catch (error) {
      console.error('Error al cargar alertas:', error);
      setAlertas([]);
    }
  };

  // ✅ Función para aplicar filtro personalizado
  const aplicarFiltroPersonalizado = () => {
    if (!fechaInicio || !fechaFin) {
      setMensaje({ tipo: 'error', texto: 'Selecciona ambas fechas' });
      setTimeout(() => setMensaje(null), 3000);
      return;
    }

    if (new Date(fechaInicio) > new Date(fechaFin)) {
      setMensaje({ tipo: 'error', texto: 'La fecha de inicio debe ser menor a la fecha fin' });
      setTimeout(() => setMensaje(null), 3000);
      return;
    }

    setModoPersonalizado(true);
    setPeriodo('personalizado');
    cargarDatosCompletos();
  };

  // ✅ Función para limpiar filtro personalizado
  const limpiarFiltroPersonalizado = () => {
    setFechaInicio('');
    setFechaFin('');
    setModoPersonalizado(false);
    setPeriodo('hoy');
    setMostrarFiltros(false);
    cargarDatosCompletos();
  };

  // ✅ Eliminar alerta (URL relativa)
  const eliminarAlerta = async (id, tipo) => {
    if (!verificarToken()) return;
    if (!confirm('¿Eliminar esta alerta permanentemente?')) return;

    const alertaId = id;
    setAlertas(prev => prev.filter(a => a.id !== alertaId));

    try {
      const response = await fetch(
        `/api/colab/alertas/${id}?tipo=${tipo}&_=${Date.now()}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders()
        }
      );

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        if (emprendimiento?.id) {
          await cargarAlertas(emprendimiento.id);
        }
        return;
      }

      const data = await response.json();

      if (!data.success) {
        console.error('Error al eliminar alerta:', data.message);
        if (emprendimiento?.id) {
          await cargarAlertas(emprendimiento.id);
        }
      }
    } catch (error) {
      console.error('Error al eliminar alerta:', error);
      if (emprendimiento?.id) {
        await cargarAlertas(emprendimiento.id);
      }
    }
  };

  // ✅ Actualizar emprendimiento (URL relativa)
  const actualizarEmprendimiento = async (e) => {
    e.preventDefault();
    if (!verificarToken()) return;

    const payload = {
      nombre: formData.nombre?.trim() || '',
      categoria: formData.categoria?.trim() || '',
      ubicacion: formData.ubicacion?.trim() || '',
      ciudad: formData.ciudad?.trim() || '',
      horario: formData.horario?.trim() || null,
      whatsapp: formData.whatsapp?.trim() || null,
      instagram: formData.instagram?.trim() || null,
      tiktok: formData.tiktok?.trim() || null
    };

    if (payload.whatsapp) {
      const whatsappRegex = /^([0-9+\-\s]{8,20}|https?:\/\/.+)$/;
      if (!whatsappRegex.test(payload.whatsapp)) {
        setMensaje({
          tipo: 'error',
          texto: 'WhatsApp debe ser un número (8-20 dígitos) o una URL válida (https://...)'
        });
        return;
      }
    }

    if (payload.instagram && !/^https?:\/\/.+/.test(payload.instagram)) {
      setMensaje({
        tipo: 'error',
        texto: 'Instagram debe ser una URL válida (https://...)'
      });
      return;
    }

    if (payload.tiktok && !/^https?:\/\/.+/.test(payload.tiktok)) {
      setMensaje({
        tipo: 'error',
        texto: 'TikTok debe ser una URL válida (https://...)'
      });
      return;
    }

    setGuardando(true);
    setMensaje(null);

    try {
      const response = await fetch(
        `/api/colab/emprendimiento/${emprendimiento.id}?_=${Date.now()}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();

      if (data.success) {
        const emprendimientoActualizado = { ...emprendimiento, ...payload };
        setEmprendimiento(emprendimientoActualizado);
        await cargarDatosCompletos();

        if (socketRef.current) {
          socketRef.current.emit('actualizar_emprendimiento', {
            emprendimientoId: emprendimiento.id,
            data: payload
          });
        }

        setMensaje({ tipo: 'success', texto: 'Datos actualizados correctamente' });
        setTimeout(() => setMensaje(null), 3000);
        setMostrarModal(false);
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'Error al actualizar' });
      }
    } catch (error) {
      console.error('Error al actualizar:', error);
      setMensaje({ tipo: 'error', texto: 'Error de conexión' });
    } finally {
      setGuardando(false);
    }
  };

  // ✅ Marcar alerta como leída (URL relativa)
  const marcarAlertaLeida = async (id, tipo) => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(
        `/api/colab/alertas/${id}/leida?_=${Date.now()}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ tipo: tipo })
        }
      );

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();

      if (data.success) {
        if (emprendimiento?.id) {
          await cargarAlertas(emprendimiento.id);
        }

        if (socketRef.current) {
          socketRef.current.emit('alerta_leida', {
            alertaId: id,
            emprendimientoId: emprendimiento.id
          });
        }
      }
    } catch (error) {
      console.error('Error al marcar alerta como leída:', error);
    }
  };

  // ✅ Marcar todas las alertas como leídas (URL relativa)
  const marcarTodasAlertasLeidas = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(
        `/api/colab/alertas/marcar-todas?_=${Date.now()}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ emprendimientoId: emprendimiento.id })
        }
      );

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();

      if (data.success) {
        if (emprendimiento?.id) {
          await cargarAlertas(emprendimiento.id);
        }

        if (socketRef.current) {
          socketRef.current.emit('todas_alertas_leidas', {
            emprendimientoId: emprendimiento.id
          });
        }
      }
    } catch (error) {
      console.error('Error al marcar todas las alertas:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const abrirModal = () => {
    if (emprendimiento) {
      setFormData({
        nombre: emprendimiento.nombre || '',
        categoria: emprendimiento.categoria || '',
        ubicacion: emprendimiento.ubicacion || '',
        ciudad: emprendimiento.ciudad || '',
        horario: emprendimiento.horario || '',
        whatsapp: emprendimiento.whatsapp || '',
        instagram: emprendimiento.instagram || '',
        tiktok: emprendimiento.tiktok || ''
      });
      setMostrarModal(true);
    }
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setMensaje(null);
  };

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(monto || 0);
  };

  const formatearFechaRelativa = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    try {
      const fecha = new Date(fechaStr);
      const ahora = new Date();
      const diferenciaMs = ahora - fecha;

      // ✅ Manejar fechas futuras
      if (diferenciaMs < 0) {
        return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
      }

      const diferenciaMin = Math.floor(diferenciaMs / 60000);
      const diferenciaHoras = Math.floor(diferenciaMs / 3600000);

      if (diferenciaMin < 1) {
        return 'Ahora mismo';
      } else if (diferenciaMin < 60) {
        return `Hace ${diferenciaMin} min`;
      } else if (diferenciaHoras < 24) {
        return `Hace ${diferenciaHoras} h`;
      } else {
        return fecha.toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'short'
        });
      }
    } catch {
      return 'Fecha inválida';
    }
  };

  const getTendenciaColor = (tendencia) => {
    switch(tendencia) {
      case 'up': return '#10b981';
      case 'down': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getTendenciaIcono = (tendencia) => {
    switch(tendencia) {
      case 'up': return <FaArrowUp />;
      case 'down': return <FaArrowDown />;
      default: return <FaSync />;
    }
  };

  const getEstadoAlertaColor = (estado) => {
    switch(estado) {
      case 'pendiente': return '#ef4444';
      case 'aprobado': return '#10b981';
      case 'completado': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getEstadoAlertaIcono = (estado) => {
    switch(estado) {
      case 'pendiente': return <FaClock />;
      case 'aprobado': return <FaCheckCircle />;
      case 'completado': return <FaCheckCircle />;
      default: return <FaBell />;
    }
  };

  const calcularEstadisticasFinancieras = () => {
    if (metricas && metricas.ventas?.cantidad) {
      const ingresos = metricas.ventas.cantidad;
      const costos = metricas.costosTotales?.cantidad || ingresos * 0.6;
      const ganancias = ingresos - costos;
      const margenGanancia = ingresos > 0 ? (ganancias / ingresos) * 100 : 0;

      return { ingresos, costos, ganancias, margenGanancia: Math.round(margenGanancia), perdidas: 0 };
    }
    return { ingresos: 0, costos: 0, ganancias: 0, margenGanancia: 0, perdidas: 0 };
  };

  const estadisticasFinancieras = calcularEstadisticasFinancieras();

  const alertasNoLeidas = (alertas || []).filter(a => {
    if (a.tipo === 'canje') {
      return a.detalle?.estado === 'pendiente';
    }
    return !a.leida;
  }).length;

  // ✅ Texto del período mostrado
  const getPeriodoTexto = () => {
    if (modoPersonalizado && fechaInicio && fechaFin) {
      const inicio = new Date(fechaInicio).toLocaleDateString('es-MX');
      const fin = new Date(fechaFin).toLocaleDateString('es-MX');
      return `${inicio} - ${fin}`;
    }
    switch(periodo) {
      case 'hoy': return 'Hoy';
      case 'semana': return 'Esta Semana';
      case 'mes': return 'Este Mes';
      case 'año': return 'Este Año';
      default: return 'Período actual';
    }
  };

  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.cargandoContainer}>
        <p>{error}</p>
        <button onClick={() => cargarDatosCompletos()} className={styles.btnActualizar}>
          <FaSync /> Reintentar
        </button>
      </div>
    );
  }

  if (!emprendimiento) {
    return (
      <div className={styles.cargandoContainer}>
        <p>No tienes un emprendimiento asociado. Por favor, contacta al administrador.</p>
        <button onClick={() => cargarDatosCompletos()} className={styles.btnActualizar}>
          <FaSync /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      {/* Notificación de nueva alerta */}
      {nuevaAlerta && (
        <div className={styles.notificacionToast}>
          <div className={styles.toastContent}>
            <span className={styles.toastIcon}>{nuevaAlerta.icono || '🔔'}</span>
            <div className={styles.toastText}>
              <strong>{nuevaAlerta.titulo}</strong>
              <p>{nuevaAlerta.mensaje}</p>
            </div>
            <button onClick={() => setNuevaAlerta(null)} className={styles.toastClose}>
              <FaTimes />
            </button>
          </div>
        </div>
      )}

      {mostrarModal && (
        <div className={styles.modalOverlay} onClick={cerrarModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <FaEdit className={styles.modalIcono} />
                Editar Información del Emprendimiento
              </h3>
              <button className={styles.modalClose} onClick={cerrarModal}>
                <FaTimes />
              </button>
            </div>

            {mensaje && (
              <div className={`${styles.modalMensaje} ${styles[mensaje.tipo]}`}>
                {mensaje.texto}
              </div>
            )}

            <form onSubmit={actualizarEmprendimiento} className={styles.modalForm}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Nombre del emprendimiento *</label>
                  <input
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    required
                    placeholder="Ej: Café Central"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Categoría *</label>
                  <input
                    type="text"
                    name="categoria"
                    value={formData.categoria}
                    onChange={handleInputChange}
                    required
                    placeholder="Ej: Cafetería, Restaurante, Tienda"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Ubicación / Dirección *</label>
                  <input
                    type="text"
                    name="ubicacion"
                    value={formData.ubicacion}
                    onChange={handleInputChange}
                    required
                    placeholder="Ej: Av. Principal 123"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Ciudad *</label>
                  <input
                    type="text"
                    name="ciudad"
                    value={formData.ciudad}
                    onChange={handleInputChange}
                    required
                    placeholder="Ej: Ciudad de México"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Horario de atención *</label>
                  <input
                    type="text"
                    name="horario"
                    value={formData.horario}
                    onChange={handleInputChange}
                    required
                    placeholder="Ej: Lun-Vie: 8AM-8PM, Sáb: 9AM-6PM"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>WhatsApp</label>
                  <input
                    type="text"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleInputChange}
                    placeholder="https://wa.me/1234567890 o +521234567890"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Instagram</label>
                  <input
                    type="url"
                    name="instagram"
                    value={formData.instagram}
                    onChange={handleInputChange}
                    placeholder="https://instagram.com/tu_perfil"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>TikTok</label>
                  <input
                    type="url"
                    name="tiktok"
                    value={formData.tiktok}
                    onChange={handleInputChange}
                    placeholder="https://tiktok.com/@tu_perfil"
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnCancelar} onClick={cerrarModal}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnGuardar} disabled={guardando}>
                  {guardando ? 'Guardando...' : <><FaSave /> Guardar cambios</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={styles.infoTiendaCard}>
        <div className={styles.infoTiendaHeader}>
          <div className={styles.tiendaIdentidad}>
            <div className={styles.tiendaAvatar}>
              {emprendimiento?.logo_imagen ? (
                <img
                  src={emprendimiento.logo_imagen}
                  alt={emprendimiento.nombre}
                  className={styles.tiendaLogo}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<span class="' + styles.tiendaAvatarIcono + '">🏪</span>';
                  }}
                />
              ) : (
                <span className={styles.tiendaAvatarIcono}>🏪</span>
              )}
            </div>
            <div className={styles.tiendaInfo}>
              <h2>{emprendimiento?.nombre}</h2>
              <div className={styles.tiendaMeta}>
                <span className={styles.tiendaCategoria}>{emprendimiento?.categoria}</span>
                <span className={styles.tiendaStatus}>
                  <span className={styles.statusDot}></span>
                  {emprendimiento?.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>

          <button className={styles.btnEditar} onClick={abrirModal}>
            <FaEdit /> Editar información
          </button>
        </div>

        <div className={styles.infoTiendaDetalles}>
          <div className={styles.detalleItem}>
            <span className={styles.detalleLabel}><FaMapMarkerAlt /> Dirección</span>
            <span className={styles.detalleValor}>{emprendimiento?.ubicacion}, {emprendimiento?.ciudad}</span>
          </div>
          <div className={styles.detalleItem}>
            <span className={styles.detalleLabel}><FaClock /> Horario</span>
            <span className={styles.detalleValor}>{emprendimiento?.horario}</span>
          </div>
          {emprendimiento?.whatsapp && (
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}><FaWhatsapp /> WhatsApp</span>
              <a href={emprendimiento.whatsapp} target="_blank" rel="noopener noreferrer" className={styles.detalleValorLink}>
                {emprendimiento.whatsapp}
              </a>
            </div>
          )}
          {emprendimiento?.instagram && (
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}><FaInstagram /> Instagram</span>
              <a href={emprendimiento.instagram} target="_blank" rel="noopener noreferrer" className={styles.detalleValorLink}>
                {emprendimiento.instagram}
              </a>
            </div>
          )}
          {emprendimiento?.tiktok && (
            <div className={styles.detalleItem}>
              <span className={styles.detalleLabel}><FaTiktok /> TikTok</span>
              <a href={emprendimiento.tiktok} target="_blank" rel="noopener noreferrer" className={styles.detalleValorLink}>
                {emprendimiento.tiktok}
              </a>
            </div>
          )}
          <div className={styles.detalleItem}>
            <span className={styles.detalleLabel}><FaCalendarAlt /> Registro</span>
            <span className={styles.detalleValor}>
              {emprendimiento?.fecha_registro ?
                new Date(emprendimiento.fecha_registro).toLocaleDateString('es-MX', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }) : 'Fecha no disponible'
              }
            </span>
          </div>
        </div>
      </div>

      <div className={styles.controlesPeriodoContainer}>
        <div className={styles.controlesSuperiores}>
          <div className={styles.filtroPeriodo}>
            <select
              value={periodo}
              onChange={(e) => {
                if (e.target.value === 'personalizado') {
                  setMostrarFiltros(true);
                } else {
                  setModoPersonalizado(false);
                  setPeriodo(e.target.value);
                  setMostrarFiltros(false);
                }
              }}
              className={styles.selectPeriodo}
            >
              <option value="hoy">Hoy</option>
              <option value="semana">Esta semana</option>
              <option value="mes">Este mes</option>
              <option value="año">Este año</option>
              <option value="personalizado">📅 Personalizado</option>
            </select>
          </div>

          {/* ✅ Filtros personalizados */}
          {mostrarFiltros && (
            <div className={styles.filtrosPersonalizados}>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className={styles.inputFecha}
                max={fechaFin || undefined}
              />
              <span className={styles.separadorFecha}>→</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className={styles.inputFecha}
                min={fechaInicio || undefined}
                max={new Date().toISOString().split('T')[0]}
              />
              <button
                onClick={aplicarFiltroPersonalizado}
                className={styles.btnAplicarFiltro}
              >
                <FaFilter /> Aplicar
              </button>
              <button
                onClick={limpiarFiltroPersonalizado}
                className={styles.btnLimpiarFiltro}
                title="Limpiar filtro"
              >
                <FaTimes />
              </button>
            </div>
          )}

          {/* ✅ Indicador de período actual */}
          <div className={styles.periodoActual}>
            <FaCalendarAlt className={styles.fechaIcono} />
            <span className={styles.periodoTexto}>
              {getPeriodoTexto()}
              {modoPersonalizado && (
                <span className={styles.badgePersonalizado}>Personalizado</span>
              )}
            </span>
          </div>

          <button className={styles.btnActualizar} onClick={cargarDatosCompletos}>
            <FaSync /> Actualizar
          </button>
        </div>
      </div>

      {metricas && (
        <>
          <div className={styles.analisisFinancieroSection}>
            <div className={styles.sectionHeader}>
              <h3>
                <FaChartBar className={styles.sectionIcono} />
                Análisis Financiero
              </h3>
              <button className={styles.btnExportar}>
                <FaFileExport /> Exportar reporte
              </button>
            </div>

            <div className={styles.estadisticasGrid}>
              <div className={`${styles.estadisticaCard} ${styles.ingresosCard}`}>
                <div className={styles.estadisticaIcono}><FaMoneyBillWave /></div>
                <div className={styles.estadisticaContenido}>
                  <span className={styles.estadisticaLabel}>Ingresos Totales</span>
                  <span className={styles.estadisticaValorGrande}>{formatearMoneda(estadisticasFinancieras.ingresos)}</span>
                  <span className={styles.estadisticaPeriodo}>
                    {modoPersonalizado ? `Del ${new Date(fechaInicio).toLocaleDateString('es-MX')} al ${new Date(fechaFin).toLocaleDateString('es-MX')}` : 'Últimos 30 días'}
                  </span>
                </div>
              </div>

              <div className={`${styles.estadisticaCard} ${styles.costosCard}`}>
                <div className={styles.estadisticaIcono}><FaBox /></div>
                <div className={styles.estadisticaContenido}>
                  <span className={styles.estadisticaLabel}>Costos Totales</span>
                  <span className={styles.estadisticaValorGrande}>{formatearMoneda(estadisticasFinancieras.costos)}</span>
                  <span className={styles.estadisticaPeriodo}>Costo de ventas</span>
                </div>
              </div>

              <div className={`${styles.estadisticaCard} ${styles.gananciasCard}`}>
                <div className={styles.estadisticaIcono}><FaChartLine /></div>
                <div className={styles.estadisticaContenido}>
                  <span className={styles.estadisticaLabel}>Ganancias</span>
                  <span className={styles.estadisticaValorGrande}>{formatearMoneda(estadisticasFinancieras.ganancias)}</span>
                  <span className={styles.estadisticaPeriodo}>Utilidad neta</span>
                </div>
              </div>

              <div className={`${styles.estadisticaCard} ${styles.margenCard}`}>
                <div className={styles.estadisticaIcono}><span className={styles.porcentajeIcono}>%</span></div>
                <div className={styles.estadisticaContenido}>
                  <span className={styles.estadisticaLabel}>Margen de Ganancia</span>
                  <span className={styles.estadisticaValorGrande}>{estadisticasFinancieras.margenGanancia}%</span>
                  <span className={styles.estadisticaPeriodo}>
                    {estadisticasFinancieras.margenGanancia > 50 ? 'Excelente' :
                     estadisticasFinancieras.margenGanancia > 30 ? 'Bueno' :
                     estadisticasFinancieras.margenGanancia > 10 ? 'Regular' : 'Bajo'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.metricasGrid}>
            <div className={styles.metricaCard}>
              <div className={styles.metricaHeader}>
                <div className={styles.metricaIcono} style={{ backgroundColor: '#3b82f620' }}>
                  <FaMoneyBillWave style={{ color: '#3b82f6' }} />
                </div>
                <div className={styles.metricaInfo}>
                  <h3>Ventas {getPeriodoTexto()}</h3>
                  <p className={styles.metricaPeriodo}>Período actual</p>
                </div>
              </div>
              <div className={styles.metricaContenido}>
                <p className={styles.metricaValor}>{formatearMoneda(metricas.ventas?.cantidad || 0)}</p>
                {metricas.ventas?.crecimiento !== undefined && (
                  <div className={styles.metricaTendencia} style={{ color: getTendenciaColor(metricas.ventas?.tendencia) }}>
                    {getTendenciaIcono(metricas.ventas?.tendencia)}
                    <span>{metricas.ventas?.crecimiento}%</span>
                  </div>
                )}
              </div>
              <div className={styles.metricaFooter}>
                <span>vs. período anterior</span>
              </div>
            </div>

            <div className={styles.metricaCard}>
              <div className={styles.metricaHeader}>
                <div className={styles.metricaIcono} style={{ backgroundColor: '#10b98120' }}>
                  <FaUsers style={{ color: '#10b981' }} />
                </div>
                <div className={styles.metricaInfo}>
                  <h3>Clientes {getPeriodoTexto()}</h3>
                  <p className={styles.metricaPeriodo}>Visitantes únicos</p>
                </div>
              </div>
              <div className={styles.metricaContenido}>
                <p className={styles.metricaValor}>{metricas.clientes?.cantidad || 0}</p>
                {metricas.clientes?.crecimiento !== undefined && (
                  <div className={styles.metricaTendencia} style={{ color: getTendenciaColor(metricas.clientes?.tendencia) }}>
                    {getTendenciaIcono(metricas.clientes?.tendencia)}
                    <span>{metricas.clientes?.crecimiento}%</span>
                  </div>
                )}
              </div>
              <div className={styles.metricaFooter}>
                <span>vs. período anterior</span>
              </div>
            </div>

            <div className={styles.metricaCard}>
              <div className={styles.metricaHeader}>
                <div className={styles.metricaIcono} style={{ backgroundColor: '#f59e0b20' }}>
                  <FaStar style={{ color: '#f59e0b' }} />
                </div>
                <div className={styles.metricaInfo}>
                  <h3>Puntos Otorgados</h3>
                  <p className={styles.metricaPeriodo}>{getPeriodoTexto()}</p>
                </div>
              </div>
              <div className={styles.metricaContenido}>
                <p className={styles.metricaValor}>{metricas.puntosOtorgados?.cantidad?.toLocaleString() || 0} pts</p>
                {metricas.puntosOtorgados?.crecimiento !== undefined && (
                  <div className={styles.metricaTendencia} style={{ color: getTendenciaColor(metricas.puntosOtorgados?.tendencia) }}>
                    {getTendenciaIcono(metricas.puntosOtorgados?.tendencia)}
                    <span>{metricas.puntosOtorgados?.crecimiento}%</span>
                  </div>
                )}
              </div>
              <div className={styles.metricaFooter}>
                <span>vs. período anterior</span>
              </div>
            </div>

            <div className={styles.metricaCard}>
              <div className={styles.metricaHeader}>
                <div className={styles.metricaIcono} style={{ backgroundColor: '#8b5cf620' }}>
                  <FaBox style={{ color: '#8b5cf6' }} />
                </div>
                <div className={styles.metricaInfo}>
                  <h3>Productos Vendidos</h3>
                  <p className={styles.metricaPeriodo}>{getPeriodoTexto()}</p>
                </div>
              </div>
              <div className={styles.metricaContenido}>
                <p className={styles.metricaValor}>{metricas.productosVendidos?.cantidad || 0}</p>
                {metricas.productosVendidos?.crecimiento !== undefined && (
                  <div className={styles.metricaTendencia} style={{ color: getTendenciaColor(metricas.productosVendidos?.tendencia) }}>
                    {getTendenciaIcono(metricas.productosVendidos?.tendencia)}
                    <span>{metricas.productosVendidos?.crecimiento}%</span>
                  </div>
                )}
              </div>
              <div className={styles.metricaFooter}>
                <span>vs. período anterior</span>
              </div>
            </div>
          </div>
        </>
      )}

      <div className={styles.seccionInferior}>
        <div className={styles.alertasCardFull}>
          <div className={styles.seccionHeader}>
            <h3>
              <FaBell className={styles.seccionIcono} />
              Alertas y Notificaciones
            </h3>
            <div className={styles.headerAlertasInfo}>
              {alertasNoLeidas > 0 && (
                <span className={styles.alertasNoLeidas}>
                  {alertasNoLeidas} pendientes
                </span>
              )}
              <span className={styles.alertasContador}>
                {(alertas || []).filter(a => a.importante).length} importantes
              </span>
            </div>
          </div>

          <div className={styles.alertasLista}>
            {(alertas || []).length === 0 ? (
              <div className={styles.sinAlertas}>
                <p>No hay alertas</p>
              </div>
            ) : (
              (alertas || []).map(alerta => {
                const estadoAlerta = alerta.detalle?.estado || 'pendiente';
                const isAprobadaOCompletada = estadoAlerta === 'aprobado' || estadoAlerta === 'completado';

                return (
                  <div
                    key={alerta.id}
                    className={`${styles.alertaItem} ${alerta.importante ? styles.importante : ''} ${!alerta.leida && !isAprobadaOCompletada ? styles.noLeida : styles.leida}`}
                    style={{ borderLeftColor: getEstadoAlertaColor(estadoAlerta) }}
                  >
                    <div className={styles.alertaIcono}>
                      <span className={styles.iconoEmoji}>
                        {isAprobadaOCompletada ? getEstadoAlertaIcono(estadoAlerta) : (alerta.icono || '📢')}
                      </span>
                    </div>

                    <div className={styles.alertaContenido}>
                      <div className={styles.alertaHeader}>
                        <div className={styles.alertaTituloContainer}>
                          {!alerta.leida && !isAprobadaOCompletada && <span className={styles.indicadorNoLeido}></span>}
                          <h4 className={styles.alertaTitulo} style={{ color: getEstadoAlertaColor(estadoAlerta) }}>
                            {alerta.titulo}
                          </h4>
                          {isAprobadaOCompletada && (
                            <span className={styles.estadoBadge} style={{ backgroundColor: getEstadoAlertaColor(estadoAlerta) }}>
                              {estadoAlerta === 'aprobado' ? 'Aprobada' : 'Completada'}
                            </span>
                          )}
                        </div>
                        <span className={styles.alertaFecha}>
                          {formatearFechaRelativa(alerta.fecha)}
                        </span>
                      </div>
                      <p className={styles.alertaMensaje}>{alerta.mensaje}</p>
                      {alerta.detalle?.usuario && (
                        <div className={styles.alertaDetalle}>
                          <small>👤 {alerta.detalle.usuario} • {alerta.detalle.puntos} pts</small>
                        </div>
                      )}
                    </div>

                    <div className={styles.alertaAcciones}>
                      <button
                        className={styles.btnEliminar}
                        onClick={() => eliminarAlerta(alerta.id, alerta.tipo)}
                        title="Eliminar alerta"
                      >
                        <FaTrash />
                      </button>
                      {!alerta.leida && !isAprobadaOCompletada && (
                        <button
                          className={styles.btnMarcarLeida}
                          onClick={() => marcarAlertaLeida(alerta.id, alerta.tipo)}
                          title="Marcar como leída"
                        >
                          <FaCheck />
                        </button>
                      )}
                      {alerta.importante && !isAprobadaOCompletada && (
                        <div className={styles.alertaImportante}>
                          <FaFire className={styles.importanteIcono} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}