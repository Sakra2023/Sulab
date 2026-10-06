const express = require('express');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const jwt = require('jsonwebtoken');

const router = express.Router();

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

// Solo administradores pueden gestionar usuarios
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    logger.warn(`Intento no autorizado de gestionar usuarios: ${req.user?.id} - Rol: ${req.user?.rol}`);
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

const userValidations = {
  create: Joi.object({
    email: Joi.string().email().max(100).required(),
    usuario: Joi.string().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/).required(),
    contra: Joi.string().min(6).max(100).required(),
    rol: Joi.string().valid('admin', 'colab', 'usuario').required(),
    puntosAcumulados: Joi.number().integer().min(0).max(999999999).optional()
  }),
  
  update: Joi.object({
    email: Joi.string().email().max(100).optional(),
    usuario: Joi.string().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/).optional(),
    contra: Joi.string().min(6).max(100).optional(),
    rol: Joi.string().valid('admin', 'colab', 'usuario').optional(),
    puntosAcumulados: Joi.number().integer().min(0).max(999999999).optional(),
    activo: Joi.boolean().optional()
  }).min(1),
  
  id: Joi.object({
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
    return res.status(409).json({ success: false, message: 'Email o nombre de usuario ya registrado' });
  }
  
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// Cache keys
const CACHE_KEYS = {
  ALL_USERS: 'users_all',
  USER_PREFIX: 'user_'
};

const clearUsersCache = () => {
  cache.del(CACHE_KEYS.ALL_USERS);
  const keys = cache.keys();
  keys.forEach(key => {
    if (key.startsWith(CACHE_KEYS.USER_PREFIX)) {
      cache.del(key);
    }
  });
};

// ============================================
// FUNCIONES DE EMISIÓN DE SOCKET.IO
// ============================================

const emitUserEvent = (io, event, data) => {
  if (!io) return;

  try {
    // Emitir a todos los administradores
    io.to('admin').emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`📡 Evento Socket.IO emitido: ${event}`, { data });
  } catch (socketError) {
    logger.error('Error emitiendo evento de usuario:', socketError);
  }
};

const emitUserCreated = (io, userData) => {
  emitUserEvent(io, 'usuario_creado', {
    ...userData,
    mensaje: `Nuevo usuario creado: ${userData.usuario} (${userData.rol})`
  });
};

const emitUserUpdated = (io, userData) => {
  emitUserEvent(io, 'usuario_actualizado', {
    ...userData,
    mensaje: `Usuario actualizado: ${userData.usuario}`
  });
};

const emitUserDeleted = (io, userId, userName) => {
  emitUserEvent(io, 'usuario_eliminado', {
    id: userId,
    usuario: userName,
    mensaje: `Usuario desactivado: ${userName}`
  });
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;
  
  // GET / - Obtener todos los usuarios (SOLO ADMIN)
  router.get('/',
    authenticate,
    authorizeAdmin,
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /api/admin-registro - Admin:', req.user.id);
        
        // Paginación
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        
        // Intentar obtener del caché (solo página 1 sin filtros)
        let users = null;
        if (page === 1 && !req.query.search) {
          users = cache.get(CACHE_KEYS.ALL_USERS);
        }
        
        if (!users) {
          let query = `
            SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, 
                   u.ultimo_acceso, u.activo, u.google_id, u.foto_url,
                   COALESCE(up.puntos_totales, 0) as puntosAcumulados
            FROM user u
            LEFT JOIN user_puntos up ON u.id = up.user_id
          `;
          
          let params = [];
          
          // Búsqueda opcional
          if (req.query.search) {
            query += ` WHERE u.usuario LIKE ? OR u.email LIKE ?`;
            params.push(`%${req.query.search}%`, `%${req.query.search}%`);
          }
          
          query += ` ORDER BY u.id DESC LIMIT ? OFFSET ?`;
          params.push(limit, offset);
          
          const [results] = await pool.query(query, params);
          users = results;
          
          if (page === 1 && !req.query.search) {
            cache.put(CACHE_KEYS.ALL_USERS, users, 5 * 60 * 1000);
          }
        }
        
        // Obtener total para paginación
        const [countResult] = await pool.query(`
          SELECT COUNT(*) as total FROM user
          ${req.query.search ? 'WHERE usuario LIKE ? OR email LIKE ?' : ''}
        `, req.query.search ? [`%${req.query.search}%`, `%${req.query.search}%`] : []);
        
        res.json({
          success: true,
          usuarios: users,
          pagination: {
            page,
            limit,
            total: countResult[0].total,
            pages: Math.ceil(countResult[0].total / limit)
          }
        });
      } catch (error) {
        handleError(error, 'GET usuarios', res);
      }
    }
  );

  // GET /:id - Obtener un usuario por ID (SOLO ADMIN)
  router.get('/:id',
    authenticate,
    authorizeAdmin,
    createLimiter(5, 100),
    validateParams(userValidations.id),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /api/admin-registro/${id} - Admin:`, req.user.id);
        
        const cacheKey = CACHE_KEYS.USER_PREFIX + id;
        let usuario = cache.get(cacheKey);
        
        if (!usuario) {
          const [users] = await pool.query(`
            SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, 
                   u.ultimo_acceso, u.activo, u.google_id, u.foto_url,
                   COALESCE(up.puntos_totales, 0) as puntosAcumulados
            FROM user u
            LEFT JOIN user_puntos up ON u.id = up.user_id
            WHERE u.id = ?
          `, [id]);
          
          if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
          }
          
          usuario = users[0];
          cache.put(cacheKey, usuario, 5 * 60 * 1000);
        }
        
        res.json({ success: true, usuario });
      } catch (error) {
        handleError(error, `GET usuario ${req.params.id}`, res);
      }
    }
  );

  // POST / - Crear nuevo usuario (SOLO ADMIN)
  router.post('/',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    validate(userValidations.create),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /api/admin-registro - Admin:', req.user.id);
        await connection.beginTransaction();
        
        const { email, usuario, contra, rol, puntosAcumulados } = req.body;
        
        // Verificar si ya existe
        const [existing] = await connection.query(
          'SELECT * FROM user WHERE email = ? OR usuario = ?',
          [email, usuario]
        );
        
        if (existing.length > 0) {
          await connection.rollback();
          const existingUser = existing[0];
          if (existingUser.email === email) {
            return res.status(400).json({ success: false, message: 'El email ya está registrado' });
          }
          if (existingUser.usuario === usuario) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está registrado' });
          }
        }
        
        // Encriptar contraseña
        const hashedPassword = await bcrypt.hash(contra, 10);
        
        // Insertar usuario
        const [result] = await connection.query(
          `INSERT INTO user (email, usuario, contra, rol, fecha_registro, activo) 
           VALUES (?, ?, ?, ?, NOW(), 1)`,
          [email, usuario, hashedPassword, rol]
        );
        
        const userId = result.insertId;
        
        // SOLO para usuarios con rol 'usuario' se inserta en user_puntos y user_config
        if (rol === 'usuario') {
          await connection.query(
            `INSERT INTO user_puntos (user_id, puntos_totales, nivel, nivel_actual, 
              puntos_nivel_actual, puntos_siguiente_nivel) 
             VALUES (?, ?, 'Bronce', 1, 0, 5000)`,
            [userId, puntosAcumulados || 0]
          );
          
          // Crear configuración por defecto (si la tabla existe)
          try {
            await connection.query(
              `INSERT INTO user_config 
               (user_id, email_notificaciones, push_notificaciones, 
                puntos_notif, canjes_notif, promociones_notif, recordatorios_notif) 
               VALUES (?, 1, 1, 1, 1, 1, 0)`,
              [userId]
            );
          } catch (configError) {
            logger.warn('Tabla user_config no existe, continuando...');
          }
          
          // Notificación de bienvenida (si la tabla existe)
          try {
            await connection.query(
              `INSERT INTO notificaciones 
               (user_id, tipo, titulo, mensaje, fecha, leida, importante, icono, color) 
               VALUES (?, 'sistema', 'Bienvenido al sistema', 
                       'Tu cuenta ha sido creada exitosamente', 
                       NOW(), 0, 1, '👋', '#4CAF50')`,
              [userId]
            );
          } catch (notifError) {
            logger.warn('Tabla notificaciones no existe, continuando...');
          }
        }
        
        await connection.commit();
        
        // Limpiar caché
        clearUsersCache();
        
        logger.info(`Usuario creado: ID ${userId} - Rol: ${rol} por admin ${req.user.id}`);
        
        const mensaje = rol === 'usuario' 
          ? 'Usuario creado exitosamente con configuración de puntos' 
          : `${rol === 'admin' ? 'Administrador' : 'Colaborador'} creado exitosamente`;
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          emitUserCreated(io, {
            id: userId,
            email,
            usuario,
            rol,
            puntosAcumulados: puntosAcumulados || 0,
            activo: 1,
            creado_por: req.user.id
          });
        }
        
        res.status(201).json({
          success: true,
          message: mensaje,
          userId: userId
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST usuario', res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /:id - Actualizar usuario (SOLO ADMIN)
  router.put('/:id',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    validateParams(userValidations.id),
    validate(userValidations.update),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`PUT /api/admin-registro/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { email, usuario, contra, rol, puntosAcumulados, activo } = req.body;
        
        // Verificar si existe
        const [existing] = await connection.query(
          'SELECT * FROM user WHERE id = ?',
          [id]
        );
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        const currentUser = existing[0];
        
        // Verificar email duplicado
        if (email && email !== currentUser.email) {
          const [emailExists] = await connection.query(
            'SELECT id FROM user WHERE email = ? AND id != ?',
            [email, id]
          );
          if (emailExists.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'El email ya está registrado' });
          }
        }
        
        // Verificar usuario duplicado
        if (usuario && usuario !== currentUser.usuario) {
          const [userExists] = await connection.query(
            'SELECT id FROM user WHERE usuario = ? AND id != ?',
            [usuario, id]
          );
          if (userExists.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está registrado' });
          }
        }
        
        // Construir query dinámica
        const updateFields = [];
        const values = [];
        
        if (email !== undefined) {
          updateFields.push('email = ?');
          values.push(email);
        }
        if (usuario !== undefined) {
          updateFields.push('usuario = ?');
          values.push(usuario);
        }
        if (rol !== undefined) {
          updateFields.push('rol = ?');
          values.push(rol);
        }
        if (activo !== undefined) {
          updateFields.push('activo = ?');
          values.push(activo ? 1 : 0);
        }
        if (contra) {
          const hashedPassword = await bcrypt.hash(contra, 10);
          updateFields.push('contra = ?');
          values.push(hashedPassword);
        }
        
        if (updateFields.length > 0) {
          values.push(id);
          await connection.query(
            `UPDATE user SET ${updateFields.join(', ')} WHERE id = ?`,
            values
          );
        }
        
        // Actualizar puntos SOLO si es usuario normal y se envía puntosAcumulados
        if (puntosAcumulados !== undefined && currentUser.rol === 'usuario') {
          await connection.query(
            `UPDATE user_puntos SET puntos_totales = ? WHERE user_id = ?`,
            [puntosAcumulados, id]
          );
        }
        
        await connection.commit();
        
        // Limpiar caché
        clearUsersCache();
        
        logger.info(`Usuario actualizado: ID ${id} por admin ${req.user.id}`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          emitUserUpdated(io, {
            id: parseInt(id),
            email: email || currentUser.email,
            usuario: usuario || currentUser.usuario,
            rol: rol || currentUser.rol,
            activo: activo !== undefined ? (activo ? 1 : 0) : currentUser.activo,
            puntosAcumulados: puntosAcumulados !== undefined ? puntosAcumulados : currentUser.puntosAcumulados,
            actualizado_por: req.user.id
          });
        }
        
        res.json({ success: true, message: 'Usuario actualizado exitosamente' });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT usuario ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // DELETE /:id - Soft delete (SOLO ADMIN)
  router.delete('/:id',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 20),
    validateParams(userValidations.id),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`DELETE /api/admin-registro/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // No permitir eliminar el propio usuario
        if (parseInt(id) === req.user.id) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'No puedes desactivar tu propio usuario' });
        }
        
        // Verificar si existe
        const [existing] = await connection.query(
          'SELECT * FROM user WHERE id = ?',
          [id]
        );
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        const userData = existing[0];
        
        // Soft delete - marcar como inactivo
        await connection.query('UPDATE user SET activo = 0 WHERE id = ?', [id]);
        
        await connection.commit();
        
        // Limpiar caché
        clearUsersCache();
        
        logger.info(`Usuario desactivado: ID ${id} por admin ${req.user.id}`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          emitUserDeleted(io, parseInt(id), userData.usuario);
        }
        
        res.json({ success: true, message: 'Usuario desactivado exitosamente' });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `DELETE usuario ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};