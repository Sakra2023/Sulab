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

// Autorización - solo admin y colaboradores
const authorizeEmprendimiento = (req, res, next) => {
  if (!req.user || !['admin', 'colab'].includes(req.user.rol)) {
    logger.warn(`Acceso denegado: ${req.user?.rol} intentó acceder a ${req.path}`);
    return res.status(403).json({ success: false, message: 'Permisos insuficientes' });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const emprendimientoValidations = {
  update: Joi.object({
    nombre: Joi.string().trim().min(3).max(100).required(),
    categoria: Joi.string().trim().min(2).max(50).required(),
    ubicacion: Joi.string().trim().min(5).max(200).required(),
    ciudad: Joi.string().trim().min(2).max(50).required(),
    horario: Joi.string().trim().max(100).allow(null, '').optional(),
    // ✅ Acepta número de teléfono (8-20 dígitos/+, -, espacios) O URL (http/https)
    whatsapp: Joi.string().trim().pattern(/^([0-9+\-\s]{8,20}|https?:\/\/.+)$/).allow(null, '').optional(),
    // ✅ Acepta URL completa O @usuario (se amplió el límite y se quitó el pattern restrictivo)
    instagram: Joi.string().trim().max(200).allow(null, '').optional(),
    tiktok: Joi.string().trim().max(200).allow(null, '').optional()
  }),

  usuarioIdParam: Joi.object({
    usuarioId: Joi.number().integer().positive().required()
  }),

  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
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

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Registro duplicado' });
  }

  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// Cache keys
const CACHE_KEYS = {
  EMPRENDIMIENTO_PREFIX: 'emprendimiento_propietario_'
};

const clearEmprendimientoCache = (usuarioId, emprendimientoId) => {
  cache.del(`${CACHE_KEYS.EMPRENDIMIENTO_PREFIX}${usuarioId}`);
  if (emprendimientoId) {
    cache.del(`${CACHE_KEYS.EMPRENDIMIENTO_PREFIX}id_${emprendimientoId}`);
  }
};

// Verificar que el usuario tenga permiso sobre el emprendimiento
const verifyEmprendimientoPermission = async (connection, emprendimientoId, usuarioId, userRol) => {
  if (userRol === 'admin') return true;
  
  const [emprendimiento] = await connection.query(
    'SELECT propietario_id FROM emprendimientos WHERE id = ? AND activo = 1',
    [emprendimientoId]
  );
  
  if (emprendimiento.length === 0) return false;
  return emprendimiento[0].propietario_id === usuarioId;
};

// ============================================
// FUNCIONES DE EMISIÓN DE SOCKET.IO
// ============================================

const emitirEventoEmprendimiento = (io, evento, datos) => {
  if (!io) return;

  try {
    // Emitir a la sala del emprendimiento específico
    if (datos.emprendimiento_id) {
      io.to(`emprendimiento_${datos.emprendimiento_id}`).emit(evento, {
        ...datos,
        timestamp: new Date().toISOString()
      });
      logger.info(`📡 Evento ${evento} emitido para emprendimiento ${datos.emprendimiento_id}`);
    }

    // Emitir al propietario
    if (datos.propietario_id) {
      io.to(`user_${datos.propietario_id}`).emit(evento, {
        ...datos,
        timestamp: new Date().toISOString()
      });
      logger.info(`📡 Evento ${evento} emitido para propietario ${datos.propietario_id}`);
    }

    // Emitir globalmente para administradores
    io.emit(`emprendimiento_${evento}`, {
      ...datos,
      timestamp: new Date().toISOString()
    });
  } catch (socketError) {
    logger.error('Error emitiendo evento de emprendimiento:', socketError);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;

  // GET /propietario/:usuarioId - Obtener emprendimiento por propietario
  router.get('/propietario/:usuarioId',
    authenticate,
    authorizeEmprendimiento,
    createLimiter(5, 100),
    validateParams(emprendimientoValidations.usuarioIdParam),
    async (req, res) => {
      try {
        const { usuarioId } = req.params;
        logger.info(`GET /emprendimientos/propietario/${usuarioId} - User: ${req.user.id}`);

        // Verificar que el usuario autenticado solo acceda a sus propios datos
        if (req.user.rol !== 'admin' && req.user.id !== parseInt(usuarioId)) {
          logger.warn(`Usuario ${req.user.id} intentó acceder a emprendimiento de ${usuarioId}`);
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para ver este emprendimiento' 
          });
        }

        // Intentar obtener del caché
        const cacheKey = `${CACHE_KEYS.EMPRENDIMIENTO_PREFIX}${usuarioId}`;
        let cachedEmprendimiento = cache.get(cacheKey);

        if (cachedEmprendimiento) {
          return res.json({ success: true, emprendimiento: cachedEmprendimiento });
        }

        const [emprendimiento] = await pool.query(
          `SELECT * FROM emprendimientos 
           WHERE propietario_id = ? AND activo = 1`,
          [usuarioId]
        );

        if (emprendimiento.length === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'Emprendimiento no encontrado' 
          });
        }

        // Guardar en caché por 5 minutos
        cache.put(cacheKey, emprendimiento[0], 5 * 60 * 1000);

        res.json({ success: true, emprendimiento: emprendimiento[0] });

      } catch (error) {
        handleError(error, `GET emprendimiento/propietario/${req.params.usuarioId}`, res);
      }
    }
  );

  // PUT /:id - Actualizar emprendimiento
  router.put('/:id',
    authenticate,
    authorizeEmprendimiento,
    createLimiter(1, 30),
    validateParams(emprendimientoValidations.idParam),
    validate(emprendimientoValidations.update),
    async (req, res) => {
      let connection;
      
      try {
        const { id } = req.params;
        const { nombre, categoria, ubicacion, ciudad, horario, whatsapp, instagram, tiktok } = req.body;
        
        logger.info(`PUT /emprendimientos/${id} - User: ${req.user.id}`);
        
        connection = await pool.getConnection();
        
        // Verificar que el usuario tenga permiso
        const [emprendimientoActual] = await connection.query(
          `SELECT propietario_id FROM emprendimientos WHERE id = ? AND activo = 1`,
          [id]
        );
        
        if (emprendimientoActual.length === 0) {
          return res.status(404).json({ success: false, message: 'Emprendimiento no encontrado' });
        }
        
        const propietarioId = emprendimientoActual[0].propietario_id;
        
        const tienePermiso = await verifyEmprendimientoPermission(
          connection, id, req.user.id, req.user.rol
        );
        
        if (!tienePermiso) {
          logger.warn(`Usuario ${req.user.id} intentó actualizar emprendimiento ${id} sin permiso`);
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para modificar este emprendimiento' 
          });
        }
        
        const [result] = await connection.query(
          `UPDATE emprendimientos 
           SET nombre = ?, categoria = ?, ubicacion = ?, ciudad = ?, 
               horario = ?, whatsapp = ?, instagram = ?, tiktok = ?
           WHERE id = ?`,
          [nombre, categoria, ubicacion, ciudad, horario || null, whatsapp || null, instagram || null, tiktok || null, id]
        );
        
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Emprendimiento no encontrado' });
        }
        
        // Limpiar caché
        clearEmprendimientoCache(propietarioId, id);
        
        logger.info(`Emprendimiento ${id} actualizado por usuario ${req.user.id}`);

        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          emitirEventoEmprendimiento(io, 'emprendimiento_actualizado', {
            emprendimiento_id: id,
            propietario_id: propietarioId,
            usuario_id: req.user.id,
            usuario: req.user.usuario,
            datos: { nombre, categoria, ubicacion, ciudad, horario, whatsapp, instagram, tiktok },
            mensaje: `El emprendimiento "${nombre}" ha sido actualizado`
          });

          // Emitir al propietario específico
          io.to(`user_${propietarioId}`).emit('emprendimiento_actualizado', {
            emprendimiento_id: id,
            mensaje: `Tu emprendimiento "${nombre}" ha sido actualizado por ${req.user.usuario}`,
            datos: { nombre, categoria, ubicacion, ciudad },
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({ success: true, message: 'Emprendimiento actualizado exitosamente' });
        
      } catch (error) {
        handleError(error, `PUT emprendimiento/${req.params.id}`, res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  return router;
};