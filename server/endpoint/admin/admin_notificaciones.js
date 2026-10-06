const express = require('express');
const router = express.Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const jwt = require('jsonwebtoken');

// ============================================
// VARIABLE GLOBAL PARA SOCKET.IO
// ============================================
let io = null;

// ============================================
// MIDDLEWARES DE SEGURIDAD
// ============================================

// Rate limiting por endpoint
const createLimiter = (minutes = 15, max = 100) => rateLimit({
  windowMs: minutes * 60 * 1000,
  max,
  message: { success: false, message: 'Demasiadas solicitudes, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware de autenticación CORREGIDO
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      logger.warn('Token no proporcionado');
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }
    
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET no configurado');
      return res.status(500).json({ success: false, message: 'Error de configuración del servidor' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    logger.info(`Usuario autenticado: ${decoded.usuario} (ID: ${decoded.id}) - Rol: ${decoded.rol}`);
    next();
  } catch (error) {
    logger.warn(`Token inválido: ${error.message}`);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expirado' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }
    
    res.status(401).json({ success: false, message: 'No autorizado' });
  }
};

// Autorización por roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      logger.warn(`Acceso denegado: ${req.user?.rol} intentó acceder a ${req.path}`);
      return res.status(403).json({ 
        success: false, 
        message: `Permisos insuficientes. Se requiere rol: ${roles.join(' o ')}` 
      });
    }
    next();
  };
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const validations = {
  solicitarCanje: Joi.object({
    user_id: Joi.number().integer().positive().required(),
    tipo_canje: Joi.string().valid('efectivo', 'premio', 'solo_puntos', 'mixto').required(),
    puntos: Joi.number().integer().min(100).optional(),
    premio_id: Joi.number().integer().positive().optional(),
    emprendimiento_id: Joi.number().integer().positive().optional(),
    empresa_nombre: Joi.string().max(255).optional(),
    departamento: Joi.string().max(100).optional(),
    monto_efectivo: Joi.number().min(0).optional(),
    producto_id: Joi.number().integer().positive().optional(),
    producto_nombre: Joi.string().max(200).optional()
  }).custom((value, helpers) => {
    if (value.tipo_canje === 'efectivo' && !value.puntos) {
      return helpers.error('Para canje en efectivo, puntos es requerido');
    }
    if (value.tipo_canje === 'premio' && !value.premio_id) {
      return helpers.error('Para canje de premio, premio_id es requerido');
    }
    if ((value.tipo_canje === 'solo_puntos' || value.tipo_canje === 'mixto') && !value.emprendimiento_id) {
      return helpers.error('Para canje de colaborador, emprendimiento_id es requerido');
    }
    return value;
  }),

  aprobarSolicitud: Joi.object({
    adminId: Joi.number().integer().positive().required()
  }),

  rechazarSolicitud: Joi.object({
    adminId: Joi.number().integer().positive().required(),
    reason: Joi.string().min(3).max(500).required()
  }),

  notificacionAdmin: Joi.object({
    user_id: Joi.number().integer().positive().optional(),
    userName: Joi.string().max(100).optional(),
    userTelefono: Joi.string().max(20).optional(),
    userEmail: Joi.string().email().max(100).optional(),
    userRol: Joi.string().max(50).optional(),
    tipo: Joi.string().max(50).optional(),
    titulo: Joi.string().max(200).required(),
    mensaje: Joi.string().max(1000).required(),
    detalles: Joi.object().optional()
  })
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      logger.warn(`Validación falló: ${error.message}`);
      return res.status(400).json({ success: false, message: error.message });
    }
    req.body = value;
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params);
    if (error) {
      logger.warn(`Validación de params falló: ${error.message}`);
      return res.status(400).json({ success: false, message: error.message });
    }
    req.params = value;
    next();
  };
};

// Validaciones de parámetros
const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const solicitudIdParamSchema = Joi.object({
  solicitudId: Joi.number().integer().positive().required()
});

const nombreParamSchema = Joi.object({
  nombre: Joi.string().min(1).max(100).required()
});

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

const handleError = (error, context, res) => {
  logger.error(`Error en ${context}:`, {
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
  
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Registro duplicado' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ success: false, message: 'Referencia inválida' });
  }
  
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

const parseMetadata = (metadata) => {
  if (!metadata) return {};
  try {
    return typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
  } catch (e) {
    logger.error('Error parsing metadata:', e);
    return {};
  }
};

// ✅ ELIMINADO CACHÉ - Función que siempre consulta a la base de datos
const getConfigPuntos = async (pool) => {
  const [config] = await pool.query('SELECT valor_punto, umbral_minimo, tasa_conversion, redondeo FROM config_puntos LIMIT 1');
  if (config.length > 0) {
    return {
      valor_punto: parseFloat(config[0].valor_punto),
      umbral_minimo: config[0].umbral_minimo,
      tasa_conversion: config[0].tasa_conversion,
      redondeo: config[0].redondeo
    };
  }
  return { valor_punto: 0.005 };
};

// ✅ Función para invalidar caché de configuración (se llama cuando se actualiza)
const invalidarConfigPuntos = () => {
  // La caché ya no existe, pero mantenemos la función por compatibilidad
  logger.info('🔄 Configuración de puntos invalidada');
};

// ============================================
// FUNCIONES DE EMISIÓN DE SOCKET.IO (CORREGIDAS)
// ============================================

const emitirNuevaSolicitud = (io, data) => {
  // ✅ VERIFICACIÓN MEJORADA
  if (!io) {
    console.error('❌ [SOCKET] io no está definido en emitirNuevaSolicitud');
    logger.error('❌ io no está definido en emitirNuevaSolicitud');
    return;
  }

  try {
    console.log('📡 [SOCKET] Emitiendo nueva_solicitud_canje:', JSON.stringify(data, null, 2));
    logger.info(`📡 Emitiendo nueva_solicitud_canje para solicitud: ${data.solicitud_id}`);
    
    // Emitir a todos los administradores
    io.to('admin').emit('nueva_solicitud_canje', {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    // Emitir notificación en tiempo real para admins
    io.to('admin').emit('nueva_notificacion_admin', {
      id: data.solicitud_id,
      type: 'solicitud_canje',
      title: '💰 Nueva solicitud de canje',
      message: data.mensaje || `${data.usuario_nombre} solicitó un canje`,
      userId: data.usuario_id,
      userName: data.usuario_nombre,
      userRol: data.usuario_rol || 'usuario',
      origen_soli: data.origen_soli || 'usuario',
      timestamp: new Date().toISOString(),
      read: false,
      priority: 'high'
    });
    
    console.log(`✅ [SOCKET] Evento nueva_solicitud_canje emitido correctamente para solicitud ${data.solicitud_id}`);
    logger.info(`✅ Evento nueva_solicitud_canje emitido: ${data.solicitud_id}`);
    
  } catch (socketError) {
    console.error('❌ [SOCKET] Error emitiendo nueva solicitud:', socketError);
    logger.error('Error emitiendo nueva solicitud:', socketError);
  }
};

// ✅ FUNCIÓN CORREGIDA - Agrega emisión a emprendimiento
const emitirSolicitudProcesada = (io, data) => {
  if (!io) {
    console.error('❌ [SOCKET] io no está definido en emitirSolicitudProcesada');
    return;
  }

  try {
    console.log('📡 [SOCKET] Emitiendo solicitud_procesada:', JSON.stringify(data, null, 2));
    
    // Emitir al usuario
    io.to(`user_${data.user_id}`).emit('canje_procesado', {
      solicitud_id: data.solicitud_id,
      estado: data.estado,
      tipo_canje: data.tipo_canje,
      origen_soli: data.origen_soli,
      puntos: data.puntos,
      mensaje: data.mensaje,
      motivo: data.motivo || null,
      timestamp: new Date().toISOString()
    });

    // ✅ NUEVO: Emitir al emprendimiento si existe (para colaboradores)
    if (data.emprendimiento_id) {
      io.to(`emprendimiento_${data.emprendimiento_id}`).emit('canje_procesado', {
        solicitud_id: data.solicitud_id,
        estado: data.estado,
        tipo_canje: data.tipo_canje,
        origen_soli: data.origen_soli,
        puntos: data.puntos,
        mensaje: data.mensaje,
        motivo: data.motivo || null,
        timestamp: new Date().toISOString()
      });
      
      // ✅ También emitir alerta específica para el colaborador
      io.to(`emprendimiento_${data.emprendimiento_id}`).emit('nueva_alerta', {
        id: `canje_${data.solicitud_id}`,
        tipo: 'canje',
        titulo: data.estado === 'aprobado' ? '✅ Canje aprobado' : '❌ Canje rechazado',
        mensaje: data.mensaje || `Solicitud de canje ${data.estado}`,
        icono: data.estado === 'aprobado' ? '✅' : '❌',
        importante: true,
        fecha: new Date().toISOString(),
        detalle: {
          estado: data.estado,
          puntos: data.puntos || 0,
          motivo: data.motivo || null
        }
      });
      
      console.log(`✅ [SOCKET] Evento emitido a emprendimiento_${data.emprendimiento_id}`);
    }

    // Emitir a administradores
    io.to('admin').emit('solicitud_procesada', {
      solicitud_id: data.solicitud_id,
      estado: data.estado,
      admin_id: data.admin_id,
      origen_soli: data.origen_soli,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ [SOCKET] Solicitud ${data.solicitud_id} procesada: ${data.estado}`);
    logger.info(`📡 Solicitud ${data.solicitud_id} procesada: ${data.estado}`);
    
  } catch (socketError) {
    console.error('❌ [SOCKET] Error emitiendo solicitud procesada:', socketError);
    logger.error('Error emitiendo solicitud procesada:', socketError);
  }
};

const emitirNotificacionGeneral = (io, data) => {
  if (!io) {
    console.error('❌ [SOCKET] io no está definido en emitirNotificacionGeneral');
    return;
  }

  try {
    const notificacion = {
      id: data.id || Date.now(),
      userId: data.userId || null,
      userName: data.userName || 'Sistema',
      userRol: data.userRol || 'sistema',
      userTelefono: data.userTelefono || 'No registrado',
      userEmail: data.userEmail || 'No registrado',
      type: data.type || 'sistema',
      title: data.title || 'Notificación',
      message: data.message || '',
      details: data.details || {},
      status: data.status || 'pending',
      timestamp: new Date().toISOString(),
      read: false,
      priority: data.priority || 'medium'
    };

    // Emitir a administradores
    io.to('admin').emit('nueva_notificacion', notificacion);

    // Si hay un usuario específico, emitir a su sala
    if (data.userId) {
      io.to(`user_${data.userId}`).emit('nueva_notificacion', notificacion);
    }

    console.log(`✅ [SOCKET] Notificación general emitida: ${notificacion.title}`);
    logger.info(`📡 Notificación general emitida: ${notificacion.title}`);
    
  } catch (socketError) {
    console.error('❌ [SOCKET] Error emitiendo notificación general:', socketError);
    logger.error('Error emitiendo notificación general:', socketError);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;
  
  // ✅ VERIFICACIÓN DE SOCKET.IO AL INICIO
  if (io) {
    console.log('✅ [SOCKET] Socket.io asignado correctamente al router de notificaciones');
    logger.info('✅ Socket.io asignado correctamente al router de notificaciones');
    
    // ✅ Agregar evento de prueba para verificar conexión
    io.on('connection', (socket) => {
      console.log('🔌 [SOCKET] Nuevo cliente conectado al router de notificaciones');
      
      socket.on('test_connection', (data) => {
        console.log('🧪 [SOCKET] Test connection recibido:', data);
        socket.emit('test_response', { 
          success: true, 
          message: 'Conexión Socket.io funcionando correctamente',
          timestamp: new Date().toISOString()
        });
      });
      
      socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`📡 [SOCKET] Cliente unido a sala: ${room}`);
        socket.emit('room_joined', { room, status: 'success' });
      });
    });
  } else {
    console.error('❌ [SOCKET] ¡ADVERTENCIA! io es null en el router de notificaciones');
    logger.error('❌ ¡ADVERTENCIA! io es null en el router de notificaciones');
  }
  
  // GET /config-puntos - Obtener configuración de puntos (PÚBLICO)
  router.get('/config-puntos', 
    createLimiter(5, 200),
    async (req, res) => {
      try {
        logger.info('GET /config-puntos');
        const config = await getConfigPuntos(pool);
        
        if (!config) {
          return res.status(404).json({ success: false, message: 'Configuración de puntos no encontrada' });
        }
        
        res.json({ success: true, ...config });
      } catch (error) {
        handleError(error, 'GET config-puntos', res);
      }
    }
  );

  // GET /lista-solicitudes - Obtener lista de solicitudes de canje (SOLO ADMIN)
  // ✅ RATE LIMITER ELIMINADO para que aparezca automáticamente
  router.get('/lista-solicitudes',
    authenticate,
    authorize('admin'),
    // createLimiter(5, 100), // ❌ ELIMINADO
    async (req, res) => {
      try {
        logger.info('GET /lista-solicitudes - Admin:', req.user.id);
        
        const [solicitudes] = await pool.query(`
          SELECT 
            sc.*,
            u.usuario as user_name,
            u.email,
            u.telefono,
            u.direccion,
            u.rol as user_rol
          FROM solicitudes_canje sc
          LEFT JOIN user u ON sc.user_id = u.id
          WHERE u.rol IN ('usuario', 'colab')
          ORDER BY sc.fecha_solicitud DESC
        `);
        
        const solicitudesFormateadas = solicitudes.map(s => {
          const metadata = parseMetadata(s.metadata);
          return {
            id: s.id,
            user_id: s.user_id,
            user_name: s.user_name || 'Usuario',
            user_rol: s.user_rol || 'usuario',
            email: s.email,
            telefono: s.telefono,
            direccion: s.direccion,
            tipo_canje: s.tipo_canje,
            origen_soli: s.origen_soli || 'usuario',
            puntos_requeridos: s.puntos_requeridos,
            premio_nombre: s.premio_nombre,
            premio_id: s.premio_id,
            estado: s.estado,
            fecha_solicitud: s.fecha_solicitud,
            fecha_procesamiento: s.fecha_procesamiento,
            procesado_por: s.procesado_por,
            motivo_rechazo: s.motivo_rechazo,
            empresa_nombre: s.empresa_nombre,
            departamento: s.departamento,
            valor_dinero: s.valor_dinero,
            metadata: metadata,
            monto_usd: metadata.monto_usd || null,
            valor_punto: metadata.valor_punto || null
          };
        });
        
        res.json({ success: true, solicitudes: solicitudesFormateadas });
      } catch (error) {
        handleError(error, 'GET lista-solicitudes', res);
      }
    }
  );

  // ============================================
  // ✅ NUEVO ENDPOINT: GET /emprendimientos - Obtener emprendimientos para el filtro
  // ============================================
  router.get('/emprendimientos',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /emprendimientos - Admin:', req.user.id);
        
        const [emprendimientos] = await pool.query(`
          SELECT id, nombre, categoria, activo 
          FROM emprendimientos 
          WHERE activo = 1
          ORDER BY nombre ASC
        `);
        
        res.json({ success: true, emprendimientos });
      } catch (error) {
        handleError(error, 'GET emprendimientos', res);
      }
    }
  );

  // ============================================
  // ✅ NUEVO ENDPOINT: GET /ventas - Obtener ventas con ganancia REAL
  // ============================================
  router.get('/ventas',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /ventas - Admin:', req.user.id);
        
        // Consulta para obtener ventas con items, emprendimiento y ganancia real
        const [ventas] = await pool.query(`
          SELECT 
            f.id,
            f.numero,
            f.fecha,
            f.hora,
            f.cliente_nombre,
            f.cliente_telefono,
            f.cliente_email,
            f.cliente_direccion,
            f.subtotal,
            f.impuesto,
            f.total,
            f.metodo_pago,
            f.pago_recibido,
            f.vuelto,
            f.puntos_otorgados,
            f.referencia,
            f.estado,
            f.cliente_id,
            e.id AS emprendimiento_id,
            e.nombre AS emprendimiento_nombre,
            e.categoria AS emprendimiento_categoria,
            (
              SELECT SUM(fi.cantidad * (fi.precio - p.precio_compra))
              FROM factura_items fi
              JOIN productos p ON fi.producto_id = p.id
              WHERE fi.factura_id = f.id
            ) AS ganancia_real
          FROM facturas f
          LEFT JOIN emprendimientos e ON f.emprendimiento_id = e.id
          WHERE f.estado = 'completado' OR f.estado = 'pagada'
          ORDER BY f.fecha DESC, f.hora DESC
        `);

        // Obtener items para cada factura
        const ventasConItems = await Promise.all(ventas.map(async (venta) => {
          const [items] = await pool.query(
            `SELECT 
              fi.id,
              fi.producto_id,
              fi.codigo,
              fi.nombre,
              fi.precio,
              fi.cantidad,
              fi.subtotal,
              fi.puntos,
              p.precio_compra,
              (fi.cantidad * (fi.precio - p.precio_compra)) AS ganancia_item
             FROM factura_items fi
             LEFT JOIN productos p ON fi.producto_id = p.id
             WHERE fi.factura_id = ?
             ORDER BY fi.id ASC`,
            [venta.id]
          );
          
          return {
            ...venta,
            ganancia_real: parseFloat(venta.ganancia_real) || 0,
            items: items
          };
        }));
        
        res.json({ success: true, ventas: ventasConItems });
        
      } catch (error) {
        handleError(error, 'GET ventas', res);
      }
    }
  );

  // GET / - Obtener todas las notificaciones (REQUIERE AUTH)
  router.get('/',
    authenticate,
    createLimiter(5, 100),
    async (req, res) => {
      try {
        const adminId = req.user.id;
        logger.info('GET /notificaciones - Admin:', adminId);
        
        const [notificaciones] = await pool.query(`
          SELECT 
            n.*,
            u.usuario as user_name,
            u.telefono,
            u.email,
            u.direccion,
            u.activo,
            u.rol as user_rol,
            COALESCE(up.puntos_totales, 0) as puntos,
            COALESCE(up.nivel, 'Bronce') as nivel,
            sc.tipo_canje,
            sc.origen_soli,
            sc.puntos_requeridos,
            sc.premio_nombre,
            sc.empresa_nombre,
            sc.departamento,
            sc.valor_dinero,
            sc.estado as solicitud_estado,
            sc.metadata as solicitud_metadata,
            emisor.usuario as emisor_nombre,
            emisor.rol as emisor_rol
          FROM notificaciones n
          LEFT JOIN user u ON n.cliente_id = u.id
          LEFT JOIN user emisor ON n.user_id = emisor.id
          LEFT JOIN user_puntos up ON u.id = up.user_id
          LEFT JOIN solicitudes_canje sc ON n.solicitud_id = sc.id
          WHERE 
            n.user_id = ?
            OR n.cliente_id IS NOT NULL
            OR n.user_id IS NULL
            OR (n.user_id = ? AND n.cliente_id IS NULL)
          ORDER BY n.fecha DESC
        `, [adminId, adminId]);
        
        const config = await getConfigPuntos(pool);
        const valorPunto = config?.valor_punto || 0.005;
        
        const notificacionesFormateadas = notificaciones.map(n => {
          const metadata = parseMetadata(n.solicitud_metadata);
          const puntos = n.puntos_requeridos || 0;
          const valorEnDinero = puntos * valorPunto;
          
          return {
            id: n.id,
            solicitud_id: n.solicitud_id,
            userId: n.cliente_id,
            userName: n.user_name || 'Cliente',
            userRol: n.user_rol || 'usuario',
            userTelefono: n.telefono || 'No registrado',
            userEmail: n.email || 'No registrado',
            userDireccion: n.direccion || 'No registrada',
            userActivo: n.activo === 1,
            userPuntos: n.puntos || 0,
            userNivel: n.nivel || 'Bronce',
            emisor: {
              id: n.user_id,
              nombre: n.emisor_nombre || 'Sistema',
              rol: n.emisor_rol || 'sistema'
            },
            type: n.tipo || n.tipo_canje || 'general',
            title: n.titulo,
            message: n.mensaje,
            details: {
              tipo_canje: n.tipo_canje,
              origen_soli: n.origen_soli || 'usuario',
              puntos_requeridos: puntos,
              premio_nombre: n.premio_nombre,
              empresa_nombre: n.empresa_nombre,
              departamento: n.departamento,
              valor_dinero: n.valor_dinero,
              valor_en_dinero: parseFloat(valorEnDinero.toFixed(2)),
              valor_punto: valorPunto,
              ...metadata
            },
            status: n.solicitud_estado || 'pending',
            timestamp: n.fecha,
            read: n.leida === 1,
            priority: n.importante ? 'high' : 'medium',
            processedAt: n.procesado_en || null,
            processedBy: n.procesado_por || null,
            rejectionReason: n.motivo_rechazo || null
          };
        });
        
        res.json({ success: true, notificaciones: notificacionesFormateadas });
      } catch (error) {
        handleError(error, 'GET notificaciones', res);
      }
    }
  );

  // GET /solicitudes-pendientes - Obtener solicitudes pendientes (SOLO ADMIN)
  router.get('/solicitudes-pendientes',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /solicitudes-pendientes - Admin:', req.user.id);
        
        const [solicitudes] = await pool.query(`
          SELECT 
            sc.*,
            u.usuario as usuario_nombre,
            u.email as usuario_email,
            u.telefono as usuario_telefono,
            u.rol as usuario_rol
          FROM solicitudes_canje sc
          JOIN user u ON sc.user_id = u.id
          WHERE sc.estado = 'pendiente' AND u.rol IN ('usuario', 'colab')
          ORDER BY sc.fecha_solicitud ASC
        `);
        
        const solicitudesConMetadata = solicitudes.map(s => ({
          ...s,
          metadata: parseMetadata(s.metadata)
        }));
        
        res.json({ success: true, solicitudes: solicitudesConMetadata });
      } catch (error) {
        handleError(error, 'GET solicitudes-pendientes', res);
      }
    }
  );

  // GET /premios-disponibles - Obtener premios disponibles (PÚBLICO)
  router.get('/premios-disponibles',
    createLimiter(5, 200),
    async (req, res) => {
      try {
        logger.info('GET /premios-disponibles');
        
        const [premios] = await pool.query(`
          SELECT id, nombre, categoria, puntos, descripcion, stock, imagen 
          FROM premios 
          WHERE disponible = 1 AND stock > 0 AND fechaVencimiento >= CURDATE()
          ORDER BY puntos ASC
        `);
        
        res.json({ success: true, premios });
      } catch (error) {
        handleError(error, 'GET premios-disponibles', res);
      }
    }
  );

  // POST /solicitar-canje - Crear solicitud de canje (REQUIERE AUTH)
  router.post('/solicitar-canje',
    authenticate,
    createLimiter(1, 30),
    validate(validations.solicitarCanje),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /solicitar-canje - User:', req.user.id);
        await connection.beginTransaction();
        
        const { 
          user_id, 
          tipo_canje, 
          puntos, 
          premio_id,
          emprendimiento_id,
          empresa_nombre,
          departamento,
          monto_efectivo,
          producto_id,
          producto_nombre
        } = req.body;
        
        // Verificar permisos
        if (req.user.rol !== 'admin' && req.user.id !== user_id) {
          await connection.rollback();
          return res.status(403).json({ success: false, message: 'No puedes solicitar canje para otro usuario' });
        }
        
        const [userInfo] = await connection.query(
          'SELECT usuario, rol FROM user WHERE id = ? AND activo = 1',
          [user_id]
        );
        
        if (!userInfo.length) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        const [puntosUser] = await connection.query(
          'SELECT puntos_totales FROM user_puntos WHERE user_id = ?',
          [user_id]
        );
        
        if (!puntosUser.length) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Usuario no tiene registro de puntos' });
        }
        
        const puntosActuales = puntosUser[0].puntos_totales;
        let puntosRequeridos = 0;
        let premioNombre = null;
        let metadata = {};
        let origenSoli = req.user.rol === 'colab' ? 'colab' : 'usuario';
        let empresaNombreFinal = empresa_nombre || null;
        let departamentoFinal = departamento || null;
        let valorDineroFinal = null;
        
        // Procesar según tipo de canje
        if (tipo_canje === 'efectivo') {
          if (puntos < 100) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'El mínimo para canjear es 100 puntos' });
          }
          
          if (puntos > puntosActuales) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Puntos insuficientes' });
          }
          
          puntosRequeridos = puntos;
          const config = await getConfigPuntos(pool);
          valorDineroFinal = (puntos * config.valor_punto).toFixed(2);
          
          metadata = {
            monto_usd: valorDineroFinal,
            valor_punto: config.valor_punto,
            puntos_canjeados: puntos
          };
          
        } else if (tipo_canje === 'premio') {
          const [premio] = await connection.query(
            `SELECT * FROM premios 
             WHERE id = ? AND disponible = 1 
             AND stock > 0 AND fechaVencimiento >= CURDATE()`,
            [premio_id]
          );
          
          if (premio.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Premio no disponible' });
          }
          
          if (puntosActuales < premio[0].puntos) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Puntos insuficientes para este premio' });
          }
          
          puntosRequeridos = premio[0].puntos;
          premioNombre = premio[0].nombre;
          metadata = {
            premio_id: premio_id,
            premio_nombre: premio[0].nombre,
            premio_categoria: premio[0].categoria,
            stock_actual: premio[0].stock
          };
          
        } else if (tipo_canje === 'solo_puntos' || tipo_canje === 'mixto') {
          // Canje de colaborador
          if (puntos > puntosActuales) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Puntos insuficientes' });
          }
          
          puntosRequeridos = puntos;
          const config = await getConfigPuntos(pool);
          const montoDescuento = puntos * config.valor_punto;
          
          // Obtener nombre del emprendimiento si no se proporcionó
          if (!empresaNombreFinal && emprendimiento_id) {
            const [emprendimiento] = await connection.query(
              'SELECT nombre FROM emprendimientos WHERE id = ?',
              [emprendimiento_id]
            );
            if (emprendimiento.length > 0) {
              empresaNombreFinal = emprendimiento[0].nombre;
            }
          }
          
          valorDineroFinal = monto_efectivo || (tipo_canje === 'mixto' ? monto_efectivo : null);
          
          metadata = {
            emprendimiento_id: emprendimiento_id,
            nombre_tienda: empresaNombreFinal,
            tipo_pago: tipo_canje === 'mixto' ? 'mixto' : 'solo_puntos',
            monto_descuento: montoDescuento,
            monto_efectivo: monto_efectivo || 0,
            puntos_solicitados: puntos,
            puntos_actuales: puntosActuales,
            valor_punto: config.valor_punto,
            producto_id: producto_id || null,
            producto_nombre: producto_nombre || null,
            motivo: req.body.motivo || 'Canje de puntos'
          };
        }
        
        // Insertar solicitud con todas las columnas
        const [solicitud] = await connection.query(
          `INSERT INTO solicitudes_canje 
           (user_id, emprendimiento_id, tipo_canje, premio_id, premio_nombre, 
            puntos_requeridos, estado, fecha_solicitud, metadata,
            origen_soli, empresa_nombre, departamento, valor_dinero)
           VALUES (?, ?, ?, ?, ?, ?, 'pendiente', NOW(), ?, ?, ?, ?, ?)`,
          [
            user_id,
            emprendimiento_id || null,
            tipo_canje,
            premio_id || null,
            premioNombre,
            puntosRequeridos,
            JSON.stringify(metadata),
            origenSoli,
            empresaNombreFinal,
            departamentoFinal,
            valorDineroFinal
          ]
        );
        
        const solicitudId = solicitud.insertId;
        const nombreUsuario = userInfo[0].usuario;
        const rolUsuario = userInfo[0].rol;
        
        const [admins] = await pool.query(
          "SELECT id FROM user WHERE rol = 'admin' AND activo = 1"
        );
        
        let mensajeAdmin = '';
        if (tipo_canje === 'efectivo') {
          mensajeAdmin = `${nombreUsuario} (${rolUsuario}) solicita canjear ${puntosRequeridos} puntos por $${metadata.monto_usd} USD`;
        } else if (tipo_canje === 'premio') {
          mensajeAdmin = `${nombreUsuario} (${rolUsuario}) solicita canjear "${premioNombre}" por ${puntosRequeridos} puntos`;
        } else if (tipo_canje === 'mixto') {
          mensajeAdmin = `${nombreUsuario} (${rolUsuario}) solicita PAGO MIXTO: ${puntosRequeridos} puntos por $${(puntosRequeridos * (metadata.valor_punto || 0.005)).toFixed(2)} USD + $${(monto_efectivo || 0)} USD en efectivo - Empresa: ${empresaNombreFinal || 'N/A'}`;
        } else {
          mensajeAdmin = `${nombreUsuario} (${rolUsuario}) solicita canje de ${puntosRequeridos} puntos - Empresa: ${empresaNombreFinal || 'N/A'}`;
        }
        
        for (const admin of admins) {
          await connection.query(
            `INSERT INTO notificaciones (user_id, cliente_id, solicitud_id, tipo, titulo, mensaje, importante, leida, estado, fecha)
             VALUES (?, ?, ?, 'canje', '💰 Nueva solicitud de canje', ?, 1, 0, 'pending', NOW())`,
            [admin.id, user_id, solicitudId, mensajeAdmin]
          );
        }
        
        await connection.query(
          `INSERT INTO notificaciones (user_id, cliente_id, solicitud_id, tipo, titulo, mensaje, importante, leida, estado, fecha)
           VALUES (?, ?, ?, 'sys', '📤 Solicitud enviada', 'Tu solicitud de canje ha sido enviada. Espera la aprobación del administrador.', 0, 0, 'pending', NOW())`,
          [user_id, user_id, solicitudId]
        );
        
        await connection.commit();
        
        // ✅ EMITIR EVENTOS DE SOCKET.IO CON VERIFICACIÓN MEJORADA
        console.log(`📡 [SOCKET] Preparando emisión para solicitud ${solicitudId}`);
        
        if (io) {
          const socketData = {
            solicitud_id: solicitudId,
            usuario_id: user_id,
            usuario_nombre: nombreUsuario,
            usuario_rol: rolUsuario,
            tipo_canje: tipo_canje,
            origen_soli: origenSoli,
            puntos: puntosRequeridos,
            empresa_nombre: empresaNombreFinal,
            departamento: departamentoFinal,
            detalles: metadata,
            mensaje: mensajeAdmin
          };
          
          console.log('📡 [SOCKET] Datos a emitir:', JSON.stringify(socketData, null, 2));
          emitirNuevaSolicitud(io, socketData);
        } else {
          console.error('❌ [SOCKET] ¡io es null! No se pudo emitir el evento para solicitud', solicitudId);
          logger.error(`❌ io es null! No se pudo emitir el evento para solicitud ${solicitudId}`);
        }
        
        res.json({ 
          success: true, 
          message: 'Solicitud de canje enviada. Espera la aprobación del administrador.',
          solicitud_id: solicitudId
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST solicitar-canje', res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /aprobar-solicitud/:solicitudId - Aprobar solicitud (SOLO ADMIN)
  router.put('/aprobar-solicitud/:solicitudId',
    authenticate,
    authorize('admin'),
    createLimiter(1, 20),
    validateParams(solicitudIdParamSchema),
    validate(validations.aprobarSolicitud),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        const { solicitudId } = req.params;
        const { adminId } = req.body;
        
        logger.info(`PUT /aprobar-solicitud/${solicitudId} - Admin:`, adminId);
        await connection.beginTransaction();
        
        const [solicitud] = await connection.query(
          `SELECT sc.*, u.usuario, u.rol as user_rol 
           FROM solicitudes_canje sc
           JOIN user u ON sc.user_id = u.id
           WHERE sc.id = ? AND sc.estado = 'pendiente'`,
          [solicitudId]
        );
        
        if (solicitud.length === 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Solicitud no encontrada o ya procesada' });
        }
        
        const solicitudData = solicitud[0];
        const metadata = parseMetadata(solicitudData.metadata);
        const config = await getConfigPuntos(pool);
        
        const [puntosUser] = await connection.query(
          'SELECT puntos_totales FROM user_puntos WHERE user_id = ? FOR UPDATE',
          [solicitudData.user_id]
        );
        
        if (!puntosUser.length || puntosUser[0].puntos_totales < solicitudData.puntos_requeridos) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'El usuario ya no tiene suficientes puntos' });
        }
        
        // Descontar stock si es premio
        if (solicitudData.tipo_canje === 'premio' && metadata.premio_id) {
          const [premio] = await connection.query(
            'SELECT stock FROM premios WHERE id = ? FOR UPDATE',
            [metadata.premio_id]
          );
          
          if (premio.length === 0 || premio[0].stock <= 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'El premio ya no tiene stock disponible' });
          }
          
          await connection.query(
            'UPDATE premios SET stock = stock - 1, vecesCanjeado = vecesCanjeado + 1 WHERE id = ?',
            [metadata.premio_id]
          );
        }
        
        // Descontar puntos
        const nuevosPuntos = puntosUser[0].puntos_totales - solicitudData.puntos_requeridos;
        await connection.query(
          'UPDATE user_puntos SET puntos_totales = ? WHERE user_id = ?',
          [nuevosPuntos, solicitudData.user_id]
        );
        
        // Determinar tipo de transacción
        const esPagoMixto = solicitudData.tipo_canje === 'mixto' || metadata.tipo_pago === 'mixto';
        const esCanjeProducto = solicitudData.tipo_canje === 'producto' || metadata.producto_id || solicitudData.premio_id;
        const tipoTransaccion = esPagoMixto ? 'canje_mixto' : 'canje';
        
        // Registrar transacción
        await connection.query(
          `INSERT INTO transacciones 
           (user_id, tipo, referencia, fecha, puntos, puntos_usados, estado, detalles, emprendimiento_id)
           VALUES (?, ?, ?, NOW(), ?, ?, 'completado', ?, ?)`,
          [
            solicitudData.user_id,
            tipoTransaccion,
            `${tipoTransaccion.toUpperCase()}-${Date.now()}`,
            -solicitudData.puntos_requeridos,
            solicitudData.puntos_requeridos,
            JSON.stringify({
              solicitud_id: solicitudId,
              aprobado_por: adminId,
              fecha_aprobacion: new Date().toISOString(),
              origen_soli: solicitudData.origen_soli,
              ...metadata
            }),
            solicitudData.emprendimiento_id || metadata.emprendimiento_id || null
          ]
        );
        
        // Actualizar solicitud
        await connection.query(
          `UPDATE solicitudes_canje 
           SET estado = 'aprobado', fecha_procesamiento = NOW(), procesado_por = ?
           WHERE id = ?`,
          [adminId, solicitudId]
        );
        
        // Actualizar notificaciones relacionadas
        await connection.query(
          `UPDATE notificaciones 
           SET estado = 'aprobado', leida = 1, procesado_en = NOW(), procesado_por = ?
           WHERE solicitud_id = ?`,
          [adminId, solicitudId]
        );
        
        // Generar mensaje de aprobación
        let mensajeAprobacion = '';
        if (tipoTransaccion === 'canje_mixto') {
          const montoEfectivo = metadata.monto_efectivo || 0;
          const montoDescuento = metadata.monto_descuento || (solicitudData.puntos_requeridos * config.valor_punto);
          mensajeAprobacion = `✅ ¡Pago MIXTO aprobado! Canjeaste ${solicitudData.puntos_requeridos.toLocaleString()} puntos (USD $${montoDescuento.toFixed(2)}) + USD $${montoEfectivo} en efectivo.`;
        } else if (metadata.producto_nombre || solicitudData.premio_nombre) {
          const nombreProducto = metadata.producto_nombre || solicitudData.premio_nombre;
          mensajeAprobacion = `✅ ¡Canje de producto aprobado! Recibiste "${nombreProducto}" por ${solicitudData.puntos_requeridos.toLocaleString()} puntos.`;
        } else if (solicitudData.tipo_canje === 'efectivo') {
          mensajeAprobacion = `✅ ¡Canje aprobado! Canjeaste ${solicitudData.puntos_requeridos.toLocaleString()} puntos por USD $${(solicitudData.puntos_requeridos * config.valor_punto).toFixed(2)}.`;
        } else {
          mensajeAprobacion = `✅ ¡Canje aprobado! Canjeaste ${solicitudData.puntos_requeridos.toLocaleString()} puntos.`;
        }
        
        // Notificar al usuario
        await connection.query(
          `INSERT INTO notificaciones (user_id, cliente_id, solicitud_id, tipo, titulo, mensaje, importante, leida, estado, fecha)
           VALUES (?, ?, ?, 'sys', '🎉 Canje aprobado', ?, 1, 0, 'aprobado', NOW())`,
          [solicitudData.user_id, solicitudData.user_id, solicitudId, mensajeAprobacion]
        );
        
        await connection.commit();
        
        // ✅ OBTENER EMPRENDIMIENTO_ID PARA SOCKET
        const emprendimientoId = solicitudData.emprendimiento_id || metadata.emprendimiento_id || null;
        
        // ✅ EMITIR EVENTOS DE SOCKET.IO CON VERIFICACIÓN - CORREGIDO
        if (io) {
          emitirSolicitudProcesada(io, {
            solicitud_id: solicitudId,
            user_id: solicitudData.user_id,
            estado: 'aprobado',
            admin_id: adminId,
            tipo_canje: solicitudData.tipo_canje,
            origen_soli: solicitudData.origen_soli || 'usuario',
            puntos: solicitudData.puntos_requeridos,
            mensaje: mensajeAprobacion,
            emprendimiento_id: emprendimientoId  // ✅ AGREGADO
          });
          
          // Emitir actualización de puntos
          io.to(`user_${solicitudData.user_id}`).emit('puntos_actualizados', {
            user_id: solicitudData.user_id,
            puntos_totales: nuevosPuntos,
            puntos_usados: solicitudData.puntos_requeridos
          });
          
          console.log(`✅ [SOCKET] Eventos emitidos para aprobación de solicitud ${solicitudId}`);
        } else {
          console.error(`❌ [SOCKET] io es null! No se pudieron emitir eventos para aprobación ${solicitudId}`);
        }
        
        res.json({ 
          success: true, 
          message: 'Canje aprobado exitosamente',
          puntos_restantes: nuevosPuntos,
          tipo_transaccion: tipoTransaccion
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT aprobar-solicitud/${req.params.solicitudId}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /rechazar-solicitud/:solicitudId - Rechazar solicitud (SOLO ADMIN)
  router.put('/rechazar-solicitud/:solicitudId',
    authenticate,
    authorize('admin'),
    createLimiter(1, 20),
    validateParams(solicitudIdParamSchema),
    validate(validations.rechazarSolicitud),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        const { solicitudId } = req.params;
        const { adminId, reason } = req.body;
        
        logger.info(`PUT /rechazar-solicitud/${solicitudId} - Admin:`, adminId);
        await connection.beginTransaction();
        
        const [solicitud] = await connection.query(
          `SELECT * FROM solicitudes_canje WHERE id = ? AND estado = 'pendiente'`,
          [solicitudId]
        );
        
        if (solicitud.length === 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Solicitud no encontrada o ya procesada' });
        }
        
        const solicitudData = solicitud[0];
        const metadata = parseMetadata(solicitudData.metadata);
        
        // Devolver stock si era canje de producto
        if (metadata.producto_id && solicitudData.tipo_canje !== 'efectivo') {
          await connection.query(
            `UPDATE productos SET stock = stock + 1 WHERE id = ?`,
            [metadata.producto_id]
          );
        }
        
        // Actualizar solicitud
        await connection.query(
          `UPDATE solicitudes_canje 
           SET estado = 'rechazado', fecha_procesamiento = NOW(), procesado_por = ?, motivo_rechazo = ?
           WHERE id = ?`,
          [adminId, reason, solicitudId]
        );
        
        // Actualizar notificaciones
        await connection.query(
          `UPDATE notificaciones 
           SET estado = 'rechazado', leida = 1, procesado_en = NOW(), procesado_por = ?, motivo_rechazo = ?
           WHERE solicitud_id = ?`,
          [adminId, reason, solicitudId]
        );
        
        let mensajeRechazo = '';
        if (solicitudData.tipo_canje === 'efectivo') {
          mensajeRechazo = `❌ Tu solicitud de canje de ${solicitudData.puntos_requeridos} puntos ha sido RECHAZADA. Motivo: ${reason}. Los puntos NO fueron descontados.`;
        } else {
          const nombreProducto = solicitudData.premio_nombre || metadata.producto_nombre || 'producto';
          mensajeRechazo = `❌ Tu solicitud de canje para "${nombreProducto}" ha sido RECHAZADA. Motivo: ${reason}. Los puntos NO fueron descontados.`;
        }
        
        await connection.query(
          `INSERT INTO notificaciones (user_id, cliente_id, solicitud_id, tipo, titulo, mensaje, importante, leida, estado, fecha)
           VALUES (?, ?, ?, 'sys', '❌ Canje rechazado', ?, 1, 0, 'rechazado', NOW())`,
          [solicitudData.user_id, solicitudData.user_id, solicitudId, mensajeRechazo]
        );
        
        await connection.commit();
        
        // ✅ OBTENER EMPRENDIMIENTO_ID PARA SOCKET
        const emprendimientoId = solicitudData.emprendimiento_id || metadata.emprendimiento_id || null;
        
        // ✅ EMITIR EVENTOS DE SOCKET.IO CON VERIFICACIÓN - CORREGIDO
        if (io) {
          emitirSolicitudProcesada(io, {
            solicitud_id: solicitudId,
            user_id: solicitudData.user_id,
            estado: 'rechazado',
            admin_id: adminId,
            tipo_canje: solicitudData.tipo_canje,
            origen_soli: solicitudData.origen_soli || 'usuario',
            puntos: solicitudData.puntos_requeridos,
            mensaje: mensajeRechazo,
            motivo: reason,
            emprendimiento_id: emprendimientoId  // ✅ AGREGADO
          });
          
          console.log(`✅ [SOCKET] Eventos emitidos para rechazo de solicitud ${solicitudId}`);
        } else {
          console.error(`❌ [SOCKET] io es null! No se pudieron emitir eventos para rechazo ${solicitudId}`);
        }
        
        res.json({ 
          success: true, 
          message: 'Solicitud rechazada. Los puntos no fueron descontados.'
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT rechazar-solicitud/${req.params.solicitudId}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // GET /cliente-detalle/:nombre - Obtener detalles del cliente por nombre (SOLO ADMIN)
  router.get('/cliente-detalle/:nombre',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    validateParams(nombreParamSchema),
    async (req, res) => {
      try {
        const { nombre } = req.params;
        logger.info(`GET /cliente-detalle/${nombre} - Admin:`, req.user.id);
        
        const [usuario] = await pool.query(
          `SELECT 
            u.id, 
            u.email, 
            u.usuario, 
            u.telefono, 
            u.direccion, 
            u.activo, 
            u.rol,
            COALESCE(up.puntos_totales, 0) as puntos,
            COALESCE(up.nivel, 'Bronce') as nivel,
            up.nivel_actual,
            up.puntos_nivel_actual,
            up.puntos_siguiente_nivel
           FROM user u
           LEFT JOIN user_puntos up ON u.id = up.user_id
           WHERE u.usuario = ?`,
          [nombre]
        );
        
        if (usuario.length === 0) {
          return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
        }
        
        res.json({ success: true, cliente: usuario[0] });
      } catch (error) {
        handleError(error, 'GET cliente-detalle', res);
      }
    }
  );

  // GET /usuario-detalle/:id - Obtener usuario por ID (SOLO ADMIN)
  router.get('/usuario-detalle/:id',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    validateParams(idParamSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /usuario-detalle/${id} - Admin:`, req.user.id);
        
        const [usuario] = await pool.query(
          `SELECT 
            u.id, 
            u.email, 
            u.usuario, 
            u.telefono, 
            u.direccion, 
            u.activo, 
            u.rol,
            COALESCE(up.puntos_totales, 0) as puntos,
            COALESCE(up.nivel, 'Bronce') as nivel,
            up.nivel_actual,
            up.puntos_nivel_actual,
            up.puntos_siguiente_nivel
           FROM user u
           LEFT JOIN user_puntos up ON u.id = up.user_id
           WHERE u.id = ?`,
          [id]
        );
        
        if (usuario.length === 0) {
          return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        res.json({ success: true, usuario: usuario[0] });
      } catch (error) {
        handleError(error, 'GET usuario-detalle', res);
      }
    }
  );

  // PUT /:id/read - Marcar notificación como leída (REQUIERE AUTH)
  router.put('/:id/read',
    authenticate,
    createLimiter(5, 100),
    validateParams(idParamSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`PUT /${id}/read - User:`, req.user.id);
        
        await pool.query(`UPDATE notificaciones SET leida = 1 WHERE id = ?`, [id]);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          io.emit('notificacion_leida', {
            notificacion_id: id,
            usuario_id: req.user.id,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({ success: true, message: 'Notificación marcada como leída' });
      } catch (error) {
        handleError(error, 'PUT notificacion-read', res);
      }
    }
  );

  // PUT /read-all - Marcar todas como leídas (REQUIERE AUTH)
  router.put('/read-all',
    authenticate,
    createLimiter(5, 50),
    async (req, res) => {
      try {
        logger.info('PUT /read-all - User:', req.user.id);
        
        await pool.query(`UPDATE notificaciones SET leida = 1 WHERE leida = 0`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          io.emit('todas_notificaciones_leidas', {
            usuario_id: req.user.id,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' });
      } catch (error) {
        handleError(error, 'PUT read-all', res);
      }
    }
  );

  // ============================================
  // DELETE /:id - ELIMINAR NOTIFICACIÓN O SOLICITUD (CORREGIDO)
  // ============================================
  router.delete('/:id',
    authenticate,
    authorize('admin'),
    createLimiter(5, 50),
    validateParams(idParamSchema),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`DELETE /${id} - Admin:`, req.user.id);
        
        let eliminado = false;
        let tipoEliminado = '';
        
        // ✅ PRIMERO: Buscar en notificaciones
        const [notif] = await pool.query(`SELECT id FROM notificaciones WHERE id = ?`, [id]);
        if (notif.length > 0) {
          await pool.query(`DELETE FROM notificaciones WHERE id = ?`, [id]);
          eliminado = true;
          tipoEliminado = 'notificacion';
          logger.info(`✅ Notificación ${id} eliminada`);
        }
        
        // ✅ SEGUNDO: Buscar en solicitudes_canje
        if (!eliminado) {
          const [solicitud] = await pool.query(`SELECT id FROM solicitudes_canje WHERE id = ?`, [id]);
          if (solicitud.length > 0) {
            // Eliminar notificaciones relacionadas primero
            await pool.query(
              `DELETE FROM notificaciones WHERE solicitud_id = ? OR JSON_EXTRACT(metadata, '$.solicitud_id') = ?`,
              [id, id]
            );
            await pool.query(`DELETE FROM solicitudes_canje WHERE id = ?`, [id]);
            eliminado = true;
            tipoEliminado = 'solicitud';
            logger.info(`✅ Solicitud ${id} eliminada junto con sus notificaciones`);
          }
        }
        
        // ✅ TERCERO: Buscar en metadata de notificaciones
        if (!eliminado) {
          const [notifPorMetadata] = await pool.query(
            `SELECT id FROM notificaciones WHERE JSON_EXTRACT(metadata, '$.solicitud_id') = ?`,
            [id]
          );
          if (notifPorMetadata.length > 0) {
            await pool.query(`DELETE FROM notificaciones WHERE id = ?`, [notifPorMetadata[0].id]);
            eliminado = true;
            tipoEliminado = 'notificacion_metadata';
            logger.info(`✅ Notificación con metadata.solicitud_id=${id} eliminada`);
          }
        }
        
        if (!eliminado) {
          return res.status(404).json({ success: false, message: 'Elemento no encontrado' });
        }
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          io.emit('notificacion_eliminada', {
            notificacion_id: id,
            admin_id: req.user.id,
            tipo: tipoEliminado,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({ success: true, message: `${tipoEliminado} eliminado correctamente` });
        
      } catch (error) {
        handleError(error, 'DELETE notificacion', res);
      }
    }
  );

  // POST /enviar-admin - Enviar notificación a admin (SOLO ADMIN y COLAB)
  router.post('/enviar-admin',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(1, 30),
    validate(validations.notificacionAdmin),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /enviar-admin - User:', req.user.id);
        
        const { user_id, userName, userTelefono, userEmail, userRol, tipo, titulo, mensaje, detalles } = req.body;
        
        const [admins] = await connection.query(
          `SELECT id FROM user WHERE rol = 'admin' AND activo = 1`
        );
        
        const mensajeCompleto = `${userName || 'Cliente'} (${userRol || 'usuario'}) ${mensaje}`;
        
        let tipoValido = tipo || 'sistema';
        const tiposValidos = ['puntos', 'canje', 'promocion', 'sistema', 'recordatorio', 'solicitud_canje'];
        if (!tiposValidos.includes(tipoValido)) {
          tipoValido = 'sistema';
        }
        
        for (const admin of admins) {
          await connection.query(
            `INSERT INTO notificaciones (user_id, cliente_id, tipo, titulo, mensaje, importante, fecha, metadata)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)`,
            [admin.id, user_id || null, tipoValido, titulo, mensajeCompleto, JSON.stringify(detalles || {})]
          );
        }
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          emitirNotificacionGeneral(io, {
            id: Date.now(),
            userId: user_id,
            userName: userName || 'Cliente',
            userRol: userRol || 'usuario',
            userTelefono: userTelefono || 'No registrado',
            userEmail: userEmail || 'No registrado',
            type: tipoValido,
            title: titulo,
            message: mensaje,
            details: detalles || {},
            status: 'pending',
            priority: 'high'
          });
        }
        
        res.json({ success: true, message: 'Notificación enviada a administradores' });
      } catch (error) {
        handleError(error, 'POST enviar-admin', res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};