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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      logger.warn('Token no proporcionado');
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }
    
    // Verificar JWT_SECRET
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET no configurado');
      return res.status(500).json({ success: false, message: 'Error de configuración del servidor' });
    }
    
    // Decodificar token real
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
      return res.status(403).json({ success: false, message: 'Permisos insuficientes' });
    }
    next();
  };
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const validations = {
  rolParam: Joi.object({
    rol: Joi.string().valid('admin', 'colab', 'usuario').required()
  }),
  
  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  userIdParam: Joi.object({
    userId: Joi.number().integer().positive().required()
  }),
  
  solicitudIdParam: Joi.object({
    solicitudId: Joi.number().integer().positive().required()
  }),
  
  emprendimientoIdParam: Joi.object({
    emprendimientoId: Joi.number().integer().positive().required()
  }),
  
  canjePuntos: Joi.object({
    user_id: Joi.number().integer().positive().required(),
    emprendimiento_id: Joi.number().integer().positive().required(),
    puntos_a_canjear: Joi.number().integer().min(1).required(),
    monto_descuento: Joi.number().positive().optional(),
    monto_efectivo: Joi.number().min(0).optional(),
    motivo: Joi.string().max(500).optional(),
    referencia: Joi.string().max(100).optional(),
    tipo_pago: Joi.string().valid('solo_puntos', 'mixto').optional(),
    producto_id: Joi.number().integer().positive().optional(),
    producto_nombre: Joi.string().max(200).optional()
  }),
  
  puntosUpdate: Joi.object({
    puntos: Joi.number().integer().required()
  }),
  
  notificacion: Joi.object({
    userId: Joi.number().integer().positive().optional(),
    userName: Joi.string().max(100).optional(),
    type: Joi.string().max(50).optional(),
    title: Joi.string().max(200).required(),
    message: Joi.string().max(1000).required(),
    details: Joi.object().optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional()
  }),
  
  solicitudQuery: Joi.object({
    estado: Joi.string().valid('pendiente', 'aprobado', 'rechazado', 'visto').optional(),
    tipo_canje: Joi.string().valid('efectivo', 'producto', 'mixto').optional(),
    emprendimiento_id: Joi.number().integer().positive().optional(),
    limite: Joi.number().integer().min(1).max(500).default(100)
  }),
  
  transaccionQuery: Joi.object({
    tipo: Joi.string().valid('compra', 'canje', 'canje_mixto', 'ajuste').optional(),
    fecha_inicio: Joi.date().iso().optional(),
    fecha_fin: Joi.date().iso().optional(),
    limite: Joi.number().integer().min(1).max(500).default(100)
  }),
  
  configPuntos: Joi.object({
    valor_punto: Joi.number().positive().max(1).required(),
    tasa_conversion: Joi.number().positive().required(),
    umbral_minimo: Joi.number().positive().required(),
    puntos_fijos: Joi.number().integer().min(0).required(),
    redondeo: Joi.string().valid('none', 'floor', 'ceil', 'round').required()
  }),
  
  productoBusqueda: Joi.object({
    emprendimiento_id: Joi.number().integer().positive().required(),
    query: Joi.string().min(2).max(100).required()
  }),
  
  aprobarRechazar: Joi.object({
    admin_id: Joi.number().integer().positive().required(),
    motivo_rechazo: Joi.string().max(500).optional()
  })
};

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property]);
    if (error) {
      logger.warn(`Validación falló: ${error.message}`);
      return res.status(400).json({ success: false, message: error.message });
    }
    req[property] = value;
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

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query);
    if (error) {
      logger.warn(`Validación de query falló: ${error.message}`);
      return res.status(400).json({ success: false, message: error.message });
    }
    req.query = value;
    next();
  };
};

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

// Cache keys
const CACHE_KEYS = {
  USUARIOS: 'usuarios_list',
  SOLICITUDES_PREFIX: 'solicitudes_',
  TRANSACCIONES_PREFIX: 'transacciones_',
  CONFIG_PUNTOS: 'config_puntos'
};

const clearCache = () => {
  cache.del(CACHE_KEYS.USUARIOS);
  cache.del(CACHE_KEYS.CONFIG_PUNTOS);
  const keys = cache.keys();
  keys.forEach(key => {
    if (key.startsWith(CACHE_KEYS.SOLICITUDES_PREFIX) || 
        key.startsWith(CACHE_KEYS.TRANSACCIONES_PREFIX)) {
      cache.del(key);
    }
  });
};

// ============================================
// FUNCIÓN PARA EMITIR EVENTOS DE SOCKET.IO
// ============================================

const emitirEventoPuntos = (io, evento, datos) => {
  if (!io) return;

  try {
    // Emitir a la sala del usuario específico
    if (datos.user_id) {
      io.to(`user_${datos.user_id}`).emit(evento, {
        ...datos,
        timestamp: new Date().toISOString()
      });
      logger.info(`📡 Evento ${evento} emitido para usuario ${datos.user_id}`);
    }

    // Emitir globalmente para administradores
    io.emit(`puntos_${evento}`, {
      ...datos,
      timestamp: new Date().toISOString()
    });
  } catch (socketError) {
    logger.error('Error emitiendo evento de puntos:', socketError);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;

  // GET /usuarios/rol/:rol - Obtener usuarios por rol
  router.get('/usuarios/rol/:rol',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(5, 100),
    validateParams(validations.rolParam),
    async (req, res) => {
      try {
        const { rol } = req.params;
        logger.info(`GET /usuarios/rol/${rol} - User: ${req.user.id}`);

        const [usuarios] = await pool.query(
          `SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, u.activo, u.foto_url,
                  u.telefono, u.direccion, COALESCE(up.puntos_totales, 0) as puntos
           FROM user u
           LEFT JOIN user_puntos up ON u.id = up.user_id
           WHERE u.rol = ? AND u.activo = 1`,
          [rol]
        );

        res.json({ success: true, usuarios });
      } catch (error) {
        handleError(error, 'GET usuarios por rol', res);
      }
    }
  );

  // GET /usuarios - Obtener todos los usuarios activos
  router.get('/usuarios',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info(`GET /usuarios - User: ${req.user.id}`);

        let usuarios = cache.get(CACHE_KEYS.USUARIOS);
        if (!usuarios) {
          const [results] = await pool.query(
            `SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, u.ultimo_acceso, u.activo, u.foto_url,
                    u.telefono, u.direccion, COALESCE(up.puntos_totales, 0) as puntos
             FROM user u
             LEFT JOIN user_puntos up ON u.id = up.user_id
             WHERE u.activo = 1
             ORDER BY u.id DESC`
          );
          usuarios = results;
          cache.put(CACHE_KEYS.USUARIOS, usuarios, 5 * 60 * 1000);
        }

        res.json({ success: true, usuarios });
      } catch (error) {
        handleError(error, 'GET usuarios', res);
      }
    }
  );

  // GET /usuarios/:id/puntos - Obtener puntos de un usuario
  router.get('/usuarios/:id/puntos',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.idParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /usuarios/${id}/puntos - User: ${req.user.id}`);

        const [puntos] = await pool.query(
          `SELECT puntos_totales, nivel, nivel_actual 
           FROM user_puntos 
           WHERE user_id = ?`,
          [id]
        );

        if (puntos.length === 0) {
          return res.json({ success: true, puntos: 0, nivel: 'Bronce', nivel_actual: 1 });
        }

        res.json({ 
          success: true, 
          puntos: puntos[0].puntos_totales,
          nivel: puntos[0].nivel,
          nivel_actual: puntos[0].nivel_actual
        });
      } catch (error) {
        handleError(error, `GET puntos usuario ${req.params.id}`, res);
      }
    }
  );

  // GET /productos/buscar - Buscar productos
  router.get('/productos/buscar',
    authenticate,
    createLimiter(10, 200),
    validateQuery(validations.productoBusqueda),
    async (req, res) => {
      try {
        const { emprendimiento_id, query } = req.query;
        logger.info(`GET /productos/buscar - Emprendimiento: ${emprendimiento_id}, Query: ${query}`);

        const [productos] = await pool.query(
          `SELECT id, nombre, codigo, precio_venta, stock, descripcion
           FROM productos 
           WHERE emprendimiento_id = ? 
           AND activo = 1 
           AND stock > 0
           AND (nombre LIKE ? OR codigo LIKE ?)
           ORDER BY nombre ASC
           LIMIT 10`,
          [emprendimiento_id, `%${query}%`, `%${query}%`]
        );

        res.json({ success: true, productos });
      } catch (error) {
        handleError(error, 'GET buscar productos', res);
      }
    }
  );

  // GET /productos/:id - Obtener producto por ID
  router.get('/productos/:id',
    authenticate,
    createLimiter(10, 200),
    validateParams(validations.idParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /productos/${id}`);

        const [productos] = await pool.query(
          `SELECT id, nombre, codigo, precio_venta, stock, descripcion
           FROM productos 
           WHERE id = ? AND activo = 1`,
          [id]
        );

        if (productos.length === 0) {
          return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }

        res.json({ success: true, producto: productos[0] });
      } catch (error) {
        handleError(error, `GET producto ${req.params.id}`, res);
      }
    }
  );

  // POST /canjear-puntos - Solicitar canje de puntos
  router.post('/canjear-puntos',
    authenticate,
    createLimiter(1, 30),
    validate(validations.canjePuntos),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        logger.info(`POST /canjear-puntos - User: ${req.user.id}`);
        
        const {
          user_id,
          emprendimiento_id,
          puntos_a_canjear,
          monto_descuento,
          monto_efectivo,
          motivo,
          referencia,
          tipo_pago,
          producto_id,
          producto_nombre
        } = req.body;

        // ========== CORRECCIÓN APLICADA AQUÍ ==========
        // Permitir que admin y colab puedan canjear para cualquier usuario
        // Solo los usuarios normales (rol 'usuario') están restringidos a canjear solo para sí mismos
        if (req.user.rol !== 'admin' && req.user.rol !== 'colab' && req.user.id !== user_id) {
          await connection.rollback();
          return res.status(403).json({ 
            success: false, 
            message: 'No puedes solicitar canje para otro usuario' 
          });
        }
        // ==============================================

        await connection.beginTransaction();

        const [puntosActuales] = await connection.query(
          `SELECT puntos_totales, nivel FROM user_puntos WHERE user_id = ? FOR UPDATE`,
          [user_id]
        );

        if (puntosActuales.length === 0) {
          await connection.rollback();
          return res.status(404).json({ 
            success: false, 
            message: 'Usuario no tiene registro de puntos' 
          });
        }

        const puntosDisponibles = puntosActuales[0].puntos_totales;

        if (puntosDisponibles < puntos_a_canjear) {
          await connection.rollback();
          return res.status(400).json({ 
            success: false, 
            message: `Puntos insuficientes. Disponibles: ${puntosDisponibles}` 
          });
        }

        const [emprendimiento] = await connection.query(
          `SELECT nombre FROM emprendimientos WHERE id = ?`,
          [emprendimiento_id]
        );

        const nombreTienda = emprendimiento[0]?.nombre || `Emprendimiento ${emprendimiento_id}`;

        const [config] = await connection.query(
          `SELECT valor_punto FROM config_puntos WHERE id = 1`
        );

        const valorPunto = config[0]?.valor_punto || 0.005;
        const valorEnDinero = monto_descuento || (puntos_a_canjear * valorPunto);

        if (producto_id) {
          const [producto] = await connection.query(
            `SELECT stock, nombre FROM productos WHERE id = ? FOR UPDATE`,
            [producto_id]
          );

          if (producto.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Producto no encontrado' });
          }

          if (producto[0].stock <= 0) {
            await connection.rollback();
            return res.status(400).json({ 
              success: false, 
              message: `Producto "${producto[0].nombre}" sin stock disponible` 
            });
          }

          await connection.query(
            `UPDATE productos SET stock = stock - 1 WHERE id = ? AND stock > 0`,
            [producto_id]
          );
        }

        let tipo_canje = 'efectivo';
        if (tipo_pago === 'mixto') {
          tipo_canje = 'mixto';
        } else if (producto_id) {
          tipo_canje = 'producto';
        }

        const metadata = {
          emprendimiento_id,
          nombre_tienda: nombreTienda,
          monto_descuento: valorEnDinero,
          monto_efectivo: monto_efectivo || 0,
          motivo: motivo || 'Canje de puntos',
          puntos_solicitados: puntos_a_canjear,
          puntos_actuales: puntosDisponibles,
          tipo_pago: tipo_pago || 'solo_puntos',
          valor_punto: valorPunto,
          producto_id: producto_id || null,
          producto_nombre: producto_nombre || null
        };

        const referenciaFinal = referencia || `${tipo_canje.toUpperCase()}-${Date.now()}`;

        // ========== INSERT CORREGIDO CON NUEVAS COLUMNAS ==========
        const [result] = await connection.query(
          `INSERT INTO solicitudes_canje (
            user_id, emprendimiento_id, tipo_canje, premio_id, premio_nombre, 
            puntos_requeridos, estado, fecha_solicitud, metadata,
            origen_soli, empresa_nombre, departamento, valor_dinero
          ) VALUES (?, ?, ?, ?, ?, ?, 'pendiente', NOW(), ?, ?, ?, ?, ?)`,
          [
            user_id,
            emprendimiento_id,
            tipo_canje,
            producto_id || null,
            producto_nombre || null,
            puntos_a_canjear,
            JSON.stringify(metadata),
            req.user.rol === 'colab' ? 'colab' : 'usuario', // origen_soli
            nombreTienda,                                   // empresa_nombre
            req.user.departamento || null,                  // departamento
            monto_efectivo || null                          // valor_dinero
          ]
        );
        // ==========================================================

        const solicitudId = result.insertId;

        const [usuario] = await connection.query(
          `SELECT usuario, email FROM user WHERE id = ?`,
          [user_id]
        );

        const [admins] = await connection.query(
          `SELECT id FROM user WHERE rol = 'admin' AND activo = 1`
        );

        let mensajeNotificacion = '';
        let tituloNotificacion = '';

        if (tipo_pago === 'mixto') {
          tituloNotificacion = '💰 Nueva solicitud de pago mixto';
          mensajeNotificacion = `${usuario[0]?.usuario || 'Usuario'} solicita PAGO MIXTO: ${puntos_a_canjear} puntos (USD $${valorEnDinero.toFixed(2)}) + USD $${(monto_efectivo || 0).toFixed(2)} en efectivo`;
          if (producto_nombre) {
            mensajeNotificacion += ` | Producto: ${producto_nombre}`;
          }
        } else if (producto_id) {
          tituloNotificacion = '🎁 Nueva solicitud de canje de producto';
          mensajeNotificacion = `${usuario[0]?.usuario || 'Usuario'} solicita canjear ${puntos_a_canjear} puntos por el producto: ${producto_nombre}`;
        } else {
          tituloNotificacion = '🎁 Nueva solicitud de canje';
          mensajeNotificacion = `${usuario[0]?.usuario || 'Usuario'} solicita CANJE DE PUNTOS: ${puntos_a_canjear} puntos por USD $${valorEnDinero.toFixed(2)}`;
        }

        for (const admin of admins) {
          await connection.query(
            `INSERT INTO notificaciones (user_id, cliente_id, tipo, titulo, mensaje, importante, fecha, metadata)
             VALUES (?, ?, 'canje', ?, ?, 1, NOW(), ?)`,
            [admin.id, user_id, tituloNotificacion, mensajeNotificacion, JSON.stringify({ 
              solicitud_id: solicitudId,
              valor_punto: valorPunto,
              producto_id: producto_id || null,
              producto_nombre: producto_nombre || null,
              emprendimiento_id: emprendimiento_id
            })]
          );
        }

        await connection.commit();

        // ✅ EMITIR EVENTOS DE SOCKET.IO
        if (io) {
          // Emitir a la sala del usuario
          io.to(`user_${user_id}`).emit('solicitud_enviada', {
            solicitud_id: solicitudId,
            puntos: puntos_a_canjear,
            tipo: tipo_canje,
            estado: 'pendiente',
            timestamp: new Date().toISOString()
          });

          // Emitir a los administradores
          io.to('admin').emit('nueva_notificacion', {
            id: Date.now(),
            userId: user_id,
            userName: usuario[0]?.usuario || 'Usuario',
            type: tipo_pago === 'mixto' ? 'pago_mixto' : 'canje',
            title: tituloNotificacion,
            message: mensajeNotificacion,
            details: {
              points: puntos_a_canjear,
              amount: valorEnDinero,
              monto_efectivo: monto_efectivo || 0,
              currency: 'USD',
              emprendimiento_id,
              motivo,
              tipo_pago: tipo_pago || 'solo_puntos',
              solicitud_id: solicitudId,
              valor_punto: valorPunto,
              producto_id: producto_id || null,
              producto_nombre: producto_nombre || null
            },
            status: 'pending',
            timestamp: new Date().toISOString(),
            read: false,
            priority: 'high'
          });

          // ✅ NUEVO: EMITIR EVENTO ESPECÍFICO PARA NUEVAS SOLICITUDES
          io.to('admin').emit('nueva_solicitud_canje', {
            solicitud_id: solicitudId,
            usuario_id: user_id,
            usuario_nombre: usuario[0]?.usuario || 'Usuario',
            usuario_rol: 'usuario',
            tipo_canje: tipo_canje,
            origen_soli: req.user.rol === 'colab' ? 'colab' : 'usuario',
            puntos: puntos_a_canjear,
            empresa_nombre: nombreTienda,
            departamento: req.user.departamento || null,
            detalles: metadata,
            mensaje: mensajeNotificacion,
            timestamp: new Date().toISOString()
          });

          // Emitir evento de canje pendiente
          emitirEventoPuntos(io, 'canje_pendiente', {
            user_id: user_id,
            usuario: usuario[0]?.usuario || 'Usuario',
            puntos_solicitados: puntos_a_canjear,
            emprendimiento_id: emprendimiento_id,
            solicitud_id: solicitudId,
            tipo: tipo_canje
          });
        }

        // Limpiar caché
        cache.del(`${CACHE_KEYS.SOLICITUDES_PREFIX}${emprendimiento_id}`);

        res.json({
          success: true,
          message: 'Solicitud de canje enviada. Esperando aprobación del administrador.',
          data: {
            solicitud_id: solicitudId,
            puntos_disponibles: puntosDisponibles,
            puntos_solicitados: puntos_a_canjear,
            valor_equivalente: valorEnDinero,
            monto_efectivo: monto_efectivo || 0,
            tipo_pago: tipo_pago || 'solo_puntos',
            estado: 'pendiente',
            valor_punto: valorPunto,
            producto: producto_nombre || null
          }
        });

      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST canjear-puntos', res);
      } finally {
        connection.release();
      }
    }
  );

  // PATCH /usuarios/:id/puntos - Actualizar puntos del usuario (SOLO ADMIN)
  router.patch('/usuarios/:id/puntos',
    authenticate,
    authorize('admin'),
    createLimiter(1, 30),
    validateParams(validations.idParam),
    validate(validations.puntosUpdate),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        const { id } = req.params;
        const { puntos } = req.body;
        logger.info(`PATCH /usuarios/${id}/puntos - Admin: ${req.user.id}`);

        await connection.beginTransaction();

        const [existing] = await connection.query(
          `SELECT * FROM user_puntos WHERE user_id = ?`,
          [id]
        );

        let puntosActualizados = 0;
        if (existing.length === 0) {
          await connection.query(
            `INSERT INTO user_puntos (user_id, nivel, puntos_totales, nivel_actual, 
              puntos_nivel_actual, puntos_siguiente_nivel, fecha_registro)
             VALUES (?, 'Bronce', ?, 1, ?, 1000, NOW())`,
            [id, puntos, puntos]
          );
          puntosActualizados = puntos;
        } else {
          const nuevosPuntos = existing[0].puntos_totales + puntos;
          await connection.query(
            `UPDATE user_puntos SET puntos_totales = puntos_totales + ? WHERE user_id = ?`,
            [puntos, id]
          );
          puntosActualizados = nuevosPuntos;
        }

        const [puntosFinales] = await connection.query(
          `SELECT puntos_totales, nivel FROM user_puntos WHERE user_id = ?`,
          [id]
        );

        await connection.commit();

        const [usuario] = await connection.query(
          `SELECT usuario, email FROM user WHERE id = ?`,
          [id]
        );

        // ✅ EMITIR EVENTOS DE SOCKET.IO
        if (io) {
          // Emitir a la sala del usuario
          io.to(`user_${id}`).emit('puntos_actualizados', {
            user_id: id,
            puntos_totales: puntosFinales[0]?.puntos_totales || 0,
            puntos_ganados: puntos,
            nivel: puntosFinales[0]?.nivel || 'Bronce',
            transaccion: {
              tipo: 'ajuste',
              puntos: puntos,
              motivo: 'Ajuste manual por administrador'
            },
            timestamp: new Date().toISOString()
          });

          // Emitir a la sala de colaboradores
          io.to('colab_puntos').emit('puntos_usuario_actualizados', {
            user_id: id,
            puntos_actuales: puntosFinales[0]?.puntos_totales || 0,
            usuario: usuario[0]?.usuario,
            timestamp: new Date().toISOString()
          });
        }

        // Limpiar caché
        clearCache();

        res.json({ 
          success: true, 
          message: 'Puntos actualizados exitosamente',
          puntos_actuales: puntosFinales[0]?.puntos_totales || 0
        });
      } catch (error) {
        await connection.rollback();
        handleError(error, `PATCH puntos usuario ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // POST /enviar-notificacion - Enviar notificación manual
  router.post('/enviar-notificacion',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(1, 30),
    validate(validations.notificacion),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        logger.info(`POST /enviar-notificacion - User: ${req.user.id}`);
        
        const { userId, userName, type, title, message, details, priority } = req.body;

        const [admins] = await connection.query(
          `SELECT id FROM user WHERE rol = 'admin' AND activo = 1`
        );

        for (const admin of admins) {
          await connection.query(
            `INSERT INTO notificaciones (user_id, cliente_id, tipo, titulo, mensaje, importante, fecha)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
              admin.id,
              userId || null,
              type === 'gift_exchange' ? 'canje' : (type || 'sistema'),
              title || 'Nueva notificación',
              message || 'Tienes una nueva notificación',
              priority === 'high' ? 1 : 0
            ]
          );
        }

        connection.release();

        // ✅ EMITIR NOTIFICACIÓN POR SOCKET.IO
        const notificacion = {
          id: Date.now(),
          userId: userId || 0,
          userName: userName || 'Sistema',
          type: type || 'general',
          title: title || 'Nueva notificación',
          message: message || 'Tienes una nueva notificación',
          details: details || {},
          status: 'pending',
          timestamp: new Date().toISOString(),
          read: false,
          priority: priority || 'medium'
        };

        if (io) {
          io.to('admin').emit('nueva_notificacion', notificacion);
          
          if (userId) {
            io.to(`user_${userId}`).emit('nueva_notificacion', notificacion);
          }
        }

        res.json({ success: true, message: 'Notificación enviada y guardada exitosamente', notificacion });
      } catch (error) {
        connection.release();
        handleError(error, 'POST enviar-notificacion', res);
      }
    }
  );

  // GET /solicitudes-canje - Obtener todas las solicitudes de canje
  router.get('/solicitudes-canje',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    validateQuery(validations.solicitudQuery),
    async (req, res) => {
      try {
        const { estado, tipo_canje, emprendimiento_id, limite } = req.query;
        logger.info(`GET /solicitudes-canje - User: ${req.user.id}`);

        const cacheKey = `${CACHE_KEYS.SOLICITUDES_PREFIX}${emprendimiento_id || 'all'}_${estado || 'all'}_${tipo_canje || 'all'}`;
        let solicitudes = cache.get(cacheKey);

        if (!solicitudes) {
          let query = `
            SELECT sc.*, u.usuario as cliente_nombre, u.email as cliente_email, e.nombre as emprendimiento_nombre
            FROM solicitudes_canje sc
            LEFT JOIN user u ON sc.user_id = u.id
            LEFT JOIN emprendimientos e ON sc.emprendimiento_id = e.id
            WHERE 1=1
          `;
          const params = [];

          if (estado) {
            query += ` AND sc.estado = ?`;
            params.push(estado);
          }

          if (tipo_canje) {
            query += ` AND sc.tipo_canje = ?`;
            params.push(tipo_canje);
          }

          if (emprendimiento_id) {
            query += ` AND sc.emprendimiento_id = ?`;
            params.push(emprendimiento_id);
          }

          query += ` ORDER BY sc.fecha_solicitud DESC LIMIT ?`;
          params.push(parseInt(limite));

          const [results] = await pool.query(query, params);
          solicitudes = results;
          cache.put(cacheKey, solicitudes, 2 * 60 * 1000);
        }

        res.json({ success: true, solicitudes });
      } catch (error) {
        handleError(error, 'GET solicitudes-canje', res);
      }
    }
  );

  // POST /aprobar-solicitud/:solicitudId - Aprobar solicitud de canje
  router.post('/aprobar-solicitud/:solicitudId',
    authenticate,
    authorize('admin'),
    createLimiter(1, 20),
    validateParams(validations.solicitudIdParam),
    validate(validations.aprobarRechazar),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        const { solicitudId } = req.params;
        const { admin_id } = req.body;
        logger.info(`POST /aprobar-solicitud/${solicitudId} - Admin: ${req.user.id}`);

        await connection.beginTransaction();

        const [solicitudes] = await connection.query(
          `SELECT * FROM solicitudes_canje WHERE id = ? AND estado = 'pendiente' FOR UPDATE`,
          [solicitudId]
        );

        if (solicitudes.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Solicitud no encontrada o ya procesada' });
        }

        const solicitud = solicitudes[0];
        const metadata = JSON.parse(solicitud.metadata || '{}');
        const puntosACanjear = solicitud.puntos_requeridos;

        const [puntosActuales] = await connection.query(
          `SELECT puntos_totales FROM user_puntos WHERE user_id = ? FOR UPDATE`,
          [solicitud.user_id]
        );

        if (puntosActuales.length === 0 || puntosActuales[0].puntos_totales < puntosACanjear) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Puntos insuficientes para completar el canje' });
        }

        await connection.query(
          `UPDATE user_puntos SET puntos_totales = puntos_totales - ? WHERE user_id = ?`,
          [puntosACanjear, solicitud.user_id]
        );

        const referencia = `${solicitud.tipo_canje.toUpperCase()}-${Date.now()}`;

        await connection.query(
          `INSERT INTO transacciones (
            user_id, tipo, referencia, fecha, puntos, puntos_usados, estado, detalles, emprendimiento_id
          ) VALUES (?, ?, ?, NOW(), ?, ?, 'completado', ?, ?)`,
          [
            solicitud.user_id,
            solicitud.tipo_canje === 'mixto' ? 'canje_mixto' : 'canje',
            referencia,
            -puntosACanjear,
            puntosACanjear,
            JSON.stringify({
              ...metadata,
              solicitud_id: solicitudId,
              aprobado_por: admin_id,
              fecha_aprobacion: new Date().toISOString()
            }),
            solicitud.emprendimiento_id || metadata.emprendimiento_id || null
          ]
        );

        await connection.query(
          `UPDATE solicitudes_canje 
           SET estado = 'aprobado', 
               fecha_procesamiento = NOW(), 
               procesado_por = ?
           WHERE id = ?`,
          [admin_id, solicitudId]
        );

        await connection.commit();

        // ✅ EMITIR EVENTOS DE SOCKET.IO
        if (io) {
          io.to(`user_${solicitud.user_id}`).emit('solicitud_aprobada', {
            solicitud_id: solicitudId,
            puntos: puntosACanjear,
            tipo: solicitud.tipo_canje,
            timestamp: new Date().toISOString()
          });

          emitirEventoPuntos(io, 'canje_aprobado', {
            user_id: solicitud.user_id,
            puntos_utilizados: puntosACanjear,
            solicitud_id: solicitudId,
            tipo: solicitud.tipo_canje,
            aprobado_por: admin_id
          });
        }

        // Limpiar caché
        clearCache();

        res.json({ success: true, message: 'Solicitud aprobada exitosamente' });

      } catch (error) {
        await connection.rollback();
        handleError(error, `POST aprobar-solicitud/${req.params.solicitudId}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // POST /rechazar-solicitud/:solicitudId - Rechazar solicitud de canje
  router.post('/rechazar-solicitud/:solicitudId',
    authenticate,
    authorize('admin'),
    createLimiter(1, 20),
    validateParams(validations.solicitudIdParam),
    validate(validations.aprobarRechazar),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        const { solicitudId } = req.params;
        const { admin_id, motivo_rechazo } = req.body;
        logger.info(`POST /rechazar-solicitud/${solicitudId} - Admin: ${req.user.id}`);

        await connection.beginTransaction();

        const [solicitudes] = await connection.query(
          `SELECT * FROM solicitudes_canje WHERE id = ? AND estado = 'pendiente' FOR UPDATE`,
          [solicitudId]
        );

        if (solicitudes.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Solicitud no encontrada o ya procesada' });
        }

        const solicitud = solicitudes[0];
        const metadata = JSON.parse(solicitud.metadata || '{}');

        if (metadata.producto_id) {
          await connection.query(
            `UPDATE productos SET stock = stock + 1 WHERE id = ?`,
            [metadata.producto_id]
          );
        }

        await connection.query(
          `UPDATE solicitudes_canje 
           SET estado = 'rechazado', 
               fecha_procesamiento = NOW(), 
               procesado_por = ?,
               metadata = JSON_SET(COALESCE(metadata, '{}'), '$.motivo_rechazo', ?)
           WHERE id = ?`,
          [admin_id, motivo_rechazo || 'Rechazado por el administrador', solicitudId]
        );

        await connection.commit();

        // ✅ EMITIR EVENTOS DE SOCKET.IO
        if (io) {
          io.to(`user_${solicitud.user_id}`).emit('solicitud_rechazada', {
            solicitud_id: solicitudId,
            motivo: motivo_rechazo || 'Rechazado por el administrador',
            timestamp: new Date().toISOString()
          });

          emitirEventoPuntos(io, 'canje_rechazado', {
            user_id: solicitud.user_id,
            solicitud_id: solicitudId,
            motivo: motivo_rechazo || 'Rechazado por el administrador',
            rechazado_por: admin_id
          });
        }

        // Limpiar caché
        clearCache();

        res.json({ success: true, message: 'Solicitud rechazada' });

      } catch (error) {
        await connection.rollback();
        handleError(error, `POST rechazar-solicitud/${req.params.solicitudId}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // GET /transacciones - Obtener todas las transacciones
  router.get('/transacciones',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    validateQuery(validations.transaccionQuery),
    async (req, res) => {
      try {
        const { tipo, fecha_inicio, fecha_fin, limite } = req.query;
        logger.info(`GET /transacciones - User: ${req.user.id}`);

        const cacheKey = `${CACHE_KEYS.TRANSACCIONES_PREFIX}${tipo || 'all'}_${fecha_inicio || 'all'}_${fecha_fin || 'all'}`;
        let transacciones = cache.get(cacheKey);

        if (!transacciones) {
          let query = `
            SELECT t.*, u.usuario as cliente_nombre, e.nombre as emprendimiento_nombre
            FROM transacciones t
            LEFT JOIN user u ON t.user_id = u.id
            LEFT JOIN emprendimientos e ON t.emprendimiento_id = e.id
            WHERE 1=1
          `;
          const params = [];

          if (tipo) {
            query += ` AND t.tipo = ?`;
            params.push(tipo);
          }

          if (fecha_inicio) {
            query += ` AND t.fecha >= ?`;
            params.push(fecha_inicio);
          }

          if (fecha_fin) {
            query += ` AND t.fecha <= ?`;
            params.push(fecha_fin);
          }

          query += ` ORDER BY t.fecha DESC LIMIT ?`;
          params.push(parseInt(limite));

          const [results] = await pool.query(query, params);
          transacciones = results;
          cache.put(cacheKey, transacciones, 2 * 60 * 1000);
        }

        res.json({ success: true, transacciones });
      } catch (error) {
        handleError(error, 'GET transacciones', res);
      }
    }
  );

  // GET /transacciones/usuario/:userId - Obtener transacciones por usuario
  router.get('/transacciones/usuario/:userId',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.userIdParam),
    async (req, res) => {
      try {
        const { userId } = req.params;
        logger.info(`GET /transacciones/usuario/${userId} - User: ${req.user.id}`);

        const [transacciones] = await pool.query(
          `SELECT t.*, u.usuario as cliente_nombre, e.nombre as emprendimiento_nombre
           FROM transacciones t
           LEFT JOIN user u ON t.user_id = u.id
           LEFT JOIN emprendimientos e ON t.emprendimiento_id = e.id
           WHERE t.user_id = ?
           ORDER BY t.fecha DESC
           LIMIT 100`,
          [userId]
        );

        res.json({ success: true, transacciones });
      } catch (error) {
        handleError(error, `GET transacciones usuario ${req.params.userId}`, res);
      }
    }
  );

  // GET /transacciones/emprendimiento/:emprendimientoId - Obtener transacciones por emprendimiento
  router.get('/transacciones/emprendimiento/:emprendimientoId',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(5, 100),
    validateParams(validations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /transacciones/emprendimiento/${emprendimientoId} - User: ${req.user.id}`);

        const [transacciones] = await pool.query(
          `SELECT t.*, u.usuario as cliente_nombre, e.nombre as emprendimiento_nombre
           FROM transacciones t
           LEFT JOIN user u ON t.user_id = u.id
           LEFT JOIN emprendimientos e ON t.emprendimiento_id = e.id
           WHERE t.emprendimiento_id = ?
           AND (t.tipo = 'canje' OR t.tipo = 'canje_mixto')
           ORDER BY t.fecha DESC
           LIMIT 200`,
          [emprendimientoId]
        );

        res.json({ success: true, transacciones });
      } catch (error) {
        handleError(error, `GET transacciones emprendimiento ${req.params.emprendimientoId}`, res);
      }
    }
  );

  // GET /config-puntos - Obtener configuración de puntos
  router.get('/config-puntos',
    createLimiter(10, 200),
    async (req, res) => {
      try {
        logger.info('GET /config-puntos');

        let config = cache.get(CACHE_KEYS.CONFIG_PUNTOS);
        if (!config) {
          const [results] = await pool.query(`SELECT * FROM config_puntos WHERE id = 1`);
          config = results[0] || {
            valor_punto: 0.005,
            tasa_conversion: 100,
            umbral_minimo: 0.99,
            puntos_fijos: 5,
            redondeo: 'floor'
          };
          cache.put(CACHE_KEYS.CONFIG_PUNTOS, config, 10 * 60 * 1000);
        }

        res.json({ success: true, config });
      } catch (error) {
        handleError(error, 'GET config-puntos', res);
      }
    }
  );

  // PUT /config-puntos - Actualizar configuración de puntos (SOLO ADMIN)
  router.put('/config-puntos',
    authenticate,
    authorize('admin'),
    createLimiter(1, 20),
    validate(validations.configPuntos),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        logger.info(`PUT /config-puntos - Admin: ${req.user.id}`);
        
        const { valor_punto, tasa_conversion, umbral_minimo, puntos_fijos, redondeo } = req.body;

        await connection.beginTransaction();

        await connection.query(
          `UPDATE config_puntos 
           SET valor_punto = ?, 
               tasa_conversion = ?, 
               umbral_minimo = ?, 
               puntos_fijos = ?, 
               redondeo = ?,
               updated_at = NOW()
           WHERE id = 1`,
          [valor_punto, tasa_conversion, umbral_minimo, puntos_fijos, redondeo]
        );

        const [nuevaConfig] = await connection.query(
          `SELECT valor_punto, tasa_conversion, umbral_minimo, puntos_fijos, redondeo, updated_at
           FROM config_puntos WHERE id = 1`
        );

        await connection.commit();

        // Limpiar caché
        cache.del(CACHE_KEYS.CONFIG_PUNTOS);

        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          io.emit('config_puntos_actualizada', {
            valor_punto: nuevaConfig[0].valor_punto,
            tasa_conversion: nuevaConfig[0].tasa_conversion,
            umbral_minimo: nuevaConfig[0].umbral_minimo,
            puntos_fijos: nuevaConfig[0].puntos_fijos,
            redondeo: nuevaConfig[0].redondeo,
            actualizado_en: nuevaConfig[0].updated_at || new Date().toISOString()
          });
        }

        res.json({ 
          success: true, 
          message: 'Configuración actualizada exitosamente',
          config: nuevaConfig[0]
        });

      } catch (error) {
        await connection.rollback();
        handleError(error, 'PUT config-puntos', res);
      } finally {
        connection.release();
      }
    }
  );

  // GET /valor-punto-actual - Obtener solo el valor actual del punto
  router.get('/valor-punto-actual',
    createLimiter(20, 300),
    async (req, res) => {
      try {
        logger.info('GET /valor-punto-actual');

        let config = cache.get(CACHE_KEYS.CONFIG_PUNTOS);
        if (!config) {
          const [results] = await pool.query(`SELECT valor_punto FROM config_puntos WHERE id = 1`);
          config = results[0] || { valor_punto: 0.005 };
          cache.put(CACHE_KEYS.CONFIG_PUNTOS, config, 10 * 60 * 1000);
        }

        res.json({ success: true, valor_punto: config.valor_punto });
      } catch (error) {
        handleError(error, 'GET valor-punto-actual', res);
      }
    }
  );

  return router;
};