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

// Middleware de autenticación CORREGIDO
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      logger.warn('Token no proporcionado');
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }
    
    // Verificar JWT_SECRET
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET no configurado');
      return res.status(500).json({ success: false, message: 'Error de configuración del servidor' });
    }
    
    // Verificar token JWT real
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

// Solo administradores pueden modificar promociones
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    logger.warn(`Intento no autorizado de modificar promociones: ${req.user?.id} - Rol: ${req.user?.rol}`);
    return res.status(403).json({ 
      success: false, 
      message: 'Se requieren permisos de administrador' 
    });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const promocionValidations = {
  create: Joi.object({
    nombre: Joi.string().min(3).max(100).required().trim(),
    descripcion: Joi.string().max(500).allow(null).optional(),
    multiplicador: Joi.number().integer().min(2).max(5).required(),
    fechaInicio: Joi.date().iso().required(),
    fechaFin: Joi.date().iso().greater(Joi.ref('fechaInicio')).required(),
    activo: Joi.boolean().default(true),
    emprendimiento_id: Joi.number().integer().positive().allow(null).optional()
  }),
  
  update: Joi.object({
    nombre: Joi.string().min(3).max(100).optional().trim(),
    descripcion: Joi.string().max(500).allow(null).optional(),
    multiplicador: Joi.number().integer().min(2).max(5).optional(),
    fechaInicio: Joi.date().iso().optional(),
    fechaFin: Joi.date().iso().optional(),
    activo: Joi.boolean().optional(),
    emprendimiento_id: Joi.number().integer().positive().allow(null).optional()
  }).custom((value, helpers) => {
    // Validar que si ambas fechas están presentes, fechaFin > fechaInicio
    if (value.fechaInicio && value.fechaFin) {
      const inicio = new Date(value.fechaInicio);
      const fin = new Date(value.fechaFin);
      if (fin <= inicio) {
        return helpers.error('La fecha de fin debe ser posterior a la fecha de inicio');
      }
    }
    return value;
  }).min(1),
  
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  emprendimientoId: Joi.object({
    emprendimientoId: Joi.number().integer().positive().required()
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
    return res.status(409).json({ success: false, message: 'Promoción duplicada' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ success: false, message: 'Emprendimiento no encontrado' });
  }
  
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// ✅ ELIMINADO CACHÉ - Función ya no usada, mantenida por compatibilidad
const clearPromocionesCache = () => {
  // La caché ya no se usa, pero mantenemos la función por compatibilidad
  logger.info('🔄 Caché de promociones invalidada (ya no se usa caché)');
};

// Verificar si una promoción está activa basado en fechas
const isPromocionActiva = (promocion) => {
  const ahora = new Date();
  const inicio = new Date(promocion.fechaInicio);
  const fin = new Date(promocion.fechaFin);
  return promocion.activo === 1 && ahora >= inicio && ahora <= fin;
};

// ============================================
// ENDPOINTS - SIN CACHÉ (SIEMPRE CONSULTA BD)
// ============================================

module.exports = (pool) => {
  
  // GET / - Obtener todas las promociones (SOLO ADMIN)
  router.get('/',
    authenticate,
    authorizeAdmin,
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /api/promociones - Admin:', req.user.id);
        
        // ✅ SIN CACHÉ - Siempre consultar BD
        const [results] = await pool.query(`
          SELECT p.*, e.nombre as emprendimiento_nombre
          FROM promociones p
          LEFT JOIN emprendimientos e ON p.emprendimiento_id = e.id
          ORDER BY p.fechaInicio DESC
        `);
        
        res.json({ success: true, promociones: results });
      } catch (error) {
        handleError(error, 'GET promociones', res);
      }
    }
  );

  // GET /activas - Obtener promociones activas (PÚBLICO - sin autenticación)
  router.get('/activas',
    createLimiter(5, 200),
    async (req, res) => {
      try {
        logger.info('GET /api/promociones/activas');
        
        // ✅ SIN CACHÉ - Siempre consultar BD para datos en tiempo real
        const [results] = await pool.query(`
          SELECT p.*, e.nombre as emprendimiento_nombre
          FROM promociones p
          LEFT JOIN emprendimientos e ON p.emprendimiento_id = e.id
          WHERE p.activo = 1 
            AND NOW() BETWEEN p.fechaInicio AND p.fechaFin
          ORDER BY p.fechaFin ASC
        `);
        
        res.json({ success: true, promociones: results });
      } catch (error) {
        handleError(error, 'GET promociones activas', res);
      }
    }
  );

  // GET /emprendimiento/:emprendimientoId - Obtener promociones por emprendimiento (PÚBLICO)
  router.get('/emprendimiento/:emprendimientoId',
    createLimiter(5, 200),
    validateParams(promocionValidations.emprendimientoId),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /api/promociones/emprendimiento/${emprendimientoId}`);
        
        // ✅ SIN CACHÉ - Siempre consultar BD
        const [results] = await pool.query(`
          SELECT p.*, e.nombre as emprendimiento_nombre
          FROM promociones p
          LEFT JOIN emprendimientos e ON p.emprendimiento_id = e.id
          WHERE p.emprendimiento_id = ? OR p.emprendimiento_id IS NULL
          ORDER BY p.fechaInicio DESC
        `, [emprendimientoId]);
        
        res.json({ success: true, promociones: results });
      } catch (error) {
        handleError(error, 'GET promociones por emprendimiento', res);
      }
    }
  );

  // GET /:id - Obtener promoción por ID (PÚBLICO)
  router.get('/:id',
    createLimiter(5, 200),
    validateParams(promocionValidations.id),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /api/promociones/${id}`);
        
        // ✅ SIN CACHÉ - Siempre consultar BD
        const [promociones] = await pool.query(`
          SELECT p.*, e.nombre as emprendimiento_nombre
          FROM promociones p
          LEFT JOIN emprendimientos e ON p.emprendimiento_id = e.id
          WHERE p.id = ?
        `, [id]);
        
        if (promociones.length === 0) {
          return res.status(404).json({ success: false, message: 'Promoción no encontrada' });
        }
        
        res.json({ success: true, promocion: promociones[0] });
      } catch (error) {
        handleError(error, `GET promocion ${req.params.id}`, res);
      }
    }
  );

  // POST / - Crear nueva promoción (SOLO ADMIN)
  router.post('/',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    validate(promocionValidations.create),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /api/promociones - Admin:', req.user.id);
        await connection.beginTransaction();
        
        const { nombre, descripcion, multiplicador, fechaInicio, fechaFin, activo, emprendimiento_id } = req.body;
        
        // Verificar emprendimiento si se especifica
        if (emprendimiento_id) {
          const [emprendimiento] = await connection.query(
            'SELECT id FROM emprendimientos WHERE id = ? AND activo = 1',
            [emprendimiento_id]
          );
          
          if (emprendimiento.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Emprendimiento no encontrado o inactivo' });
          }
        }
        
        const [result] = await connection.query(
          `INSERT INTO promociones 
           (nombre, descripcion, multiplicador, fechaInicio, fechaFin, activo, emprendimiento_id, fechaRegistro) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [nombre, descripcion || null, multiplicador, fechaInicio, fechaFin, activo !== false ? 1 : 0, emprendimiento_id || null]
        );
        
        await connection.commit();
        
        // Limpiar caché (mantenido por compatibilidad)
        clearPromocionesCache();
        
        logger.info(`Promoción creada: ID ${result.insertId} por admin ${req.user.id}`);
        
        res.status(201).json({
          success: true,
          message: 'Promoción creada exitosamente',
          id: result.insertId
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST promocion', res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /:id - Actualizar promoción (SOLO ADMIN)
  router.put('/:id',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    validateParams(promocionValidations.id),
    validate(promocionValidations.update),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`PUT /api/promociones/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { nombre, descripcion, multiplicador, fechaInicio, fechaFin, activo, emprendimiento_id } = req.body;
        
        // Verificar si existe
        const [existing] = await connection.query('SELECT * FROM promociones WHERE id = ?', [id]);
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Promoción no encontrada' });
        }
        
        // Verificar emprendimiento si se especifica
        if (emprendimiento_id) {
          const [emprendimiento] = await connection.query(
            'SELECT id FROM emprendimientos WHERE id = ? AND activo = 1',
            [emprendimiento_id]
          );
          
          if (emprendimiento.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Emprendimiento no encontrado o inactivo' });
          }
        }
        
        // Construir query dinámica
        const updateFields = [];
        const values = [];
        
        const fieldsMap = {
          nombre, descripcion, multiplicador, fechaInicio, fechaFin, emprendimiento_id
        };
        
        for (const [field, value] of Object.entries(fieldsMap)) {
          if (value !== undefined) {
            updateFields.push(`${field} = ?`);
            values.push(value === null ? null : value);
          }
        }
        
        if (activo !== undefined) {
          updateFields.push('activo = ?');
          values.push(activo ? 1 : 0);
        }
        
        if (updateFields.length > 0) {
          values.push(id);
          await connection.query(
            `UPDATE promociones SET ${updateFields.join(', ')} WHERE id = ?`,
            values
          );
        }
        
        await connection.commit();
        
        // Limpiar caché (mantenido por compatibilidad)
        clearPromocionesCache();
        
        logger.info(`Promoción actualizada: ID ${id} por admin ${req.user.id}`);
        
        res.json({ success: true, message: 'Promoción actualizada exitosamente' });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT promocion ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // DELETE /:id - Eliminación física (DELETE real)
  router.delete('/:id',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 20),
    validateParams(promocionValidations.id),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`DELETE /api/promociones/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // Verificar si existe
        const [existing] = await connection.query('SELECT * FROM promociones WHERE id = ?', [id]);
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Promoción no encontrada' });
        }
        
        // ELIMINACIÓN FÍSICA - Borrar completamente de la base de datos
        await connection.query('DELETE FROM promociones WHERE id = ?', [id]);
        
        await connection.commit();
        
        // Limpiar caché (mantenido por compatibilidad)
        clearPromocionesCache();
        
        logger.info(`Promoción eliminada físicamente: ID ${id} por admin ${req.user.id}`);
        
        res.json({ success: true, message: 'Promoción eliminada exitosamente' });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `DELETE promocion ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};