import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import io from 'socket.io-client';
import styles from '../../assets/css/colab/puntos.module.css';
import { 
  FaSearch, 
  FaUser, 
  FaCoins, 
  FaHistory,
  FaCheckCircle,
  FaPrint,
  FaDownload,
  FaFilter,
  FaClock,
  FaMoneyBillWave,
  FaExchangeAlt,
  FaBoxOpen,
  FaTimes,
  FaShoppingCart
} from 'react-icons/fa';

export default function PuntosColab() {
  // ============================================
  // RECIBIR DATOS DEL OUTLET CONTEXT
  // ============================================
  const { emprendimientoId, usuarioId } = useOutletContext();
  
  // Estados principales
  const [clientes, setClientes] = useState([]);
  const [clientesFiltrados, setClientesFiltrados] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modo, setModo] = useState('manual');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  
  // Estados para búsqueda y filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  // Estados para pago
  const [tipoPago, setTipoPago] = useState('mixto');
  const [puntosACanjear, setPuntosACanjear] = useState('');
  const [montoProducto, setMontoProducto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorPuntos, setErrorPuntos] = useState('');
  
  // Estados para buscador de productos
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [mostrarSugerenciasProducto, setMostrarSugerenciasProducto] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  
  // Estado para valor del punto dinámico
  const [valorPunto, setValorPunto] = useState(0.005);
  
  // Estado para Socket.io
  const [socket, setSocket] = useState(null);
  
  // Referencias
  const manualInputRef = useRef(null);
  const sugerenciasRef = useRef(null);
  const productoInputRef = useRef(null);
  const sugerenciasProductoRef = useRef(null);

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
    alert('Sesión expirada. Redirigiendo al login...');
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }, 2000);
  };

  const verificarToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      redirectToLogin();
      return false;
    }
    return true;
  };

  // Tipos de transacción
  const TIPO_TRANSACCION = {
    COMPRA: 'compra',
    CANJE: 'canje',
    AJUSTE: 'ajuste',
    BONIFICACION: 'bonificacion',
    TRANSFERENCIA: 'transferencia'
  };

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sugerenciasRef.current && !sugerenciasRef.current.contains(event.target) &&
          manualInputRef.current && !manualInputRef.current.contains(event.target)) {
        setMostrarSugerencias(false);
      }
      if (sugerenciasProductoRef.current && !sugerenciasProductoRef.current.contains(event.target) &&
          productoInputRef.current && !productoInputRef.current.contains(event.target)) {
        setMostrarSugerenciasProducto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ============================================
  // CONECTAR SOCKET.IO CON AUTENTICACIÓN (URL relativa)
  // ============================================
  useEffect(() => {
    if (!verificarToken()) return;
    
    const token = localStorage.getItem('token');
    const newSocket = io({
      path: '/socket.io/',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      auth: { token }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket.io conectado en PuntosColab');
      if (emprendimientoId) {
        newSocket.emit('join_room', `colab_${emprendimientoId}`);
      }
      newSocket.emit('join_room', 'colab_puntos');
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket.io error:', error);
    });

    newSocket.on('config_puntos_actualizada', (nuevaConfig) => {
      console.log('🔄 Valor del punto actualizado en tiempo real:', nuevaConfig.valor_punto);
      if (nuevaConfig && nuevaConfig.valor_punto !== undefined) {
        setValorPunto(nuevaConfig.valor_punto);
        if (modo === 'historial') {
          cargarTransaccionesReales();
        }
      }
    });

    newSocket.on('puntos_usuario_actualizados', (data) => {
      console.log('🔄 Puntos de usuario actualizados:', data);
      if (clienteSeleccionado && clienteSeleccionado.id === data.user_id) {
        setClienteSeleccionado(prev => ({
          ...prev,
          puntos: data.puntos_actuales,
          nivel: calcularNivel(data.puntos_actuales)
        }));
        setClientes(prev => prev.map(c => 
          c.id === data.user_id 
            ? { ...c, puntos: data.puntos_actuales, nivel: calcularNivel(data.puntos_actuales) }
            : c
        ));
      }
    });

    // ============================================
    // 🆕 NUEVOS LISTENERS PARA SOLICITUDES DE CANJE
    // ============================================

    // 📨 Escuchar nuevas solicitudes de canje
    newSocket.on('nueva_solicitud_canje', (solicitud) => {
      console.log('📨 [SOCKET] Nueva solicitud de canje recibida:', solicitud);
      
      // Mostrar notificación al colaborador
      const mensaje = `📨 Nueva solicitud de canje de ${solicitud.usuario_nombre || 'usuario'}`;
      alert(mensaje);
      
      // Recargar transacciones si está en modo historial
      if (modo === 'historial') {
        cargarTransaccionesReales();
      }
    });

    // 📢 Escuchar solicitudes procesadas (aprobadas/rechazadas)
    newSocket.on('solicitud_procesada', (data) => {
      console.log('📢 [SOCKET] Solicitud procesada:', data);
      
      if (data.estado === 'aprobado') {
        alert(`✅ Solicitud #${data.solicitud_id} APROBADA`);
      } else if (data.estado === 'rechazado') {
        alert(`❌ Solicitud #${data.solicitud_id} RECHAZADA: ${data.motivo || 'Sin motivo'}`);
      }
      
      // Recargar transacciones si está en modo historial
      if (modo === 'historial') {
        cargarTransaccionesReales();
      }
    });

    // 📨 Escuchar notificaciones generales
    newSocket.on('nueva_notificacion', (notificacion) => {
      console.log('📨 [SOCKET] Nueva notificación general:', notificacion);
      // Puedes mostrar un toast o notificación en UI aquí
    });

    // 📢 Escuchar cuando un canje es procesado para un usuario específico
    newSocket.on('canje_procesado', (data) => {
      console.log('📢 [SOCKET] Canje procesado para usuario:', data);
      // Actualizar puntos del cliente si es el seleccionado
      if (clienteSeleccionado && clienteSeleccionado.id === data.user_id) {
        // Recargar datos del cliente
        cargarClientesReales();
        if (modo === 'historial') {
          cargarTransaccionesReales();
        }
      }
    });

    return () => {
      if (newSocket) {
        newSocket.off('connect');
        newSocket.off('connect_error');
        newSocket.off('config_puntos_actualizada');
        newSocket.off('puntos_usuario_actualizados');
        newSocket.off('nueva_solicitud_canje');
        newSocket.off('solicitud_procesada');
        newSocket.off('nueva_notificacion');
        newSocket.off('canje_procesado');
        newSocket.disconnect();
      }
    };
  }, [emprendimientoId, modo]); // Agregar modo como dependencia

  // ============================================
  // CARGAR DATOS DESDE API CON AUTENTICACIÓN
  // ============================================
  useEffect(() => {
    if (emprendimientoId && verificarToken()) {
      cargarClientesReales();
      cargarTransaccionesReales();
      cargarConfigPuntos();
    } else {
      console.log('⏳ Esperando emprendimientoId...');
      setCargando(false);
    }
  }, [emprendimientoId]);

  // Filtrar clientes cuando cambia la búsqueda
  useEffect(() => {
    if (busqueda.trim().length >= 1) {
      const filtrados = clientes.filter(c => 
        c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.codigo && c.codigo.toLowerCase().includes(busqueda.toLowerCase())) ||
        (c.telefono && c.telefono.includes(busqueda)) ||
        (c.email && c.email.toLowerCase().includes(busqueda.toLowerCase()))
      );
      setClientesFiltrados(filtrados);
      setMostrarSugerencias(true);
    } else {
      setClientesFiltrados([]);
      setMostrarSugerencias(false);
    }
  }, [busqueda, clientes]);

  // Buscar productos cuando cambia la búsqueda
  useEffect(() => {
    if (busquedaProducto.trim().length >= 2 && emprendimientoId && verificarToken()) {
      const delayDebounce = setTimeout(() => {
        buscarProductos(busquedaProducto);
      }, 500);
      return () => clearTimeout(delayDebounce);
    } else {
      setProductosFiltrados([]);
      setMostrarSugerenciasProducto(false);
    }
  }, [busquedaProducto, emprendimientoId]);

  // ✅ Buscar productos en API (URL relativa)
  const buscarProductos = async (query) => {
    if (!query || query.length < 2 || !verificarToken()) return;
    
    setCargandoProductos(true);
    try {
      const response = await fetch(
        `/api/colab/puntos/productos/buscar?emprendimiento_id=${emprendimientoId}&query=${encodeURIComponent(query)}`,
        { headers: getAuthHeaders() }
      );
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.productos) {
        setProductosFiltrados(data.productos);
        setMostrarSugerenciasProducto(true);
      } else {
        setProductosFiltrados([]);
        setMostrarSugerenciasProducto(false);
      }
    } catch (error) {
      console.error('Error buscando productos:', error);
      setProductosFiltrados([]);
    } finally {
      setCargandoProductos(false);
    }
  };

  // Seleccionar producto
  const seleccionarProducto = (producto) => {
    setProductoSeleccionado(producto);
    setMontoProducto(producto.precio_venta.toString());
    setMotivo(`${producto.nombre} - ${producto.codigo}`);
    setBusquedaProducto('');
    setMostrarSugerenciasProducto(false);
    
    if (tipoPago === 'solo_puntos') {
      const puntosNecesarios = Math.ceil(producto.precio_venta / valorPunto);
      setPuntosACanjear(puntosNecesarios.toString());
    }
  };

  // Limpiar producto seleccionado
  const limpiarProductoSeleccionado = () => {
    setProductoSeleccionado(null);
    setMontoProducto('');
    setMotivo('');
    setPuntosACanjear('');
    setErrorPuntos('');
  };

  // ✅ Cargar clientes desde API (URL relativa)
  const cargarClientesReales = async () => {
    if (!verificarToken()) return;
    
    try {
      const response = await fetch(`/api/colab/puntos/usuarios/rol/usuario`, {
        headers: getAuthHeaders()
      });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.usuarios && data.usuarios.length > 0) {
        const clientesConPuntos = await Promise.all(data.usuarios.map(async (u) => {
          try {
            const puntosResponse = await fetch(`/api/colab/puntos/usuarios/${u.id}/puntos`, {
              headers: getAuthHeaders()
            });
            const puntosData = await puntosResponse.json();
            
            return {
              id: u.id,
              codigo: `CLI-${u.id.toString().padStart(4, '0')}`,
              nombre: u.usuario || 'Sin nombre',
              telefono: u.telefono || 'No registrado',
              email: u.email || '',
              direccion: u.direccion || '',
              puntos: puntosData?.puntos || 0,
              nivel: calcularNivel(puntosData?.puntos || 0),
              avatar: obtenerAvatar(puntosData?.puntos || 0),
              totalGastado: 0,
              ultimaVisita: new Date().toISOString().split('T')[0],
              activo: u.activo === 1
            };
          } catch (error) {
            console.error(`Error cargando puntos del usuario ${u.id}:`, error);
            return {
              id: u.id,
              codigo: `CLI-${u.id.toString().padStart(4, '0')}`,
              nombre: u.usuario || 'Sin nombre',
              telefono: u.telefono || 'No registrado',
              email: u.email || '',
              direccion: u.direccion || '',
              puntos: 0,
              nivel: 'Regular',
              avatar: '👤',
              totalGastado: 0,
              ultimaVisita: new Date().toISOString().split('T')[0],
              activo: u.activo === 1
            };
          }
        }));
        setClientes(clientesConPuntos);
      } else {
        setClientes([]);
        console.log('No se encontraron usuarios con rol "usuario"');
      }
    } catch (error) {
      console.error('Error cargando clientes:', error);
      setClientes([]);
    }
  };

  // ✅ Cargar transacciones desde API (URL relativa)
  const cargarTransaccionesReales = async () => {
    if (!verificarToken()) return;
    
    try {
      const url = `/api/colab/puntos/transacciones/emprendimiento/${emprendimientoId}`;
      
      const response = await fetch(url, { headers: getAuthHeaders() });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.transacciones && data.transacciones.length > 0) {
        const transaccionesFormateadas = data.transacciones.map(t => ({
          id: t.id,
          clienteId: t.user_id,
          clienteNombre: t.cliente_nombre || `Cliente ${t.user_id}`,
          tipo: t.tipo,
          puntos: t.puntos || 0,
          monto: t.monto_equivalente || 0,
          fecha: t.fecha || new Date().toISOString(),
          referencia: t.referencia || 'N/A',
          estado: t.estado || 'completado',
          detalles: t.detalles
        }));
        setTransacciones(transaccionesFormateadas);
      } else {
        setTransacciones([]);
        console.log('No se encontraron transacciones');
      }
    } catch (error) {
      console.error('Error cargando transacciones:', error);
      setTransacciones([]);
    } finally {
      setCargando(false);
    }
  };

  // ✅ Cargar configuración de puntos (URL relativa)
  const cargarConfigPuntos = async () => {
    if (!verificarToken()) return;
    
    try {
      const response = await fetch(`/api/colab/puntos/config-puntos`, {
        headers: getAuthHeaders()
      });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.config) {
        if (data.config.valor_punto) {
          setValorPunto(data.config.valor_punto);
          console.log('💰 Valor del punto cargado:', data.config.valor_punto);
        }
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
    }
  };

  // Calcular nivel según puntos
  const calcularNivel = (puntos) => {
    const pts = puntos || 0;
    if (pts >= 10000) return 'Diamante';
    if (pts >= 5000) return 'Oro';
    if (pts >= 2000) return 'Plata';
    if (pts >= 500) return 'Bronce';
    return 'Regular';
  };

  // Obtener avatar según nivel
  const obtenerAvatar = (puntos) => {
    const pts = puntos || 0;
    if (pts >= 10000) return '👑';
    if (pts >= 5000) return '💎';
    if (pts >= 2000) return '⭐';
    if (pts >= 500) return '🌟';
    return '👤';
  };

  // ✅ Seleccionar cliente de las sugerencias (URL relativa)
  const seleccionarCliente = async (cliente) => {
    if (!verificarToken()) return;
    
    try {
      const response = await fetch(`/api/colab/puntos/usuarios/${cliente.id}/puntos`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          cliente.puntos = data.puntos || 0;
          cliente.nivel = calcularNivel(data.puntos || 0);
        }
      }
    } catch (error) {
      console.error('Error actualizando puntos:', error);
    }
    
    setClienteSeleccionado(cliente);
    setBusqueda('');
    setMostrarSugerencias(false);
    setPuntosACanjear('');
    setMontoProducto('');
    setMotivo('');
    setMontoRecibido('');
    setTipoPago('mixto');
    setErrorPuntos('');
    setProductoSeleccionado(null);
    setBusquedaProducto('');
  };

  // Manejar búsqueda manual
  const manejarBusqueda = async () => {
    if (!busqueda.trim()) {
      alert('Por favor ingresa un código, nombre o teléfono');
      return;
    }
    
    const cliente = clientes.find(c => 
      c.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.codigo && c.codigo.toLowerCase().includes(busqueda.toLowerCase())) ||
      (c.telefono && c.telefono.includes(busqueda))
    );
    
    if (cliente) {
      await seleccionarCliente(cliente);
    } else {
      alert('❌ Cliente no encontrado');
    }
  };

  // Manejar búsqueda en tiempo real
  const manejarBusquedaEnTiempoReal = (e) => {
    const valor = e.target.value;
    setBusqueda(valor);
  };

  // Manejar tecla Enter
  const manejarKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (clientesFiltrados.length > 0) {
        seleccionarCliente(clientesFiltrados[0]);
      } else {
        manejarBusqueda();
      }
    }
  };

  // Calcular equivalente en dólares usando valor_punto dinámico
  const puntosADinero = (puntos) => {
    const pts = parseInt(puntos) || 0;
    return pts * valorPunto;
  };

  // Calcular puntos necesarios para cubrir un monto
  const dineroAPuntos = (monto) => {
    const montoNum = parseFloat(monto) || 0;
    return Math.ceil(montoNum / valorPunto);
  };

  // Calcular total a pagar en efectivo
  const calcularTotalEfectivo = () => {
    if (tipoPago === 'solo_puntos') return 0;
    if (!montoProducto || !puntosACanjear) return 0;
    const montoTotal = parseFloat(montoProducto) || 0;
    const valorPuntos = puntosADinero(parseInt(puntosACanjear) || 0);
    return Math.max(0, montoTotal - valorPuntos);
  };

  // Calcular vuelto
  const calcularVuelto = () => {
    if (tipoPago === 'solo_puntos') return 0;
    const totalEfectivo = calcularTotalEfectivo();
    const recibido = parseFloat(montoRecibido) || 0;
    return Math.max(0, recibido - totalEfectivo);
  };

  // Validar si el monto recibido es suficiente
  const esMontoSuficiente = () => {
    if (tipoPago === 'solo_puntos') return true;
    const totalEfectivo = calcularTotalEfectivo();
    const recibido = parseFloat(montoRecibido) || 0;
    return recibido >= totalEfectivo;
  };

  // Calcular cuánto falta para completar el pago
  const calcularFaltante = () => {
    if (tipoPago !== 'mixto') return 0;
    const totalEfectivo = calcularTotalEfectivo();
    const recibido = parseFloat(montoRecibido) || 0;
    return Math.max(0, totalEfectivo - recibido);
  };

  // Calcular puntos restantes después del canje
  const calcularPuntosRestantes = () => {
    if (tipoPago !== 'solo_puntos') return 0;
    const puntosActuales = clienteSeleccionado?.puntos || 0;
    const puntosUsados = parseInt(puntosACanjear) || 0;
    return Math.max(0, puntosActuales - puntosUsados);
  };

  // Calcular si los puntos son suficientes
  const puntosSuficientes = () => {
    if (tipoPago !== 'solo_puntos') return true;
    const puntosActuales = clienteSeleccionado?.puntos || 0;
    const puntosUsados = parseInt(puntosACanjear) || 0;
    return puntosUsados <= puntosActuales;
  };

  // Manejar cambio de puntos a canjear
  const manejarCambioPuntos = (e) => {
    const valor = e.target.value;
    const puntosMaximos = clienteSeleccionado?.puntos || 0;
    
    if (valor === '') {
      setPuntosACanjear('');
      setErrorPuntos('');
      return;
    }
    
    const puntos = parseInt(valor);
    
    if (puntos > puntosMaximos) {
      setErrorPuntos(`⚠️ El cliente solo tiene ${puntosMaximos.toLocaleString()} puntos disponibles`);
      setPuntosACanjear(valor);
    } else {
      setErrorPuntos('');
      setPuntosACanjear(valor);
    }
  };

  // Validar formulario
  const validarFormulario = (puntos, montoTotal, valorPuntos, recibido, totalEfectivo) => {
    if (!puntos || puntos <= 0) {
      alert('❌ Ingresa una cantidad válida de puntos a canjear');
      return false;
    }
    
    if (!motivo.trim()) {
      alert('❌ Ingresa un motivo para la transacción');
      return false;
    }
    
    if (puntos > (clienteSeleccionado?.puntos || 0)) {
      alert(`⚠️ El cliente solo tiene ${(clienteSeleccionado?.puntos || 0).toLocaleString()} puntos disponibles.`);
      return false;
    }
    
    if (tipoPago === 'mixto') {
      if (!montoProducto || parseFloat(montoProducto) <= 0) {
        alert('❌ Ingresa el monto total del producto');
        return false;
      }
      
      if (valorPuntos > montoTotal) {
        alert('❌ Los puntos no pueden exceder el monto del producto');
        return false;
      }
      
      if (!recibido || recibido <= 0) {
        alert('❌ Ingresa el monto recibido en efectivo');
        return false;
      }
      
      if (recibido < totalEfectivo) {
        alert(`❌ El efectivo recibido es insuficiente. Faltan USD $${(totalEfectivo - recibido).toFixed(2)}`);
        return false;
      }
    }
    
    return true;
  };

  // ✅ Procesar pago (URL relativa)
  const procesarPagoMixto = async () => {
    if (!verificarToken()) return;
    
    if (!clienteSeleccionado) {
      alert('❌ Primero selecciona un cliente');
      return;
    }
    
    const puntos = parseInt(puntosACanjear);
    const montoTotal = parseFloat(montoProducto) || 0;
    const valorPuntos = puntosADinero(puntos);
    const totalEfectivo = calcularTotalEfectivo();
    const recibido = parseFloat(montoRecibido) || 0;
    
    if (puntos > (clienteSeleccionado.puntos || 0)) {
      setErrorPuntos(`⚠️ El cliente solo tiene ${(clienteSeleccionado.puntos || 0).toLocaleString()} puntos disponibles`);
      return;
    }
    
    if (!validarFormulario(puntos, montoTotal, valorPuntos, recibido, totalEfectivo)) {
      return;
    }
    
    setProcesando(true);
    
    try {
      const requestBody = {
        user_id: clienteSeleccionado.id,
        emprendimiento_id: emprendimientoId,
        puntos_a_canjear: puntos,
        monto_descuento: valorPuntos,
        motivo: tipoPago === 'mixto' 
          ? `${motivo} (Pago mixto - Producto: USD $${montoTotal.toFixed(2)})`
          : `${motivo} (Solo canje de puntos)`,
        referencia: `${tipoPago === 'mixto' ? 'MIXTO' : 'SOLOPTS'}-${Date.now()}`,
        tipo_pago: tipoPago
      };
      
      if (tipoPago === 'mixto') {
        requestBody.monto_efectivo = totalEfectivo;
        if (productoSeleccionado) {
          requestBody.producto_id = productoSeleccionado.id;
          requestBody.producto_nombre = productoSeleccionado.nombre;
        }
      } else {
        if (productoSeleccionado) {
          requestBody.producto_id = productoSeleccionado.id;
          requestBody.producto_nombre = productoSeleccionado.nombre;
        }
      }
      
      const response = await fetch(`/api/colab/puntos/canjear-puntos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        const nuevaTransaccion = {
          id: data.data?.transaccion_id || Date.now(),
          clienteId: clienteSeleccionado.id,
          clienteNombre: clienteSeleccionado.nombre,
          tipo: TIPO_TRANSACCION.CANJE,
          puntos: -puntos,
          monto: tipoPago === 'mixto' ? totalEfectivo : 0,
          fecha: new Date().toISOString(),
          referencia: `${tipoPago === 'mixto' ? 'MIXTO' : 'SOLOPTS'}-${Date.now()}`,
          estado: 'pendiente'
        };
        
        setTransacciones([nuevaTransaccion, ...transacciones]);
        
        const clientesActualizados = clientes.map(c => 
          c.id === clienteSeleccionado.id 
            ? { 
                ...c, 
                puntos: data.data?.puntos_actuales || c.puntos,
                nivel: calcularNivel(data.data?.puntos_actuales || c.puntos),
                totalGastado: (c.totalGastado || 0) + (tipoPago === 'mixto' ? totalEfectivo : 0),
                ultimaVisita: new Date().toISOString().split('T')[0] 
              }
            : c
        );
        
        setClientes(clientesActualizados);
        setClienteSeleccionado({
          ...clienteSeleccionado, 
          puntos: data.data?.puntos_actuales || clienteSeleccionado.puntos,
          nivel: calcularNivel(data.data?.puntos_actuales || clienteSeleccionado.puntos),
          totalGastado: (clienteSeleccionado.totalGastado || 0) + (tipoPago === 'mixto' ? totalEfectivo : 0),
          ultimaVisita: new Date().toISOString().split('T')[0]
        });
        
        setPuntosACanjear('');
        setMontoProducto('');
        setMotivo('');
        setMontoRecibido('');
        setErrorPuntos('');
        setProductoSeleccionado(null);
        setBusquedaProducto('');
        
        let mensaje = '';
        if (tipoPago === 'mixto') {
          const vuelto = recibido - totalEfectivo;
          mensaje = `✅ Pago mixto completado:\n` +
                    `💰 Puntos canjeados: ${puntos} pts (USD $${valorPuntos.toFixed(2)})\n` +
                    `💵 Efectivo recibido: USD $${recibido.toFixed(2)}\n` +
                    `📦 Total producto: USD $${montoTotal.toFixed(2)}\n` +
                    `💲 Total a pagar en efectivo: USD $${totalEfectivo.toFixed(2)}`;
          if (vuelto > 0) {
            mensaje += `\n🔄 Vuelto: USD $${vuelto.toFixed(2)}`;
          }
        } else {
          mensaje = `✅ Canje de puntos completado:\n` +
                    `💰 Puntos canjeados: ${puntos} pts (USD $${valorPuntos.toFixed(2)})\n` +
                    `🎁 Concepto: ${motivo}`;
          if (productoSeleccionado) {
            mensaje += `\n📦 Producto: ${productoSeleccionado.nombre}`;
          }
        }
        
        alert(mensaje);
      } else {
        alert(`❌ Error: ${data.message}`);
      }
    } catch (error) {
      console.error('Error procesando pago:', error);
      alert('❌ Error al procesar el pago. Intenta nuevamente.');
    } finally {
      setProcesando(false);
    }
  };

  // Filtrar transacciones
  const transaccionesFiltradas = (transacciones || []).filter(t => {
    if (!t) return false;
    if (filtroTipo !== 'todas' && t.tipo !== filtroTipo) return false;
    
    if (fechaInicio) {
      const fechaTrans = new Date(t.fecha);
      const fechaInicioDate = new Date(fechaInicio);
      if (fechaTrans < fechaInicioDate) return false;
    }
    
    if (fechaFin) {
      const fechaTrans = new Date(t.fecha);
      const fechaFinDate = new Date(fechaFin);
      fechaFinDate.setHours(23, 59, 59, 999);
      if (fechaTrans > fechaFinDate) return false;
    }
    
    return true;
  });

  // Estadísticas
  const estadisticas = {
    puntosOtorgadosHoy: (transacciones || [])
      .filter(t => t && new Date(t.fecha).toDateString() === new Date().toDateString() && (t.puntos || 0) > 0)
      .reduce((sum, t) => sum + (t.puntos || 0), 0),
    puntosCanjeadosHoy: (transacciones || [])
      .filter(t => t && new Date(t.fecha).toDateString() === new Date().toDateString() && (t.puntos || 0) < 0)
      .reduce((sum, t) => sum + Math.abs(t.puntos || 0), 0),
    clientesAtendidosHoy: new Set(
      (transacciones || [])
        .filter(t => t && new Date(t.fecha).toDateString() === new Date().toDateString())
        .map(t => t.clienteId)
    ).size,
    montoTotalHoy: (transacciones || [])
      .filter(t => t && new Date(t.fecha).toDateString() === new Date().toDateString())
      .reduce((sum, t) => sum + (t.monto || 0), 0)
  };

  // Formatear fecha
  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Fecha inválida';
    }
  };

  // Obtener color según tipo de transacción
  const getTipoColor = (tipo) => {
    switch(tipo) {
      case TIPO_TRANSACCION.COMPRA: return '#10b981';
      case TIPO_TRANSACCION.CANJE: return '#3b82f6';
      case TIPO_TRANSACCION.AJUSTE: return '#f59e0b';
      case TIPO_TRANSACCION.BONIFICACION: return '#8b5cf6';
      case TIPO_TRANSACCION.TRANSFERENCIA: return '#ec4899';
      default: return '#6b7280';
    }
  };

  // Obtener icono según tipo
  const getTipoIcono = (tipo) => {
    switch(tipo) {
      case TIPO_TRANSACCION.COMPRA: return '🛒';
      case TIPO_TRANSACCION.CANJE: return '🎁';
      case TIPO_TRANSACCION.AJUSTE: return '⚡';
      case TIPO_TRANSACCION.BONIFICACION: return '🎯';
      case TIPO_TRANSACCION.TRANSFERENCIA: return '🔄';
      default: return '📄';
    }
  };

  // Obtener texto según tipo
  const getTipoTexto = (tipo) => {
    const textos = {
      [TIPO_TRANSACCION.COMPRA]: 'Compra',
      [TIPO_TRANSACCION.CANJE]: 'Canje',
      [TIPO_TRANSACCION.AJUSTE]: 'Ajuste',
      [TIPO_TRANSACCION.BONIFICACION]: 'Bonificación',
      [TIPO_TRANSACCION.TRANSFERENCIA]: 'Transferencia'
    };
    return textos[tipo] || tipo || 'Desconocido';
  };

  // Obtener color según nivel
  const getNivelColor = (nivel) => {
    switch(nivel) {
      case 'Diamante': return '#a78bfa';
      case 'Oro': return '#fbbf24';
      case 'Plata': return '#d1d5db';
      case 'Bronce': return '#f97316';
      default: return '#6b7280';
    }
  };

  // Exportar transacciones
  const exportarTransacciones = () => {
    if (transaccionesFiltradas.length === 0) {
      alert('No hay transacciones para exportar');
      return;
    }
    
    const csv = [
      ['Fecha', 'Cliente', 'Tipo', 'Puntos', 'Monto (USD)', 'Referencia', 'Estado'],
      ...transaccionesFiltradas.map(t => [
        formatearFecha(t.fecha),
        t.clienteNombre || 'N/A',
        getTipoTexto(t.tipo),
        t.puntos || 0,
        `USD $${((t.monto || 0)).toFixed(2)}`,
        t.referencia || 'N/A',
        t.estado || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones_puntos_${emprendimientoId || 'tienda'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    alert('✅ Transacciones exportadas exitosamente');
  };

  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando sistema de puntos...</p>
      </div>
    );
  }

  if (!emprendimientoId) {
    return (
      <div className={styles.cargandoContainer}>
        <p>No se encontró un emprendimiento asociado</p>
        <p className={styles.subtitulo}>Esperando información del negocio...</p>
      </div>
    );
  }

  return (
    <div className={styles.puntosContainer}>
      {/* Encabezado */}
      <div className={styles.encabezado}>
        <div className={styles.tituloSection}>
          <h1>
            <FaCoins className={styles.tituloIcono} />
            Gestión de Puntos LabPoints
          </h1>
          <p className={styles.subtitulo}>
            Busca clientes y gestiona sus puntos de fidelización
          </p>
        </div>
        
        <div className={styles.estadisticasHeader}>
          <div className={styles.estadisticaHeader}>
            <FaCoins className={styles.estadisticaIcono} />
            <div>
              <span className={styles.estadisticaValor}>
                {(estadisticas.puntosOtorgadosHoy || 0).toLocaleString()}
              </span>
              <span className={styles.estadisticaLabel}>Puntos hoy</span>
            </div>
          </div>
          
          <div className={styles.estadisticaHeader}>
            <FaUser className={styles.estadisticaIcono} />
            <div>
              <span className={styles.estadisticaValor}>
                {estadisticas.clientesAtendidosHoy || 0}
              </span>
              <span className={styles.estadisticaLabel}>Clientes hoy</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modos de operación */}
      <div className={styles.modosSection}>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            onClick={() => setModo('manual')}
            style={{
              padding: '12px 30px',
              background: modo === 'manual' ? '#3b82f6' : 'white',
              color: modo === 'manual' ? 'white' : '#374151',
              border: modo === 'manual' ? 'none' : '1px solid #d1d5db',
              borderRadius: '30px',
              fontWeight: '600',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.2s',
              boxShadow: modo === 'manual' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          >
            <FaSearch /> Gestión Manual
          </button>
          
          <button 
            onClick={() => setModo('historial')}
            style={{
              padding: '12px 30px',
              background: modo === 'historial' ? '#3b82f6' : 'white',
              color: modo === 'historial' ? 'white' : '#374151',
              border: modo === 'historial' ? 'none' : '1px solid #d1d5db',
              borderRadius: '30px',
              fontWeight: '600',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              transition: 'all 0.2s',
              boxShadow: modo === 'historial' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          >
            <FaHistory /> Historial
          </button>
        </div>
      </div>

      {/* Contenido según modo */}
      <div className={styles.contenidoPrincipal}>
        {/* MODO MANUAL */}
        {modo === 'manual' && (
          <div className={styles.manualSection}>
            <div style={{ maxWidth: '600px', margin: '0 auto', position: 'relative' }}>
              {/* Buscador con sugerencias */}
              <div className={styles.busquedaCard}>
                <h3>
                  <FaSearch className={styles.busquedaIcono} />
                  Buscar Cliente
                </h3>
                
                <div className={styles.busquedaInputGroup} style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={busqueda}
                    onChange={manejarBusquedaEnTiempoReal}
                    onKeyPress={manejarKeyPress}
                    onFocus={() => busqueda.trim().length >= 1 && setMostrarSugerencias(true)}
                    placeholder="Ingresa nombre, código o teléfono"
                    className={styles.busquedaInput}
                    ref={manualInputRef}
                    autoFocus
                  />
                  <button 
                    onClick={manejarBusqueda}
                    className={styles.btnBuscar}
                  >
                    <FaSearch /> Buscar
                  </button>
                  
                  {/* Sugerencias de clientes */}
                  {mostrarSugerencias && clientesFiltrados.length > 0 && (
                    <div 
                      ref={sugerenciasRef}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        marginTop: '4px'
                      }}
                    >
                      {clientesFiltrados.map(cliente => (
                        <div
                          key={cliente.id}
                          onClick={() => seleccionarCliente(cliente)}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f3f4f6',
                            transition: 'background 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: '#f3f4f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px'
                          }}>
                            {cliente.avatar || '👤'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', color: '#1f2937' }}>
                              {cliente.nombre || 'Sin nombre'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '12px', marginTop: '4px' }}>
                              <span>📱 {cliente.telefono || 'No registrado'}</span>
                              <span>⭐ {(cliente.puntos || 0).toLocaleString()} pts</span>
                            </div>
                          </div>
                          <div style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: getNivelColor(cliente.nivel),
                            color: 'white'
                          }}>
                            {cliente.nivel || 'Regular'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!busqueda && !clienteSeleccionado && clientes.length === 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '30px 20px', 
                    color: '#6b7280',
                    border: '1px dashed #d1d5db',
                    borderRadius: '8px',
                    marginTop: '20px'
                  }}>
                    <FaUser style={{ fontSize: '40px', color: '#d1d5db', marginBottom: '10px' }} />
                    <p>No hay clientes registrados. Los usuarios con rol "usuario" aparecerán aquí.</p>
                  </div>
                )}

                {!busqueda && !clienteSeleccionado && clientes.length > 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '30px 20px', 
                    color: '#6b7280',
                    border: '1px dashed #d1d5db',
                    borderRadius: '8px',
                    marginTop: '20px'
                  }}>
                    <FaUser style={{ fontSize: '40px', color: '#d1d5db', marginBottom: '10px' }} />
                    <p>Ingresa un nombre, código o teléfono para buscar un cliente</p>
                  </div>
                )}
              </div>

              {/* Información del cliente y pago mixto */}
              {clienteSeleccionado && (
                <>
                  {/* Información del cliente */}
                  <div className={styles.clienteCard} style={{ marginTop: '20px' }}>
                    <div className={styles.clienteHeader}>
                      <div className={styles.clienteAvatar}>
                        {clienteSeleccionado.avatar || '👤'}
                      </div>
                      <div className={styles.clienteInfo}>
                        <h3>{clienteSeleccionado.nombre || 'Sin nombre'}</h3>
                        <div className={styles.clienteMeta}>
                          <span 
                            className={styles.clienteNivel}
                            style={{ backgroundColor: getNivelColor(clienteSeleccionado.nivel) }}
                          >
                            {clienteSeleccionado.nivel || 'Regular'}
                          </span>
                          <span className={styles.clienteCodigo}>
                            {clienteSeleccionado.codigo || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className={styles.clienteEstadisticas}>
                      <div className={styles.estadisticaCliente}>
                        <span className={styles.estadisticaLabel}>Puntos actuales</span>
                        <span className={styles.estadisticaValor}>
                          {(clienteSeleccionado.puntos || 0).toLocaleString()} pts
                        </span>
                      </div>
                      
                      <div className={styles.estadisticaCliente}>
                        <span className={styles.estadisticaLabel}>Equivalente</span>
                        <span className={styles.estadisticaValor}>
                          USD ${puntosADinero(clienteSeleccionado.puntos || 0).toFixed(2)}
                        </span>
                      </div>
                      
                      <div className={styles.estadisticaCliente}>
                        <span className={styles.estadisticaLabel}>Última visita</span>
                        <span className={styles.estadisticaValor}>
                          {clienteSeleccionado.ultimaVisita ? new Date(clienteSeleccionado.ultimaVisita).toLocaleDateString('es-MX') : 'No registrada'}
                        </span>
                      </div>
                    </div>
                    
                    <div className={styles.clienteContacto}>
                      <span>📱 {clienteSeleccionado.telefono || 'No registrado'}</span>
                      {clienteSeleccionado.email && clienteSeleccionado.email !== 'temp_email' && clienteSeleccionado.email !== '' && 
                        <span>📧 {clienteSeleccionado.email}</span>
                      }
                    </div>
                  </div>

                  {/* Pago Mixto / Canje */}
                  <div className={styles.gestionCard} style={{ marginTop: '20px' }}>
                    <h3>
                      <FaMoneyBillWave className={styles.gestionIcono} />
                      Canje de Puntos
                    </h3>
                    
                    <div style={{ 
                      background: '#e0e7ff', 
                      padding: '8px 12px', 
                      borderRadius: '8px', 
                      marginBottom: '15px',
                      fontSize: '12px',
                      textAlign: 'center',
                      color: '#3730a3'
                    }}>
                      💰 1 punto = ${valorPunto} USD
                    </div>
                    
                    {/* Selector de tipo de pago */}
                    <div className={styles.tipoPagoSelector} style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600', color: '#374151' }}>
                        <FaExchangeAlt style={{ marginRight: '8px' }} />
                        Tipo de operación:
                      </label>
                      <div style={{ display: 'flex', gap: '15px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setTipoPago('mixto');
                            setMontoProducto('');
                            setMontoRecibido('');
                            setErrorPuntos('');
                            setProductoSeleccionado(null);
                            setBusquedaProducto('');
                          }}
                          style={{
                            flex: 1,
                            padding: '12px',
                            background: tipoPago === 'mixto' ? '#3b82f6' : '#f3f4f6',
                            color: tipoPago === 'mixto' ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          💰 Pago Mixto (Puntos + Efectivo)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTipoPago('solo_puntos');
                            setMontoProducto('');
                            setMontoRecibido('');
                            setErrorPuntos('');
                            setProductoSeleccionado(null);
                            setBusquedaProducto('');
                          }}
                          style={{
                            flex: 1,
                            padding: '12px',
                            background: tipoPago === 'solo_puntos' ? '#10b981' : '#f3f4f6',
                            color: tipoPago === 'solo_puntos' ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                          }}
                        >
                          🎁 Solo Canje de Puntos
                        </button>
                      </div>
                    </div>
                    
                    <div className={styles.pagoMixtoContainer}>
                      {/* BUSCADOR DE PRODUCTOS */}
                      <div className={styles.inputGroup}>
                        <label>
                          <FaBoxOpen style={{ marginRight: '8px' }} />
                          Buscar Producto
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={busquedaProducto}
                            onChange={(e) => setBusquedaProducto(e.target.value)}
                            onFocus={() => busquedaProducto.trim().length >= 2 && setMostrarSugerenciasProducto(true)}
                            placeholder="Buscar por nombre o código..."
                            className={styles.busquedaInput}
                            ref={productoInputRef}
                            disabled={!!productoSeleccionado}
                          />
                          {cargandoProductos && (
                            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                              <div className={styles.spinnerSmall}></div>
                            </div>
                          )}
                          
                          {/* Sugerencias de productos */}
                          {mostrarSugerenciasProducto && productosFiltrados.length > 0 && (
                            <div 
                              ref={sugerenciasProductoRef}
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'white',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                maxHeight: '250px',
                                overflowY: 'auto',
                                zIndex: 1000,
                                marginTop: '4px'
                              }}
                            >
                              {productosFiltrados.map(producto => (
                                <div
                                  key={producto.id}
                                  onClick={() => seleccionarProducto(producto)}
                                  style={{
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f3f4f6',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                  <div style={{ fontWeight: '600', color: '#1f2937' }}>
                                    {producto.nombre}
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '12px', marginTop: '4px' }}>
                                    <span>📦 Código: {producto.codigo}</span>
                                    <span>💰 USD ${producto.precio_venta}</span>
                                    <span>📊 Stock: {producto.stock}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Producto seleccionado */}
                      {productoSeleccionado && (
                        <div style={{
                          background: '#e0e7ff',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          marginBottom: '15px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <strong>✅ Producto seleccionado:</strong> {productoSeleccionado.nombre}
                            <div style={{ fontSize: '12px', color: '#4b5563' }}>
                              Código: {productoSeleccionado.codigo} | Precio: ${productoSeleccionado.precio_venta}
                            </div>
                          </div>
                          <button
                            onClick={limpiarProductoSeleccionado}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '24px',
                              height: '24px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <FaTimes size={12} />
                          </button>
                        </div>
                      )}

                      {/* Monto del Producto - SOLO para pago mixto */}
                      {tipoPago === 'mixto' && (
                        <div className={styles.inputGroup}>
                          <label>Monto del Producto (USD)</label>
                          <input
                            type="number"
                            value={montoProducto}
                            onChange={(e) => setMontoProducto(e.target.value)}
                            placeholder="Ej: 20.00"
                            className={styles.inputMonto}
                            step="0.01"
                            min="0"
                            disabled={!!productoSeleccionado}
                          />
                        </div>
                      )}
                      
                      {/* Puntos a canjear con validación */}
                      <div className={styles.inputGroup}>
                        <label>Puntos a Canjear</label>
                        <input
                          type="number"
                          value={puntosACanjear}
                          onChange={manejarCambioPuntos}
                          placeholder={tipoPago === 'mixto' ? "Ej: 10000" : "Puntos necesarios"}
                          className={styles.inputPuntos}
                          min="1"
                          max={clienteSeleccionado?.puntos || 0}
                        />
                        {puntosACanjear > 0 && !errorPuntos && (
                          <span className={styles.equivalenteTexto}>
                            = USD ${puntosADinero(parseInt(puntosACanjear)).toFixed(2)}
                          </span>
                        )}
                        {errorPuntos && (
                          <span style={{ 
                            color: '#dc2626', 
                            fontSize: '12px', 
                            marginTop: '4px', 
                            display: 'block',
                            fontWeight: '500'
                          }}>
                            {errorPuntos}
                          </span>
                        )}
                        {clienteSeleccionado && !errorPuntos && (
                          <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                            💡 Máximo disponible: {(clienteSeleccionado.puntos || 0).toLocaleString()} pts
                          </span>
                        )}
                      </div>

                      {/* Efectivo Recibido - solo para pago mixto */}
                      {tipoPago === 'mixto' && (
                        <div className={styles.inputGroup}>
                          <label>Efectivo Recibido (USD)</label>
                          {!esMontoSuficiente() && calcularFaltante() > 0 && (
                            <span style={{ 
                              fontSize: '12px', 
                              color: '#6b7280', 
                              marginBottom: '4px', 
                              display: 'block',
                              fontWeight: '500'
                            }}>
                              💡 Faltan USD ${calcularFaltante().toFixed(2)} para completar el pago
                            </span>
                          )}
                          <input
                            type="number"
                            value={montoRecibido}
                            onChange={(e) => setMontoRecibido(e.target.value)}
                            placeholder="Ej: 20.00"
                            className={styles.inputMonto}
                            step="0.01"
                            min="0"
                          />
                        </div>
                      )}
                      
                      {/* Motivo */}
                      <div className={styles.inputGroup}>
                        <label>Motivo / Concepto</label>
                        <input
                          type="text"
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder={tipoPago === 'mixto' ? "Ej: Camisa, Pantalón, etc." : "Ej: Canje por descuento, Producto gratis, etc."}
                          className={styles.inputMotivo}
                        />
                      </div>
                      
                      {/* Resumen del pago - solo para pago mixto */}
                      {tipoPago === 'mixto' && puntosACanjear > 0 && montoProducto > 0 && montoRecibido > 0 && !errorPuntos && (
                        <div className={styles.resumenPago}>
                          <h4>Resumen del Pago:</h4>
                          <div className={styles.resumenItem}>
                            <span>Monto total producto:</span>
                            <span>USD ${parseFloat(montoProducto).toFixed(2)}</span>
                          </div>
                          <div className={styles.resumenItem}>
                            <span>Valor de puntos:</span>
                            <span className={styles.valorPositivo}>
                              -USD ${puntosADinero(parseInt(puntosACanjear)).toFixed(2)}
                            </span>
                          </div>
                          <div className={styles.resumenItem}>
                            <span>Total a pagar en efectivo:</span>
                            <span className={styles.valorTotal}>
                              USD ${calcularTotalEfectivo().toFixed(2)}
                            </span>
                          </div>
                          <div className={styles.resumenItem}>
                            <span>Efectivo recibido:</span>
                            <span>USD ${parseFloat(montoRecibido).toFixed(2)}</span>
                          </div>
                          {calcularVuelto() > 0 && (
                            <div className={`${styles.resumenItem} ${styles.resumenVuelto}`}>
                              <span>Vuelto:</span>
                              <span className={styles.valorVuelto}>
                                USD ${calcularVuelto().toFixed(2)}
                              </span>
                            </div>
                          )}
                          {!esMontoSuficiente() && (
                            <div className={styles.errorMensaje}>
                              ⚠️ Efectivo insuficiente. Faltan USD ${(calcularTotalEfectivo() - parseFloat(montoRecibido)).toFixed(2)}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Resumen para solo puntos */}
                      {tipoPago === 'solo_puntos' && puntosACanjear > 0 && !errorPuntos && (
                        <div className={styles.resumenPago} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                          <h4 style={{ color: '#166534' }}>Resumen del Canje:</h4>
                          {productoSeleccionado && (
                            <div className={styles.resumenItem}>
                              <span>Producto:</span>
                              <span>{productoSeleccionado.nombre}</span>
                            </div>
                          )}
                          <div className={styles.resumenItem}>
                            <span>Puntos a canjear:</span>
                            <span className={styles.valorTotal}>{parseInt(puntosACanjear).toLocaleString()} pts</span>
                          </div>
                          <div className={styles.resumenItem}>
                            <span>Valor equivalente:</span>
                            <span className={styles.valorTotal}>USD ${puntosADinero(parseInt(puntosACanjear)).toFixed(2)}</span>
                          </div>
                          {productoSeleccionado && (
                            <div className={styles.resumenItem}>
                              <span>Precio del producto:</span>
                              <span>USD ${parseFloat(montoProducto).toFixed(2)}</span>
                            </div>
                          )}
                          <div className={styles.resumenItem}>
                            <span>Puntos restantes:</span>
                            <span className={calcularPuntosRestantes() > 0 ? styles.valorPositivo : styles.valorNegativo}>
                              {calcularPuntosRestantes().toLocaleString()} pts
                            </span>
                          </div>
                          <div className={styles.resumenItem}>
                            <span>Concepto:</span>
                            <span>{motivo || 'No especificado'}</span>
                          </div>
                          <div style={{ marginTop: '10px', padding: '8px', background: '#dcfce7', borderRadius: '6px', fontSize: '12px', color: '#166534' }}>
                            💡 Nota: El cliente recibirá {productoSeleccionado ? `el producto "${productoSeleccionado.nombre}"` : `un descuento de USD ${puntosADinero(parseInt(puntosACanjear)).toFixed(2)}`} a cambio de sus puntos.
                          </div>
                        </div>
                      )}
                      
                      <button 
                        onClick={procesarPagoMixto}
                        className={styles.btnPagar}
                        disabled={
                          procesando ||
                          !puntosACanjear || 
                          !motivo ||
                          !!errorPuntos ||
                          (tipoPago === 'mixto' && (
                            !montoProducto ||
                            !montoRecibido ||
                            parseInt(puntosACanjear) > (clienteSeleccionado?.puntos || 0) ||
                            puntosADinero(parseInt(puntosACanjear)) > parseFloat(montoProducto) ||
                            !esMontoSuficiente()
                          )) ||
                          (tipoPago === 'solo_puntos' && (
                            parseInt(puntosACanjear) > (clienteSeleccionado?.puntos || 0)
                          ))
                        }
                      >
                        <FaCheckCircle /> {procesando ? 'Procesando...' : (tipoPago === 'mixto' ? 'Procesar Pago Mixto' : 'Procesar Canje de Puntos')}
                      </button>
                    </div>
                    
                    {/* Acciones adicionales */}
                    <div className={styles.accionesAdicionales}>
                      <button className={styles.btnAdicional}>
                        <FaPrint /> Imprimir Comprobante
                      </button>
                      <button 
                        className={styles.btnAdicional}
                        onClick={() => setModo('historial')}
                      >
                        <FaHistory /> Ver Historial
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modo: Historial de transacciones */}
        {modo === 'historial' && (
          <div className={styles.historialSection}>
            <div className={styles.historialHeader}>
              <h3>
                <FaHistory className={styles.historialIcono} />
                Historial de Transacciones
              </h3>
              
              <div className={styles.historialAcciones}>
                <button 
                  onClick={exportarTransacciones}
                  className={styles.btnExportar}
                  disabled={transacciones.length === 0}
                >
                  <FaDownload /> Exportar CSV
                </button>
              </div>
            </div>
            
            {/* Filtros */}
            <div className={styles.filtrosSection}>
              <div className={styles.filtrosGrid}>
                <div className={styles.filtroGrupo}>
                  <label htmlFor="tipo">
                    <FaFilter className={styles.filtroIcono} />
                    Tipo de transacción
                  </label>
                  <select
                    id="tipo"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value)}
                    className={styles.filtroSelect}
                  >
                    <option value="todas">Todas las transacciones</option>
                    <option value={TIPO_TRANSACCION.COMPRA}>Compras</option>
                    <option value={TIPO_TRANSACCION.CANJE}>Canjes</option>
                    <option value={TIPO_TRANSACCION.AJUSTE}>Ajustes</option>
                    <option value={TIPO_TRANSACCION.BONIFICACION}>Bonificaciones</option>
                  </select>
                </div>
                
                <div className={styles.filtroGrupo}>
                  <label htmlFor="fechaInicio">
                    <FaClock className={styles.filtroIcono} />
                    Fecha inicio
                  </label>
                  <input
                    id="fechaInicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className={styles.filtroInput}
                  />
                </div>
                
                <div className={styles.filtroGrupo}>
                  <label htmlFor="fechaFin">
                    <FaClock className={styles.filtroIcono} />
                    Fecha fin
                  </label>
                  <input
                    id="fechaFin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className={styles.filtroInput}
                  />
                </div>
              </div>
              
              <div className={styles.contadorResultados}>
                Mostrando {transaccionesFiltradas.length} de {transacciones.length} transacciones
              </div>
            </div>
            
            {/* Tabla de transacciones */}
            <div className={styles.tablaSection}>
              {transaccionesFiltradas.length === 0 ? (
                <div className={styles.sinTransacciones}>
                  <FaHistory className={styles.sinIcono} />
                  <h4>No hay transacciones</h4>
                  <p>No se encontraron transacciones con los filtros aplicados</p>
                </div>
              ) : (
                <div className={styles.tablaContainer}>
                  <table className={styles.tablaTransacciones}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Tipo</th>
                        <th>Puntos</th>
                        <th>Monto (USD)</th>
                        <th>Referencia</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transaccionesFiltradas.map(transaccion => (
                        <tr key={transaccion.id} className={styles.filaTransaccion}>
                          <td className={styles.fechaCell}>
                            {formatearFecha(transaccion.fecha)}
                            </td>
                          <td className={styles.clienteCell}>
                            {transaccion.clienteNombre || 'N/A'}
                            </td>
                          <td>
                            <div className={styles.tipoCell}>
                              <span 
                                className={styles.tipoIcono}
                                style={{ color: getTipoColor(transaccion.tipo) }}
                              >
                                {getTipoIcono(transaccion.tipo)}
                              </span>
                              <span>{getTipoTexto(transaccion.tipo)}</span>
                            </div>
                            </td>
                          <td className={styles.puntosCell}>
                            <span className={(transaccion.puntos || 0) >= 0 ? styles.puntosPositivos : styles.puntosNegativos}>
                              {(transaccion.puntos || 0) >= 0 ? '+' : ''}{(transaccion.puntos || 0)}
                            </span>
                            </td>
                          <td className={styles.montoCell}>
                            {(transaccion.monto || 0) > 0 ? `USD $${(transaccion.monto || 0).toFixed(2)}` : '-'}
                            </td>
                          <td className={styles.referenciaCell}>
                            {transaccion.referencia || 'N/A'}
                            </td>
                          <td>
                            <span className={styles.estadoBadge}>
                              {transaccion.estado || 'N/A'}
                            </span>
                            </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}