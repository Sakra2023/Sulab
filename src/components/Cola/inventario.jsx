import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import io from 'socket.io-client';
import styles from '../../assets/css/colab/inven.module.css';
import { 
  FaBox, FaSearch, FaPlus, FaEdit, FaTrash, FaBarcode,
  FaFilter, FaDownload, FaWarehouse, FaTags, FaDollarSign,
  FaPercent, FaExclamationTriangle, FaAppleAlt, FaShoePrints, FaUtensils,
  FaToggleOn, FaToggleOff, FaTimes, FaSave, FaUndo
} from 'react-icons/fa';

export default function InventarioColab() {
  // Obtener datos del contexto del outlet
  const { emprendimientoId, usuarioId } = useOutletContext();
  
  const [productos, setProductos] = useState([]);
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroStock, setFiltroStock] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [atributosEspecificos, setAtributosEspecificos] = useState({});
  
  // Estados para ajuste de stock
  const [ajusteStock, setAjusteStock] = useState(0);
  const [mostrarAjusteStock, setMostrarAjusteStock] = useState(false);
  
  // Estados para Socket.IO
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const socketRef = useRef(null);
  
  const [formData, setFormData] = useState({
    codigo: '', nombre: '', descripcion: '', categoria: 'general',
    precio_venta: 0, precio_compra: 0, stock: 0, stock_minimo: 5, unidad_medida: 'unidad',
    proveedor: '', iva: 16, activo: true
  });

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
  // CONEXIÓN SOCKET.IO (URL relativa)
  // ============================================
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !emprendimientoId) return;

    const newSocket = io({
      path: '/socket.io/',
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket.IO conectado en Inventario');
      setIsSocketConnected(true);
      // Unirse a la sala del emprendimiento
      newSocket.emit('join_room', `emprendimiento_${emprendimientoId}`);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket.IO desconectado en Inventario');
      setIsSocketConnected(false);
    });

    // ===== EVENTOS DE PRODUCTOS =====
    newSocket.on('producto_creado', (data) => {
      console.log('📡 Producto creado en tiempo real:', data);
      if (data.emprendimiento_id === emprendimientoId) {
        const nuevoProducto = {
          id: data.producto_id,
          codigo: data.codigo || '',
          nombre: data.nombre || 'Producto',
          precio_venta: data.precio_venta || 0,
          stock: data.stock || 0,
          categoria: data.categoria || 'general',
          descripcion: data.descripcion || '',
          precio_compra: 0,
          stock_minimo: 5,
          unidad_medida: 'unidad',
          proveedor: '',
          iva: 16,
          activo: 1,
          atributos: {}
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

    return () => {
      if (newSocket) {
        newSocket.off('connect');
        newSocket.off('disconnect');
        newSocket.off('producto_creado');
        newSocket.off('producto_actualizado');
        newSocket.off('producto_eliminado');
        newSocket.off('stock_actualizado');
        newSocket.disconnect();
      }
    };
  }, [emprendimientoId]);

  const camposPorCategoria = {
    ropa: {
      talla: { type: 'select', label: 'Talla', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], required: true },
      color: { type: 'text', label: 'Color', placeholder: 'Ej: Rojo, Azul, Negro', required: true },
      material: { type: 'text', label: 'Material', placeholder: 'Ej: Algodón, Poliéster, Lino' }
    },
    frutas: {},
    comida: {
      preparacion: { type: 'text', label: 'Tiempo preparación (min)', placeholder: 'Ej: 15' },
      tipoComida: { type: 'select', label: 'Tipo', options: ['Desayuno', 'Almuerzo', 'Cena', 'Bebida', 'Postre'], required: true },
      ingredientes: { type: 'textarea', label: 'Ingredientes', placeholder: 'Lista de ingredientes...', rows: 2 },
      aptoVegetariano: { type: 'checkbox', label: 'Apto vegetariano' },
      aptoCeliaco: { type: 'checkbox', label: 'Apto celíaco' }
    },
    servicio: {},
    electronica: {
      marca: { type: 'text', label: 'Marca', required: true },
      modelo: { type: 'text', label: 'Modelo' },
      garantia: { type: 'text', label: 'Garantía (meses)', placeholder: 'Ej: 12' }
    },
    bebidas: {},
    limpieza: {
      tipo: { type: 'select', label: 'Tipo', options: ['Líquido', 'Polvo', 'Spray', 'Pastilla'], required: true },
      presentacion: { type: 'text', label: 'Presentación', placeholder: 'Ej: 500ml, 1kg, 10 sobres' },
      peligroso: { type: 'checkbox', label: 'Producto peligroso' }
    },
    alimentos: {
      peso: { type: 'text', label: 'Peso neto', placeholder: 'Ej: 500g, 1kg' },
      conservacion: { type: 'select', label: 'Conservación', options: ['Ambiente', 'Refrigerado', 'Congelado'] }
    }
  };

  const UNIDADES_MEDIDA = ['unidad', 'kg', 'litro', 'paquete', 'caja', 'metro', 'docena'];
  const UNIDADES_MEDIDA_FRUTAS = ['pieza', 'bolsa', 'kg'];
  const UNIDADES_MEDIDA_SERVICIO = ['servicio'];

  const CATEGORIAS = [
    { value: 'general', label: 'General', icono: <FaBox /> },
    { value: 'ropa', label: 'Ropa', icono: <FaTags /> },
    { value: 'frutas', label: 'Frutas/Verduras', icono: <FaAppleAlt /> },
    { value: 'comida', label: 'Comida/Restaurante', icono: <FaUtensils /> },
    { value: 'servicio', label: 'Servicio', icono: <FaShoePrints /> },
    { value: 'electronica', label: 'Electrónica', icono: <FaBox /> },
    { value: 'bebidas', label: 'Bebidas', icono: <FaBox /> },
    { value: 'limpieza', label: 'Limpieza', icono: <FaBox /> },
    { value: 'alimentos', label: 'Alimentos', icono: <FaBox /> },
    { value: 'hogar', label: 'Hogar', icono: <FaBox /> },
    { value: 'otros', label: 'Otros', icono: <FaBox /> }
  ];

  // Debug: Verificar los datos recibidos
  useEffect(() => {
    console.log('📦 InventarioColab - emprendimientoId:', emprendimientoId);
    console.log('📦 InventarioColab - usuarioId:', usuarioId);
  }, [emprendimientoId, usuarioId]);

  // Cargar productos cuando se recibe el emprendimientoId
  useEffect(() => {
    if (emprendimientoId) {
      cargarProductos();
    } else {
      console.log('⏳ Esperando emprendimientoId...');
      setCargando(false);
    }
  }, [emprendimientoId]);

  // ✅ Cargar productos (URL relativa)
  const cargarProductos = async () => {
    if (!verificarToken()) return;
    
    setCargando(true);
    try {
      console.log(`📡 Fetching productos para emprendimientoId: ${emprendimientoId}`);
      const response = await fetch(`/api/inventario/emprendimiento/${emprendimientoId}`, {
        headers: getAuthHeaders()
      });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        const productosParseados = (data.productos || []).map(p => ({
          ...p,
          atributos: typeof p.atributos === 'string' ? JSON.parse(p.atributos) : (p.atributos || {})
        }));
        setProductos(productosParseados);
        setProductosFiltrados(productosParseados);
        console.log(`✅ Cargados ${productosParseados.length} productos`);
      } else {
        console.error('❌ Error al cargar productos:', data.message);
        setProductos([]);
        setProductosFiltrados([]);
      }
    } catch (error) {
      console.error('❌ Error de red:', error);
      alert('Error al cargar productos');
      setProductos([]);
      setProductosFiltrados([]);
    } finally {
      setCargando(false);
    }
  };

  // Filtrar productos
  useEffect(() => {
    let resultado = [...productos];
    
    if (busqueda) {
      const termino = busqueda.toLowerCase();
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(termino) ||
        p.codigo.toLowerCase().includes(termino) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(termino))
      );
    }
    
    if (filtroCategoria !== 'todas') {
      resultado = resultado.filter(p => p.categoria === filtroCategoria);
    }
    
    if (filtroStock === 'bajo') {
      resultado = resultado.filter(p => p.stock <= p.stock_minimo && p.stock > 0);
    } else if (filtroStock === 'agotado') {
      resultado = resultado.filter(p => p.stock === 0);
    } else if (filtroStock === 'stock') {
      resultado = resultado.filter(p => p.stock > 0);
    }
    
    if (filtroEstado === 'activos') {
      resultado = resultado.filter(p => p.activo === 1);
    } else if (filtroEstado === 'inactivos') {
      resultado = resultado.filter(p => p.activo === 0);
    }
    
    setProductosFiltrados(resultado);
  }, [productos, busqueda, filtroCategoria, filtroStock, filtroEstado]);

  // Calcular margen de ganancia promedio
  const calcularMargenPromedio = () => {
    const productosConCompra = productos.filter(p => p.precio_compra && p.precio_compra > 0);
    if (productosConCompra.length === 0) return 0;
    const sumaMargenes = productosConCompra.reduce((sum, p) => {
      const margen = ((p.precio_venta - p.precio_compra) / p.precio_compra) * 100;
      return sum + margen;
    }, 0);
    return sumaMargenes / productosConCompra.length;
  };

  const estadisticas = {
    totalProductos: productos.length,
    productosActivos: productos.filter(p => p.activo).length,
    productosInactivos: productos.filter(p => !p.activo).length,
    valorInventario: productos.reduce((sum, p) => sum + (p.stock * p.precio_venta), 0),
    valorInventarioCompra: productos.reduce((sum, p) => sum + (p.stock * (p.precio_compra || 0)), 0),
    productosBajoStock: productos.filter(p => p.stock <= p.stock_minimo && p.stock > 0).length,
    productosAgotados: productos.filter(p => p.stock === 0).length,
    margenPromedio: calcularMargenPromedio()
  };

  // Generar código automático por emprendimiento
  const generarCodigo = () => {
    if (!emprendimientoId) return 'PROD-001';
    
    const prefix = `EMP-${emprendimientoId}-PROD`;
    const productosEmprendimiento = productos.filter(p => p.emprendimiento_id === emprendimientoId);
    
    if (productosEmprendimiento.length === 0) {
      return `${prefix}-001`;
    }
    
    const numeros = productosEmprendimiento.map(p => {
      const partes = p.codigo.split('-');
      const ultimoSegmento = partes[partes.length - 1];
      return parseInt(ultimoSegmento) || 0;
    });
    
    const maxNumero = Math.max(...numeros, 0);
    const nuevoNumero = String(maxNumero + 1).padStart(3, '0');
    
    return `${prefix}-${nuevoNumero}`;
  };

  const getUnidadesMedida = (categoria) => {
    if (categoria === 'frutas') return UNIDADES_MEDIDA_FRUTAS;
    if (categoria === 'servicio') return UNIDADES_MEDIDA_SERVICIO;
    return UNIDADES_MEDIDA;
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? parseFloat(value) || 0 : 
              value
    }));
  };

  const handleAtributoChange = (campo, valor) => {
    setAtributosEspecificos(prev => ({ ...prev, [campo]: valor }));
  };

  const handleCategoriaChange = (e) => {
    const nuevaCategoria = e.target.value;
    setFormData(prev => ({ 
      ...prev, 
      categoria: nuevaCategoria,
      unidad_medida: getUnidadesMedida(nuevaCategoria)[0] || 'unidad'
    }));
    setAtributosEspecificos({});
    
    if (nuevaCategoria === 'servicio') {
      setFormData(prev => ({ ...prev, stock_minimo: 0, stock: 999 }));
    } else {
      setFormData(prev => ({ ...prev, stock_minimo: 5, stock: 0 }));
    }
  };

  // Función para aplicar ajuste de stock
  const aplicarAjusteStock = () => {
    if (ajusteStock === 0) return;
    
    const nuevoStock = formData.stock + ajusteStock;
    
    if (nuevoStock < 0) {
      alert('El stock no puede ser negativo');
      return;
    }
    
    if (formData.categoria === 'servicio') {
      alert('Los servicios no tienen stock');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      stock: nuevoStock
    }));
    
    // Mostrar mensaje de confirmación
    const operacion = ajusteStock > 0 ? `+${ajusteStock}` : ajusteStock;
    alert(`Stock ajustado: ${formData.stock} → ${nuevoStock} (${operacion})`);
    
    // Resetear ajuste
    setAjusteStock(0);
    setMostrarAjusteStock(false);
  };

  const validarPorCategoria = () => {
    const campos = camposPorCategoria[formData.categoria];
    if (!campos) return true;
    for (const [key, config] of Object.entries(campos)) {
      if (config.required && !atributosEspecificos[key]) {
        alert(`El campo "${config.label}" es obligatorio`);
        return false;
      }
    }
    return true;
  };

  // ============================================
  // FUNCIÓN GUARDAR PRODUCTO (URLs relativas)
  // ============================================
  const guardarProducto = async (e) => {
    e.preventDefault();
    if (!verificarToken()) return;
    
    if (!formData.nombre.trim()) {
      alert('El nombre es requerido');
      return;
    }
    if (formData.precio_venta <= 0) {
      alert('El precio de venta debe ser mayor a 0');
      return;
    }
    if (!validarPorCategoria()) return;
    
    const stockFinal = formData.categoria === 'servicio' ? 999 : formData.stock;
    const stockMinimoFinal = formData.categoria === 'servicio' ? 0 : formData.stock_minimo;
    
    // Datos base del producto (comunes para crear y actualizar)
    const baseData = {
      codigo: productoEditando ? formData.codigo : generarCodigo(),
      nombre: formData.nombre,
      descripcion: formData.descripcion || null,
      categoria: formData.categoria,
      precio_venta: formData.precio_venta,
      precio_compra: formData.precio_compra || 0,
      stock: stockFinal,
      stock_minimo: stockMinimoFinal,
      unidad_medida: formData.unidad_medida,
      proveedor: formData.proveedor || null,
      iva: formData.iva,
      activo: formData.activo,
      atributos: atributosEspecificos
    };

    // 🔑 IMPORTANTE: Solo en creación se incluyen los IDs
    const productoData = productoEditando 
      ? baseData  // PUT: solo campos del producto
      : { ...baseData, emprendimiento_id: emprendimientoId, usuario_id: usuarioId };  // POST: incluye IDs
    
    try {
      let response;
      if (productoEditando) {
        response = await fetch(`/api/inventario/${productoEditando.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(productoData)
        });
      } else {
        response = await fetch(`/api/inventario`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(productoData)
        });
      }
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        alert(productoEditando ? 'Producto actualizado' : 'Producto agregado');
        cargarProductos();
        resetearFormulario();
      } else {
        alert(data.message || 'Error al guardar');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error de conexión');
    }
  };

  const resetearFormulario = () => {
    setFormData({
      codigo: '', nombre: '', descripcion: '', categoria: 'general',
      precio_venta: 0, precio_compra: 0, stock: 0, stock_minimo: 5, unidad_medida: 'unidad',
      proveedor: '', iva: 16, activo: true
    });
    setAtributosEspecificos({});
    setProductoEditando(null);
    setMostrarFormulario(false);
    setAjusteStock(0);
    setMostrarAjusteStock(false);
  };

  const editarProducto = (producto) => {
    setFormData({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      categoria: producto.categoria,
      precio_venta: producto.precio_venta,
      precio_compra: producto.precio_compra || 0,
      stock: producto.stock === 999 ? 0 : producto.stock,
      stock_minimo: producto.stock_minimo,
      unidad_medida: producto.unidad_medida,
      proveedor: producto.proveedor || '',
      iva: producto.iva,
      activo: producto.activo === 1
    });
    setAtributosEspecificos(producto.atributos || {});
    setProductoEditando(producto);
    setMostrarFormulario(true);
    setAjusteStock(0);
    setMostrarAjusteStock(false);
  };

  // ✅ Eliminar producto (URL relativa)
  const eliminarProducto = async (id) => {
    if (!verificarToken()) return;
    if (!window.confirm('¿Eliminar este producto?')) return;
    
    try {
      const response = await fetch(`/api/inventario/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        alert('Producto eliminado');
        cargarProductos();
      } else {
        alert(data.message || 'Error al eliminar');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión');
    }
  };

  // ✅ Toggle activo (URL relativa)
  const toggleActivo = async (id, activoActual) => {
    if (!verificarToken()) return;
    
    try {
      const response = await fetch(`/api/inventario/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ activo: !activoActual })
      });
      
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        cargarProductos();
      } else {
        alert(data.message || 'Error al cambiar estado');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión');
    }
  };

  const exportarCSV = () => {
    const csv = [['Código', 'Nombre', 'Categoría', 'Precio Venta', 'Precio Compra', 'Margen %', 'Stock', 'Stock Mínimo', 'Proveedor', 'Estado', 'Atributos'],
      ...productos.map(p => {
        const margen = p.precio_compra ? (((p.precio_venta - p.precio_compra) / p.precio_compra) * 100).toFixed(2) : 'N/A';
        return [p.codigo, p.nombre, p.categoria, `$${p.precio_venta}`, `$${p.precio_compra || 0}`, margen, p.stock, p.stock_minimo, p.proveedor || '', p.activo ? 'Activo' : 'Inactivo', JSON.stringify(p.atributos || {})];
      })
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${emprendimientoId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const formatearMoneda = (monto) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto);

  const getStockColor = (stock, stockMinimo, categoria) => {
    if (categoria === 'servicio') return '#10b981';
    if (stock === 0) return '#ef4444';
    if (stock <= stockMinimo) return '#f59e0b';
    return '#10b981';
  };

  const getStockTexto = (stock, stockMinimo, categoria) => {
    if (categoria === 'servicio') return 'Siempre disponible';
    if (stock === 0) return 'Agotado';
    if (stock <= stockMinimo) return 'Bajo Stock';
    return 'Disponible';
  };

  const renderizarCamposCategoria = () => {
    const campos = camposPorCategoria[formData.categoria];
    if (!campos || Object.keys(campos).length === 0) return null;
    return (
      <div className={styles.camposCategoria}>
        <div className={styles.camposCategoriaHeader}>
          <h4>Atributos para {CATEGORIAS.find(c => c.value === formData.categoria)?.label || formData.categoria}</h4>
        </div>
        <div className={styles.formGridSmall}>
          {Object.entries(campos).map(([key, config]) => {
            const valor = atributosEspecificos[key] || '';
            switch (config.type) {
              case 'select':
                return (
                  <div key={key} className={styles.formGrupo}>
                    <label>{config.label} {config.required && '*'}</label>
                    <select value={valor} onChange={(e) => handleAtributoChange(key, e.target.value)} className={styles.formSelect}>
                      <option value="">Seleccionar</option>
                      {config.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                );
              case 'checkbox':
                return (
                  <div key={key} className={styles.formCheckbox}>
                    <label>
                      <input type="checkbox" checked={!!valor} onChange={(e) => handleAtributoChange(key, e.target.checked)} />
                      <span className={styles.checkboxLabel}>{config.label}</span>
                    </label>
                  </div>
                );
              case 'textarea':
                return (
                  <div key={key} className={styles.formGrupo}>
                    <label>{config.label}</label>
                    <textarea value={valor} onChange={(e) => handleAtributoChange(key, e.target.value)} rows={config.rows || 3} placeholder={config.placeholder} className={styles.formTextarea} />
                  </div>
                );
              default:
                return (
                  <div key={key} className={styles.formGrupo}>
                    <label>{config.label} {config.required && '*'}</label>
                    <input type="text" value={valor} onChange={(e) => handleAtributoChange(key, e.target.value)} placeholder={config.placeholder} className={styles.formInput} />
                  </div>
                );
            }
          })}
        </div>
      </div>
    );
  };

  const mostrarAtributosResumen = (producto) => {
    if (!producto.atributos || Object.keys(producto.atributos).length === 0) return null;
    const atributosMostrar = [];
    const campos = camposPorCategoria[producto.categoria];
    if (!campos) return null;
    for (const [key, config] of Object.entries(campos)) {
      if (producto.atributos[key]) atributosMostrar.push(`${config.label}: ${producto.atributos[key]}`);
    }
    if (atributosMostrar.length === 0) return null;
    return <div className={styles.atributosResumen}>{atributosMostrar.slice(0, 2).join(' | ')}{atributosMostrar.length > 2 && ` +${atributosMostrar.length - 2}`}</div>;
  };

  // Mostrar mensaje si no hay emprendimientoId
  if (!emprendimientoId) {
    return (
      <div className={styles.cargandoContainer}>
        <p>No se encontró un emprendimiento asociado</p>
        <p className={styles.subtitulo}>Esperando información del negocio...</p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando inventario...</p>
        {isSocketConnected && <p className={styles.socketConnected}>🟢 Tiempo real activo</p>}
      </div>
    );
  }

  return (
    <div className={styles.inventarioContainer}>
      {/* Indicador de conexión Socket.IO */}
      <div className={styles.socketStatusBar}>
        {isSocketConnected ? (
          <span className={styles.socketConnected}>🟢 Tiempo real activo</span>
        ) : (
          <span className={styles.socketDisconnected}>🔴 Reconectando...</span>
        )}
      </div>

      {/* Encabezado */}
      <div className={styles.encabezado}>
        <div className={styles.tituloSection}>
          <h1>
            <FaWarehouse className={styles.tituloIcono} /> 
            Gestión de Inventario
          </h1>
          <p className={styles.subtitulo}>Administra los productos de tu negocio</p>
        </div>
        <div className={styles.accionesHeader}>
          <button 
            onClick={() => { resetearFormulario(); setMostrarFormulario(true); }} 
            className={styles.btnAgregar}
          >
            <FaPlus /> Agregar Producto
          </button>
          <button onClick={exportarCSV} className={styles.btnExportar}>
            <FaDownload /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className={styles.estadisticasGrid}>
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#3b82f620' }}>
            <FaBox style={{ color: '#3b82f6' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Total Productos</h3>
            <p className={styles.estadisticaValor}>{estadisticas.totalProductos}</p>
            <p className={styles.estadisticaDetalle}>{estadisticas.productosActivos} activos / {estadisticas.productosInactivos} inactivos</p>
          </div>
        </div>
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#10b98120' }}>
            <FaDollarSign style={{ color: '#10b981' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Valor Venta</h3>
            <p className={styles.estadisticaValor}>{formatearMoneda(estadisticas.valorInventario)}</p>
            <p className={styles.estadisticaDetalle}>Precio de venta total</p>
          </div>
        </div>
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#f59e0b20' }}>
            <FaExclamationTriangle style={{ color: '#f59e0b' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Bajo Stock</h3>
            <p className={styles.estadisticaValor}>{estadisticas.productosBajoStock}</p>
            <p className={styles.estadisticaDetalle}>{estadisticas.productosAgotados} agotados</p>
          </div>
        </div>
        <div className={styles.estadisticaCard}>
          <div className={styles.estadisticaIcono} style={{ backgroundColor: '#8b5cf620' }}>
            <FaPercent style={{ color: '#8b5cf6' }} />
          </div>
          <div className={styles.estadisticaContenido}>
            <h3>Margen Promedio</h3>
            <p className={styles.estadisticaValor}>{estadisticas.margenPromedio.toFixed(1)}%</p>
            <p className={styles.estadisticaDetalle}>Ganancia sobre compra</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className={styles.filtrosSection}>
        <div className={styles.filtrosGrid}>
          <div className={styles.filtroGrupo}>
            <label>
              <FaSearch className={styles.filtroIcono} /> Buscar
            </label>
            <input 
              type="text" 
              value={busqueda} 
              onChange={(e) => setBusqueda(e.target.value)} 
              placeholder="Buscar por nombre, código..." 
              className={styles.filtroInput} 
            />
          </div>
          <div className={styles.filtroGrupo}>
            <label>
              <FaTags className={styles.filtroIcono} /> Categoría
            </label>
            <select 
              value={filtroCategoria} 
              onChange={(e) => setFiltroCategoria(e.target.value)} 
              className={styles.filtroSelect}
            >
              <option value="todas">Todas las categorías</option>
              {CATEGORIAS.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filtroGrupo}>
            <label>
              <FaFilter className={styles.filtroIcono} /> Estado de Stock
            </label>
            <select 
              value={filtroStock} 
              onChange={(e) => setFiltroStock(e.target.value)} 
              className={styles.filtroSelect}
            >
              <option value="todos">Todos</option>
              <option value="stock">Con stock disponible</option>
              <option value="bajo">Stock bajo</option>
              <option value="agotado">Agotados</option>
            </select>
          </div>
          <div className={styles.filtroGrupo}>
            <label>
              <FaToggleOn className={styles.filtroIcono} /> Estado Producto
            </label>
            <select 
              value={filtroEstado} 
              onChange={(e) => setFiltroEstado(e.target.value)} 
              className={styles.filtroSelect}
            >
              <option value="todos">Todos</option>
              <option value="activos">Solo activos</option>
              <option value="inactivos">Solo inactivos</option>
            </select>
          </div>
        </div>
        <div className={styles.contadorResultados}>
          Mostrando {productosFiltrados.length} de {productos.length} productos
        </div>
      </div>

      {/* Tabla de productos */}
      <div className={styles.tablaSection}>
        <div className={styles.tablaHeader}>
          <h3>
            <FaBox className={styles.tablaIcono} /> 
            Productos Registrados
          </h3>
        </div>
        
        {productosFiltrados.length === 0 ? (
          <div className={styles.sinProductos}>
            <FaBox className={styles.sinIcono} />
            <h3>No hay productos</h3>
            <p>No se encontraron productos con los filtros actuales</p>
            <button 
              onClick={() => { setBusqueda(''); setFiltroCategoria('todas'); setFiltroStock('todos'); setFiltroEstado('todos'); }} 
              className={styles.btnLimpiar}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className={styles.tablaContainer}>
            <table className={styles.tablaProductos}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio Venta</th>
                  <th>Margen</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map(producto => {
                  const margen = producto.precio_compra ? ((producto.precio_venta - producto.precio_compra) / producto.precio_compra * 100).toFixed(1) : null;
                  const rowStyle = producto.activo === 0 ? { opacity: 0.6, backgroundColor: '#f9fafb' } : {};
                  
                  return (
                    <tr key={producto.id} style={rowStyle}>
                      <td>
                        <div className={styles.codigoContainer}>
                          <FaBarcode className={styles.codigoIcono} />
                          <span className={styles.codigoTexto}>{producto.codigo}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.productoInfo}>
                          <h4 className={styles.productoNombre}>{producto.nombre}</h4>
                          {producto.descripcion && (
                            <p className={styles.productoDescripcion}>{producto.descripcion}</p>
                          )}
                          {mostrarAtributosResumen(producto)}
                          <div className={styles.productoDetalles}>
                            <span className={styles.detalleItem}>
                              Proveedor: {producto.proveedor || 'N/A'} | Unidad: {producto.unidad_medida}
                            </span>
                            {producto.precio_compra > 0 && (
                              <span className={styles.detalleItem}>
                                Compra: {formatearMoneda(producto.precio_compra)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.categoriaBadge}>
                          {CATEGORIAS.find(c => c.value === producto.categoria)?.label || producto.categoria}
                        </span>
                      </td>
                      <td>
                        <div className={styles.preciosContainer}>
                          <div className={styles.precioItem}>
                            <span className={styles.precioLabel}>Venta:</span>
                            <span className={styles.precioValorVenta}>{formatearMoneda(producto.precio_venta)}</span>
                          </div>
                          <div className={styles.precioItem}>
                            <span className={styles.precioLabel}>IVA:</span>
                            <span className={styles.precioValor}>{producto.iva}%</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {margen ? (
                          <div className={styles.puntosContainer}>
                            <span 
                              className={styles.puntosValor}
                              style={{ color: margen >= 50 ? '#10b981' : margen >= 20 ? '#f59e0b' : '#ef4444' }}
                            >
                              {margen}%
                            </span>
                            <span className={styles.puntosInfo}>ganancia</span>
                          </div>
                        ) : (
                          <span className={styles.puntosInfo}>Sin datos</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.stockContainer}>
                          <div className={styles.stockInfo}>
                            <span 
                              className={styles.stockEstado}
                              style={{ color: getStockColor(producto.stock, producto.stock_minimo, producto.categoria) }}
                            >
                              {getStockTexto(producto.stock, producto.stock_minimo, producto.categoria)}
                            </span>
                            <span className={styles.stockCantidad}>
                              {producto.stock === 999 ? '∞' : `${producto.stock} ${producto.unidad_medida}`}
                            </span>
                          </div>
                          {producto.categoria !== 'servicio' && (
                            <div className={styles.stockMinimo}>
                              Mínimo: {producto.stock_minimo} {producto.unidad_medida}
                            </div>
                          )}
                          {producto.stock <= producto.stock_minimo && producto.stock > 0 && (
                            <div className={styles.stockAlerta}>
                              ⚠️ Reponer pronto
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.estadoContainer}>
                          <span className={`${styles.estadoBadge} ${producto.activo ? styles.estadoActivo : styles.estadoInactivo}`}>
                            {producto.activo ? 'Activo' : 'Inactivo'}
                          </span>
                          <button 
                            onClick={() => toggleActivo(producto.id, producto.activo)}
                            className={styles.toggleBtn}
                            title={producto.activo ? 'Desactivar' : 'Activar'}
                          >
                            {producto.activo ? <FaToggleOn /> : <FaToggleOff />}
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className={styles.accionesContainer}>
                          <button 
                            onClick={() => editarProducto(producto)}
                            className={styles.btnEditar}
                            title="Editar"
                          >
                            <FaEdit />
                          </button>
                          <button 
                            onClick={() => eliminarProducto(producto.id)}
                            className={styles.btnEliminar}
                            title="Eliminar"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de formulario */}
      {mostrarFormulario && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>
                {productoEditando ? (
                  <>Editar Producto</>
                ) : (
                  <>Agregar Producto</>
                )}
              </h2>
              <button onClick={resetearFormulario} className={styles.modalCloseBtn}>
                <FaTimes />
              </button>
            </div>
            
            <form onSubmit={guardarProducto} className={styles.formulario}>
              <div className={styles.formGrid}>
                <div className={styles.formColumna}>
                  <div className={styles.formGrupo}>
                    <label>Código *</label>
                    <input 
                      name="codigo" 
                      value={productoEditando ? formData.codigo : generarCodigo()} 
                      onChange={handleInputChange} 
                      readOnly 
                      className={styles.formInput}
                    />
                    <small className={styles.formAyuda}>
                      Código generado automáticamente para este emprendimiento
                    </small>
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Nombre *</label>
                    <input 
                      name="nombre" 
                      value={formData.nombre} 
                      onChange={handleInputChange} 
                      required 
                      className={styles.formInput}
                    />
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Descripción</label>
                    <textarea 
                      name="descripcion" 
                      value={formData.descripcion} 
                      onChange={handleInputChange} 
                      rows="3" 
                      className={styles.formTextarea}
                    />
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Categoría *</label>
                    <select 
                      name="categoria" 
                      value={formData.categoria} 
                      onChange={handleCategoriaChange}
                      className={styles.formSelect}
                    >
                      {CATEGORIAS.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Unidad de Medida</label>
                    <select 
                      name="unidad_medida" 
                      value={formData.unidad_medida} 
                      onChange={handleInputChange}
                      className={styles.formSelect}
                    >
                      {getUnidadesMedida(formData.categoria).map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className={styles.formColumna}>
                  <div className={styles.formGrupo}>
                    <label>Precio Venta *</label>
                    <input 
                      name="precio_venta" 
                      type="number" 
                      step="0.01" 
                      value={formData.precio_venta} 
                      onChange={handleInputChange} 
                      required 
                      className={styles.formInput}
                    />
                  </div>
                  
                  <div className={styles.formGrupo}>
                    <label>Precio Compra</label>
                    <input 
                      name="precio_compra" 
                      type="number" 
                      step="0.01" 
                      value={formData.precio_compra} 
                      onChange={handleInputChange} 
                      className={styles.formInput}
                    />
                    {formData.precio_venta > 0 && formData.precio_compra > 0 && (
                      <small className={styles.formAyuda} style={{ color: '#10b981' }}>
                        Margen: {((formData.precio_venta - formData.precio_compra) / formData.precio_compra * 100).toFixed(1)}%
                      </small>
                    )}
                  </div>
                  
                  {/* SECCIÓN DE STOCK CON AJUSTE */}
                  <div className={styles.formRow}>
                    <div className={styles.formGrupo}>
                      <label>Stock Actual</label>
                      <input 
                        name="stock" 
                        type="number" 
                        value={formData.stock} 
                        onChange={handleInputChange} 
                        disabled={formData.categoria === 'servicio'}
                        className={styles.formInput}
                      />
                      {formData.categoria !== 'servicio' && (
                        <small className={styles.formAyuda}>
                          Puedes editar directamente o usar el ajuste rápido
                        </small>
                      )}
                    </div>
                    
                    {formData.categoria !== 'servicio' && (
                      <div className={styles.formGrupo}>
                        <label>Stock Mínimo</label>
                        <input 
                          name="stock_minimo" 
                          type="number" 
                          value={formData.stock_minimo} 
                          onChange={handleInputChange} 
                          className={styles.formInput}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Sección de ajuste rápido de stock (solo en edición y no servicios) */}
                  {productoEditando && formData.categoria !== 'servicio' && (
                    <div className={styles.ajusteStockSection}>
                      <div className={styles.ajusteStockHeader}>
                        <h4>Ajuste Rápido de Stock</h4>
                        <button 
                          type="button"
                          onClick={() => setMostrarAjusteStock(!mostrarAjusteStock)}
                          className={styles.btnToggleAjuste}
                        >
                          {mostrarAjusteStock ? 'Ocultar' : 'Mostrar ajuste'}
                        </button>
                      </div>
                      
                      {mostrarAjusteStock && (
                        <div className={styles.ajusteStockContainer}>
                          <div className={styles.ajusteStockControls}>
                            <button
                              type="button"
                              onClick={() => setAjusteStock(prev => prev - 1)}
                              className={styles.btnAjuste}
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={() => setAjusteStock(prev => prev - 5)}
                              className={styles.btnAjuste}
                            >
                              -5
                            </button>
                            <button
                              type="button"
                              onClick={() => setAjusteStock(prev => prev - 10)}
                              className={styles.btnAjuste}
                            >
                              -10
                            </button>
                            
                            <input
                              type="number"
                              value={ajusteStock}
                              onChange={(e) => setAjusteStock(parseInt(e.target.value) || 0)}
                              className={styles.ajusteInput}
                              placeholder="Cantidad"
                            />
                            
                            <button
                              type="button"
                              onClick={() => setAjusteStock(prev => prev + 1)}
                              className={styles.btnAjuste}
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => setAjusteStock(prev => prev + 5)}
                              className={styles.btnAjuste}
                            >
                              +5
                            </button>
                            <button
                              type="button"
                              onClick={() => setAjusteStock(prev => prev + 10)}
                              className={styles.btnAjuste}
                            >
                              +10
                            </button>
                          </div>
                          
                          <div className={styles.ajusteStockInfo}>
                            <span>Stock actual: <strong>{formData.stock}</strong></span>
                            <span>Ajuste: <strong style={{ color: ajusteStock > 0 ? '#10b981' : ajusteStock < 0 ? '#ef4444' : '#6b7280' }}>
                              {ajusteStock > 0 ? `+${ajusteStock}` : ajusteStock}
                            </strong></span>
                            <span>Nuevo stock: <strong>{formData.stock + ajusteStock}</strong></span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={aplicarAjusteStock}
                            disabled={ajusteStock === 0}
                            className={styles.btnAplicarAjuste}
                          >
                            Aplicar Ajuste
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className={styles.formGrupo}>
                    <label>Proveedor</label>
                    <input 
                      name="proveedor" 
                      value={formData.proveedor} 
                      onChange={handleInputChange} 
                      className={styles.formInput}
                    />
                  </div>
                  
                  <div className={styles.formRow}>
                    <div className={styles.formGrupo}>
                      <label>IVA %</label>
                      <input 
                        name="iva" 
                        type="number" 
                        step="0.1" 
                        value={formData.iva} 
                        onChange={handleInputChange} 
                        className={styles.formInput}
                      />
                    </div>
                    
                    <div className={styles.formCheckbox}>
                      <label>
                        <input 
                          type="checkbox" 
                          name="activo" 
                          checked={formData.activo} 
                          onChange={handleInputChange} 
                        />
                        <span className={styles.checkboxLabel}>Producto activo</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              
              {renderizarCamposCategoria()}
              
              <div className={styles.formAcciones}>
                <button type="button" onClick={resetearFormulario} className={styles.btnCancelar}>
                  <FaUndo /> Cancelar
                </button>
                <button type="submit" className={styles.btnGuardar}>
                  <FaSave /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}