import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import io from 'socket.io-client';
import styles from '../../assets/css/colab/factu.module.css';
import {
  FaFileInvoiceDollar,
  FaShoppingCart,
  FaPrint,
  FaSearch,
  FaPlus,
  FaTrash,
  FaSave,
  FaMoneyBillWave,
  FaExchangeAlt,
  FaReceipt,
  FaHistory,
  FaUser,
  FaFileExport,
  FaTimes,
  FaCrown,
  FaTable,
  FaUtensils,
  FaCheckCircle,
  FaArrowRight,
  FaEye,
  FaEnvelope,
  FaFilePdf,
  FaSpinner,
  FaCheck,
  FaExclamationCircle,
  FaGift,
  FaTag,
  FaPalette,
  FaRuler,
  FaBoxes
} from 'react-icons/fa';

// Función para parsear atributos JSON
const parseAtributos = (atributos) => {
  if (!atributos) return { talla: '', color: '', modelo: '', marca: '' };
  try {
    if (typeof atributos === 'string') {
      const parsed = JSON.parse(atributos);
      return {
        talla: parsed.talla || '',
        color: parsed.color || '',
        modelo: parsed.modelo || '',
        marca: parsed.marca || ''
      };
    }
    return {
      talla: atributos.talla || '',
      color: atributos.color || '',
      modelo: atributos.modelo || '',
      marca: atributos.marca || ''
    };
  } catch (e) {
    return { talla: '', color: '', modelo: '', marca: '' };
  }
};

const FacturacionColab = () => {
  // ============================================
  // RECIBIR DATOS DEL OUTLET CONTEXT
  // ============================================
  const { emprendimientoId, usuarioId } = useOutletContext();

  // Estados principales
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vistaActiva, setVistaActiva] = useState('nueva-factura');

  // Estado para datos del emprendimiento
  const [emprendimiento, setEmprendimiento] = useState(null);

  // Estados para mesas/comandas
  const [mesas, setMesas] = useState([]);
  const [mesaActiva, setMesaActiva] = useState(null);
  const [nuevaMesaNombre, setNuevaMesaNombre] = useState('');
  const [mostrarNuevaMesa, setMostrarNuevaMesa] = useState(false);
  const [nuevaMesaCliente, setNuevaMesaCliente] = useState(null);

  // Estados para nueva factura (principal)
  const [nuevaFactura, setNuevaFactura] = useState({
    cliente: '',
    tipo: 'venta',
    metodoPago: 'efectivo',
    referencia: '',
    items: [],
    subtotal: 0,
    impuesto: 0,
    total: 0,
    pagoRecibido: 0,
    vuelto: 0,
    estado: 'pendiente',
    comanda_id: null
  });

  // Estados para datos del cliente
  const [datosCliente, setDatosCliente] = useState({
    nombre: '',
    direccion: '',
    email: '',
    telefono: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  // Estados para formulario
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');

  // Estados para filtros
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroMetodoPago, setFiltroMetodoPago] = useState('todos');

  // Estados para modal de factura
  const [modalFacturaVisible, setModalFacturaVisible] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(false);

  // ============================================
  // ✅ NUEVOS ESTADOS PARA MODAL DE EMAIL
  // ============================================
  const [modalEmailVisible, setModalEmailVisible] = useState(false);
  const [emailCliente, setEmailCliente] = useState('');
  const [facturaEmailActual, setFacturaEmailActual] = useState(null);
  const [progresoEmail, setProgresoEmail] = useState(0);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [estadoEmail, setEstadoEmail] = useState('iniciando'); // iniciando, enviando, completado, error
  const [mensajeEmail, setMensajeEmail] = useState('');

  // Estado para configuración de puntos desde el backend
  const [configPuntos, setConfigPuntos] = useState({
    tasa_conversion: 10,
    valor_punto: 0.005,
    umbral_minimo: 0.99,
    puntos_fijos: 5,
    redondeo: 'floor'
  });

  // ============================================
  // ESTADOS PARA MODAL DE PROCESAMIENTO
  // ============================================
  const [modalProcesando, setModalProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [estadoProceso, setEstadoProceso] = useState('iniciando');
  const [mensajeProceso, setMensajeProceso] = useState('');
  const [resultadoProceso, setResultadoProceso] = useState(null);

  // ============================================
  // ESTADOS PARA SOCKET.IO
  // ============================================
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Refs
  const sugerenciasClienteRef = useRef(null);
  const nombreClienteInputRef = useRef(null);
  const sugerenciasProductoRef = useRef(null);
  const busquedaProductoInputRef = useRef(null);
  const modalContentRef = useRef(null);
  const iframeRef = useRef(null);

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

  // ============================================
  // FUNCIÓN PARA CALCULAR PUNTOS
  // ============================================
  const calcularPuntosPorMonto = (monto) => {
    if (monto < configPuntos.umbral_minimo) {
      return configPuntos.puntos_fijos;
    }

    let puntos = monto * configPuntos.tasa_conversion;

    switch (configPuntos.redondeo) {
      case 'floor':
        return Math.floor(puntos);
      case 'ceil':
        return Math.ceil(puntos);
      case 'round':
        return Math.round(puntos);
      default:
        return Math.floor(puntos);
    }
  };

  // ============================================
  // 🔥 FUNCIÓN PARA CALCULAR IVA EN TIEMPO REAL
  // ============================================
  const calcularIVA = (items) => {
    let impuestoTotal = 0;
    items.forEach(item => {
      const producto = productos.find(p => p.id === item.productoId);
      if (producto && producto.iva) {
        const ivaPorcentaje = parseFloat(producto.iva) || 0;
        const subtotalItem = item.precio * item.cantidad;
        impuestoTotal += subtotalItem * (ivaPorcentaje / 100);
      }
    });
    return Math.round(impuestoTotal * 100) / 100;
  };

  // ============================================
  // ✅ CARGAR DATOS DEL EMPRENDIMIENTO (URL relativa)
  // ============================================
  const cargarEmprendimiento = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(`/api/colab/emprendimiento/propietario/${usuarioId}`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success && data.emprendimiento) {
        setEmprendimiento(data.emprendimiento);
      }
    } catch (error) {
      console.error('Error cargando emprendimiento:', error);
    }
  };

  // ============================================
  // ✅ FUNCIONES API PARA COMANDAS (URLs relativas)
  // ============================================

  const cargarComandas = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(`/api/factu/comandas/emprendimiento/${emprendimientoId}`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        const comandasFormateadas = (data.comandas || []).map(comanda => ({
          id: comanda.id,
          emprendimiento_id: comanda.emprendimiento_id,
          nombre: comanda.nombre || 'Mesa',
          cliente: comanda.cliente_nombre || '',
          cliente_id: comanda.cliente_id,
          telefono: comanda.cliente_telefono || '',
          direccion: comanda.cliente_direccion || '',
          items: comanda.items || [],
          subtotal: parseFloat(comanda.subtotal) || 0,
          impuesto: parseFloat(comanda.impuesto) || 0,
          total: parseFloat(comanda.total) || 0,
          estado: comanda.estado || 'activa',
          createdAt: comanda.creada_en || new Date().toISOString()
        }));
        setMesas(comandasFormateadas);
        if (comandasFormateadas.length > 0 && !mesaActiva) {
          setMesaActiva(comandasFormateadas[0].id);
        }
      }
    } catch (error) {
      console.error('Error cargando comandas:', error);
    } finally {
      setCargando(false);
    }
  };

  const guardarComandaEnAPI = async (comanda) => {
    if (!verificarToken()) return null;

    try {
      const response = await fetch(`/api/factu/comandas`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          emprendimiento_id: comanda.emprendimiento_id,
          nombre: comanda.nombre,
          cliente_id: comanda.cliente_id || null,
          cliente_nombre: comanda.cliente || null,
          cliente_telefono: comanda.telefono || null,
          cliente_direccion: comanda.direccion || null,
          items: comanda.items || [],
          subtotal: comanda.subtotal || 0,
          impuesto: comanda.impuesto || 0,
          total: comanda.total || 0
        })
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return null;
      }

      const data = await response.json();
      if (data.success) {
        return data.id;
      }
    } catch (error) {
      console.error('Error guardando comanda:', error);
    }
    return null;
  };

  const actualizarComandaEnAPI = async (comandaId, comanda) => {
    if (!verificarToken()) return false;

    try {
      const response = await fetch(`/api/factu/comandas/${comandaId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          items: comanda.items || [],
          subtotal: comanda.subtotal || 0,
          impuesto: comanda.impuesto || 0,
          total: comanda.total || 0
        })
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return false;
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error actualizando comanda:', error);
      return false;
    }
  };

  const eliminarComandaEnAPI = async (comandaId) => {
    if (!verificarToken()) return false;

    try {
      const response = await fetch(`/api/factu/comandas/${comandaId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return false;
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error eliminando comanda:', error);
      return false;
    }
  };

  // ============================================
  // ✅ CARGAR DATOS DESDE API (URLs relativas)
  // ============================================

  const cargarConfigPuntos = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(`/api/factu/config-puntos`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success && data.config) {
        setConfigPuntos(data.config);
      }
    } catch (error) {
      console.error('Error cargando configuración de puntos:', error);
    }
  };

  const cargarProductos = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(`/api/factu/productos/emprendimiento/${emprendimientoId}`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        const productosParseados = (data.productos || []).map(p => {
          const { talla, color, modelo, marca } = parseAtributos(p.atributos);
          return {
            id: p.id,
            codigo: p.codigo || '',
            nombre: p.nombre || 'Producto',
            precio: p.precio_venta || 0,
            stock: p.stock || 0,
            categoria: p.categoria || 'General',
            costo: p.precio_compra || 0,
            iva: p.iva || 16,
            talla: talla,
            color: color,
            modelo: modelo,
            marca: marca,
            atributos: p.atributos
          };
        });
        setProductos(productosParseados);
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const cargarClientes = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(`/api/factu/usuarios/rol/usuario`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        const clientesParseados = (data.usuarios || []).map(u => ({
          id: u.id,
          codigo: `CLI-${String(u.id).padStart(3, '0')}`,
          nombre: u.usuario || 'Usuario',
          email: u.email || '',
          telefono: u.telefono || '',
          direccion: u.direccion || '',
          puntos: u.puntos || 0,
          tipo: 'regular'
        }));
        setClientes(clientesParseados);
      }
    } catch (error) {
      console.error('Error cargando clientes:', error);
    }
  };

  const cargarFacturas = async () => {
    if (!verificarToken()) return;

    try {
      const response = await fetch(`/api/factu/facturas/emprendimiento/${emprendimientoId}`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();
      if (data.success) {
        setFacturas(data.facturas || []);
      }
    } catch (error) {
      console.error('Error cargando facturas:', error);
      setFacturas([]);
    }
  };

  // ============================================
  // ✅ CONEXIÓN SOCKET.IO (URL relativa)
  // ============================================
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const newSocket = io({
      path: '/socket.io/',
      auth: { token },
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Conectado a Socket.IO');
      setIsSocketConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Desconectado de Socket.IO');
      setIsSocketConnected(false);
    });

    // ===== EVENTOS DE PRODUCTOS =====
    newSocket.on('producto_creado', (data) => {
      console.log('📡 Producto creado en tiempo real:', data);
      // Verificar que el producto pertenece a este emprendimiento
      if (data.emprendimiento_id === emprendimientoId) {
        const nuevoProducto = {
          id: data.producto_id,
          codigo: data.codigo || '',
          nombre: data.nombre || 'Producto',
          precio: data.precio_venta || 0,
          stock: data.stock || 0,
          categoria: data.categoria || 'General',
          costo: 0,
          iva: 16,
          talla: '',
          color: '',
          modelo: '',
          marca: ''
        };
        setProductos(prev => [...prev, nuevoProducto]);
      }
    });

    newSocket.on('producto_actualizado', (data) => {
      console.log('📡 Producto actualizado:', data);
      if (data.emprendimiento_id === emprendimientoId) {
        setProductos(prev => prev.map(p => 
          p.id === data.producto_id ? { ...p, ...data } : p
        ));
      }
    });

    newSocket.on('producto_eliminado', (data) => {
      console.log('📡 Producto eliminado:', data);
      if (data.emprendimiento_id === emprendimientoId) {
        setProductos(prev => prev.filter(p => p.id !== data.producto_id));
      }
    });

    newSocket.on('stock_actualizado', (data) => {
      console.log('📡 Stock actualizado:', data);
      if (data.emprendimiento_id === emprendimientoId) {
        setProductos(prev => prev.map(p => 
          p.id === data.producto_id ? { ...p, stock: data.stock_nuevo } : p
        ));
      }
    });

    // ===== EVENTOS DE FACTURAS =====
    newSocket.on('nueva_factura', (data) => {
      console.log('📡 Nueva factura en tiempo real:', data);
      // Verificar que la factura pertenece a este emprendimiento
      if (data.emprendimiento_id === emprendimientoId) {
        setFacturas(prev => [data, ...prev]);
      }
    });

    // ===== EVENTOS DE CONFIGURACIÓN =====
    newSocket.on('config_puntos_actualizada', (data) => {
      console.log('📡 Configuración de puntos actualizada:', data);
      setConfigPuntos(prev => ({
        ...prev,
        tasa_conversion: data.tasa_conversion || prev.tasa_conversion,
        valor_punto: data.valor_punto || prev.valor_punto,
        umbral_minimo: data.umbral_minimo || prev.umbral_minimo,
        puntos_fijos: data.puntos_fijos || prev.puntos_fijos,
        redondeo: data.redondeo || prev.redondeo
      }));
    });

    return () => {
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('producto_creado');
      newSocket.off('producto_actualizado');
      newSocket.off('producto_eliminado');
      newSocket.off('stock_actualizado');
      newSocket.off('nueva_factura');
      newSocket.off('config_puntos_actualizada');
      newSocket.disconnect();
    };
  }, [emprendimientoId]);

  // ============================================
  // EFECTO PRINCIPAL PARA CARGAR DATOS
  // ============================================
  useEffect(() => {
    const cargarDatos = async () => {
      setCargando(true);

      if (emprendimientoId && usuarioId && verificarToken()) {
        await Promise.all([
          cargarProductos(),
          cargarClientes(),
          cargarFacturas(),
          cargarComandas(),
          cargarConfigPuntos(),
          cargarEmprendimiento()
        ]);
      } else {
        console.log('⏳ Esperando emprendimientoId o usuarioId...');
        setCargando(false);
      }
    };

    cargarDatos();
  }, [emprendimientoId, usuarioId]);

  // ============================================
  // Calcular totales de mesa SIN IVA (el backend lo calcula)
  // ============================================
  const calcularTotalesMesa = (items) => {
    const subtotal = items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    return { subtotal, impuesto: 0, total: subtotal };
  };

  const agregarProductoAMesa = async (mesaId, producto, cantidadProducto) => {
    if (!producto) return;

    if (producto.stock < cantidadProducto) {
      alert(`❌ Stock insuficiente. Solo hay ${producto.stock} unidades disponibles de "${producto.nombre}"`);
      return;
    }

    const subtotal = producto.precio * cantidadProducto;
    const puntos = calcularPuntosPorMonto(subtotal);

    const nuevoItem = {
      id: Date.now(),
      productoId: producto.id,
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: cantidadProducto,
      subtotal,
      puntos,
      talla: producto.talla,
      color: producto.color,
      modelo: producto.modelo,
      marca: producto.marca
    };

    const mesaActualizada = mesas.find(m => m.id === mesaId);
    if (mesaActualizada) {
      const nuevosItems = [...mesaActualizada.items, nuevoItem];
      const { subtotal: nuevoSubtotal, impuesto: nuevoImpuesto, total: nuevoTotal } = calcularTotalesMesa(nuevosItems);

      const mesaActualizadaObj = {
        ...mesaActualizada,
        items: nuevosItems,
        subtotal: nuevoSubtotal,
        impuesto: nuevoImpuesto,
        total: nuevoTotal
      };

      setMesas(mesas.map(mesa => mesa.id === mesaId ? mesaActualizadaObj : mesa));
      await actualizarComandaEnAPI(mesaId, mesaActualizadaObj);
    }

    setProductoSeleccionado(null);
    setBusquedaProducto('');
    setCantidad(1);
  };

  const eliminarItemDeMesa = async (mesaId, itemId) => {
    const mesaActualizada = mesas.find(m => m.id === mesaId);
    if (mesaActualizada) {
      const nuevosItems = mesaActualizada.items.filter(item => item.id !== itemId);
      const { subtotal, impuesto, total } = calcularTotalesMesa(nuevosItems);

      const mesaActualizadaObj = {
        ...mesaActualizada,
        items: nuevosItems,
        subtotal,
        impuesto,
        total
      };

      setMesas(mesas.map(mesa => mesa.id === mesaId ? mesaActualizadaObj : mesa));
      await actualizarComandaEnAPI(mesaId, mesaActualizadaObj);
    }
  };

  const actualizarCantidadEnMesa = async (mesaId, itemId, nuevaCantidad) => {
    if (nuevaCantidad < 1) {
      eliminarItemDeMesa(mesaId, itemId);
      return;
    }

    const mesaActualizada = mesas.find(m => m.id === mesaId);
    if (mesaActualizada) {
      const nuevosItems = mesaActualizada.items.map(item => {
        if (item.id === itemId) {
          const producto = productos.find(p => p.id === item.productoId);
          if (producto && producto.stock < nuevaCantidad) {
            alert(`❌ Stock insuficiente. Solo hay ${producto.stock} unidades disponibles`);
            return item;
          }
          const subtotal = item.precio * nuevaCantidad;
          const puntos = calcularPuntosPorMonto(subtotal);
          return { ...item, cantidad: nuevaCantidad, subtotal, puntos };
        }
        return item;
      });

      const { subtotal, impuesto, total } = calcularTotalesMesa(nuevosItems);

      const mesaActualizadaObj = {
        ...mesaActualizada,
        items: nuevosItems,
        subtotal,
        impuesto,
        total
      };

      setMesas(mesas.map(mesa => mesa.id === mesaId ? mesaActualizadaObj : mesa));
      await actualizarComandaEnAPI(mesaId, mesaActualizadaObj);
    }
  };

  const crearNuevaMesa = async () => {
    if (!nuevaMesaNombre.trim()) {
      alert('Por favor ingresa un nombre para la mesa/comanda');
      return;
    }

    const nuevaMesa = {
      id: Date.now(),
      emprendimiento_id: emprendimientoId,
      nombre: nuevaMesaNombre,
      cliente: nuevaMesaCliente ? nuevaMesaCliente.nombre : '',
      cliente_id: nuevaMesaCliente ? nuevaMesaCliente.id : null,
      telefono: nuevaMesaCliente ? nuevaMesaCliente.telefono : '',
      direccion: nuevaMesaCliente ? nuevaMesaCliente.direccion : '',
      items: [],
      subtotal: 0,
      impuesto: 0,
      total: 0,
      estado: 'activa',
      createdAt: new Date().toISOString()
    };

    const idGuardado = await guardarComandaEnAPI(nuevaMesa);
    if (idGuardado) {
      nuevaMesa.id = idGuardado;
      setMesas([...mesas, nuevaMesa]);
      setMesaActiva(nuevaMesa.id);
    } else {
      setMesas([...mesas, nuevaMesa]);
      setMesaActiva(nuevaMesa.id);
    }

    setNuevaMesaNombre('');
    setNuevaMesaCliente(null);
    setBusquedaCliente('');
    setMostrarNuevaMesa(false);
  };

  const eliminarMesa = async (mesaId) => {
    if (window.confirm('¿Estás seguro de eliminar esta mesa/comanda? Los productos no guardados se perderán.')) {
      await eliminarComandaEnAPI(mesaId);
      const nuevasMesas = mesas.filter(mesa => mesa.id !== mesaId);
      setMesas(nuevasMesas);
      if (mesaActiva === mesaId && nuevasMesas.length > 0) {
        setMesaActiva(nuevasMesas[0].id);
      } else if (nuevasMesas.length === 0) {
        setMesaActiva(null);
      }
    }
  };

  const pasarMesaAFactura = async (mesa) => {
    if (mesa.items.length === 0) {
      alert('No hay productos en esta mesa/comanda');
      return;
    }

    let clienteCompleto = null;
    if (mesa.cliente_id) {
      clienteCompleto = clientes.find(c => c.id === mesa.cliente_id);
    }

    const impuestoCalculado = calcularIVA(mesa.items);
    const totalConIVA = mesa.subtotal + impuestoCalculado;

    setNuevaFactura({
      ...nuevaFactura,
      items: [...mesa.items],
      subtotal: mesa.subtotal,
      impuesto: impuestoCalculado,
      total: totalConIVA,
      comanda_id: mesa.id
    });

    if (clienteCompleto) {
      setDatosCliente({
        nombre: clienteCompleto.nombre,
        telefono: clienteCompleto.telefono || '',
        direccion: clienteCompleto.direccion || '',
        email: clienteCompleto.email || '',
        fecha: new Date().toISOString().split('T')[0]
      });
      setBusquedaCliente(clienteCompleto.nombre);
      setNuevaFactura(prev => ({ ...prev, cliente: clienteCompleto.nombre }));
    } else if (mesa.cliente) {
      setDatosCliente({
        nombre: mesa.cliente,
        telefono: mesa.telefono || '',
        direccion: mesa.direccion || '',
        email: datosCliente.email,
        fecha: new Date().toISOString().split('T')[0]
      });
      setBusquedaCliente(mesa.cliente);
      setNuevaFactura(prev => ({ ...prev, cliente: mesa.cliente }));
    }

    setVistaActiva('nueva-factura');
  };

  // ============================================
  // 🔥 CORRECCIÓN: Agregar producto a factura con IVA calculado en tiempo real
  // ============================================
  const agregarProductoAFactura = (e) => {
    if (e) e.preventDefault();

    if (!productoSeleccionado) {
      alert('Por favor, selecciona un producto primero');
      return;
    }

    if (cantidad < 1) {
      alert('La cantidad debe ser al menos 1');
      return;
    }

    if (productoSeleccionado.stock < cantidad) {
      alert(`❌ Stock insuficiente. Solo hay ${productoSeleccionado.stock} unidades disponibles`);
      return;
    }

    const subtotal = productoSeleccionado.precio * cantidad;
    const puntos = calcularPuntosPorMonto(subtotal);

    const nuevoItem = {
      id: Date.now(),
      productoId: productoSeleccionado.id,
      codigo: productoSeleccionado.codigo,
      nombre: productoSeleccionado.nombre,
      precio: productoSeleccionado.precio,
      cantidad,
      subtotal,
      puntos,
      talla: productoSeleccionado.talla,
      color: productoSeleccionado.color,
      modelo: productoSeleccionado.modelo,
      marca: productoSeleccionado.marca
    };

    const nuevosItems = [...nuevaFactura.items, nuevoItem];
    const subtotalTotal = nuevosItems.reduce((sum, item) => sum + item.subtotal, 0);

    const impuestoCalculado = calcularIVA(nuevosItems);
    const total = subtotalTotal + impuestoCalculado;

    setNuevaFactura({
      ...nuevaFactura,
      items: nuevosItems,
      subtotal: subtotalTotal,
      impuesto: impuestoCalculado,
      total
    });

    setProductoSeleccionado(null);
    setCantidad(1);
    setBusquedaProducto('');
  };

  const removerItem = (itemId) => {
    const nuevosItems = nuevaFactura.items.filter(item => item.id !== itemId);
    const subtotalTotal = nuevosItems.reduce((sum, item) => sum + item.subtotal, 0);

    const impuestoCalculado = calcularIVA(nuevosItems);
    const total = subtotalTotal + impuestoCalculado;

    setNuevaFactura({
      ...nuevaFactura,
      items: nuevosItems,
      subtotal: subtotalTotal,
      impuesto: impuestoCalculado,
      total
    });
  };

  const actualizarCantidad = (itemId, nuevaCantidad) => {
    if (nuevaCantidad < 1) {
      removerItem(itemId);
      return;
    }

    const nuevosItems = nuevaFactura.items.map(item => {
      if (item.id === itemId) {
        const producto = productos.find(p => p.id === item.productoId);
        if (producto && producto.stock < nuevaCantidad) {
          alert(`❌ Stock insuficiente. Solo hay ${producto.stock} unidades disponibles`);
          return item;
        }
        const subtotal = item.precio * nuevaCantidad;
        const puntos = calcularPuntosPorMonto(subtotal);
        return { ...item, cantidad: nuevaCantidad, subtotal, puntos };
      }
      return item;
    });

    const subtotalTotal = nuevosItems.reduce((sum, item) => sum + item.subtotal, 0);

    const impuestoCalculado = calcularIVA(nuevosItems);
    const total = subtotalTotal + impuestoCalculado;

    setNuevaFactura({
      ...nuevaFactura,
      items: nuevosItems,
      subtotal: subtotalTotal,
      impuesto: impuestoCalculado,
      total
    });
  };

  const generarNumeroFactura = () => {
    const ultimoNumero = facturas.length > 0
      ? Math.max(...facturas.map(f => parseInt(f.numero?.split('-')[2]) || 0))
      : 0;
    const año = new Date().getFullYear();
    return `FAC-${año}-${String(ultimoNumero + 1).padStart(3, '0')}`;
  };

  const calcularVuelto = (pagoRecibido) => {
    const vuelto = pagoRecibido - nuevaFactura.total;
    return vuelto >= 0 ? vuelto : 0;
  };

  // ✅ CORRECCIÓN: Ver PDF de la factura en modal usando blob URL para evitar X-Frame-Options (URL relativa)
  const verPDFFactura = async (factura) => {
    if (factura && factura.ruta_pdf) {
      setPdfError(false);
      setFacturaSeleccionada(factura);
      setModalFacturaVisible(true);

      let rutaLimpia = factura.ruta_pdf;
      if (rutaLimpia.startsWith('/')) {
        rutaLimpia = rutaLimpia.substring(1);
      }

      const pdfUrlCompleta = `/${rutaLimpia}`;

      try {
        const response = await fetch(pdfUrlCompleta, {
          headers: getAuthHeaders()
        });

        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          setPdfUrl(blobUrl);
        } else {
          setPdfError(true);
          console.error('Error fetching PDF:', response.status);
        }
      } catch (error) {
        console.error('Error cargando PDF:', error);
        setPdfError(true);
      }
    } else {
      alert('No hay PDF disponible para esta factura');
    }
  };

  // Limpiar blob URL cuando se cierra el modal
  useEffect(() => {
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // ============================================
  // 📧 NUEVA FUNCIÓN: Abrir modal para enviar email
  // ============================================
  const abrirModalEmail = (factura) => {
    const email = factura.cliente_email || factura.clienteEmail;
    if (!email) {
      alert('El cliente no tiene email registrado');
      return;
    }

    setFacturaEmailActual(factura);
    setEmailCliente(email);
    setModalEmailVisible(true);
    setEstadoEmail('iniciando');
    setProgresoEmail(0);
    setMensajeEmail('');
  };

  // ============================================
  // ✅ NUEVA FUNCIÓN: Enviar email con barra de progreso (URL relativa)
  // ============================================
  const enviarFacturaEmail = async () => {
    if (!verificarToken()) return;

    if (!emailCliente.trim()) {
      alert('Por favor ingresa un email válido');
      return;
    }

    const factura = facturaEmailActual;
    if (!factura) {
      alert('No hay factura seleccionada');
      return;
    }

    setEnviandoEmail(true);
    setEstadoEmail('enviando');
    setProgresoEmail(10);
    setMensajeEmail('Preparando factura...');

    try {
      setProgresoEmail(25);
      setMensajeEmail('Generando PDF...');

      const datosClienteFactura = {
        nombre: factura.cliente_nombre || factura.cliente,
        direccion: factura.cliente_direccion || factura.clienteDireccion,
        email: emailCliente,
        telefono: factura.cliente_telefono || factura.clienteTelefono
      };

      const datosEmprendimiento = emprendimiento ? {
        nombre: emprendimiento.nombre || 'Mi Tienda',
        ubicacion: emprendimiento.ubicacion || 'Dirección no registrada',
        ciudad: emprendimiento.ciudad || '',
        whatsapp: emprendimiento.whatsapp || emprendimiento.telefono || 'Teléfono no registrado'
      } : null;

      setProgresoEmail(50);
      setMensajeEmail('Enviando email...');

      const response = await fetch(`/api/factu/enviar-factura`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          factura: factura,
          datosCliente: datosClienteFactura,
          numeroFactura: factura.numero,
          emprendimiento: datosEmprendimiento,
          emailCliente: emailCliente // Enviar el email modificado
        })
      });

      setProgresoEmail(80);
      setMensajeEmail('Confirmando envío...');

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }

      const data = await response.json();

      if (data.success) {
        setProgresoEmail(100);
        setEstadoEmail('completado');
        setMensajeEmail(`✅ Factura enviada exitosamente a ${emailCliente}`);
      } else {
        setEstadoEmail('error');
        setMensajeEmail('❌ ' + (data.message || 'Error al enviar la factura'));
      }
    } catch (error) {
      console.error('Error enviando factura:', error);
      setEstadoEmail('error');
      setMensajeEmail('❌ Error al enviar la factura por email');
    } finally {
      setEnviandoEmail(false);
    }
  };

  // ============================================
  // 🔥 PROCESAR PAGO CON MODAL DE PROGRESO Y PUNTOS CON PROMOCIÓN (URL relativa)
  // ============================================
  const procesarPago = async () => {
    if (!verificarToken()) return;

    if (nuevaFactura.items.length === 0) {
      alert('Agrega productos a la factura primero');
      return;
    }

    if (!datosCliente.nombre || !datosCliente.direccion || !datosCliente.telefono) {
      alert('Por favor, completa los datos del cliente (nombre, dirección y teléfono)');
      return;
    }

    if (nuevaFactura.total === 0) {
      alert('El total debe ser mayor a 0');
      return;
    }

    if (nuevaFactura.pagoRecibido < nuevaFactura.total) {
      alert(`El pago recibido debe ser al menos ${formatearMoneda(nuevaFactura.total)}`);
      return;
    }

    setModalProcesando(true);
    setProgreso(0);
    setEstadoProceso('iniciando');
    setMensajeProceso('Iniciando procesamiento de venta...');
    setResultadoProceso(null);

    try {
      setProgreso(10);
      setEstadoProceso('procesando');
      setMensajeProceso('Preparando datos de la factura...');

      const vuelto = calcularVuelto(nuevaFactura.pagoRecibido);
      const ahora = new Date();
      const horaFormateada = ahora.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const fechaFormateada = datosCliente.fecha;
      const puntosTotales = nuevaFactura.items.reduce((sum, item) => sum + (item.puntos || 0), 0);
      const numeroFactura = generarNumeroFactura();

      const nuevaFacturaCompleta = {
        emprendimiento_id: emprendimientoId,
        usuario_id: usuarioId,
        numero: numeroFactura,
        fecha: fechaFormateada,
        hora: horaFormateada,
        cliente: datosCliente.nombre,
        clienteDireccion: datosCliente.direccion,
        clienteEmail: datosCliente.email,
        clienteTelefono: datosCliente.telefono,
        items: nuevaFactura.items.map(item => ({
          productoId: item.productoId,
          codigo: item.codigo,
          nombre: item.nombre,
          precio: item.precio,
          cantidad: item.cantidad,
          subtotal: item.subtotal
        })),
        subtotal: nuevaFactura.subtotal,
        impuesto: nuevaFactura.impuesto,
        total: nuevaFactura.total,
        metodoPago: nuevaFactura.metodoPago,
        pagoRecibido: nuevaFactura.pagoRecibido,
        vuelto,
        estado: 'completado',
        referencia: nuevaFactura.referencia || `VENTA-${Date.now()}`,
        comanda_id: nuevaFactura.comanda_id || null
      };

      setProgreso(30);
      setMensajeProceso('Enviando factura al servidor...');

      const response = await fetch(`/api/factu/facturas`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(nuevaFacturaCompleta)
      });

      setProgreso(60);
      setMensajeProceso('Procesando respuesta del servidor...');

      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        setModalProcesando(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setProgreso(75);
        setMensajeProceso('Actualizando stock de productos...');

        const productosActualizados = [...productos];
        nuevaFactura.items.forEach(item => {
          const index = productosActualizados.findIndex(p => p.id === item.productoId);
          if (index !== -1) {
            productosActualizados[index].stock -= item.cantidad;
          }
        });
        setProductos(productosActualizados);

        setProgreso(85);
        setMensajeProceso('Actualizando puntos del cliente...');

        const puntosBase = data.puntosBase || puntosTotales;
        const puntosOtorgados = data.puntosOtorgados || puntosTotales;
        const promocionAplicada = data.promocion_aplicada || null;

        const clientesActualizados = [...clientes];
        const clienteIndex = clientesActualizados.findIndex(c => c.nombre === datosCliente.nombre);
        if (clienteIndex !== -1) {
          clientesActualizados[clienteIndex].puntos += puntosOtorgados;
        } else {
          const nuevoCliente = {
            id: Date.now(),
            codigo: `CLI-${String(Date.now()).slice(-4)}`,
            nombre: datosCliente.nombre,
            email: datosCliente.email,
            telefono: datosCliente.telefono,
            direccion: datosCliente.direccion,
            puntos: puntosOtorgados,
            tipo: 'regular'
          };
          clientesActualizados.push(nuevoCliente);
        }
        setClientes(clientesActualizados);

        setProgreso(92);
        setMensajeProceso('Guardando factura...');

        const subtotalCalculado = data.subtotal_calculado || nuevaFacturaCompleta.subtotal;
        const impuestoCalculado = data.impuesto_calculado || nuevaFacturaCompleta.impuesto;
        const totalCalculado = data.total_calculado || nuevaFacturaCompleta.total;

        const nuevaFacturaConId = {
          ...nuevaFacturaCompleta,
          id: data.id,
          items: nuevaFacturaCompleta.items,
          ruta_pdf: data.ruta_pdf,
          puntosOtorgados: puntosOtorgados,
          puntosBase: puntosBase,
          subtotal: subtotalCalculado,
          impuesto: impuestoCalculado,
          total: totalCalculado,
          promocion_aplicada: promocionAplicada
        };
        setFacturas([nuevaFacturaConId, ...facturas]);

        if (nuevaFactura.comanda_id) {
          setMensajeProceso('Eliminando comanda asociada...');
          await eliminarComandaEnAPI(nuevaFactura.comanda_id);
          const nuevasMesas = mesas.filter(m => m.id !== nuevaFactura.comanda_id);
          setMesas(nuevasMesas);
          if (mesaActiva === nuevaFactura.comanda_id && nuevasMesas.length > 0) {
            setMesaActiva(nuevasMesas[0].id);
          } else if (nuevasMesas.length === 0) {
            setMesaActiva(null);
          }
        }

        setProgreso(100);
        setEstadoProceso('completado');
        setResultadoProceso({
          success: true,
          numero: numeroFactura,
          total: totalCalculado,
          iva: impuestoCalculado,
          puntos: puntosOtorgados,
          puntosBase: puntosBase,
          promocion: promocionAplicada,
          mensaje: `Factura ${numeroFactura} creada exitosamente`
        });
        setMensajeProceso('✅ ¡Venta completada con éxito!');

      } else {
        setEstadoProceso('error');
        setResultadoProceso({
          success: false,
          mensaje: data.message || 'Error al guardar la factura'
        });
        setMensajeProceso('❌ Error al procesar la venta');
      }

    } catch (error) {
      console.error('Error guardando factura:', error);
      setEstadoProceso('error');
      setResultadoProceso({
        success: false,
        mensaje: 'Error de conexión con el servidor'
      });
      setMensajeProceso('❌ Error al procesar la venta');
    }
  };

  const resetearFactura = () => {
    setNuevaFactura({
      cliente: '',
      tipo: 'venta',
      metodoPago: 'efectivo',
      referencia: '',
      items: [],
      subtotal: 0,
      impuesto: 0,
      total: 0,
      pagoRecibido: 0,
      vuelto: 0,
      estado: 'pendiente',
      comanda_id: null
    });
    setDatosCliente({
      nombre: '',
      direccion: '',
      email: '',
      telefono: '',
      fecha: new Date().toISOString().split('T')[0]
    });
    setProductoSeleccionado(null);
    setCantidad(1);
    setBusquedaProducto('');
    setBusquedaCliente('');
  };

  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto);
  };

  const formatearFecha = (fechaStr) => {
    return new Date(fechaStr).toLocaleDateString('es-EC');
  };

  const clientesFiltrados = clientes.filter(cliente => {
    if (!busquedaCliente) return false;
    const searchTerm = busquedaCliente.toLowerCase();
    return (
      cliente.nombre.toLowerCase().includes(searchTerm) ||
      cliente.email?.toLowerCase().includes(searchTerm) ||
      cliente.telefono?.includes(searchTerm)
    );
  });

  const handleClienteSelect = (cliente) => {
    setDatosCliente({
      nombre: cliente.nombre,
      direccion: cliente.direccion || '',
      email: cliente.email || '',
      telefono: cliente.telefono || '',
      fecha: datosCliente.fecha
    });
    setBusquedaCliente(cliente.nombre);
    setNuevaFactura(prev => ({ ...prev, cliente: cliente.nombre }));
  };

  const productosFiltrados = productos.filter(producto => {
    if (!busquedaProducto) return true;
    const searchTerm = busquedaProducto.toLowerCase();
    return (
      producto.nombre.toLowerCase().includes(searchTerm) ||
      producto.codigo?.toLowerCase().includes(searchTerm) ||
      producto.marca?.toLowerCase().includes(searchTerm) ||
      producto.modelo?.toLowerCase().includes(searchTerm)
    );
  });

  const facturasFiltradas = facturas.filter(factura => {
    if (filtroFechaInicio && new Date(factura.fecha) < new Date(filtroFechaInicio)) return false;
    if (filtroFechaFin && new Date(factura.fecha) > new Date(filtroFechaFin)) return false;
    if (filtroEstado !== 'todos' && factura.estado !== filtroEstado) return false;
    if (filtroMetodoPago !== 'todos' && factura.metodoPago !== filtroMetodoPago) return false;
    return true;
  });

  const estadisticas = {
    totalVentas: facturasFiltradas.filter(f => f.estado === 'pagada').reduce((sum, f) => sum + f.total, 0),
    totalFacturas: facturasFiltradas.length,
    promedioTicket: facturasFiltradas.length > 0 ? facturasFiltradas.reduce((sum, f) => sum + f.total, 0) / facturasFiltradas.length : 0,
    productosVendidos: facturasFiltradas.reduce((sum, f) => sum + f.items?.reduce((itemSum, item) => itemSum + item.cantidad, 0) || 0, 0),
    puntosOtorgados: facturasFiltradas.reduce((sum, f) => sum + (f.puntosOtorgados || 0), 0)
  };

  const productosMasVendidos = (() => {
    const ventasPorProducto = {};
    facturas.forEach(factura => {
      if (factura.items) {
        factura.items.forEach(item => {
          const productoId = item.producto_id || item.productoId;
          if (!ventasPorProducto[productoId]) {
            ventasPorProducto[productoId] = {
              id: productoId,
              nombre: item.nombre,
              codigo: item.codigo || '',
              categoria: 'General',
              cantidad: 0,
              ingresos: 0,
              ganancias: 0,
              margen: 0
            };
          }
          ventasPorProducto[productoId].cantidad += item.cantidad;
          ventasPorProducto[productoId].ingresos += item.subtotal;
          ventasPorProducto[productoId].ganancias += item.subtotal * 0.4;
          ventasPorProducto[productoId].margen = 40;
        });
      }
    });
    return Object.values(ventasPorProducto).sort((a, b) => b.cantidad - a.cantidad);
  })();

  useEffect(() => {
    console.log('📦 FacturacionColab - emprendimientoId:', emprendimientoId);
    console.log('👤 FacturacionColab - usuarioId:', usuarioId);
  }, [emprendimientoId, usuarioId]);

  // Cerrar modal de procesamiento con Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && modalProcesando && estadoProceso === 'completado') {
        setModalProcesando(false);
        resetearFactura();
        cargarFacturas();
      }
      if (e.key === 'Escape' && modalEmailVisible) {
        setModalEmailVisible(false);
        setEnviandoEmail(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalProcesando, estadoProceso, modalEmailVisible]);

  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando sistema de facturación...</p>
        {isSocketConnected && <p className={styles.socketConnected}>🟢 Conectado en tiempo real</p>}
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

  const modalContentStyles = {
    width: '90%',
    maxWidth: '1200px',
    height: '90vh',
    backgroundColor: 'white',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  };

  const pdfIframeStyles = {
    width: '100%',
    height: 'calc(90vh - 120px)',
    border: 'none',
    borderRadius: '8px'
  };

  return (
    <div className={styles.facturacionContainer}>
      {/* Indicador de conexión Socket.IO */}
      <div className={styles.socketStatusBar}>
        {isSocketConnected ? (
          <span className={styles.socketConnected}>🟢 Tiempo real activo</span>
        ) : (
          <span className={styles.socketDisconnected}>🔴 Reconectando...</span>
        )}
      </div>

      {/* Encabezado con 4 pestañas */}
      <div className={styles.encabezado}>
        <div className={styles.tituloSection}>
          <h1>
            <FaFileInvoiceDollar className={styles.tituloIcono} />
            Sistema de Facturación
          </h1>
          <p className={styles.subtitulo}>
            Facturación electrónica, comandas, caja y gestión de ventas
          </p>
        </div>

        <div className={styles.accionesHeader}>
          <button
            onClick={() => setVistaActiva('nueva-factura')}
            className={`${styles.btnAccion} ${vistaActiva === 'nueva-factura' ? styles.active : ''}`}
          >
            <FaReceipt /> Nueva Factura
          </button>

          <button
            onClick={() => setVistaActiva('comandas')}
            className={`${styles.btnAccion} ${vistaActiva === 'comandas' ? styles.active : ''}`}
          >
            <FaTable /> Comandas
          </button>

          <button
            onClick={() => setVistaActiva('historial')}
            className={`${styles.btnAccion} ${vistaActiva === 'historial' ? styles.active : ''}`}
          >
            <FaHistory /> Historial
          </button>

          <button
            onClick={() => setVistaActiva('reportes')}
            className={`${styles.btnAccion} ${vistaActiva === 'reportes' ? styles.active : ''}`}
          >
            <FaFileExport /> Reportes
          </button>
        </div>
      </div>

      {/* Vista: Nueva Factura */}
      {vistaActiva === 'nueva-factura' && (
        <div className={styles.nuevaFacturaSection}>
          <div className={styles.facturaGridSinResumen}>
            <div className={styles.panelCentralFactura}>
              <div className={styles.facturaHeader}>
                <h3><FaReceipt /> Factura Actual</h3>
                <div className={styles.facturaInfo}>
                  <span className={styles.facturaNumero}>{generarNumeroFactura()}</span>
                  <span className={styles.facturaFecha}>{new Date().toLocaleDateString('es-EC')}</span>
                </div>
              </div>

              <div className={styles.datosClienteContainer}>
                <h4><FaUser /> Datos del Cliente</h4>
                <div className={styles.formDatosCliente}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup} style={{ position: 'relative' }}>
                      <label>Nombre completo *</label>
                      <input
                        ref={nombreClienteInputRef}
                        type="text"
                        value={datosCliente.nombre}
                        onChange={(e) => {
                          setDatosCliente({ ...datosCliente, nombre: e.target.value });
                          setNuevaFactura({ ...nuevaFactura, cliente: e.target.value });
                          setBusquedaCliente(e.target.value);
                        }}
                        className={styles.input}
                        placeholder="Escribe para buscar clientes..."
                        required
                      />
                      {busquedaCliente && clientesFiltrados.length > 0 && !clientesFiltrados.some(c => c.nombre === busquedaCliente) && (
                        <div ref={sugerenciasClienteRef} className={styles.sugerenciasCliente}>
                          {clientesFiltrados.slice(0, 5).map(cliente => (
                            <div key={cliente.id} className={styles.sugerenciaCliente} onClick={() => handleClienteSelect(cliente)}>
                              <span className={styles.sugerenciaClienteNombre}>{cliente.nombre}</span>
                              <span className={styles.sugerenciaClienteContacto}>{cliente.telefono} • {cliente.email}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.formGroup}>
                      <label>Fecha</label>
                      <input type="date" value={datosCliente.fecha} onChange={(e) => setDatosCliente({ ...datosCliente, fecha: e.target.value })} className={styles.input} />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Dirección *</label>
                      <input type="text" value={datosCliente.direccion} onChange={(e) => setDatosCliente({ ...datosCliente, direccion: e.target.value })} className={styles.input} required />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Teléfono *</label>
                      <input type="tel" value={datosCliente.telefono} onChange={(e) => setDatosCliente({ ...datosCliente, telefono: e.target.value })} className={styles.input} required />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Email</label>
                      <input type="email" value={datosCliente.email} onChange={(e) => setDatosCliente({ ...datosCliente, email: e.target.value })} className={styles.input} />
                    </div>
                    <div className={styles.formGroup}>
                      <button type="button" onClick={() => { setDatosCliente({ nombre: '', direccion: '', email: '', telefono: '', fecha: new Date().toISOString().split('T')[0] }); setBusquedaCliente(''); setNuevaFactura({ ...nuevaFactura, cliente: '' }); }} className={styles.btnLimpiarCliente}>
                        <FaTimes /> Limpiar
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.busquedaRapidaContainer}>
                <div className={styles.busquedaRapidaHeader}>
                  <h4><FaSearch /> Agregar Producto</h4>
                </div>
                <div className={styles.formBusquedaRapida}>
                  <div className={styles.busquedaRapidaInputGroup}>
                    <div className={styles.busquedaProductoGroup}>
                      <input ref={busquedaProductoInputRef} type="text" value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar producto..." className={styles.busquedaRapidaInput} />
                      <FaSearch className={styles.busquedaIcono} />
                    </div>
                    <div className={styles.cantidadBusquedaRapida}>
                      <label>Cantidad:</label>
                      <div className={styles.cantidadControles}>
                        <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} className={styles.btnCantidad}>-</button>
                        <input type="number" value={cantidad} onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))} className={styles.cantidadInput} min="1" />
                        <button onClick={() => setCantidad(cantidad + 1)} className={styles.btnCantidad}>+</button>
                      </div>
                    </div>
                    <button onClick={agregarProductoAFactura} className={styles.btnAgregarRapido} disabled={!productoSeleccionado}>
                      <FaPlus /> Agregar
                    </button>
                  </div>

                  {busquedaProducto && productosFiltrados.length > 0 && (!productoSeleccionado || productoSeleccionado.nombre !== busquedaProducto.trim()) && (
                    <div ref={sugerenciasProductoRef} className={styles.sugerenciasBusqueda}>
                      {productosFiltrados.slice(0, 8).map(producto => (
                        <button
                          key={producto.id}
                          onClick={() => {
                            setProductoSeleccionado(producto);
                            setBusquedaProducto(producto.nombre);
                          }}
                          className={`${styles.sugerenciaItem} ${productoSeleccionado?.id === producto.id ? styles.selected : ''}`}
                          title={`${producto.nombre} - Código: ${producto.codigo}`}
                        >
                          <div className={styles.sugerenciaNombre}>
                            <strong>{producto.nombre}</strong>
                            {producto.marca && <span className={styles.sugerenciaMarca}> <FaTag /> {producto.marca}</span>}
                          </div>
                          <div className={styles.sugerenciaDetalles}>
                            <span className={styles.sugerenciaCodigo}><FaTag /> {producto.codigo}</span>
                            {producto.modelo && <span className={styles.sugerenciaModelo}>📱 {producto.modelo}</span>}
                            {producto.talla && <span className={styles.sugerenciaTalla}><FaRuler /> {producto.talla}</span>}
                            {producto.color && <span className={styles.sugerenciaColor}><FaPalette /> {producto.color}</span>}
                            <span className={styles.sugerenciaCategoria}>📂 {producto.categoria}</span>
                          </div>
                          <div className={styles.sugerenciaPrecioStock}>
                            <span className={styles.sugerenciaPrecio}>{formatearMoneda(producto.precio)}</span>
                            <span className={`${styles.sugerenciaStock} ${producto.stock <= 5 ? styles.stockBajo : ''}`}>
                              <FaBoxes /> {producto.stock} uds
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}



                  {productoSeleccionado && (
                    <div className={styles.productoPreview}>
                      <div className={styles.productoPreviewInfo}>
                        <span className={styles.productoPreviewNombre}>{productoSeleccionado.nombre}</span>
                        <div className={styles.productoPreviewDetalles}>
                          <span className={styles.previewCodigo}><FaTag /> {productoSeleccionado.codigo}</span>
                          {productoSeleccionado.marca && <span className={styles.previewMarca}>🏷️ {productoSeleccionado.marca}</span>}
                          {productoSeleccionado.modelo && <span className={styles.previewModelo}>📱 {productoSeleccionado.modelo}</span>}
                          {productoSeleccionado.talla && <span className={styles.previewTalla}><FaRuler /> {productoSeleccionado.talla}</span>}
                          {productoSeleccionado.color && <span className={styles.previewColor}><FaPalette /> {productoSeleccionado.color}</span>}
                        </div>
                        <span className={styles.productoPreviewPrecio}>{formatearMoneda(productoSeleccionado.precio)}</span>
                        <span className={`${styles.productoPreviewStock} ${productoSeleccionado.stock <= 5 ? styles.stockBajo : ''}`}>
                          <FaBoxes /> Stock: {productoSeleccionado.stock}
                        </span>
                      </div>
                      <button onClick={() => { setProductoSeleccionado(null); setBusquedaProducto(''); }} className={styles.btnLimpiarSeleccion}>
                        <FaTimes />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.facturaItems}>
                <div className={styles.facturaItemsHeader}>
                  <span>Producto</span>
                  <span>Cantidad</span>
                  <span>Precio</span>
                  <span>Subtotal</span>
                  <span>Acciones</span>
                </div>
                <div className={styles.facturaItemsLista}>
                  {nuevaFactura.items.length === 0 ? (
                    <div className={styles.sinItems}>
                      <FaShoppingCart className={styles.sinItemsIcono} />
                      <p>No hay productos en la factura</p>
                      <p>Busca y selecciona productos para agregar</p>
                    </div>
                  ) : (
                    nuevaFactura.items.map(item => (
                      <div key={item.id} className={styles.facturaItem}>
                        <div className={styles.itemInfo}>
                          <span className={styles.itemNombre}>{item.nombre}</span>
                          <div className={styles.itemDetalles}>
                            {item.marca && <span className={styles.itemMarca}>🏷️ {item.marca}</span>}
                            {item.modelo && <span className={styles.itemModelo}>📱 {item.modelo}</span>}
                            {item.talla && <span className={styles.itemTalla}><FaRuler /> {item.talla}</span>}
                            {item.color && <span className={styles.itemColor}><FaPalette /> {item.color}</span>}
                          </div>
                          <span className={styles.itemCodigo}><FaTag /> {item.codigo}</span>
                        </div>
                        <div className={styles.itemCantidad}>
                          <div className={styles.cantidadControlesSmall}>
                            <button onClick={() => actualizarCantidad(item.id, item.cantidad - 1)} className={styles.btnCantidadSmall}>-</button>
                            <span className={styles.cantidadValor}>{item.cantidad}</span>
                            <button onClick={() => actualizarCantidad(item.id, item.cantidad + 1)} className={styles.btnCantidadSmall}>+</button>
                          </div>
                        </div>
                        <div className={styles.itemPrecio}>{formatearMoneda(item.precio)}</div>
                        <div className={styles.itemSubtotal}>
                          {formatearMoneda(item.subtotal)}
                          <span className={styles.itemPuntos}>{item.puntos} pts</span>
                        </div>
                        <div className={styles.itemAcciones}>
                          <button onClick={() => removerItem(item.id)} className={styles.btnRemoverItem}><FaTrash /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className={styles.facturaTotales}>
                <div className={styles.totalRow}><span>Subtotal:</span><span>{formatearMoneda(nuevaFactura.subtotal)}</span></div>
                <div className={styles.totalRow}>
                  <span>IVA:</span>
                  <span>{formatearMoneda(nuevaFactura.impuesto)}</span>
                </div>
                <div className={styles.totalRow}><span>Puntos a otorgar:</span><span className={styles.totalPuntos}>{nuevaFactura.items.reduce((sum, item) => sum + (item.puntos || 0), 0)} pts</span></div>
                <div className={styles.totalRow}><strong>Total a pagar:</strong><strong className={styles.totalFinal}>{formatearMoneda(nuevaFactura.total)}</strong></div>
              </div>
            </div>

            <div className={styles.panelDerechoPago}>
              <div className={styles.pagoSection}>
                <h3><FaMoneyBillWave /> Método de Pago</h3>
                <div className={styles.metodosPago}>
                  <div className={`${styles.metodoPago} ${nuevaFactura.metodoPago === 'efectivo' ? styles.selected : ''}`} onClick={() => setNuevaFactura({ ...nuevaFactura, metodoPago: 'efectivo' })}>
                    <FaMoneyBillWave className={styles.metodoIcono} /><span>Efectivo</span>
                  </div>
                  <div className={`${styles.metodoPago} ${nuevaFactura.metodoPago === 'transferencia' ? styles.selected : ''}`} onClick={() => setNuevaFactura({ ...nuevaFactura, metodoPago: 'transferencia' })}>
                    <FaExchangeAlt className={styles.metodoIcono} /><span>Transferencia</span>
                  </div>
                </div>

                <div className={styles.referenciaInput}>
                  <label>Referencia/Comentario:</label>
                  <input type="text" value={nuevaFactura.referencia} onChange={(e) => setNuevaFactura({ ...nuevaFactura, referencia: e.target.value })} placeholder="Ej: Pago en efectivo, transferencia..." className={styles.input} />
                </div>

                <div className={styles.pagoRecibido}>
                  <label>Pago Recibido:</label>
                  <div className={styles.pagoInputContainer}>
                    <span className={styles.pagoSimbolo}>$</span>
                    <input type="number" value={nuevaFactura.pagoRecibido} onChange={(e) => setNuevaFactura({ ...nuevaFactura, pagoRecibido: parseFloat(e.target.value) || 0 })} className={styles.pagoInput} placeholder="0.00" step="0.01" min="0" />
                  </div>
                </div>

                {nuevaFactura.metodoPago === 'efectivo' && nuevaFactura.pagoRecibido > 0 && (
                  <div className={styles.vueltoSection}>
                    <div className={styles.vueltoInfo}>
                      <span>Vuelto:</span>
                      <span className={styles.vueltoMonto} style={{ color: calcularVuelto(nuevaFactura.pagoRecibido) > 0 ? '#10b981' : '#ef4444' }}>
                        {formatearMoneda(calcularVuelto(nuevaFactura.pagoRecibido))}
                      </span>
                    </div>
                  </div>
                )}

                <div className={styles.accionesFinales}>
                  <button onClick={resetearFactura} className={styles.btnCancelar}><FaTrash /> Cancelar</button>
                  <button onClick={procesarPago} className={styles.btnProcesar} disabled={nuevaFactura.items.length === 0}><FaSave /> Procesar Venta</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vista: Comandas */}
      {vistaActiva === 'comandas' && (
        <div className={styles.comandasSection}>
          <div className={styles.comandasGrid}>
            <div className={styles.panelMesas}>
              <div className={styles.mesasContainer}>
                <div className={styles.mesasHeader}>
                  <h3><FaTable /> Mesas / Comandas</h3>
                  <button className={styles.btnNuevaMesa} onClick={() => { setMostrarNuevaMesa(!mostrarNuevaMesa); setBusquedaCliente(''); setNuevaMesaCliente(null); }}>
                    <FaPlus /> Nueva Mesa
                  </button>
                </div>

                {mostrarNuevaMesa && (
                  <div className={styles.nuevaMesaForm}>
                    <input type="text" placeholder="Ej: Mesa 1, Barra, Para llevar..." value={nuevaMesaNombre} onChange={(e) => setNuevaMesaNombre(e.target.value)} className={styles.nuevaMesaInput} autoFocus />
                    <div className={styles.buscadorClienteMesa}>
                      <label className={styles.buscadorLabel}><FaUser /> Cliente (opcional):</label>
                      <input type="text" placeholder="Escribe el nombre del cliente..." value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} className={styles.buscadorInput} />
                      {busquedaCliente && clientesFiltrados.length > 0 && (
                        <div className={styles.sugerenciasClienteMesa}>
                          {clientesFiltrados.slice(0, 5).map(cliente => (
                            <div key={cliente.id} className={styles.sugerenciaClienteMesa} onClick={() => { setNuevaMesaCliente(cliente); setBusquedaCliente(cliente.nombre); }}>
                              <span className={styles.sugerenciaNombre}>{cliente.nombre}</span>
                              <span className={styles.sugerenciaContacto}>{cliente.telefono}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {nuevaMesaCliente && (
                      <div className={styles.clienteSeleccionado}>
                        <span>✅ Cliente: {nuevaMesaCliente.nombre}</span>
                        <button onClick={() => { setNuevaMesaCliente(null); setBusquedaCliente(''); }} className={styles.btnQuitarCliente}><FaTimes /></button>
                      </div>
                    )}
                    <div className={styles.nuevaMesaAcciones}>
                      <button onClick={crearNuevaMesa} className={styles.btnCrearMesa}><FaCheckCircle /> Crear</button>
                      <button onClick={() => setMostrarNuevaMesa(false)} className={styles.btnCancelarMesa}><FaTimes /> Cancelar</button>
                    </div>
                  </div>
                )}

                <div className={styles.mesasLista}>
                  {mesas.length === 0 ? (
                    <div className={styles.sinMesas}>
                      <FaTable className={styles.sinMesasIcono} />
                      <p>No hay mesas activas</p>
                      <p>Crea una nueva mesa/comanda</p>
                    </div>
                  ) : (
                    mesas.map(mesa => (
                      <div key={mesa.id} className={`${styles.mesaCard} ${mesaActiva === mesa.id ? styles.active : ''}`} onClick={() => setMesaActiva(mesa.id)}>
                        <div className={styles.mesaHeader}>
                          <div className={styles.mesaTitulo}><FaUtensils className={styles.mesaIcono} /><strong>{mesa.nombre}</strong></div>
                          <div className={styles.mesaAcciones}>
                            <button onClick={(e) => { e.stopPropagation(); pasarMesaAFactura(mesa); }} className={styles.btnPagarMesa} disabled={mesa.items.length === 0}><FaMoneyBillWave /> Pagar</button>
                            <button onClick={(e) => { e.stopPropagation(); eliminarMesa(mesa.id); }} className={styles.btnEliminarMesa}><FaTrash /></button>
                          </div>
                        </div>
                        {mesa.cliente && (
                          <div className={styles.mesaCliente}><FaUser className={styles.mesaClienteIcono} /><span>{mesa.cliente}</span>{mesa.telefono && <small>📞 {mesa.telefono}</small>}</div>
                        )}
                        <div className={styles.mesaItems}>
                          {mesa.items.length === 0 ? <p className={styles.mesaSinItems}>Sin productos</p> : (
                            <>
                              {mesa.items.slice(0, 3).map(item => (
                                <div key={item.id} className={styles.mesaItemResumen}>
                                  <span>{item.cantidad}x</span>
                                  <span>{item.nombre.substring(0, 20)}</span>
                                  <span>{formatearMoneda(item.subtotal)}</span>
                                </div>
                              ))}
                              {mesa.items.length > 3 && <div className={styles.mesaItemMas}>+{mesa.items.length - 3} productos más</div>}
                            </>
                          )}
                        </div>
                        <div className={styles.mesaTotal}><span>Total:</span><strong>{formatearMoneda(mesa.total)}</strong></div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className={styles.panelProductosMesa}>
              {mesaActiva && mesas.find(m => m.id === mesaActiva) ? (
                <>
                  <div className={styles.mesaProductosHeader}><h4><FaShoppingCart /> Agregar a {mesas.find(m => m.id === mesaActiva)?.nombre}</h4></div>
                  <div className={styles.mesaBusquedaProducto}>
                    <div className={styles.busquedaProductoGroup}>
                      <input type="text" value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar producto..." className={styles.busquedaRapidaInput} />
                      <FaSearch className={styles.busquedaIcono} />
                    </div>
                    <div className={styles.mesaCantidadControles}>
                      <label>Cantidad:</label>
                      <div className={styles.cantidadControles}>
                        <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} className={styles.btnCantidad}>-</button>
                        <input type="number" value={cantidad} onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))} className={styles.cantidadInput} min="1" />
                        <button onClick={() => setCantidad(cantidad + 1)} className={styles.btnCantidad}>+</button>
                      </div>
                    </div>
                    <button onClick={() => agregarProductoAMesa(mesaActiva, productoSeleccionado, cantidad)} className={styles.btnAgregarMesa} disabled={!productoSeleccionado}><FaPlus /> Agregar a Mesa</button>
                  </div>

                  {busquedaProducto && productosFiltrados.length > 0 && (
                    <div className={styles.sugerenciasBusqueda}>
                      {productosFiltrados.slice(0, 8).map(producto => (
                        <button
                          key={producto.id}
                          onClick={() => {
                            setProductoSeleccionado(producto);
                            setBusquedaProducto(producto.nombre);
                          }}
                          className={`${styles.sugerenciaItem} ${productoSeleccionado?.id === producto.id ? styles.selected : ''}`}
                        >
                          <div className={styles.sugerenciaNombre}>
                            <strong>{producto.nombre}</strong>
                            {producto.marca && <span className={styles.sugerenciaMarca}> <FaTag /> {producto.marca}</span>}
                          </div>
                          <div className={styles.sugerenciaDetalles}>
                            <span className={styles.sugerenciaCodigo}><FaTag /> {producto.codigo}</span>
                            {producto.modelo && <span className={styles.sugerenciaModelo}>📱 {producto.modelo}</span>}
                            {producto.talla && <span className={styles.sugerenciaTalla}><FaRuler /> {producto.talla}</span>}
                            {producto.color && <span className={styles.sugerenciaColor}><FaPalette /> {producto.color}</span>}
                            <span className={styles.sugerenciaCategoria}>📂 {producto.categoria}</span>
                          </div>
                          <div className={styles.sugerenciaPrecioStock}>
                            <span className={styles.sugerenciaPrecio}>{formatearMoneda(producto.precio)}</span>
                            <span className={`${styles.sugerenciaStock} ${producto.stock <= 5 ? styles.stockBajo : ''}`}>
                              <FaBoxes /> {producto.stock} uds
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {productoSeleccionado && (
                    <div className={styles.productoPreview}>
                      <div className={styles.productoPreviewInfo}>
                        <span className={styles.productoPreviewNombre}>{productoSeleccionado.nombre}</span>
                        <div className={styles.productoPreviewDetalles}>
                          <span className={styles.previewCodigo}><FaTag /> {productoSeleccionado.codigo}</span>
                          {productoSeleccionado.marca && <span className={styles.previewMarca}>🏷️ {productoSeleccionado.marca}</span>}
                          {productoSeleccionado.modelo && <span className={styles.previewModelo}>📱 {productoSeleccionado.modelo}</span>}
                          {productoSeleccionado.talla && <span className={styles.previewTalla}><FaRuler /> {productoSeleccionado.talla}</span>}
                          {productoSeleccionado.color && <span className={styles.previewColor}><FaPalette /> {productoSeleccionado.color}</span>}
                        </div>
                        <span className={styles.productoPreviewPrecio}>{formatearMoneda(productoSeleccionado.precio)}</span>
                        <span className={`${styles.productoPreviewStock} ${productoSeleccionado.stock <= 5 ? styles.stockBajo : ''}`}>
                          <FaBoxes /> Stock: {productoSeleccionado.stock}
                        </span>
                      </div>
                      <button onClick={() => { setProductoSeleccionado(null); setBusquedaProducto(''); }} className={styles.btnLimpiarSeleccion}><FaTimes /></button>
                    </div>
                  )}

                  <div className={styles.mesaItemsDetalle}>
                    <h5>Productos en esta mesa:</h5>
                    {mesas.find(m => m.id === mesaActiva)?.items.length === 0 ? <p className={styles.sinItemsMesa}>No hay productos agregados</p> : (
                      <div className={styles.mesaItemsLista}>
                        {mesas.find(m => m.id === mesaActiva)?.items.map(item => (
                          <div key={item.id} className={styles.mesaItemDetalle}>
                            <div className={styles.mesaItemInfo}>
                              <span className={styles.mesaItemNombre}>{item.nombre}</span>
                              <div className={styles.mesaItemDetalles}>
                                {item.marca && <span>🏷️ {item.marca}</span>}
                                {item.modelo && <span>📱 {item.modelo}</span>}
                                {item.talla && <span><FaRuler /> {item.talla}</span>}
                                {item.color && <span><FaPalette /> {item.color}</span>}
                              </div>
                              <span className={styles.mesaItemPrecio}>{formatearMoneda(item.precio)}</span>
                            </div>
                            <div className={styles.mesaItemControles}>
                              <div className={styles.cantidadControlesSmall}>
                                <button onClick={() => actualizarCantidadEnMesa(mesaActiva, item.id, item.cantidad - 1)} className={styles.btnCantidadSmall}>-</button>
                                <span className={styles.cantidadValor}>{item.cantidad}</span>
                                <button onClick={() => actualizarCantidadEnMesa(mesaActiva, item.id, item.cantidad + 1)} className={styles.btnCantidadSmall}>+</button>
                              </div>
                              <span className={styles.mesaItemSubtotal}>{formatearMoneda(item.subtotal)}</span>
                              <button onClick={() => eliminarItemDeMesa(mesaActiva, item.id)} className={styles.btnRemoverItemMesa}><FaTrash /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.pasarFacturaContainer}>
                    <button onClick={() => pasarMesaAFactura(mesas.find(m => m.id === mesaActiva))} className={styles.btnPasarFactura} disabled={mesas.find(m => m.id === mesaActiva)?.items.length === 0}><FaArrowRight /> Pasar a Facturación</button>
                  </div>
                </>
              ) : (
                <div className={styles.sinMesaSeleccionada}>
                  <FaTable className={styles.sinMesaIcono} />
                  <p>Selecciona una mesa del panel izquierdo</p>
                  <p>para comenzar a tomar la comanda</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vista: Historial de Facturas */}
      {vistaActiva === 'historial' && (
        <div className={styles.historialSection}>
          <div className={styles.historialHeader}>
            <h3><FaHistory /> Historial de Facturas</h3>
            <div className={styles.filtrosHistorial}>
              <div className={styles.filtroGrupo}><label>Fecha inicio:</label><input type="date" value={filtroFechaInicio} onChange={(e) => setFiltroFechaInicio(e.target.value)} className={styles.filtroInput} /></div>
              <div className={styles.filtroGrupo}><label>Fecha fin:</label><input type="date" value={filtroFechaFin} onChange={(e) => setFiltroFechaFin(e.target.value)} className={styles.filtroInput} /></div>
              <div className={styles.filtroGrupo}><label>Estado:</label><select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={styles.filtroSelect}><option value="todos">Todos</option><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option><option value="anulada">Anulada</option></select></div>
              <div className={styles.filtroGrupo}><label>Método pago:</label><select value={filtroMetodoPago} onChange={(e) => setFiltroMetodoPago(e.target.value)} className={styles.filtroSelect}><option value="todos">Todos</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></div>
            </div>
          </div>

          <div className={styles.tablaFacturasContainer}>
            <table className={styles.tablaFacturas}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th>Puntos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturasFiltradas.map(factura => (
                  <tr key={factura.id} className={styles.filaFactura}>
                    <td className={styles.celdaNumero}><strong>{factura.numero}</strong><br /><small>{factura.referencia}</small></td>
                    <td className={styles.celdaFecha}>{formatearFecha(factura.fecha)}<br /><small>{factura.hora}</small></td>
                    <td className={styles.celdaCliente}><strong>{factura.cliente_nombre || factura.cliente}</strong><br /><small>{factura.cliente_telefono || factura.clienteTelefono}</small></td>
                    <td className={styles.celdaItems}>{factura.items?.length || 0} items</td>
                    <td className={styles.celdaTotal}><strong>{formatearMoneda(factura.total)}</strong><br /><small>Sub: {formatearMoneda(factura.subtotal)}</small></td>
                    <td className={styles.celdaPago}><span className={`${styles.metodoPagoBadge} ${styles[factura.metodo_pago || factura.metodoPago]}`}>{factura.metodo_pago || factura.metodoPago}</span><br /><small>Rec: {formatearMoneda(factura.pago_recibido || factura.pagoRecibido)}</small></td>
                    <td className={styles.celdaEstado}><span className={`${styles.estadoBadge} ${styles[factura.estado]}`}>{factura.estado}</span></td>
                    <td className={styles.celdaPuntos}>{factura.puntos_otorgados || factura.puntosOtorgados}</td>
                    <td className={styles.celdaAcciones}>
                      <button onClick={() => verPDFFactura(factura)} className={styles.btnAccion} title="Ver PDF" style={{ marginRight: '8px' }}><FaFilePdf /></button>
                      <button onClick={() => abrirModalEmail(factura)} className={styles.btnAccion} title="Enviar por Email"><FaEnvelope /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {facturasFiltradas.length === 0 && (<div className={styles.sinFacturas}><FaFileInvoiceDollar className={styles.sinFacturasIcono} /><p>No hay facturas registradas</p></div>)}
          </div>

          <div className={styles.resumenHistorial}>
            <div className={styles.resumenItem}><span>Total facturas:</span><strong>{estadisticas.totalFacturas}</strong></div>
            <div className={styles.resumenItem}><span>Ventas totales:</span><strong>{formatearMoneda(estadisticas.totalVentas)}</strong></div>
            <div className={styles.resumenItem}><span>Ticket promedio:</span><strong>{formatearMoneda(estadisticas.promedioTicket)}</strong></div>
            <div className={styles.resumenItem}><span>Productos vendidos:</span><strong>{estadisticas.productosVendidos}</strong></div>
            <div className={styles.resumenItem}><span>Puntos otorgados:</span><strong>{estadisticas.puntosOtorgados}</strong></div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* 📧 NUEVO MODAL PARA ENVIAR EMAIL CON BARRA DE PROGRESO */}
      {/* ============================================ */}
      {modalEmailVisible && (
        <div className={styles.modalEmailOverlay} onClick={() => {
          if (!enviandoEmail) {
            setModalEmailVisible(false);
            setEstadoEmail('iniciando');
            setProgresoEmail(0);
            setMensajeEmail('');
          }
        }}>
          <div className={styles.modalEmailContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalEmailHeader}>
              <h3><FaEnvelope /> Enviar Factura por Email</h3>
              <button
                className={styles.modalEmailClose}
                onClick={() => {
                  if (!enviandoEmail) {
                    setModalEmailVisible(false);
                    setEstadoEmail('iniciando');
                    setProgresoEmail(0);
                    setMensajeEmail('');
                  }
                }}
                disabled={enviandoEmail}
              >
                <FaTimes />
              </button>
            </div>

            <div className={styles.modalEmailBody}>
              <div className={styles.modalEmailInfo}>
                <p><strong>Factura:</strong> {facturaEmailActual?.numero}</p>
                <p><strong>Cliente:</strong> {facturaEmailActual?.cliente_nombre || facturaEmailActual?.cliente}</p>
                <p><strong>Total:</strong> {formatearMoneda(facturaEmailActual?.total)}</p>
              </div>

              <div className={styles.modalEmailFormGroup}>
                <label>Email del destinatario:</label>
                <input
                  type="email"
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(e.target.value)}
                  className={styles.modalEmailInput}
                  placeholder="cliente@email.com"
                  disabled={enviandoEmail}
                />
              </div>

              {/* Barra de progreso */}
              <div className={styles.modalEmailProgressContainer}>
                <div className={styles.modalEmailProgressBar}>
                  <div
                    className={`${styles.modalEmailProgressFill} ${estadoEmail === 'completado' ? styles.progressSuccess :
                      estadoEmail === 'error' ? styles.progressError : ''
                      }`}
                    style={{ width: `${progresoEmail}%` }}
                  />
                </div>
                <div className={styles.modalEmailProgressText}>
                  {estadoEmail === 'iniciando' && 'Listo para enviar'}
                  {estadoEmail === 'enviando' && `${Math.round(progresoEmail)}% - ${mensajeEmail}`}
                  {estadoEmail === 'completado' && '✅ Envío completado'}
                  {estadoEmail === 'error' && '❌ Error en el envío'}
                </div>
                {mensajeEmail && estadoEmail !== 'iniciando' && (
                  <div className={`${styles.modalEmailMensaje} ${estadoEmail === 'completado' ? styles.mensajeSuccess :
                    estadoEmail === 'error' ? styles.mensajeError : ''
                    }`}>
                    {mensajeEmail}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modalEmailFooter}>

              <button
                onClick={enviarFacturaEmail}
                className={styles.btnModalEmailEnviar}
                disabled={enviandoEmail || !emailCliente.trim() || estadoEmail === 'completado'}
              >
                {enviandoEmail ? (
                  <>
                    <FaSpinner className={styles.spinnerIcon} /> Enviando...
                  </>
                ) : estadoEmail === 'completado' ? (
                  '✅ Enviado'
                ) : (
                  <><FaEnvelope /> Enviar Email</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para ver PDF - Corregido para usar blob URL */}
      {modalFacturaVisible && (
        <div className={styles.modalOverlay} onClick={() => {
          setModalFacturaVisible(false);
          if (pdfUrl && pdfUrl.startsWith('blob:')) {
            URL.revokeObjectURL(pdfUrl);
          }
          setPdfUrl(null);
          setPdfError(false);
        }}>
          <div className={styles.modalContent} style={modalContentStyles} ref={modalContentRef} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3><FaFileInvoiceDollar /> Factura {facturaSeleccionada?.numero}</h3>
              <button className={styles.modalClose} onClick={() => {
                setModalFacturaVisible(false);
                if (pdfUrl && pdfUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(pdfUrl);
                }
                setPdfUrl(null);
                setPdfError(false);
              }}>
                <FaTimes />
              </button>
            </div>
            <div className={styles.modalBody}>
              {pdfError ? (
                <div className={styles.pdfErrorContainer}>
                  <p>❌ Error al cargar el PDF</p>
                  <button onClick={() => {
                    setPdfError(false);
                    verPDFFactura(facturaSeleccionada);
                  }} className={styles.btnReintentar}>
                    Reintentar
                  </button>
                </div>
              ) : pdfUrl ? (
                <div className={styles.pdfViewerContainer}>
                  <iframe
                    ref={iframeRef}
                    src={pdfUrl}
                    style={pdfIframeStyles}
                    title="Factura PDF"
                    onError={() => setPdfError(true)}
                  />
                </div>
              ) : (
                <div className={styles.pdfLoadingContainer}>
                  <div className={styles.spinnerSmall}></div>
                  <p>Cargando PDF...</p>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button onClick={() => abrirModalEmail(facturaSeleccionada)} className={styles.btnEnviarEmail} disabled={!(facturaSeleccionada?.cliente_email || facturaSeleccionada?.clienteEmail)}>
                <FaEnvelope /> Enviar por Email
              </button>
              <button onClick={() => {
                setModalFacturaVisible(false);
                if (pdfUrl && pdfUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(pdfUrl);
                }
                setPdfUrl(null);
              }} className={styles.btnCerrarModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* 🔥 MODAL DE PROCESAMIENTO CON BARRA DE PROGRESO Y PUNTOS CON PROMOCIÓN */}
      {/* ============================================ */}
      {modalProcesando && (
        <div className={styles.modalProgresoOverlay}>
          <div className={styles.modalProgresoContent}>
            <div className={styles.modalProgresoHeader}>
              <h3>
                {estadoProceso === 'completado' && <FaCheck className={styles.iconSuccess} />}
                {estadoProceso === 'error' && <FaExclamationCircle className={styles.iconError} />}
                {estadoProceso !== 'completado' && estadoProceso !== 'error' && <FaSpinner className={styles.iconSpinner} />}
                {estadoProceso === 'iniciando' && 'Iniciando...'}
                {estadoProceso === 'procesando' && 'Procesando Venta'}
                {estadoProceso === 'completado' && '¡Venta Completada!'}
                {estadoProceso === 'error' && 'Error en la Venta'}
              </h3>
            </div>

            <div className={styles.modalProgresoBody}>
              <p className={styles.mensajeProgreso}>{mensajeProceso}</p>

              <div className={styles.barraProgresoContainer}>
                <div
                  className={`${styles.barraProgreso} ${estadoProceso === 'completado' ? styles.barraCompletada :
                    estadoProceso === 'error' ? styles.barraError : ''
                    }`}
                  style={{ width: `${progreso}%` }}
                />
              </div>

              <div className={styles.porcentajeProgreso}>
                {estadoProceso === 'completado' ? '✅ 100%' : `${Math.round(progreso)}%`}
              </div>

              {resultadoProceso && estadoProceso === 'completado' && (
                <div className={styles.resultadoExitoso}>
                  <div className={styles.resultadoDetalle}>
                    <span>📄 Factura:</span>
                    <strong>{resultadoProceso.numero}</strong>
                  </div>
                  <div className={styles.resultadoDetalle}>
                    <span>💰 Total:</span>
                    <strong>{formatearMoneda(resultadoProceso.total)}</strong>
                  </div>
                  <div className={styles.resultadoDetalle}>
                    <span>🧾 IVA:</span>
                    <strong>{formatearMoneda(resultadoProceso.iva)}</strong>
                  </div>
                  <div className={styles.resultadoDetalle}>
                    <span>🎯 Puntos base:</span>
                    <strong>{resultadoProceso.puntosBase || resultadoProceso.puntos} pts</strong>
                  </div>
                  <div className={styles.resultadoDetalle}>
                    <span>🎯 Puntos otorgados:</span>
                    <strong>
                      {resultadoProceso.puntos} pts
                      {resultadoProceso.promocion && (
                        <span className={styles.promocionBadge}>
                          {' '}
                          <FaGift /> x{resultadoProceso.promocion.multiplicador} ({resultadoProceso.promocion.nombre})
                        </span>
                      )}
                      {!resultadoProceso.promocion && (
                        <span className={styles.sinPromocionBadge}> (Sin promoción)</span>
                      )}
                    </strong>
                  </div>
                </div>
              )}

              {resultadoProceso && estadoProceso === 'error' && (
                <div className={styles.resultadoError}>
                  <p>❌ {resultadoProceso.mensaje}</p>
                  <button
                    onClick={() => setModalProcesando(false)}
                    className={styles.btnCerrarError}
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>

            {estadoProceso === 'completado' && (
              <div className={styles.modalProgresoFooter}>
                <button
                  onClick={() => {
                    setModalProcesando(false);
                    resetearFactura();
                    cargarFacturas();
                  }}
                  className={styles.btnCerrarProgreso}
                >
                  Continuar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ============================================ */}
      {/* FIN MODAL DE PROCESAMIENTO */}
      {/* ============================================ */}

      {/* Vista: Reportes */}
      {vistaActiva === 'reportes' && (
        <div className={styles.reportesSection}>
          <h3><FaFileExport /> Productos Más Vendidos</h3>
          <div className={styles.reportesGrid}>
            <div className={styles.reporteCard} style={{ gridColumn: 'span 2' }}>
              <h4><FaCrown /> Ranking de Productos</h4>
              <div className={styles.tablaProductosContainer}>
                <table className={styles.tablaProductos}>
                  <thead>
                    <tr><th>Producto</th><th>Categoría</th><th>Unidades</th><th>Ingresos</th><th>Ganancias</th><th>Margen</th></tr>
                  </thead>
                  <tbody>
                    {productosMasVendidos.map((producto, index) => (
                      <tr key={producto.id} style={{ backgroundColor: index === 0 ? '#fef3c7' : 'transparent' }}>
                        <td><div><strong>{producto.nombre}</strong><br /><small style={{ color: '#64748b' }}>{producto.codigo}</small></div></td>
                        <td><span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>{producto.categoria}</span></td>
                        <td style={{ fontWeight: '600' }}>{producto.cantidad}</td>
                        <td style={{ color: '#3b82f6' }}>{formatearMoneda(producto.ingresos)}</td>
                        <td style={{ color: '#10b981' }}>{formatearMoneda(producto.ganancias)}</td>
                        <td><span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 8px', borderRadius: '4px' }}>{producto.margen}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacturacionColab;