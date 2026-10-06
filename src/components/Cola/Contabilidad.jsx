import React, { useState, useEffect } from 'react';
import styles from '../../assets/css/colab/conta.module.css';
import { 
  FaCalculator, 
  FaBook, 
  FaMoneyBillWave, 
  FaChartLine, 
  FaFileInvoice,
  FaFilter,
  FaSearch,
  FaPlus,
  FaEdit,
  FaTrash,
  FaDownload,
  FaPrint,
  FaCalendarAlt,
  FaBalanceScale,
  FaArrowUp,
  FaArrowDown,
  FaExchangeAlt,
  FaFolder,
  FaChartBar,
  FaReceipt
} from 'react-icons/fa';

const ContabilidadColab = () => {
  // Estados principales
  const [planCuentas, setPlanCuentas] = useState([]);
  const [asientos, setAsientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  // Estados para formularios
  const [mostrarFormAsiento, setMostrarFormAsiento] = useState(false);
  const [mostrarFormCuenta, setMostrarFormCuenta] = useState(false);
  const [asientoEditando, setAsientoEditando] = useState(null);
  const [cuentaEditando, setCuentaEditando] = useState(null);
  
  // Estados para filtros
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroCuenta, setFiltroCuenta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  
  // Estados para nuevo asiento
  const [nuevoAsiento, setNuevoAsiento] = useState({
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    referencia: '',
    tipo: 'general',
    partidas: [
      { cuenta: '', debe: 0, haber: 0, descripcion: '' },
      { cuenta: '', debe: 0, haber: 0, descripcion: '' }
    ]
  });
  
  // Estados para nueva cuenta
  const [nuevaCuenta, setNuevaCuenta] = useState({
    codigo: '',
    nombre: '',
    tipo: 'activo',
    categoria: 'corriente',
    nivel: 1,
    padre: '',
    permiteMovimientos: true,
    saldoInicial: 0
  });

  // Tipos de cuentas
  const TIPOS_CUENTA = {
    ACTIVO: 'activo',
    PASIVO: 'pasivo',
    PATRIMONIO: 'patrimonio',
    INGRESO: 'ingreso',
    GASTO: 'gasto'
  };

  // Categorías por tipo
  const CATEGORIAS_CUENTA = {
    [TIPOS_CUENTA.ACTIVO]: ['corriente', 'fijo', 'diferido'],
    [TIPOS_CUENTA.PASIVO]: ['corriente', 'largo-plazo', 'diferido'],
    [TIPOS_CUENTA.PATRIMONIO]: ['capital', 'reservas', 'utilidades'],
    [TIPOS_CUENTA.INGRESO]: ['ventas', 'servicios', 'otros'],
    [TIPOS_CUENTA.GASTO]: ['operativos', 'administrativos', 'financieros', 'ventas']
  };

  // Datos iniciales de ejemplo
  useEffect(() => {
    setCargando(true);
    
    // Plan de cuentas jerárquico
    const planCuentasEjemplo = [
      {
        id: 1,
        codigo: '1',
        nombre: 'ACTIVO',
        tipo: TIPOS_CUENTA.ACTIVO,
        categoria: '',
        nivel: 1,
        padre: '',
        permiteMovimientos: false,
        saldo: 589000,
        saldoInicial: 500000,
        hijos: []
      },
      {
        id: 2,
        codigo: '1.1',
        nombre: 'ACTIVO CORRIENTE',
        tipo: TIPOS_CUENTA.ACTIVO,
        categoria: 'corriente',
        nivel: 2,
        padre: '1',
        permiteMovimientos: false,
        saldo: 325000,
        saldoInicial: 300000,
        hijos: []
      },
      {
        id: 3,
        codigo: '1.1.1',
        nombre: 'Efectivo',
        tipo: TIPOS_CUENTA.ACTIVO,
        categoria: 'corriente',
        nivel: 3,
        padre: '1.1',
        permiteMovimientos: true,
        saldo: 125000,
        saldoInicial: 100000,
        hijos: []
      },
      {
        id: 4,
        codigo: '1.1.2',
        nombre: 'Cuentas por Cobrar',
        tipo: TIPOS_CUENTA.ACTIVO,
        categoria: 'corriente',
        nivel: 3,
        padre: '1.1',
        permiteMovimientos: true,
        saldo: 200000,
        saldoInicial: 200000,
        hijos: []
      },
      {
        id: 5,
        codigo: '2',
        nombre: 'PASIVO',
        tipo: TIPOS_CUENTA.PASIVO,
        categoria: '',
        nivel: 1,
        padre: '',
        permiteMovimientos: false,
        saldo: 280000,
        saldoInicial: 250000,
        hijos: []
      },
      {
        id: 6,
        codigo: '2.1',
        nombre: 'PASIVO CORRIENTE',
        tipo: TIPOS_CUENTA.PASIVO,
        categoria: 'corriente',
        nivel: 2,
        padre: '2',
        permiteMovimientos: false,
        saldo: 180000,
        saldoInicial: 150000,
        hijos: []
      },
      {
        id: 7,
        codigo: '2.1.1',
        nombre: 'Proveedores',
        tipo: TIPOS_CUENTA.PASIVO,
        categoria: 'corriente',
        nivel: 3,
        padre: '2.1',
        permiteMovimientos: true,
        saldo: 120000,
        saldoInicial: 100000,
        hijos: []
      },
      {
        id: 8,
        codigo: '3',
        nombre: 'PATRIMONIO',
        tipo: TIPOS_CUENTA.PATRIMONIO,
        categoria: '',
        nivel: 1,
        padre: '',
        permiteMovimientos: false,
        saldo: 309000,
        saldoInicial: 250000,
        hijos: []
      },
      {
        id: 9,
        codigo: '3.1',
        nombre: 'Capital Social',
        tipo: TIPOS_CUENTA.PATRIMONIO,
        categoria: 'capital',
        nivel: 2,
        padre: '3',
        permiteMovimientos: true,
        saldo: 250000,
        saldoInicial: 250000,
        hijos: []
      },
      {
        id: 10,
        codigo: '4',
        nombre: 'INGRESOS',
        tipo: TIPOS_CUENTA.INGRESO,
        categoria: '',
        nivel: 1,
        padre: '',
        permiteMovimientos: false,
        saldo: 1250000,
        saldoInicial: 0,
        hijos: []
      },
      {
        id: 11,
        codigo: '4.1',
        nombre: 'Ventas',
        tipo: TIPOS_CUENTA.INGRESO,
        categoria: 'ventas',
        nivel: 2,
        padre: '4',
        permiteMovimientos: true,
        saldo: 1250000,
        saldoInicial: 0,
        hijos: []
      },
      {
        id: 12,
        codigo: '5',
        nombre: 'GASTOS',
        tipo: TIPOS_CUENTA.GASTO,
        categoria: '',
        nivel: 1,
        padre: '',
        permiteMovimientos: false,
        saldo: 960000,
        saldoInicial: 0,
        hijos: []
      },
      {
        id: 13,
        codigo: '5.1',
        nombre: 'Costo de Ventas',
        tipo: TIPOS_CUENTA.GASTO,
        categoria: 'operativos',
        nivel: 2,
        padre: '5',
        permiteMovimientos: true,
        saldo: 720000,
        saldoInicial: 0,
        hijos: []
      },
      {
        id: 14,
        codigo: '5.2',
        nombre: 'Gastos Administrativos',
        tipo: TIPOS_CUENTA.GASTO,
        categoria: 'administrativos',
        nivel: 2,
        padre: '5',
        permiteMovimientos: true,
        saldo: 180000,
        saldoInicial: 0,
        hijos: []
      },
      {
        id: 15,
        codigo: '5.3',
        nombre: 'Gastos de Ventas',
        tipo: TIPOS_CUENTA.GASTO,
        categoria: 'ventas',
        nivel: 2,
        padre: '5',
        permiteMovimientos: true,
        saldo: 60000,
        saldoInicial: 0,
        hijos: []
      }
    ];

    // Asientos contables de ejemplo
    const asientosEjemplo = [
      {
        id: 1,
        numero: 'AS-001',
        fecha: '2024-01-30',
        descripcion: 'Venta al contado',
        referencia: 'FAC-001',
        tipo: 'venta',
        partidas: [
          { cuenta: '1.1.1', debe: 1250.50, haber: 0, descripcion: 'Efectivo' },
          { cuenta: '4.1', debe: 0, haber: 1250.50, descripcion: 'Ventas' }
        ],
        totalDebe: 1250.50,
        totalHaber: 1250.50,
        estado: 'registrado',
        usuario: 'Admin Tienda'
      },
      {
        id: 2,
        numero: 'AS-002',
        fecha: '2024-01-30',
        descripcion: 'Compra de mercancía a crédito',
        referencia: 'COMP-001',
        tipo: 'compra',
        partidas: [
          { cuenta: '5.1', debe: 850.00, haber: 0, descripcion: 'Costo de Ventas' },
          { cuenta: '2.1.1', debe: 0, haber: 850.00, descripcion: 'Proveedores' }
        ],
        totalDebe: 850.00,
        totalHaber: 850.00,
        estado: 'registrado',
        usuario: 'Admin Tienda'
      },
      {
        id: 3,
        numero: 'AS-003',
        fecha: '2024-01-29',
        descripcion: 'Pago de servicios',
        referencia: 'PAGO-001',
        tipo: 'gasto',
        partidas: [
          { cuenta: '5.2', debe: 450.75, haber: 0, descripcion: 'Gastos Administrativos' },
          { cuenta: '1.1.1', debe: 0, haber: 450.75, descripcion: 'Efectivo' }
        ],
        totalDebe: 450.75,
        totalHaber: 450.75,
        estado: 'registrado',
        usuario: 'Admin Tienda'
      },
      {
        id: 4,
        numero: 'AS-004',
        fecha: '2024-01-28',
        descripcion: 'Inversión en equipo',
        referencia: 'INV-001',
        tipo: 'activo',
        partidas: [
          { cuenta: '1.2.1', debe: 12000.00, haber: 0, descripcion: 'Equipo de computo' },
          { cuenta: '1.1.1', debe: 0, haber: 12000.00, descripcion: 'Efectivo' }
        ],
        totalDebe: 12000.00,
        totalHaber: 12000.00,
        estado: 'registrado',
        usuario: 'Admin Tienda'
      },
      {
        id: 5,
        numero: 'AS-005',
        fecha: '2024-01-27',
        descripcion: 'Retiro de propietario',
        referencia: 'RET-001',
        tipo: 'patrimonio',
        partidas: [
          { cuenta: '3.2', debe: 5000.00, haber: 0, descripcion: 'Retiros' },
          { cuenta: '1.1.1', debe: 0, haber: 5000.00, descripcion: 'Efectivo' }
        ],
        totalDebe: 5000.00,
        totalHaber: 5000.00,
        estado: 'registrado',
        usuario: 'Admin Tienda'
      }
    ];

    setTimeout(() => {
      setPlanCuentas(planCuentasEjemplo);
      setAsientos(asientosEjemplo);
      setCargando(false);
    }, 1000);
  }, []);

  // Calcular balances
  const balances = {
    activo: planCuentas.filter(c => c.tipo === TIPOS_CUENTA.ACTIVO).reduce((sum, c) => sum + c.saldo, 0),
    pasivo: planCuentas.filter(c => c.tipo === TIPOS_CUENTA.PASIVO).reduce((sum, c) => sum + c.saldo, 0),
    patrimonio: planCuentas.filter(c => c.tipo === TIPOS_CUENTA.PATRIMONIO).reduce((sum, c) => sum + c.saldo, 0),
    ingresos: planCuentas.filter(c => c.tipo === TIPOS_CUENTA.INGRESO).reduce((sum, c) => sum + c.saldo, 0),
    gastos: planCuentas.filter(c => c.tipo === TIPOS_CUENTA.GASTO).reduce((sum, c) => sum + c.saldo, 0)
  };

  // Calcular utilidad neta
  const utilidadNeta = balances.ingresos - balances.gastos;
  
  // Verificar ecuación contable
  const ecuacionContable = balances.activo - (balances.pasivo + balances.patrimonio + utilidadNeta);

  // Filtrar asientos
  const asientosFiltrados = asientos.filter(asiento => {
    if (filtroFechaInicio && new Date(asiento.fecha) < new Date(filtroFechaInicio)) return false;
    if (filtroFechaFin && new Date(asiento.fecha) > new Date(filtroFechaFin)) return false;
    if (filtroCuenta && !asiento.partidas.some(p => p.cuenta.includes(filtroCuenta))) return false;
    if (busqueda && !asiento.descripcion.toLowerCase().includes(busqueda.toLowerCase()) && 
        !asiento.referencia.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  // Obtener cuenta por código
  const getCuentaByCodigo = (codigo) => {
    return planCuentas.find(c => c.codigo === codigo);
  };

  // Generar número de asiento
  const generarNumeroAsiento = () => {
    const ultimoNumero = asientos.length > 0 
      ? Math.max(...asientos.map(a => parseInt(a.numero.split('-')[1]) || 0))
      : 0;
    return `AS-${String(ultimoNumero + 1).padStart(3, '0')}`;
  };

  // Generar código de cuenta
  const generarCodigoCuenta = (tipo, nivel, padre) => {
    if (padre) {
      const cuentaPadre = getCuentaByCodigo(padre);
      if (cuentaPadre) {
        const hijosMismoNivel = planCuentas.filter(c => c.padre === padre);
        return `${cuentaPadre.codigo}.${hijosMismoNivel.length + 1}`;
      }
    }
    
    // Nivel 1
    const cuentasNivel1 = planCuentas.filter(c => c.nivel === 1);
    const tipoNumeros = {
      [TIPOS_CUENTA.ACTIVO]: 1,
      [TIPOS_CUENTA.PASIVO]: 2,
      [TIPOS_CUENTA.PATRIMONIO]: 3,
      [TIPOS_CUENTA.INGRESO]: 4,
      [TIPOS_CUENTA.GASTO]: 5
    };
    
    return String(tipoNumeros[tipo] || cuentasNivel1.length + 1);
  };

  // Manejar cambios en nuevo asiento
  const handleAsientoChange = (field, value, partidaIndex = null, subField = null) => {
    if (partidaIndex !== null && subField !== null) {
      // Cambiar una partida específica
      const nuevasPartidas = [...nuevoAsiento.partidas];
      nuevasPartidas[partidaIndex] = {
        ...nuevasPartidas[partidaIndex],
        [subField]: value
      };
      
      // Calcular totales
      const totalDebe = nuevasPartidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0);
      const totalHaber = nuevasPartidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0);
      
      setNuevoAsiento(prev => ({
        ...prev,
        partidas: nuevasPartidas,
        totalDebe,
        totalHaber
      }));
    } else {
      // Cambiar campo general
      setNuevoAsiento(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  // Agregar partida al asiento
  const agregarPartida = () => {
    setNuevoAsiento(prev => ({
      ...prev,
      partidas: [...prev.partidas, { cuenta: '', debe: 0, haber: 0, descripcion: '' }]
    }));
  };

  // Remover partida del asiento
  const removerPartida = (index) => {
    if (nuevoAsiento.partidas.length <= 2) {
      alert('Un asiento debe tener al menos 2 partidas');
      return;
    }
    
    const nuevasPartidas = nuevoAsiento.partidas.filter((_, i) => i !== index);
    const totalDebe = nuevasPartidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0);
    const totalHaber = nuevasPartidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0);
    
    setNuevoAsiento(prev => ({
      ...prev,
      partidas: nuevasPartidas,
      totalDebe,
      totalHaber
    }));
  };

  // Validar y guardar asiento
  const guardarAsiento = () => {
    // Validaciones básicas
    if (!nuevoAsiento.descripcion.trim()) {
      alert('La descripción es requerida');
      return;
    }
    
    if (nuevoAsiento.partidas.length < 2) {
      alert('Debe haber al menos 2 partidas');
      return;
    }
    
    // Validar que todas las partidas tengan cuenta
    const partidasInvalidas = nuevoAsiento.partidas.filter(p => !p.cuenta.trim());
    if (partidasInvalidas.length > 0) {
      alert('Todas las partidas deben tener una cuenta asignada');
      return;
    }
    
    // Validar que Debe = Haber
    const totalDebe = nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0);
    const totalHaber = nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0);
    
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      alert(`Los totales no cuadran: Debe $${totalDebe.toFixed(2)} ≠ Haber $${totalHaber.toFixed(2)}`);
      return;
    }
    
    // Crear nuevo asiento
    const nuevoAsientoCompleto = {
      ...nuevoAsiento,
      id: asientoEditando ? asientoEditando.id : Date.now(),
      numero: asientoEditando ? asientoEditando.numero : generarNumeroAsiento(),
      totalDebe,
      totalHaber,
      estado: 'registrado',
      usuario: 'Admin Tienda',
      fecha: nuevoAsiento.fecha || new Date().toISOString().split('T')[0]
    };
    
    // Actualizar saldos de cuentas
    const planCuentasActualizado = [...planCuentas];
    nuevoAsientoCompleto.partidas.forEach(partida => {
      const cuenta = getCuentaByCodigo(partida.cuenta);
      if (cuenta && cuenta.permiteMovimientos) {
        const index = planCuentasActualizado.findIndex(c => c.codigo === partida.cuenta);
        if (index !== -1) {
          // Determinar si aumenta o disminuye el saldo según tipo de cuenta y debe/haber
          let cambioSaldo = 0;
          if ((cuenta.tipo === TIPOS_CUENTA.ACTIVO || cuenta.tipo === TIPOS_CUENTA.GASTO) && partida.debe > 0) {
            cambioSaldo = partida.debe;
          } else if ((cuenta.tipo === TIPOS_CUENTA.ACTIVO || cuenta.tipo === TIPOS_CUENTA.GASTO) && partida.haber > 0) {
            cambioSaldo = -partida.haber;
          } else if ((cuenta.tipo === TIPOS_CUENTA.PASIVO || cuenta.tipo === TIPOS_CUENTA.PATRIMONIO || 
                     cuenta.tipo === TIPOS_CUENTA.INGRESO) && partida.debe > 0) {
            cambioSaldo = -partida.debe;
          } else if ((cuenta.tipo === TIPOS_CUENTA.PASIVO || cuenta.tipo === TIPOS_CUENTA.PATRIMONIO || 
                     cuenta.tipo === TIPOS_CUENTA.INGRESO) && partida.haber > 0) {
            cambioSaldo = partida.haber;
          }
          
          planCuentasActualizado[index].saldo += cambioSaldo;
        }
      }
    });
    
    // Actualizar saldos de cuentas padre
    const actualizarSaldosPadres = (codigoCuenta) => {
      const cuenta = getCuentaByCodigo(codigoCuenta);
      if (cuenta && cuenta.padre) {
        const cuentaPadre = getCuentaByCodigo(cuenta.padre);
        if (cuentaPadre) {
          const indexPadre = planCuentasActualizado.findIndex(c => c.codigo === cuentaPadre.codigo);
          if (indexPadre !== -1) {
            // Recalcular saldo del padre sumando saldos de hijos
            const hijos = planCuentasActualizado.filter(c => c.padre === cuentaPadre.codigo);
            const saldoTotalHijos = hijos.reduce((sum, hijo) => sum + hijo.saldo, 0);
            planCuentasActualizado[indexPadre].saldo = saldoTotalHijos;
            
            // Actualizar abuelo recursivamente
            actualizarSaldosPadres(cuentaPadre.codigo);
          }
        }
      }
    };
    
    // Actualizar saldos de todas las cuentas afectadas
    nuevoAsientoCompleto.partidas.forEach(partida => {
      actualizarSaldosPadres(partida.cuenta);
    });
    
    // Guardar asiento
    if (asientoEditando) {
      const asientosActualizados = asientos.map(a => 
        a.id === asientoEditando.id ? nuevoAsientoCompleto : a
      );
      setAsientos(asientosActualizados);
      alert('Asiento actualizado correctamente');
    } else {
      setAsientos(prev => [nuevoAsientoCompleto, ...prev]);
      alert('Asiento registrado correctamente');
    }
    
    // Actualizar plan de cuentas
    setPlanCuentas(planCuentasActualizado);
    
    // Limpiar formulario
    setNuevoAsiento({
      fecha: new Date().toISOString().split('T')[0],
      descripcion: '',
      referencia: '',
      tipo: 'general',
      partidas: [
        { cuenta: '', debe: 0, haber: 0, descripcion: '' },
        { cuenta: '', debe: 0, haber: 0, descripcion: '' }
      ]
    });
    
    setAsientoEditando(null);
    setMostrarFormAsiento(false);
  };

  // Editar asiento
  const editarAsiento = (asiento) => {
    setNuevoAsiento({
      fecha: asiento.fecha,
      descripcion: asiento.descripcion,
      referencia: asiento.referencia,
      tipo: asiento.tipo,
      partidas: asiento.partidas,
      totalDebe: asiento.totalDebe,
      totalHaber: asiento.totalHaber
    });
    setAsientoEditando(asiento);
    setMostrarFormAsiento(true);
  };

  // Eliminar asiento
  const eliminarAsiento = (id) => {
    if (window.confirm('¿Estás seguro de eliminar este asiento?')) {
      const asientoAEliminar = asientos.find(a => a.id === id);
      
      // Revertir saldos de cuentas
      const planCuentasActualizado = [...planCuentas];
      asientoAEliminar.partidas.forEach(partida => {
        const cuenta = getCuentaByCodigo(partida.cuenta);
        if (cuenta && cuenta.permiteMovimientos) {
          const index = planCuentasActualizado.findIndex(c => c.codigo === partida.cuenta);
          if (index !== -1) {
            // Revertir el cambio (opuesto a lo que se hizo al crear)
            let cambioSaldo = 0;
            if ((cuenta.tipo === TIPOS_CUENTA.ACTIVO || cuenta.tipo === TIPOS_CUENTA.GASTO) && partida.debe > 0) {
              cambioSaldo = -partida.debe;
            } else if ((cuenta.tipo === TIPOS_CUENTA.ACTIVO || cuenta.tipo === TIPOS_CUENTA.GASTO) && partida.haber > 0) {
              cambioSaldo = partida.haber;
            } else if ((cuenta.tipo === TIPOS_CUENTA.PASIVO || cuenta.tipo === TIPOS_CUENTA.PATRIMONIO || 
                       cuenta.tipo === TIPOS_CUENTA.INGRESO) && partida.debe > 0) {
              cambioSaldo = partida.debe;
            } else if ((cuenta.tipo === TIPOS_CUENTA.PASIVO || cuenta.tipo === TIPOS_CUENTA.PATRIMONIO || 
                       cuenta.tipo === TIPOS_CUENTA.INGRESO) && partida.haber > 0) {
              cambioSaldo = -partida.haber;
            }
            
            planCuentasActualizado[index].saldo += cambioSaldo;
          }
        }
      });
      
      // Actualizar saldos de cuentas padre
      const actualizarSaldosPadres = (codigoCuenta) => {
        const cuenta = getCuentaByCodigo(codigoCuenta);
        if (cuenta && cuenta.padre) {
          const cuentaPadre = getCuentaByCodigo(cuenta.padre);
          if (cuentaPadre) {
            const indexPadre = planCuentasActualizado.findIndex(c => c.codigo === cuentaPadre.codigo);
            if (indexPadre !== -1) {
              const hijos = planCuentasActualizado.filter(c => c.padre === cuentaPadre.codigo);
              const saldoTotalHijos = hijos.reduce((sum, hijo) => sum + hijo.saldo, 0);
              planCuentasActualizado[indexPadre].saldo = saldoTotalHijos;
              actualizarSaldosPadres(cuentaPadre.codigo);
            }
          }
        }
      };
      
      asientoAEliminar.partidas.forEach(partida => {
        actualizarSaldosPadres(partida.cuenta);
      });
      
      // Eliminar asiento
      const asientosActualizados = asientos.filter(a => a.id !== id);
      setAsientos(asientosActualizados);
      setPlanCuentas(planCuentasActualizado);
      alert('Asiento eliminado correctamente');
    }
  };

  // Guardar cuenta
  const guardarCuenta = () => {
    if (!nuevaCuenta.nombre.trim()) {
      alert('El nombre de la cuenta es requerido');
      return;
    }
    
    if (!nuevaCuenta.codigo.trim()) {
      alert('El código de la cuenta es requerido');
      return;
    }
    
    // Verificar si el código ya existe
    if (planCuentas.some(c => c.codigo === nuevaCuenta.codigo) && !cuentaEditando) {
      alert('Ya existe una cuenta con ese código');
      return;
    }
    
    const nuevaCuentaCompleta = {
      ...nuevaCuenta,
      id: cuentaEditando ? cuentaEditando.id : Date.now(),
      saldo: parseFloat(nuevaCuenta.saldoInicial) || 0,
      hijos: []
    };
    
    if (cuentaEditando) {
      const cuentasActualizadas = planCuentas.map(c => 
        c.id === cuentaEditando.id ? nuevaCuentaCompleta : c
      );
      setPlanCuentas(cuentasActualizadas);
      alert('Cuenta actualizada correctamente');
    } else {
      setPlanCuentas(prev => [...prev, nuevaCuentaCompleta]);
      alert('Cuenta creada correctamente');
    }
    
    // Limpiar formulario
    setNuevaCuenta({
      codigo: '',
      nombre: '',
      tipo: 'activo',
      categoria: 'corriente',
      nivel: 1,
      padre: '',
      permiteMovimientos: true,
      saldoInicial: 0
    });
    
    setCuentaEditando(null);
    setMostrarFormCuenta(false);
  };

  // Eliminar cuenta
  const eliminarCuenta = (id) => {
    const cuenta = planCuentas.find(c => c.id === id);
    
    if (!cuenta) return;
    
    // Verificar si tiene movimientos
    const tieneMovimientos = asientos.some(a => 
      a.partidas.some(p => p.cuenta === cuenta.codigo)
    );
    
    if (tieneMovimientos) {
      alert('No se puede eliminar una cuenta que tiene movimientos');
      return;
    }
    
    // Verificar si tiene hijos
    const tieneHijos = planCuentas.some(c => c.padre === cuenta.codigo);
    if (tieneHijos) {
      alert('No se puede eliminar una cuenta que tiene subcuentas');
      return;
    }
    
    if (window.confirm(`¿Estás seguro de eliminar la cuenta ${cuenta.codigo} - ${cuenta.nombre}?`)) {
      const cuentasActualizadas = planCuentas.filter(c => c.id !== id);
      setPlanCuentas(cuentasActualizadas);
      alert('Cuenta eliminada correctamente');
    }
  };

  // Exportar asientos a CSV
  const exportarAsientos = () => {
    const csv = [
      ['Número', 'Fecha', 'Descripción', 'Referencia', 'Tipo', 'Total Debe', 'Total Haber', 'Estado'],
      ...asientosFiltrados.map(a => [
        a.numero,
        a.fecha,
        a.descripcion,
        a.referencia,
        a.tipo,
        a.totalDebe.toFixed(2),
        a.totalHaber.toFixed(2),
        a.estado
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asientos_contables_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    alert('Asientos exportados exitosamente');
  };

  // Formatear moneda
  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto);
  };

  // Formatear fecha
  const formatearFecha = (fechaStr) => {
    return new Date(fechaStr).toLocaleDateString('es-MX');
  };

  // Obtener nombre de cuenta por código
  const getNombreCuenta = (codigo) => {
    const cuenta = getCuentaByCodigo(codigo);
    return cuenta ? cuenta.nombre : 'Cuenta no encontrada';
  };

  if (cargando) {
    return (
      <div className={styles.cargandoContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando sistema contable...</p>
      </div>
    );
  }

  return (
    <div className={styles.contabilidadContainer}>
      {/* Encabezado */}
      <div className={styles.encabezado}>
        <div className={styles.tituloSection}>
          <h1>
            <FaCalculator className={styles.tituloIcono} />
            Sistema Contable
          </h1>
          <p className={styles.subtitulo}>
            Plan de cuentas, asientos contables y balances
          </p>
        </div>
        
        <div className={styles.accionesHeader}>
          <button 
            onClick={() => setMostrarFormAsiento(true)}
            className={styles.btnAccion}
          >
            <FaPlus /> Nuevo Asiento
          </button>
          
          <button 
            onClick={() => setMostrarFormCuenta(true)}
            className={styles.btnAccion}
          >
            <FaPlus /> Nueva Cuenta
          </button>
          
          <button 
            onClick={exportarAsientos}
            className={styles.btnAccion}
          >
            <FaDownload /> Exportar
          </button>
        </div>
      </div>

      {/* Panel de balances */}
      <div className={styles.balancesSection}>
        <h3>
          <FaBalanceScale className={styles.seccionIcono} />
          Estado de Situación Financiera
        </h3>
        
        <div className={styles.balancesGrid}>
          {/* Activo */}
          <div className={styles.balanceCard}>
            <div className={styles.balanceHeader} style={{ backgroundColor: '#3b82f6' }}>
              <h4>ACTIVO</h4>
              <span className={styles.balanceTotal}>{formatearMoneda(balances.activo)}</span>
            </div>
            <div className={styles.balanceDetalle}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.ACTIVO && c.nivel === 2)
                .map(cuenta => (
                  <div key={cuenta.id} className={styles.cuentaBalance}>
                    <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                    <span className={styles.cuentaSaldo}>{formatearMoneda(cuenta.saldo)}</span>
                  </div>
                ))}
            </div>
          </div>
          
          {/* Pasivo */}
          <div className={styles.balanceCard}>
            <div className={styles.balanceHeader} style={{ backgroundColor: '#ef4444' }}>
              <h4>PASIVO</h4>
              <span className={styles.balanceTotal}>{formatearMoneda(balances.pasivo)}</span>
            </div>
            <div className={styles.balanceDetalle}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.PASIVO && c.nivel === 2)
                .map(cuenta => (
                  <div key={cuenta.id} className={styles.cuentaBalance}>
                    <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                    <span className={styles.cuentaSaldo}>{formatearMoneda(cuenta.saldo)}</span>
                  </div>
                ))}
            </div>
          </div>
          
          {/* Patrimonio */}
          <div className={styles.balanceCard}>
            <div className={styles.balanceHeader} style={{ backgroundColor: '#10b981' }}>
              <h4>PATRIMONIO</h4>
              <span className={styles.balanceTotal}>{formatearMoneda(balances.patrimonio)}</span>
            </div>
            <div className={styles.balanceDetalle}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.PATRIMONIO && c.nivel === 2)
                .map(cuenta => (
                  <div key={cuenta.id} className={styles.cuentaBalance}>
                    <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                    <span className={styles.cuentaSaldo}>{formatearMoneda(cuenta.saldo)}</span>
                  </div>
                ))}
            </div>
          </div>
          
          {/* Estado de resultados */}
          <div className={styles.balanceCard}>
            <div className={styles.balanceHeader} style={{ backgroundColor: '#8b5cf6' }}>
              <h4>ESTADO DE RESULTADOS</h4>
              <span className={styles.balanceTotal}>{formatearMoneda(utilidadNeta)}</span>
            </div>
            <div className={styles.balanceDetalle}>
              <div className={styles.cuentaBalance}>
                <span className={styles.cuentaNombre}>Ingresos Totales</span>
                <span className={styles.cuentaSaldoPositivo}>{formatearMoneda(balances.ingresos)}</span>
              </div>
              <div className={styles.cuentaBalance}>
                <span className={styles.cuentaNombre}>Gastos Totales</span>
                <span className={styles.cuentaSaldoNegativo}>{formatearMoneda(balances.gastos)}</span>
              </div>
              <div className={styles.cuentaBalance} style={{ borderTop: '2px solid #e5e7eb', paddingTop: '10px' }}>
                <span className={styles.cuentaNombre}><strong>Utilidad Neta</strong></span>
                <span className={styles.cuentaSaldo} style={{ 
                  color: utilidadNeta >= 0 ? '#10b981' : '#ef4444',
                  fontWeight: '700'
                }}>
                  {formatearMoneda(utilidadNeta)}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Ecuación contable */}
        <div className={styles.ecuacionContable}>
          <div className={`${styles.ecuacionItem} ${Math.abs(ecuacionContable) < 0.01 ? styles.correcta : styles.incorrecta}`}>
            <span>Ecuación Contable:</span>
            <span>
              <strong>Activo</strong> ({formatearMoneda(balances.activo)}) = 
              <strong> Pasivo</strong> ({formatearMoneda(balances.pasivo)}) + 
              <strong> Patrimonio</strong> ({formatearMoneda(balances.patrimonio)}) + 
              <strong> Utilidad</strong> ({formatearMoneda(utilidadNeta)})
            </span>
            <span className={styles.ecuacionEstado}>
              {Math.abs(ecuacionContable) < 0.01 ? '✅ CUADRADO' : `❌ DESCUADRADO: ${formatearMoneda(ecuacionContable)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Plan de cuentas */}
      <div className={styles.planCuentasSection}>
        <div className={styles.seccionHeader}>
          <h3>
            <FaBook className={styles.seccionIcono} />
            Plan de Cuentas
          </h3>
          
          <div className={styles.busquedaPlan}>
            <input
              type="text"
              placeholder="Buscar cuenta..."
              className={styles.busquedaInput}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <FaSearch className={styles.busquedaIcono} />
          </div>
        </div>
        
        <div className={styles.planCuentasGrid}>
          {/* Activo */}
          <div className={styles.tipoCuentaColumn}>
            <div className={styles.tipoCuentaHeader} style={{ backgroundColor: '#3b82f6' }}>
              <h4>ACTIVO</h4>
              <span>{formatearMoneda(balances.activo)}</span>
            </div>
            <div className={styles.cuentasLista}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.ACTIVO && (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.codigo.includes(busqueda)))
                .map(cuenta => (
                  <div 
                    key={cuenta.id} 
                    className={styles.cuentaItem}
                    style={{ paddingLeft: `${(cuenta.nivel - 1) * 20}px` }}
                  >
                    <div className={styles.cuentaInfo}>
                      <span className={styles.cuentaCodigo}>{cuenta.codigo}</span>
                      <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                      {cuenta.permiteMovimientos && (
                        <span className={styles.cuentaMovimientos}>💱</span>
                      )}
                    </div>
                    <div className={styles.cuentaAcciones}>
                      <span className={styles.cuentaSaldo} style={{ color: '#3b82f6' }}>
                        {formatearMoneda(cuenta.saldo)}
                      </span>
                      <button 
                        onClick={() => {
                          setNuevaCuenta(cuenta);
                          setCuentaEditando(cuenta);
                          setMostrarFormCuenta(true);
                        }}
                        className={styles.btnAccionCuenta}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => eliminarCuenta(cuenta.id)}
                        className={styles.btnAccionCuenta}
                        title="Eliminar"
                        disabled={cuenta.hijos && cuenta.hijos.length > 0}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          
          {/* Pasivo y Patrimonio */}
          <div className={styles.tipoCuentaColumn}>
            <div className={styles.tipoCuentaHeader} style={{ backgroundColor: '#ef4444' }}>
              <h4>PASIVO</h4>
              <span>{formatearMoneda(balances.pasivo)}</span>
            </div>
            <div className={styles.cuentasLista}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.PASIVO && (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.codigo.includes(busqueda)))
                .map(cuenta => (
                  <div 
                    key={cuenta.id} 
                    className={styles.cuentaItem}
                    style={{ paddingLeft: `${(cuenta.nivel - 1) * 20}px` }}
                  >
                    <div className={styles.cuentaInfo}>
                      <span className={styles.cuentaCodigo}>{cuenta.codigo}</span>
                      <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                      {cuenta.permiteMovimientos && (
                        <span className={styles.cuentaMovimientos}>💱</span>
                      )}
                    </div>
                    <div className={styles.cuentaAcciones}>
                      <span className={styles.cuentaSaldo} style={{ color: '#ef4444' }}>
                        {formatearMoneda(cuenta.saldo)}
                      </span>
                      <button 
                        onClick={() => {
                          setNuevaCuenta(cuenta);
                          setCuentaEditando(cuenta);
                          setMostrarFormCuenta(true);
                        }}
                        className={styles.btnAccionCuenta}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => eliminarCuenta(cuenta.id)}
                        className={styles.btnAccionCuenta}
                        title="Eliminar"
                        disabled={cuenta.hijos && cuenta.hijos.length > 0}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            
            <div className={styles.tipoCuentaHeader} style={{ backgroundColor: '#10b981', marginTop: '20px' }}>
              <h4>PATRIMONIO</h4>
              <span>{formatearMoneda(balances.patrimonio)}</span>
            </div>
            <div className={styles.cuentasLista}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.PATRIMONIO && (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.codigo.includes(busqueda)))
                .map(cuenta => (
                  <div 
                    key={cuenta.id} 
                    className={styles.cuentaItem}
                    style={{ paddingLeft: `${(cuenta.nivel - 1) * 20}px` }}
                  >
                    <div className={styles.cuentaInfo}>
                      <span className={styles.cuentaCodigo}>{cuenta.codigo}</span>
                      <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                      {cuenta.permiteMovimientos && (
                        <span className={styles.cuentaMovimientos}>💱</span>
                      )}
                    </div>
                    <div className={styles.cuentaAcciones}>
                      <span className={styles.cuentaSaldo} style={{ color: '#10b981' }}>
                        {formatearMoneda(cuenta.saldo)}
                      </span>
                      <button 
                        onClick={() => {
                          setNuevaCuenta(cuenta);
                          setCuentaEditando(cuenta);
                          setMostrarFormCuenta(true);
                        }}
                        className={styles.btnAccionCuenta}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => eliminarCuenta(cuenta.id)}
                        className={styles.btnAccionCuenta}
                        title="Eliminar"
                        disabled={cuenta.hijos && cuenta.hijos.length > 0}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          
          {/* Ingresos y Gastos */}
          <div className={styles.tipoCuentaColumn}>
            <div className={styles.tipoCuentaHeader} style={{ backgroundColor: '#8b5cf6' }}>
              <h4>INGRESOS</h4>
              <span>{formatearMoneda(balances.ingresos)}</span>
            </div>
            <div className={styles.cuentasLista}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.INGRESO && (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.codigo.includes(busqueda)))
                .map(cuenta => (
                  <div 
                    key={cuenta.id} 
                    className={styles.cuentaItem}
                    style={{ paddingLeft: `${(cuenta.nivel - 1) * 20}px` }}
                  >
                    <div className={styles.cuentaInfo}>
                      <span className={styles.cuentaCodigo}>{cuenta.codigo}</span>
                      <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                      {cuenta.permiteMovimientos && (
                        <span className={styles.cuentaMovimientos}>💱</span>
                      )}
                    </div>
                    <div className={styles.cuentaAcciones}>
                      <span className={styles.cuentaSaldo} style={{ color: '#8b5cf6' }}>
                        {formatearMoneda(cuenta.saldo)}
                      </span>
                      <button 
                        onClick={() => {
                          setNuevaCuenta(cuenta);
                          setCuentaEditando(cuenta);
                          setMostrarFormCuenta(true);
                        }}
                        className={styles.btnAccionCuenta}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => eliminarCuenta(cuenta.id)}
                        className={styles.btnAccionCuenta}
                        title="Eliminar"
                        disabled={cuenta.hijos && cuenta.hijos.length > 0}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            
            <div className={styles.tipoCuentaHeader} style={{ backgroundColor: '#f59e0b', marginTop: '20px' }}>
              <h4>GASTOS</h4>
              <span>{formatearMoneda(balances.gastos)}</span>
            </div>
            <div className={styles.cuentasLista}>
              {planCuentas
                .filter(c => c.tipo === TIPOS_CUENTA.GASTO && (!busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.codigo.includes(busqueda)))
                .map(cuenta => (
                  <div 
                    key={cuenta.id} 
                    className={styles.cuentaItem}
                    style={{ paddingLeft: `${(cuenta.nivel - 1) * 20}px` }}
                  >
                    <div className={styles.cuentaInfo}>
                      <span className={styles.cuentaCodigo}>{cuenta.codigo}</span>
                      <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
                      {cuenta.permiteMovimientos && (
                        <span className={styles.cuentaMovimientos}>💱</span>
                      )}
                    </div>
                    <div className={styles.cuentaAcciones}>
                      <span className={styles.cuentaSaldo} style={{ color: '#f59e0b' }}>
                        {formatearMoneda(cuenta.saldo)}
                      </span>
                      <button 
                        onClick={() => {
                          setNuevaCuenta(cuenta);
                          setCuentaEditando(cuenta);
                          setMostrarFormCuenta(true);
                        }}
                        className={styles.btnAccionCuenta}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => eliminarCuenta(cuenta.id)}
                        className={styles.btnAccionCuenta}
                        title="Eliminar"
                        disabled={cuenta.hijos && cuenta.hijos.length > 0}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Asientos contables */}
      <div className={styles.asientosSection}>
        <div className={styles.seccionHeader}>
          <h3>
            <FaFileInvoice className={styles.seccionIcono} />
            Asientos Contables
          </h3>
          
          <div className={styles.filtrosAsientos}>
            <div className={styles.filtroGrupo}>
              <label htmlFor="fechaInicio">
                <FaCalendarAlt className={styles.filtroIcono} />
                Fecha inicio
              </label>
              <input
                id="fechaInicio"
                type="date"
                value={filtroFechaInicio}
                onChange={(e) => setFiltroFechaInicio(e.target.value)}
                className={styles.filtroInput}
              />
            </div>
            
            <div className={styles.filtroGrupo}>
              <label htmlFor="fechaFin">
                <FaCalendarAlt className={styles.filtroIcono} />
                Fecha fin
              </label>
              <input
                id="fechaFin"
                type="date"
                value={filtroFechaFin}
                onChange={(e) => setFiltroFechaFin(e.target.value)}
                className={styles.filtroInput}
              />
            </div>
            
            <div className={styles.filtroGrupo}>
              <label htmlFor="cuenta">
                <FaSearch className={styles.filtroIcono} />
                Cuenta
              </label>
              <select
                id="cuenta"
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
                className={styles.filtroSelect}
              >
                <option value="">Todas las cuentas</option>
                {planCuentas
                  .filter(c => c.permiteMovimientos)
                  .map(cuenta => (
                    <option key={cuenta.id} value={cuenta.codigo}>
                      {cuenta.codigo} - {cuenta.nombre}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className={styles.tablaAsientosContainer}>
          <table className={styles.tablaAsientos}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Referencia</th>
                <th>Debe</th>
                <th>Haber</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {asientosFiltrados.map(asiento => (
                <React.Fragment key={asiento.id}>
                  {/* Fila principal del asiento */}
                  <tr className={styles.filaAsientoPrincipal}>
                    <td className={styles.celdaNumero}>
                      <strong>{asiento.numero}</strong>
                    </td>
                    <td className={styles.celdaFecha}>
                      {formatearFecha(asiento.fecha)}
                    </td>
                    <td className={styles.celdaDescripcion}>
                      {asiento.descripcion}
                    </td>
                    <td className={styles.celdaReferencia}>
                      {asiento.referencia}
                    </td>
                    <td className={styles.celdaDebe}>
                      {formatearMoneda(asiento.totalDebe)}
                    </td>
                    <td className={styles.celdaHaber}>
                      {formatearMoneda(asiento.totalHaber)}
                    </td>
                    <td>
                      <span className={styles.estadoAsiento}>
                        {asiento.estado}
                      </span>
                    </td>
                    <td className={styles.celdaAcciones}>
                      <button 
                        onClick={() => editarAsiento(asiento)}
                        className={styles.btnAccionAsiento}
                        title="Editar"
                      >
                        <FaEdit />
                      </button>
                      <button 
                        onClick={() => eliminarAsiento(asiento.id)}
                        className={styles.btnAccionAsiento}
                        title="Eliminar"
                      >
                        <FaTrash />
                      </button>
                      <button 
                        className={styles.btnAccionAsiento}
                        title="Imprimir"
                      >
                        <FaPrint />
                      </button>
                    </td>
                  </tr>
                  
                  {/* Filas de partidas */}
                  {asiento.partidas.map((partida, index) => (
                    <tr key={index} className={styles.filaPartida}>
                      <td colSpan="2" className={styles.celdaPartidaCuenta}>
                        <span className={styles.codigoCuenta}>{partida.cuenta}</span>
                        <span className={styles.nombreCuenta}>{getNombreCuenta(partida.cuenta)}</span>
                      </td>
                      <td className={styles.celdaPartidaDesc}>
                        {partida.descripcion}
                      </td>
                      <td></td>
                      <td className={styles.celdaPartidaDebe}>
                        {partida.debe > 0 && formatearMoneda(partida.debe)}
                      </td>
                      <td className={styles.celdaPartidaHaber}>
                        {partida.haber > 0 && formatearMoneda(partida.haber)}
                      </td>
                      <td colSpan="2"></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          
          {asientosFiltrados.length === 0 && (
            <div className={styles.sinAsientos}>
              <FaFileInvoice className={styles.sinIcono} />
              <p>No hay asientos registrados con los filtros aplicados</p>
            </div>
          )}
        </div>
        
        <div className={styles.resumenAsientos}>
          <div className={styles.resumenItem}>
            <span>Total asientos:</span>
            <strong>{asientosFiltrados.length}</strong>
          </div>
          <div className={styles.resumenItem}>
            <span>Total débito:</span>
            <strong>{formatearMoneda(asientosFiltrados.reduce((sum, a) => sum + a.totalDebe, 0))}</strong>
          </div>
          <div className={styles.resumenItem}>
            <span>Total crédito:</span>
            <strong>{formatearMoneda(asientosFiltrados.reduce((sum, a) => sum + a.totalHaber, 0))}</strong>
          </div>
        </div>
      </div>

      {/* Modal de nuevo asiento */}
      {mostrarFormAsiento && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>
                {asientoEditando ? '✏️ Editar Asiento' : '➕ Nuevo Asiento Contable'}
              </h2>
              <button 
                onClick={() => {
                  setMostrarFormAsiento(false);
                  setAsientoEditando(null);
                  setNuevoAsiento({
                    fecha: new Date().toISOString().split('T')[0],
                    descripcion: '',
                    referencia: '',
                    tipo: 'general',
                    partidas: [
                      { cuenta: '', debe: 0, haber: 0, descripcion: '' },
                      { cuenta: '', debe: 0, haber: 0, descripcion: '' }
                    ]
                  });
                }}
                className={styles.modalCloseBtn}
              >
                &times;
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.formGrupo}>
                <label>Fecha</label>
                <input
                  type="date"
                  value={nuevoAsiento.fecha}
                  onChange={(e) => handleAsientoChange('fecha', e.target.value)}
                  className={styles.formInput}
                />
              </div>
              
              <div className={styles.formGrupo}>
                <label>Descripción *</label>
                <input
                  type="text"
                  value={nuevoAsiento.descripcion}
                  onChange={(e) => handleAsientoChange('descripcion', e.target.value)}
                  placeholder="Ej: Venta al contado, pago de servicios..."
                  className={styles.formInput}
                  required
                />
              </div>
              
              <div className={styles.formGrupo}>
                <label>Referencia</label>
                <input
                  type="text"
                  value={nuevoAsiento.referencia}
                  onChange={(e) => handleAsientoChange('referencia', e.target.value)}
                  placeholder="Ej: FAC-001, PAGO-001..."
                  className={styles.formInput}
                />
              </div>
              
              <div className={styles.formGrupo}>
                <label>Tipo</label>
                <select
                  value={nuevoAsiento.tipo}
                  onChange={(e) => handleAsientoChange('tipo', e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="general">General</option>
                  <option value="venta">Venta</option>
                  <option value="compra">Compra</option>
                  <option value="gasto">Gasto</option>
                  <option value="activo">Activo</option>
                  <option value="patrimonio">Patrimonio</option>
                </select>
              </div>
              
              {/* Partidas del asiento */}
              <div className={styles.partidasSection}>
                <div className={styles.partidasHeader}>
                  <h4>Partidas del Asiento</h4>
                  <button 
                    onClick={agregarPartida}
                    className={styles.btnAgregarPartida}
                  >
                    <FaPlus /> Agregar Partida
                  </button>
                </div>
                
                <div className={styles.partidasGrid}>
                  <div className={styles.partidaHeader}>
                    <span>Cuenta</span>
                    <span>Descripción</span>
                    <span>Debe</span>
                    <span>Haber</span>
                    <span>Acciones</span>
                  </div>
                  
                  {nuevoAsiento.partidas.map((partida, index) => (
                    <div key={index} className={styles.partidaRow}>
                      <select
                        value={partida.cuenta}
                        onChange={(e) => handleAsientoChange('cuenta', e.target.value, index, 'cuenta')}
                        className={styles.partidaSelect}
                      >
                        <option value="">Seleccionar cuenta</option>
                        {planCuentas
                          .filter(c => c.permiteMovimientos)
                          .map(cuenta => (
                            <option key={cuenta.id} value={cuenta.codigo}>
                              {cuenta.codigo} - {cuenta.nombre}
                            </option>
                          ))}
                      </select>
                      
                      <input
                        type="text"
                        value={partida.descripcion}
                        onChange={(e) => handleAsientoChange('descripcion', e.target.value, index, 'descripcion')}
                        placeholder="Descripción"
                        className={styles.partidaInput}
                      />
                      
                      <input
                        type="number"
                        value={partida.debe}
                        onChange={(e) => handleAsientoChange('debe', parseFloat(e.target.value) || 0, index, 'debe')}
                        placeholder="0.00"
                        className={styles.partidaInput}
                        min="0"
                        step="0.01"
                      />
                      
                      <input
                        type="number"
                        value={partida.haber}
                        onChange={(e) => handleAsientoChange('haber', parseFloat(e.target.value) || 0, index, 'haber')}
                        placeholder="0.00"
                        className={styles.partidaInput}
                        min="0"
                        step="0.01"
                      />
                      
                      <div className={styles.partidaAcciones}>
                        {nuevoAsiento.partidas.length > 2 && (
                          <button 
                            onClick={() => removerPartida(index)}
                            className={styles.btnEliminarPartida}
                            title="Eliminar partida"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Totales */}
                <div className={styles.totalesAsiento}>
                  <div className={styles.totalItem}>
                    <span>Total Debe:</span>
                    <strong>{formatearMoneda(nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0))}</strong>
                  </div>
                  <div className={styles.totalItem}>
                    <span>Total Haber:</span>
                    <strong>{formatearMoneda(nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0))}</strong>
                  </div>
                  <div className={styles.totalDiferencia}>
                    <span>Diferencia:</span>
                    <strong style={{ 
                      color: Math.abs(nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0) - 
                              nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0)) < 0.01 ? 
                              '#10b981' : '#ef4444'
                    }}>
                      {formatearMoneda(
                        nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0) -
                        nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0)
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                onClick={() => {
                  setMostrarFormAsiento(false);
                  setAsientoEditando(null);
                  setNuevoAsiento({
                    fecha: new Date().toISOString().split('T')[0],
                    descripcion: '',
                    referencia: '',
                    tipo: 'general',
                    partidas: [
                      { cuenta: '', debe: 0, haber: 0, descripcion: '' },
                      { cuenta: '', debe: 0, haber: 0, descripcion: '' }
                    ]
                  });
                }}
                className={styles.btnCancelar}
              >
                Cancelar
              </button>
              <button 
                onClick={guardarAsiento}
                className={styles.btnGuardar}
                disabled={Math.abs(nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.debe) || 0), 0) -
                         nuevoAsiento.partidas.reduce((sum, p) => sum + (parseFloat(p.haber) || 0), 0)) > 0.01}
              >
                {asientoEditando ? 'Actualizar Asiento' : 'Registrar Asiento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de nueva cuenta */}
      {mostrarFormCuenta && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>
                {cuentaEditando ? '✏️ Editar Cuenta' : '➕ Nueva Cuenta Contable'}
              </h2>
              <button 
                onClick={() => {
                  setMostrarFormCuenta(false);
                  setCuentaEditando(null);
                  setNuevaCuenta({
                    codigo: '',
                    nombre: '',
                    tipo: 'activo',
                    categoria: 'corriente',
                    nivel: 1,
                    padre: '',
                    permiteMovimientos: true,
                    saldoInicial: 0
                  });
                }}
                className={styles.modalCloseBtn}
              >
                &times;
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={styles.formGrupo}>
                  <label>Código *</label>
                  <input
                    type="text"
                    value={nuevaCuenta.codigo}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, codigo: e.target.value }))}
                    placeholder="Ej: 1.1.1"
                    className={styles.formInput}
                    required
                  />
                </div>
                
                <div className={styles.formGrupo}>
                  <label>Nombre *</label>
                  <input
                    type="text"
                    value={nuevaCuenta.nombre}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Ej: Efectivo, Ventas, etc."
                    className={styles.formInput}
                    required
                  />
                </div>
                
                <div className={styles.formGrupo}>
                  <label>Tipo de Cuenta *</label>
                  <select
                    value={nuevaCuenta.tipo}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, tipo: e.target.value }))}
                    className={styles.formSelect}
                  >
                    <option value={TIPOS_CUENTA.ACTIVO}>Activo</option>
                    <option value={TIPOS_CUENTA.PASIVO}>Pasivo</option>
                    <option value={TIPOS_CUENTA.PATRIMONIO}>Patrimonio</option>
                    <option value={TIPOS_CUENTA.INGRESO}>Ingreso</option>
                    <option value={TIPOS_CUENTA.GASTO}>Gasto</option>
                  </select>
                </div>
                
                <div className={styles.formGrupo}>
                  <label>Categoría</label>
                  <select
                    value={nuevaCuenta.categoria}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, categoria: e.target.value }))}
                    className={styles.formSelect}
                  >
                    {CATEGORIAS_CUENTA[nuevaCuenta.tipo]?.map(categoria => (
                      <option key={categoria} value={categoria}>
                        {categoria.charAt(0).toUpperCase() + categoria.slice(1).replace('-', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className={styles.formGrupo}>
                  <label>Nivel</label>
                  <select
                    value={nuevaCuenta.nivel}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, nivel: parseInt(e.target.value) }))}
                    className={styles.formSelect}
                  >
                    <option value="1">Nivel 1 (Principal)</option>
                    <option value="2">Nivel 2 (Subgrupo)</option>
                    <option value="3">Nivel 3 (Cuenta)</option>
                    <option value="4">Nivel 4 (Subcuenta)</option>
                  </select>
                </div>
                
                <div className={styles.formGrupo}>
                  <label>Cuenta Padre</label>
                  <select
                    value={nuevaCuenta.padre}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, padre: e.target.value }))}
                    className={styles.formSelect}
                  >
                    <option value="">Sin cuenta padre</option>
                    {planCuentas
                      .filter(c => c.nivel < 4)
                      .map(cuenta => (
                        <option key={cuenta.id} value={cuenta.codigo}>
                          {cuenta.codigo} - {cuenta.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              
              <div className={styles.formGrid}>
                <div className={styles.formGrupo}>
                  <label>
                    <input
                      type="checkbox"
                      checked={nuevaCuenta.permiteMovimientos}
                      onChange={(e) => setNuevaCuenta(prev => ({ ...prev, permiteMovimientos: e.target.checked }))}
                      className={styles.formCheckbox}
                    />
                    Permite movimientos
                  </label>
                </div>
                
                <div className={styles.formGrupo}>
                  <label>Saldo Inicial</label>
                  <input
                    type="number"
                    value={nuevaCuenta.saldoInicial}
                    onChange={(e) => setNuevaCuenta(prev => ({ ...prev, saldoInicial: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className={styles.formInput}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                onClick={() => {
                  setMostrarFormCuenta(false);
                  setCuentaEditando(null);
                  setNuevaCuenta({
                    codigo: '',
                    nombre: '',
                    tipo: 'activo',
                    categoria: 'corriente',
                    nivel: 1,
                    padre: '',
                    permiteMovimientos: true,
                    saldoInicial: 0
                  });
                }}
                className={styles.btnCancelar}
              >
                Cancelar
              </button>
              <button 
                onClick={guardarCuenta}
                className={styles.btnGuardar}
              >
                {cuentaEditando ? 'Actualizar Cuenta' : 'Crear Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContabilidadColab;