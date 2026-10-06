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

// Rate limiting específico para configuración
const configLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30, // 30 requests por ventana
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
    
    // Verificar token JWT real
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

// Solo administradores pueden modificar configuración
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    logger.warn(`Intento no autorizado de modificar configuración: ${req.user?.id} - Rol: ${req.user?.rol}`);
    return res.status(403).json({ success: false, message: 'Se requieren permisos de administrador' });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const configValidation = {
  update: Joi.object({
    umbral_minimo: Joi.number().positive().max(1000000).required(),
    puntos_fijos: Joi.number().integer().min(0).max(1000000).required(),
    tasa_conversion: Joi.number().positive().max(1000).required(),
    redondeo: Joi.string().valid('none', 'floor', 'ceil', 'round').required(),
    rango_bronce_max: Joi.number().integer().min(0).required(),
    rango_plata_min: Joi.number().integer().min(0).required(),
    rango_plata_max: Joi.number().integer().min(0).required(),
    rango_oro_min: Joi.number().integer().min(0).required(),
    rango_oro_max: Joi.number().integer().min(0).required(),
    rango_diamante_min: Joi.number().integer().min(0).required(),
    valor_punto: Joi.number().positive().max(1).required()
  }).custom((value, helpers) => {
    // Validaciones de rangos
    if (value.rango_bronce_max >= value.rango_plata_min) {
      return helpers.error('El rango Bronce debe ser menor que el rango Plata');
    }
    if (value.rango_plata_max >= value.rango_oro_min) {
      return helpers.error('El rango Plata debe ser menor que el rango Oro');
    }
    if (value.rango_oro_max >= value.rango_diamante_min) {
      return helpers.error('El rango Oro debe ser menor que el rango Diamante');
    }
    if (value.rango_plata_min > value.rango_plata_max) {
      return helpers.error('Rango Plata inválido: mínimo mayor que máximo');
    }
    if (value.rango_oro_min > value.rango_oro_max) {
      return helpers.error('Rango Oro inválido: mínimo mayor que máximo');
    }
    return value;
  }, 'Validación de rangos')
};

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      logger.warn(`Validación falló: ${error.message}`);
      return res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }
    req.body = value;
    next();
  };
};

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

// Obtener configuración con caché
const getConfig = async (pool, skipCache = false) => {
  const cacheKey = 'config_puntos';
  
  if (!skipCache) {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }
  
  const [config] = await pool.query('SELECT * FROM config_puntos LIMIT 1');
  
  if (config.length === 0) {
    await pool.query(`
      INSERT INTO config_puntos 
      (umbral_minimo, puntos_fijos, tasa_conversion, redondeo, 
       rango_bronce_max, rango_plata_min, rango_plata_max, 
       rango_oro_min, rango_oro_max, rango_diamante_min, valor_punto) 
      VALUES (0.99, 5, 1.00, 'none', 999, 1000, 4999, 5000, 9999, 10000, 0.005)
    `);
    const [newConfig] = await pool.query('SELECT * FROM config_puntos LIMIT 1');
    cache.put(cacheKey, newConfig[0], 10 * 60 * 1000);
    return newConfig[0];
  }
  
  cache.put(cacheKey, config[0], 10 * 60 * 1000);
  return config[0];
};

const handleError = (error, context, res) => {
  logger.error(`Error en ${context}:`, {
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
  
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Configuración duplicada' });
  }
  
  res.status(500).json({ 
    success: false, 
    message: 'Error interno del servidor'
  });
};

// ============================================
// FUNCIONES DE EMISIÓN DE SOCKET.IO
// ============================================

const emitirConfiguracionActualizada = (io, config) => {
  if (!io) return;

  try {
    const datos = {
      config: config,
      actualizado_en: new Date().toISOString(),
      actualizado_por: 'admin'
    };

    // Emitir a todos los usuarios conectados
    io.emit('config_puntos_actualizada', datos);
    
    // Emitir específicamente a la sala de administradores
    io.to('admin').emit('config_puntos_actualizada_admin', datos);
    
    logger.info('📡 Configuración de puntos actualizada emitida a todos los clientes');
  } catch (socketError) {
    logger.error('Error emitiendo configuración de puntos:', socketError);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;
  
  // GET / - Obtener configuración (PÚBLICO - sin autenticación)
  router.get('/', 
    configLimiter,
    async (req, res) => {
      try {
        logger.info('GET /api/config-puntos');
        const config = await getConfig(pool);
        
        res.json({
          success: true,
          config: config
        });
      } catch (error) {
        handleError(error, 'GET config-puntos', res);
      }
    }
  );
  
  // PUT / - Actualizar configuración (SOLO ADMIN)
  router.put('/',
    authenticate,
    authorizeAdmin,
    configLimiter,
    validate(configValidation.update),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('PUT /api/config-puntos - Admin:', req.user.id);
        await connection.beginTransaction();
        
        const {
          umbral_minimo, puntos_fijos, tasa_conversion, redondeo,
          rango_bronce_max, rango_plata_min, rango_plata_max,
          rango_oro_min, rango_oro_max, rango_diamante_min, valor_punto
        } = req.body;
        
        // Verificar si existe configuración
        const [existing] = await connection.query('SELECT COUNT(*) as count FROM config_puntos');
        
        if (existing[0].count === 0) {
          await connection.query(`
            INSERT INTO config_puntos 
            (umbral_minimo, puntos_fijos, tasa_conversion, redondeo, 
             rango_bronce_max, rango_plata_min, rango_plata_max, 
             rango_oro_min, rango_oro_max, rango_diamante_min, valor_punto) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [umbral_minimo, puntos_fijos, tasa_conversion, redondeo,
              rango_bronce_max, rango_plata_min, rango_plata_max,
              rango_oro_min, rango_oro_max, rango_diamante_min, valor_punto]);
        } else {
          await connection.query(`
            UPDATE config_puntos SET 
              umbral_minimo = ?, puntos_fijos = ?, tasa_conversion = ?, redondeo = ?,
              rango_bronce_max = ?, rango_plata_min = ?, rango_plata_max = ?,
              rango_oro_min = ?, rango_oro_max = ?, rango_diamante_min = ?, valor_punto = ?
          `, [umbral_minimo, puntos_fijos, tasa_conversion, redondeo,
              rango_bronce_max, rango_plata_min, rango_plata_max,
              rango_oro_min, rango_oro_max, rango_diamante_min, valor_punto]);
        }
        
        await connection.commit();
        
        // Limpiar caché
        cache.del('config_puntos');
        
        const updatedConfig = await getConfig(pool, true);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        emitirConfiguracionActualizada(io, updatedConfig);
        
        logger.info(`Configuración actualizada por admin ${req.user.id}`);
        
        res.json({
          success: true,
          message: 'Configuración de puntos guardada exitosamente',
          config: updatedConfig
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'PUT config-puntos', res);
      } finally {
        connection.release();
      }
    }
  );
  
  // POST /reset - Restablecer configuración por defecto (SOLO ADMIN)
  router.post('/reset',
    authenticate,
    authorizeAdmin,
    configLimiter,
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /api/config-puntos/reset - Admin:', req.user.id);
        await connection.beginTransaction();
        
        const defaultConfig = {
          umbral_minimo: 0.99,
          puntos_fijos: 5,
          tasa_conversion: 1.00,
          redondeo: 'none',
          rango_bronce_max: 999,
          rango_plata_min: 1000,
          rango_plata_max: 4999,
          rango_oro_min: 5000,
          rango_oro_max: 9999,
          rango_diamante_min: 10000,
          valor_punto: 0.005
        };
        
        await connection.query(`
          UPDATE config_puntos SET 
            umbral_minimo = ?, puntos_fijos = ?, tasa_conversion = ?, redondeo = ?,
            rango_bronce_max = ?, rango_plata_min = ?, rango_plata_max = ?,
            rango_oro_min = ?, rango_oro_max = ?, rango_diamante_min = ?, valor_punto = ?
        `, Object.values(defaultConfig));
        
        await connection.commit();
        
        // Limpiar caché
        cache.del('config_puntos');
        
        const config = await getConfig(pool, true);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        emitirConfiguracionActualizada(io, config);
        
        logger.info(`Configuración restablecida por admin ${req.user.id}`);
        
        res.json({
          success: true,
          message: 'Configuración restablecida exitosamente',
          config: config
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST reset config-puntos', res);
      } finally {
        connection.release();
      }
    }
  );
  
  return router;
};