const express = require('express');
const router = express.Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const jwt = require('jsonwebtoken');

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

// Middleware de autenticación REAL con JWT
const authenticate = async (req, res, next) => {
  try {
     const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    logger.warn('Token no proporcionado en user_Premios');  // ✅ Solo es un log
    return res.status(401).json({ success: false, message: 'Token no proporcionado' });
  }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      usuario: decoded.usuario,
      rol: decoded.rol,
      usuarioId: decoded.id
    };
    
    logger.info(`Usuario autenticado en premios: ${req.user.id} (${req.user.rol})`);
    next();
  } catch (error) {
    logger.error('Auth error en user_Premios:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ success: false, message: 'Token expirado, inicia sesión nuevamente' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ success: false, message: 'Token inválido' });
    }
    
    res.status(401).json({ success: false, message: 'No autorizado' });
  }
};

// Verificar que el usuario solo acceda a sus propias datos
const authorizeSelf = (req, res, next) => {
  const userId = parseInt(req.params.id);
  if (req.user.rol !== 'admin' && req.user.id !== userId) {
    logger.warn(`Usuario ${req.user.id} intentó canjear para usuario ${userId}`);
    return res.status(403).json({ success: false, message: 'No tienes permiso para realizar esta acción' });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const validations = {
  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  canjePremio: Joi.object({
    premioId: Joi.number().integer().positive().required()
  }),
  
  solicitarCanje: Joi.object({
    puntos: Joi.number().integer().min(100).required()
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

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

const handleError = (error, context, res) => {
  logger.error(`Error en ${context}:`, {
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// ============================================
// FUNCIONES DE EMISIÓN SOCKET
// ============================================

// Función para emitir nueva notificación
const emitirNuevaNotificacion = (io, userId, notificacion) => {
  if (io) {
    io.to(`user_${userId}`).emit('nueva_notificacion', {
      user_id: userId,
      id: notificacion.id,
      tipo: notificacion.tipo,
      titulo: notificacion.titulo,
      mensaje: notificacion.mensaje,
      importante: notificacion.importante || false,
      leida: notificacion.leida || false,
      fecha: notificacion.fecha || new Date().toISOString(),
      timestamp: new Date().toISOString()
    });
    logger.info(`📡 Emitida nueva notificación para usuario ${userId}: ${notificacion.titulo}`);
  }
};

// Función para emitir actualización de puntos
const emitirActualizacionPuntos = (io, userId, puntosTotales, transaccion = null) => {
  if (io) {
    io.to(`user_${userId}`).emit('puntos_actualizados', {
      user_id: userId,
      puntos_totales: puntosTotales,
      transaccion: transaccion,
      timestamp: new Date().toISOString()
    });
    logger.info(`📡 Emitida actualización de puntos para usuario ${userId}: ${puntosTotales}`);
  }
};

// ✅ Función para emitir nueva transacción (agregada)
const emitirNuevaTransaccion = (io, userId, transaccion) => {
  if (io) {
    io.to(`user_${userId}`).emit('nueva_transaccion', {
      user_id: userId,
      transaccion: transaccion,
      timestamp: new Date().toISOString()
    });
    logger.info(`📡 Emitida nueva transacción para usuario ${userId}: ${transaccion.id}`);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, io) => {
  
  // ========== CANJE DIRECTO DE PREMIOS (SIN APROBACIÓN) ==========
  router.post('/usuario/:id/canjear-premio',
    authenticate,
    authorizeSelf,
    createLimiter(1, 20),
    validateParams(validations.idParam),
    validate(validations.canjePremio),
    async (req, res) => {
      const userId = req.params.id;
      const { premioId } = req.body;
      
      const connection = await pool.getConnection();
      
      try {
        logger.info(`POST /usuario/${userId}/canjear-premio - Premio: ${premioId}`);
        await connection.beginTransaction();
        
        const [puntosUser] = await connection.query(
          'SELECT puntos_totales FROM user_puntos WHERE user_id = ? FOR UPDATE',
          [userId]
        );
        
        if (!puntosUser.length) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        const puntosActuales = puntosUser[0].puntos_totales;
        
        const [premio] = await connection.query(
          `SELECT * FROM premios WHERE id = ? AND disponible = 1 AND stock > 0 AND fechaVencimiento >= CURDATE() FOR UPDATE`,
          [premioId]
        );
        
        if (premio.length === 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Premio no disponible' });
        }
        
        if (puntosActuales < premio[0].puntos) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Puntos insuficientes para este premio' });
        }
        
        const [usuario] = await connection.query("SELECT usuario FROM user WHERE id = ?", [userId]);
        const nombreUsuario = usuario.length > 0 ? usuario[0].usuario : `Usuario ${userId}`;
        
        const nuevosPuntos = puntosActuales - premio[0].puntos;
        const stockRestante = premio[0].stock - 1;
        
        await connection.query('UPDATE user_puntos SET puntos_totales = ? WHERE user_id = ?', [nuevosPuntos, userId]);
        await connection.query('UPDATE premios SET stock = stock - 1, vecesCanjeado = vecesCanjeado + 1 WHERE id = ?', [premioId]);
        
        const [transaccionResult] = await connection.query(
          `INSERT INTO transacciones (user_id, tipo, puntos, puntos_usados, referencia, tienda, detalles, estado, fecha)
           VALUES (?, 'canje', 0, ?, CONCAT('PREMIO-', UNIX_TIMESTAMP()), 'Sistema', ?, 'completado', NOW())`,
          [userId, premio[0].puntos, JSON.stringify({ premio_id: premioId, premio_nombre: premio[0].nombre })]
        );
        
        // ✅ Obtener la transacción recién insertada
        const [nuevaTransaccion] = await connection.query(
          'SELECT * FROM transacciones WHERE id = ?',
          [transaccionResult.insertId]
        );
        
        const [admins] = await connection.query(
          "SELECT id FROM user WHERE rol = 'admin' AND activo = 1"
        );
        
        for (const admin of admins) {
          await connection.query(
            `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, importante, leida, estado, fecha, metadata)
             VALUES (?, 'sistema', '🎁 Canje de premio', ?, 1, 0, 'completado', NOW(), ?)`,
            [admin.id, 
             `Usuario "${nombreUsuario}" canjeó "${premio[0].nombre}" (${premio[0].puntos} pts) - Stock restante: ${stockRestante}`,
             JSON.stringify({ 
               premio_id: premioId, 
               usuario_id: parseInt(userId), 
               usuario_nombre: nombreUsuario,
               premio_nombre: premio[0].nombre,
               puntos_usados: premio[0].puntos,
               stock_restante: stockRestante,
               tipo_canje: 'premio'
             })]
          );
        }
        
        // ✅ Notificación para el usuario que canjeó
        const mensajeNotificacion = `¡Has canjeado "${premio[0].nombre}" por ${premio[0].puntos} puntos!`;
        const [notificacionResult] = await connection.query(
          `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, importante, leida, estado, fecha, metadata)
           VALUES (?, 'canje', '🎉 Canje exitoso', ?, 1, 0, 'completado', NOW(), ?)`,
          [userId, mensajeNotificacion, JSON.stringify({ premio_id: premioId, premio_nombre: premio[0].nombre, puntos_usados: premio[0].puntos })]
        );
        
        await connection.commit();
        
        // ✅ Emitir eventos de Socket.io
        if (io) {
          // Actualizar puntos del usuario
          emitirActualizacionPuntos(io, userId, nuevosPuntos, { 
            tipo: 'canje', 
            puntos_usados: premio[0].puntos,
            premio: premio[0].nombre 
          });
          
          // ✅ Emitir nueva transacción para el historial
          if (nuevaTransaccion.length > 0) {
            emitirNuevaTransaccion(io, userId, nuevaTransaccion[0]);
          }
          
          // Emitir nueva notificación para el usuario
          emitirNuevaNotificacion(io, userId, {
            id: notificacionResult.insertId,
            tipo: 'canje',
            titulo: '🎉 Canje exitoso',
            mensaje: mensajeNotificacion,
            importante: true,
            leida: false,
            fecha: new Date().toISOString()
          });

          // ✅ NUEVO: Emitir evento para administradores (canje de premio)
          io.to('admin').emit('nueva_solicitud_canje', {
            solicitud_id: transaccionResult.insertId,
            usuario_id: parseInt(userId),
            usuario_nombre: nombreUsuario,
            usuario_rol: 'usuario',
            tipo_canje: 'premio',
            origen_soli: 'usuario',
            puntos: premio[0].puntos,
            premio_nombre: premio[0].nombre,
            stock_restante: stockRestante,
            mensaje: `Usuario "${nombreUsuario}" canjeó el premio "${premio[0].nombre}" (${premio[0].puntos} pts) - Stock restante: ${stockRestante}`,
            timestamp: new Date().toISOString()
          });
        }
        
        logger.info(`Usuario ${userId} canjeó premio ${premioId}: ${premio[0].nombre}`);
        
        res.json({ 
          success: true, 
          message: `¡Has canjeado ${premio[0].nombre}!`, 
          puntos_restantes: nuevosPuntos,
          stock_restante: stockRestante
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `POST usuario/${userId}/canjear-premio`, res);
      } finally {
        connection.release();
      }
    }
  );

  // ========== SOLICITAR CANJE EN EFECTIVO (CON APROBACIÓN) ==========
  router.post('/usuario/:id/solicitar-canje',
    authenticate,
    authorizeSelf,
    createLimiter(1, 10),
    validateParams(validations.idParam),
    validate(validations.solicitarCanje),
    async (req, res) => {
      const userId = req.params.id;
      const { puntos } = req.body;
      
      const connection = await pool.getConnection();
      
      try {
        logger.info(`POST /usuario/${userId}/solicitar-canje - Puntos: ${puntos}`);
        await connection.beginTransaction();
        
        const [puntosUser] = await connection.query(
          'SELECT puntos_totales FROM user_puntos WHERE user_id = ? FOR UPDATE',
          [userId]
        );
        
        if (!puntosUser.length) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        const puntosActuales = puntosUser[0].puntos_totales;
        
        if (puntos > puntosActuales) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Puntos insuficientes' });
        }
        
        const [config] = await connection.query('SELECT valor_punto FROM config_puntos LIMIT 1');
        const valorPunto = config.length > 0 ? parseFloat(config[0].valor_punto) : 0.005;
        const montoEfectivo = (puntos * valorPunto).toFixed(2);
        
        const metadata = {
          tipo_canje: 'efectivo',
          puntos_canjeados: puntos,
          monto_usd: montoEfectivo,
          valor_punto: valorPunto
        };
        
        const [usuario] = await connection.query("SELECT usuario FROM user WHERE id = ?", [userId]);
        const nombreUsuario = usuario.length > 0 ? usuario[0].usuario : `Usuario ${userId}`;
        
        const [admins] = await connection.query("SELECT id FROM user WHERE rol = 'admin' AND activo = 1");
        
        // ========== INSERT CORREGIDO ==========
        // Se agrega la columna origen_soli con valor fijo 'usuario'
        const [solicitud] = await connection.query(
          `INSERT INTO solicitudes_canje 
           (user_id, tipo_canje, premio_id, premio_nombre, puntos_requeridos, 
            estado, fecha_solicitud, metadata, origen_soli)
           VALUES (?, 'efectivo', NULL, NULL, ?, 'pendiente', NOW(), ?, 'usuario')`,
          [userId, puntos, JSON.stringify(metadata)]
        );
        // ======================================
        
        const solicitudId = solicitud.insertId;
        
        for (const admin of admins) {
          await connection.query(
            `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, importante, leida, estado, fecha, metadata)
             VALUES (?, 'sistema', '💰 Nueva solicitud de canje', ?, 1, 0, 'pending', NOW(), ?)`,
            [admin.id, `Usuario "${nombreUsuario}" solicita canje de ${puntos} puntos por $${montoEfectivo} USD`, JSON.stringify({ solicitud_id: solicitudId, usuario_id: parseInt(userId), tipo_canje: 'efectivo', ...metadata })]
          );
        }
        
        const mensajeNotificacion = `Tu solicitud de canje de ${puntos} puntos por $${montoEfectivo} USD ha sido enviada. Espera la aprobación.`;
        const [notificacionResult] = await connection.query(
          `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, importante, leida, estado, fecha, metadata)
           VALUES (?, 'canje', '📤 Solicitud enviada', ?, 0, 0, 'pending', NOW(), ?)`,
          [userId, mensajeNotificacion, JSON.stringify({ solicitud_id: solicitudId })]
        );
        
        await connection.commit();
        
        // ✅ Emitir evento de notificación para el usuario
        if (io) {
          emitirNuevaNotificacion(io, userId, {
            id: notificacionResult.insertId,
            tipo: 'canje',
            titulo: '📤 Solicitud enviada',
            mensaje: mensajeNotificacion,
            importante: false,
            leida: false,
            fecha: new Date().toISOString()
          });

          // ✅ NUEVO: Emitir evento para administradores (solicitud de canje en efectivo)
          io.to('admin').emit('nueva_solicitud_canje', {
            solicitud_id: solicitudId,
            usuario_id: parseInt(userId),
            usuario_nombre: nombreUsuario,
            usuario_rol: 'usuario',
            tipo_canje: 'efectivo',
            origen_soli: 'usuario',
            puntos: puntos,
            detalles: metadata,
            mensaje: `Usuario "${nombreUsuario}" solicita canje de ${puntos} puntos por $${montoEfectivo} USD`,
            timestamp: new Date().toISOString()
          });
        }
        
        logger.info(`Usuario ${userId} solicitó canje de ${puntos} puntos por $${montoEfectivo}`);
        
        res.json({ 
          success: true, 
          message: 'Solicitud de canje enviada. Espera la aprobación del administrador.', 
          solicitud_id: solicitudId 
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `POST usuario/${userId}/solicitar-canje`, res);
      } finally {
        connection.release();
      }
    }
  );

  // ========== OBTENER PREMIOS DISPONIBLES ==========
  // ✅ ELIMINADO EL CACHÉ - Siempre consulta a la base de datos
  router.get('/premios/disponibles',
    createLimiter(10, 200),
    async (req, res) => {
      try {
        logger.info('GET /premios/disponibles');
        
        // ✅ Siempre consultar a la base de datos (sin caché)
        const [results] = await pool.query(
          `SELECT id, nombre, categoria, puntos, descripcion, stock, imagen 
           FROM premios 
           WHERE disponible = 1 AND stock > 0 AND fechaVencimiento >= CURDATE()
           ORDER BY puntos ASC`
        );
        
        res.json({ success: true, premios: results });
      } catch (error) {
        handleError(error, 'GET premios/disponibles', res);
      }
    }
  );

  return router;
};