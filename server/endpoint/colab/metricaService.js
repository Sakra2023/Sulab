// services/metricsService.js
const logger = require('../../config/logger');

class MetricsService {
  constructor(pool) {
    this.pool = pool;
    // Cache de tablas existentes (verificar una vez cada hora)
    this.tablesCache = {};
    this.tablesCacheTime = {};
    this.TABLES_CACHE_TTL = 60 * 60 * 1000; // 1 hora
  }

  async getConnection() {
    return await this.pool.getConnection();
  }

  calcularCrecimiento(actual, anterior) {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return parseFloat(((actual - anterior) / anterior * 100).toFixed(1));
  }

  async tableExists(connection, tableName) {
    const now = Date.now();
    if (this.tablesCache[tableName] && (now - this.tablesCacheTime[tableName]) < this.TABLES_CACHE_TTL) {
      return this.tablesCache[tableName];
    }
    
    const [result] = await connection.query(`SHOW TABLES LIKE ?`, [tableName]);
    this.tablesCache[tableName] = result.length > 0;
    this.tablesCacheTime[tableName] = now;
    return this.tablesCache[tableName];
  }

  // ✅ ACTUALIZADO: Soporte para fechas personalizadas
  getFechasPeriodo(periodo, fechaInicioPersonalizada = null, fechaFinPersonalizada = null) {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    let fechaInicioActual, fechaInicioAnterior;

    // ✅ Si hay fechas personalizadas, usarlas
    if (periodo === 'personalizado' && fechaInicioPersonalizada && fechaFinPersonalizada) {
      // Para crecimiento, comparar con período anterior del mismo largo
      const inicio = new Date(fechaInicioPersonalizada);
      const fin = new Date(fechaFinPersonalizada);
      const diffDays = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
      
      const inicioAnterior = new Date(inicio);
      inicioAnterior.setDate(inicioAnterior.getDate() - diffDays - 1);
      const finAnterior = new Date(inicio);
      finAnterior.setDate(finAnterior.getDate() - 1);
      
      return {
        fechaInicioActual: fechaInicioPersonalizada,
        fechaFinActual: fechaFinPersonalizada,
        fechaInicioAnterior: inicioAnterior.toISOString().split('T')[0],
        fechaFinAnterior: finAnterior.toISOString().split('T')[0]
      };
    }

    // ✅ Lógica original para períodos predefinidos
    switch(periodo) {
      case 'hoy':
        fechaInicioActual = hoyStr;
        const ayer = new Date(hoy);
        ayer.setDate(hoy.getDate() - 1);
        fechaInicioAnterior = ayer.toISOString().split('T')[0];
        return { fechaInicioActual, fechaInicioAnterior };
      case 'semana':
        const semanaAtras = new Date(hoy);
        semanaAtras.setDate(hoy.getDate() - 7);
        fechaInicioActual = semanaAtras.toISOString().split('T')[0];
        const dosSemanasAtras = new Date(hoy);
        dosSemanasAtras.setDate(hoy.getDate() - 14);
        fechaInicioAnterior = dosSemanasAtras.toISOString().split('T')[0];
        return { fechaInicioActual, fechaInicioAnterior };
      case 'mes':
        const mesAtras = new Date(hoy);
        mesAtras.setMonth(hoy.getMonth() - 1);
        fechaInicioActual = mesAtras.toISOString().split('T')[0];
        const dosMesesAtras = new Date(hoy);
        dosMesesAtras.setMonth(hoy.getMonth() - 2);
        fechaInicioAnterior = dosMesesAtras.toISOString().split('T')[0];
        return { fechaInicioActual, fechaInicioAnterior };
      default: // año
        const añoAtras = new Date(hoy);
        añoAtras.setFullYear(hoy.getFullYear() - 1);
        fechaInicioActual = añoAtras.toISOString().split('T')[0];
        const dosAñosAtras = new Date(hoy);
        dosAñosAtras.setFullYear(hoy.getFullYear() - 2);
        fechaInicioAnterior = dosAñosAtras.toISOString().split('T')[0];
        return { fechaInicioActual, fechaInicioAnterior };
    }
  }

  // ✅ ACTUALIZADO: Acepta fechas personalizadas
  async getMetricas(emprendimientoId, periodo = 'hoy', fechaInicioPersonalizada = null, fechaFinPersonalizada = null) {
    const connection = await this.getConnection();
    
    // ✅ Obtener fechas con soporte para personalizado
    const fechas = this.getFechasPeriodo(periodo, fechaInicioPersonalizada, fechaFinPersonalizada);
    const { fechaInicioActual, fechaInicioAnterior } = fechas;
    
    try {
      const facturasExiste = await this.tableExists(connection, 'facturas');
      if (!facturasExiste) {
        logger.warn(`Tabla facturas no existe para emprendimiento ${emprendimientoId}`);
        return this.getEmptyMetrics();
      }
      
      // ✅ Si es personalizado, usar fecha fin también
      let fechaFinActual = null;
      let fechaFinAnterior = null;
      
      if (periodo === 'personalizado' && fechaInicioPersonalizada && fechaFinPersonalizada) {
        fechaFinActual = fechaFinPersonalizada;
        // Calcular fecha fin anterior usando la lógica de getFechasPeriodo
        const fechasCompletas = this.getFechasPeriodo(periodo, fechaInicioPersonalizada, fechaFinPersonalizada);
        fechaFinAnterior = fechasCompletas.fechaFinAnterior;
      }
      
      // ✅ Consulta para período actual (con o sin fecha fin)
      let queryActual = `
        SELECT 
          COALESCE(SUM(total), 0) as total_ventas, 
          COUNT(DISTINCT cliente_id) as total_clientes, 
          COALESCE(SUM(puntos_otorgados), 0) as total_puntos
        FROM facturas 
        WHERE emprendimiento_id = ? 
          AND DATE(created_at) >= ? 
          AND estado = 'completado'
      `;
      let paramsActual = [emprendimientoId, fechaInicioActual];
      
      if (fechaFinActual) {
        queryActual += ` AND DATE(created_at) <= ?`;
        paramsActual.push(fechaFinActual);
      }
      
      const [ventasActual] = await connection.query(queryActual, paramsActual);
      
      // ✅ Consulta para período anterior (con o sin fecha fin)
      let queryAnterior = `
        SELECT 
          COALESCE(SUM(total), 0) as total_ventas, 
          COUNT(DISTINCT cliente_id) as total_clientes, 
          COALESCE(SUM(puntos_otorgados), 0) as total_puntos
        FROM facturas 
        WHERE emprendimiento_id = ? 
          AND DATE(created_at) >= ? 
          AND estado = 'completado'
      `;
      let paramsAnterior = [emprendimientoId, fechaInicioAnterior];
      
      if (fechaFinAnterior) {
        queryAnterior += ` AND DATE(created_at) <= ?`;
        paramsAnterior.push(fechaFinAnterior);
      } else if (fechaInicioActual) {
        queryAnterior += ` AND DATE(created_at) < ?`;
        paramsAnterior.push(fechaInicioActual);
      }
      
      const [ventasAnterior] = await connection.query(queryAnterior, paramsAnterior);
      
      // ✅ Productos - Actual
      let productosActual = 0, productosAnterior = 0;
      const itemsExiste = await this.tableExists(connection, 'factura_items');
      
      if (itemsExiste) {
        let queryProdActual = `
          SELECT COALESCE(SUM(fi.cantidad), 0) as total_vendidos 
          FROM factura_items fi 
          JOIN facturas f ON fi.factura_id = f.id
          WHERE f.emprendimiento_id = ? 
            AND DATE(f.created_at) >= ? 
            AND f.estado = 'completado'
        `;
        let paramsProdActual = [emprendimientoId, fechaInicioActual];
        
        if (fechaFinActual) {
          queryProdActual += ` AND DATE(f.created_at) <= ?`;
          paramsProdActual.push(fechaFinActual);
        }
        
        const [productosActualRes] = await connection.query(queryProdActual, paramsProdActual);
        productosActual = parseInt(productosActualRes[0].total_vendidos) || 0;
        
        // ✅ Productos - Anterior
        let queryProdAnterior = `
          SELECT COALESCE(SUM(fi.cantidad), 0) as total_vendidos 
          FROM factura_items fi 
          JOIN facturas f ON fi.factura_id = f.id
          WHERE f.emprendimiento_id = ? 
            AND DATE(f.created_at) >= ? 
            AND f.estado = 'completado'
        `;
        let paramsProdAnterior = [emprendimientoId, fechaInicioAnterior];
        
        if (fechaFinAnterior) {
          queryProdAnterior += ` AND DATE(f.created_at) <= ?`;
          paramsProdAnterior.push(fechaFinAnterior);
        } else if (fechaInicioActual) {
          queryProdAnterior += ` AND DATE(f.created_at) < ?`;
          paramsProdAnterior.push(fechaInicioActual);
        }
        
        const [productosAnteriorRes] = await connection.query(queryProdAnterior, paramsProdAnterior);
        productosAnterior = parseInt(productosAnteriorRes[0].total_vendidos) || 0;
      }
      
      const ventasActualTotal = parseFloat(ventasActual[0].total_ventas) || 0;
      const ventasAnteriorTotal = parseFloat(ventasAnterior[0].total_ventas) || 0;
      const clientesActual = parseInt(ventasActual[0].total_clientes) || 0;
      const clientesAnterior = parseInt(ventasAnterior[0].total_clientes) || 0;
      const puntosActual = parseInt(ventasActual[0].total_puntos) || 0;
      const puntosAnterior = parseInt(ventasAnterior[0].total_puntos) || 0;
      
      const result = {
        ventas: {
          cantidad: ventasActualTotal,
          crecimiento: this.calcularCrecimiento(ventasActualTotal, ventasAnteriorTotal),
          tendencia: ventasActualTotal >= ventasAnteriorTotal ? 'up' : 'down'
        },
        clientes: {
          cantidad: clientesActual,
          crecimiento: this.calcularCrecimiento(clientesActual, clientesAnterior),
          tendencia: clientesActual >= clientesAnterior ? 'up' : 'down'
        },
        puntosOtorgados: {
          cantidad: puntosActual,
          crecimiento: this.calcularCrecimiento(puntosActual, puntosAnterior),
          tendencia: puntosActual >= puntosAnterior ? 'up' : 'down'
        },
        productosVendidos: {
          cantidad: productosActual,
          crecimiento: this.calcularCrecimiento(productosActual, productosAnterior),
          tendencia: productosActual >= productosAnterior ? 'up' : 'down'
        }
      };
      
      return result;
    } catch (error) {
      logger.error('Error en getMetricas:', {
        emprendimientoId,
        periodo,
        fechaInicioPersonalizada,
        fechaFinPersonalizada,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      return this.getEmptyMetrics();
    } finally {
      connection.release();
    }
  }

  getEmptyMetrics() {
    return {
      ventas: { cantidad: 0, crecimiento: 0, tendencia: 'up' },
      clientes: { cantidad: 0, crecimiento: 0, tendencia: 'up' },
      puntosOtorgados: { cantidad: 0, crecimiento: 0, tendencia: 'up' },
      productosVendidos: { cantidad: 0, crecimiento: 0, tendencia: 'up' }
    };
  }

  // SIN CACHÉ - Siempre consultar BD directamente
  async getAlertasConDetalle(emprendimientoId) {
    const connection = await this.getConnection();
    const alertas = [];
    
    try {
      // 1. SOLICITUDES DE CANJE
      const solicitudesExiste = await this.tableExists(connection, 'solicitudes_canje');
      
      if (solicitudesExiste) {
        const query = `
          SELECT 
            s.id, 
            s.user_id, 
            s.puntos_requeridos as puntos_usados, 
            s.fecha_solicitud as fecha, 
            s.estado, 
            s.premio_nombre, 
            s.tipo_canje, 
            s.metadata,
            s.emprendimiento_id
          FROM solicitudes_canje s
          WHERE s.emprendimiento_id = ? 
          ORDER BY FIELD(s.estado, 'pendiente', 'aprobado', 'completado'), s.fecha_solicitud DESC
        `;
        
        const [solicitudes] = await connection.query(query, [emprendimientoId]);
        const userExiste = await this.tableExists(connection, 'user');
        
        for (const solicitud of solicitudes) {
          let nombreUsuario = 'Usuario';
          let emailUsuario = '';
          let detalleInfo = {};
          
          if (solicitud.metadata) {
            try {
              detalleInfo = typeof solicitud.metadata === 'string' ? JSON.parse(solicitud.metadata) : solicitud.metadata;
            } catch(e) {
              logger.warn(`Error parsing metadata para solicitud ${solicitud.id}:`, e);
            }
          }
          
          if (userExiste && solicitud.user_id) {
            const [user] = await connection.query(`SELECT usuario, email FROM user WHERE id = ?`, [solicitud.user_id]);
            if (user.length > 0) {
              nombreUsuario = user[0].usuario;
              emailUsuario = user[0].email || '';
            }
          }
          
          const puntosSolicitados = Math.abs(solicitud.puntos_usados || 0);
          const producto = solicitud.premio_nombre || 'Producto';
          const tipoPago = solicitud.tipo_canje || 'puntos';
          
          let mensaje = '';
          let titulo = '';
          let icono = '🎁';
          let importante = false;
          
          switch(solicitud.estado) {
            case 'pendiente':
              titulo = '⏳ Nueva solicitud de canje';
              importante = true;
              icono = '⏳';
              if (tipoPago === 'mixto') {
                const montoEfectivo = detalleInfo.monto_efectivo || 0;
                mensaje = `${nombreUsuario} solicita PAGO MIXTO: ${puntosSolicitados} puntos + $${montoEfectivo} USD en efectivo - ${producto}`;
              } else {
                mensaje = `${nombreUsuario} solicita canjear ${puntosSolicitados} puntos por "${producto}"`;
              }
              break;
            case 'aprobado':
              titulo = '✅ Canje aprobado';
              importante = false;
              icono = '✅';
              mensaje = `La solicitud de ${nombreUsuario} por ${puntosSolicitados} puntos (${producto}) ha sido APROBADA`;
              break;
            case 'completado':
              titulo = '🎉 Canje completado';
              importante = false;
              icono = '🎉';
              mensaje = `El canje de ${nombreUsuario} por ${puntosSolicitados} puntos (${producto}) ha sido COMPLETADO`;
              break;
            default:
              titulo = '📢 Solicitud de canje';
              mensaje = `${nombreUsuario} solicita canjear ${puntosSolicitados} puntos por "${producto}"`;
          }
          
          alertas.push({
            id: solicitud.id,
            tipo: 'canje',
            titulo: titulo,
            mensaje: mensaje,
            fecha: solicitud.fecha,
            importante: importante,
            icono: icono,
            leida: solicitud.estado !== 'pendiente',
            detalle: {
              usuario: nombreUsuario,
              email: emailUsuario,
              puntos: puntosSolicitados,
              producto: producto,
              tipo_pago: tipoPago,
              monto_efectivo: detalleInfo.monto_efectivo || 0,
              estado: solicitud.estado
            }
          });
        }
      }
      
      // 2. PRODUCTOS BAJO STOCK
      const productosExiste = await this.tableExists(connection, 'productos');
      if (productosExiste) {
        const [bajoStock] = await connection.query(
          `SELECT id, nombre, stock, stock_minimo 
           FROM productos 
           WHERE emprendimiento_id = ? AND activo = 1 AND stock <= COALESCE(stock_minimo, 5)`,
          [emprendimientoId]
        );
        
        for (const prod of bajoStock) {
          alertas.push({
            id: `stock_${prod.id}`,
            tipo: 'stock',
            titulo: '⚠️ Producto con stock bajo',
            mensaje: `${prod.nombre} tiene solo ${prod.stock} unidades (mínimo: ${prod.stock_minimo || 5})`,
            fecha: new Date().toISOString(),
            importante: true,
            icono: '📦',
            leida: false,
            detalle: {
              producto: prod.nombre,
              stock_actual: prod.stock,
              stock_minimo: prod.stock_minimo || 5,
              estado: prod.stock <= (prod.stock_minimo || 5) ? 'critico' : 'bajo'
            }
          });
        }
      }
      
      // 3. NOTIFICACIONES DEL SISTEMA
      const notificacionesExiste = await this.tableExists(connection, 'notificaciones');
      if (notificacionesExiste) {
        const [emprendimiento] = await connection.query(
          `SELECT propietario_id FROM emprendimientos WHERE id = ?`,
          [emprendimientoId]
        );
        
        const propietarioId = emprendimiento.length > 0 ? emprendimiento[0].propietario_id : null;
        
        if (propietarioId) {
          const [notificaciones] = await connection.query(
            `SELECT n.* 
             FROM notificaciones n
             WHERE n.user_id = ? AND n.leida = 0 AND n.estado = 'pending'
             ORDER BY n.fecha DESC`,
            [propietarioId]
          );
          
          for (const notif of notificaciones) {
            let metadata = {};
            if (notif.metadata) {
              try {
                metadata = typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata;
              } catch(e) {}
            }
            
            alertas.push({
              id: notif.id,
              tipo: notif.tipo || 'notificacion',
              titulo: notif.titulo,
              mensaje: notif.mensaje,
              fecha: notif.fecha,
              importante: notif.importante === 1,
              icono: notif.icono || '🔔',
              leida: notif.leida === 1,
              detalle: metadata
            });
          }
        }
      }
      
      // Ordenar: importantes primero, luego por fecha
      const result = alertas.sort((a, b) => {
        if (a.importante !== b.importante) return b.importante - a.importante;
        return new Date(b.fecha) - new Date(a.fecha);
      });
      
      return result;
      
    } catch (error) {
      logger.error('Error en getAlertasConDetalle:', {
        emprendimientoId,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      return [];
    } finally {
      connection.release();
    }
  }

  // ✅ ACTUALIZADO: Soporte para fechas personalizadas en costos
  async getCostosReales(emprendimientoId, periodo = 'mes', fechaInicioPersonalizada = null, fechaFinPersonalizada = null) {
    const connection = await this.getConnection();
    
    // ✅ Obtener fechas con soporte para personalizado
    const fechas = this.getFechasPeriodo(periodo, fechaInicioPersonalizada, fechaFinPersonalizada);
    const { fechaInicioActual, fechaFinActual } = fechas;
    
    try {
      // ✅ PRIMERO: Intentar calcular costos usando precio_compra de productos
      let queryCostos = `
        SELECT COALESCE(SUM(fi.cantidad * COALESCE(p.precio_compra, 0)), 0) as total_costos
        FROM factura_items fi
        JOIN facturas f ON fi.factura_id = f.id
        JOIN productos p ON fi.producto_id = p.id
        WHERE f.emprendimiento_id = ? 
          AND DATE(f.created_at) >= ?
          AND f.estado = 'completado'
      `;
      let paramsCostos = [emprendimientoId, fechaInicioActual];
      
      if (fechaFinActual) {
        queryCostos += ` AND DATE(f.created_at) <= ?`;
        paramsCostos.push(fechaFinActual);
      }
      
      const [costosProductos] = await connection.query(queryCostos, paramsCostos);
      
      const costosReales = parseFloat(costosProductos[0].total_costos) || 0;
      
      // Si tenemos costos reales, los usamos
      if (costosReales > 0) {
        logger.info(`✅ Costos reales calculados para emprendimiento ${emprendimientoId}: $${costosReales.toFixed(2)}`);
        return costosReales;
      }
      
      // ✅ SEGUNDO: Intentar usar tabla compras si existe (para compatibilidad)
      const comprasExiste = await this.tableExists(connection, 'compras');
      if (comprasExiste) {
        let queryCompras = `
          SELECT COALESCE(SUM(total), 0) as total_costos 
          FROM compras 
          WHERE emprendimiento_id = ? AND DATE(created_at) >= ?
        `;
        let paramsCompras = [emprendimientoId, fechaInicioActual];
        
        if (fechaFinActual) {
          queryCompras += ` AND DATE(created_at) <= ?`;
          paramsCompras.push(fechaFinActual);
        }
        
        const [costosCompras] = await connection.query(queryCompras, paramsCompras);
        const costosComprasValor = parseFloat(costosCompras[0].total_costos) || 0;
        if (costosComprasValor > 0) {
          logger.info(`✅ Costos desde tabla compras para emprendimiento ${emprendimientoId}: $${costosComprasValor.toFixed(2)}`);
          return costosComprasValor;
        }
      }
      
      // ✅ TERCERO: Fallback - calcular como 60% de las ventas
      logger.warn(`⚠️ No se pudieron calcular costos reales para emprendimiento ${emprendimientoId}. Verificar: productos.precio_compra o tabla compras. Usando fallback del 60% de ventas`);
      
      const metricas = await this.getMetricas(emprendimientoId, periodo, fechaInicioPersonalizada, fechaFinPersonalizada);
      const fallback = metricas.ventas.cantidad * 0.6;
      return fallback;
      
    } catch (error) {
      logger.error('Error en getCostosReales:', {
        emprendimientoId,
        periodo,
        fechaInicioPersonalizada,
        fechaFinPersonalizada,
        message: error.message
      });
      return 0;
    } finally {
      connection.release();
    }
  }

  // Mantener métodos de compatibilidad (no hacen nada)
  clearCache(emprendimientoId = null) {
    logger.info(`Cache deshabilitado - No se requiere limpieza${emprendimientoId ? ` para emprendimiento ${emprendimientoId}` : ''}`);
    // No hacer nada - caché eliminado completamente
  }

  clearAlertasCache(emprendimientoId) {
    logger.info(`Cache deshabilitado - No se requiere limpieza de alertas${emprendimientoId ? ` para emprendimiento ${emprendimientoId}` : ''}`);
    // No hacer nada - caché eliminado completamente
  }
}

module.exports = MetricsService;