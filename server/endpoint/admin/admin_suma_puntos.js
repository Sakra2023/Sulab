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
    puntosAcumulados: Joi.number().integer().min(0).max(999999999).default(0)
  }),
  
  update: Joi.object({
    email: Joi.string().email().max(100).optional(),
    usuario: Joi.string().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/).optional(),
    contra: Joi.string().min(6).max(100).optional(),
    rol: Joi.string().valid('admin', 'colab', 'usuario').optional(),
    activo: Joi.boolean().optional()
  }).min(1),
  
  updatePuntos: Joi.object({
    puntosAcumulados: Joi.number().integer().min(0).max(999999999).required(),
    motivo: Joi.string().min(3).max(500).default('Ajuste manual de puntos')
  }),
  
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

// Cache para configuración de niveles
let nivelesConfig = null;
let lastConfigFetch = 0;
const CONFIG_CACHE_TTL = 60 * 1000; // 1 minuto

// Función para obtener configuración de niveles desde la BD
const obtenerConfigNiveles = async (pool) => {
  const now = Date.now();
  if (nivelesConfig && (now - lastConfigFetch) < CONFIG_CACHE_TTL) {
    return nivelesConfig;
  }
  
  try {
    const [rows] = await pool.query(`
      SELECT rango_bronce_max, rango_plata_min, rango_plata_max, 
             rango_oro_min, rango_oro_max, rango_diamante_min 
      FROM config_puntos LIMIT 1
    `);
    
    if (rows.length > 0) {
      nivelesConfig = rows[0];
      lastConfigFetch = now;
      return nivelesConfig;
    }
  } catch (error) {
    logger.warn('Error obteniendo configuración de niveles, usando valores por defecto:', error.message);
  }
  
  // Valores por defecto si no hay configuración
  return {
    rango_bronce_max: 999,
    rango_plata_min: 1000,
    rango_plata_max: 4999,
    rango_oro_min: 5000,
    rango_oro_max: 9999,
    rango_diamante_min: 10000
  };
};

// Función para calcular nivel según puntos (CORREGIDA con rangos de config_puntos)
const calcularNivel = (puntos, config = null) => {
  // Usar configuración proporcionada o valores por defecto (compatibilidad con código original)
  const rangos = config || {
    rango_bronce_max: 999,
    rango_plata_min: 1000,
    rango_plata_max: 4999,
    rango_oro_min: 5000,
    rango_oro_max: 9999,
    rango_diamante_min: 10000
  };
  
  // Diamante: >= rango_diamante_min
  if (puntos >= rangos.rango_diamante_min) {
    return { 
      nivel: 'Diamante', 
      nivelActual: 4, 
      puntosSiguienteNivel: 0 
    };
  }
  
  // Oro: entre rango_oro_min y rango_oro_max
  if (puntos >= rangos.rango_oro_min) {
    return { 
      nivel: 'Oro', 
      nivelActual: 3, 
      puntosSiguienteNivel: rangos.rango_diamante_min - puntos 
    };
  }
  
  // Plata: entre rango_plata_min y rango_plata_max
  if (puntos >= rangos.rango_plata_min) {
    return { 
      nivel: 'Plata', 
      nivelActual: 2, 
      puntosSiguienteNivel: rangos.rango_oro_min - puntos 
    };
  }
  
  // Bronce: < rango_plata_min
  return { 
    nivel: 'Bronce', 
    nivelActual: 1, 
    puntosSiguienteNivel: rangos.rango_plata_min - puntos 
  };
};

// Versión async de calcularNivel para usar dentro de endpoints
const calcularNivelAsync = async (puntos, pool) => {
  const config = await obtenerConfigNiveles(pool);
  return calcularNivel(puntos, config);
};

// Crear notificación para el usuario
const crearNotificacion = async (connection, userId, tipo, titulo, mensaje, metadata = null, importante = 0) => {
  await connection.query(
    `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, metadata, importante, leida, estado, fecha)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', NOW())`,
    [userId, tipo, titulo, mensaje, metadata ? JSON.stringify(metadata) : null, importante]
  );
};

// Crear transacción en el historial
const crearTransaccion = async (connection, userId, tipo, puntos, puntosUsados, referencia, tienda, detalles, emprendimientoId = null) => {
  await connection.query(
    `INSERT INTO transacciones (user_id, tipo, puntos, puntos_usados, referencia, tienda, detalles, estado, fecha, emprendimiento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'completado', NOW(), ?)`,
    [userId, tipo, puntos, puntosUsados, referencia, tienda, JSON.stringify(detalles), emprendimientoId]
  );
};

// Obtener puntos actuales del usuario
const obtenerPuntosActuales = async (connection, userId) => {
  const [result] = await connection.query(
    'SELECT puntos_totales FROM user_puntos WHERE user_id = ?',
    [userId]
  );
  return result.length > 0 ? result[0].puntos_totales : 0;
};

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
    io.emit(`admin_${evento}`, {
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
  
  // GET / - Obtener todos los usuarios (SOLO ADMIN)
  router.get('/',
    authenticate,
    authorizeAdmin,
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /api/suma-puntos - Admin:', req.user.id);
        
        // Paginación
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        
        // Intentar obtener del caché
        let users = null;
        if (page === 1 && !req.query.search) {
          users = cache.get(CACHE_KEYS.ALL_USERS);
        }
        
        if (!users) {
          let query = `
            SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, 
                   u.ultimo_acceso, u.activo, u.google_id, u.foto_url,
                   COALESCE(up.puntos_totales, 0) as puntosAcumulados,
                   up.nivel, up.nivel_actual, up.puntos_siguiente_nivel
            FROM user u
            LEFT JOIN user_puntos up ON u.id = up.user_id
          `;
          
          let params = [];
          
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
        
        // Obtener total
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
        logger.info(`GET /api/suma-puntos/${id} - Admin:`, req.user.id);
        
        const cacheKey = CACHE_KEYS.USER_PREFIX + id;
        let usuario = cache.get(cacheKey);
        
        if (!usuario) {
          const [users] = await pool.query(`
            SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, 
                   u.ultimo_acceso, u.activo, u.google_id, u.foto_url,
                   COALESCE(up.puntos_totales, 0) as puntosAcumulados,
                   up.nivel, up.nivel_actual, up.puntos_siguiente_nivel
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
        logger.info('POST /api/suma-puntos - Admin:', req.user.id);
        await connection.beginTransaction();
        
        const { email, usuario, contra, rol, puntosAcumulados } = req.body;
        
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
        
        const hashedPassword = await bcrypt.hash(contra, 10);
        
        const [result] = await connection.query(
          `INSERT INTO user (email, usuario, contra, rol, fecha_registro, activo) 
           VALUES (?, ?, ?, ?, NOW(), 1)`,
          [email, usuario, hashedPassword, rol]
        );
        
        const userId = result.insertId;
        
        if (rol === 'usuario') {
          const config = await obtenerConfigNiveles(pool);
          const nivelInfo = calcularNivel(puntosAcumulados, config);
          
          await connection.query(
            `INSERT INTO user_puntos (user_id, puntos_totales, nivel, nivel_actual, 
              puntos_nivel_actual, puntos_siguiente_nivel) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, puntosAcumulados, nivelInfo.nivel, nivelInfo.nivelActual, 
             puntosAcumulados, nivelInfo.puntosSiguienteNivel]
          );
        }
        
        await connection.commit();
        clearUsersCache();
        
        logger.info(`Usuario creado: ID ${userId} - Rol: ${rol} por admin ${req.user.id}`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          const nuevoUsuario = {
            id: userId,
            email,
            usuario,
            rol,
            puntosAcumulados: puntosAcumulados || 0,
            activo: 1
          };
          
          io.emit('usuario_creado', {
            usuario: nuevoUsuario,
            creado_por: req.user.usuario,
            timestamp: new Date().toISOString()
          });
          
          // Si es usuario, emitir a su sala personal
          if (rol === 'usuario') {
            io.to(`user_${userId}`).emit('bienvenido', {
              mensaje: `¡Bienvenido ${usuario}! Tu cuenta ha sido creada.`,
              puntos: puntosAcumulados || 0
            });
          }
        }
        
        res.status(201).json({
          success: true,
          message: rol === 'usuario' ? 'Usuario creado exitosamente' : `${rol} creado exitosamente`,
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

  // PUT /:id/puntos - Actualizar puntos de un usuario (SOLO ADMIN)
  router.put('/:id/puntos',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    validateParams(userValidations.id),
    validate(userValidations.updatePuntos),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`PUT /api/suma-puntos/${req.params.id}/puntos - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { puntosAcumulados, motivo } = req.body;
        
        const [existing] = await connection.query(
          'SELECT * FROM user WHERE id = ? AND rol = "usuario"',
          [id]
        );
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ 
            success: false, 
            message: 'Usuario no encontrado o no es usuario' 
          });
        }
        
        const puntosAnteriores = await obtenerPuntosActuales(connection, id);
        const diferencia = puntosAcumulados - puntosAnteriores;
        const config = await obtenerConfigNiveles(pool);
        const nivelInfo = calcularNivel(puntosAcumulados, config);
        
        await connection.query(
          `UPDATE user_puntos 
           SET puntos_totales = ?,
               nivel = ?,
               nivel_actual = ?,
               puntos_nivel_actual = ?,
               puntos_siguiente_nivel = ?
           WHERE user_id = ?`,
          [puntosAcumulados, nivelInfo.nivel, nivelInfo.nivelActual, 
           puntosAcumulados, nivelInfo.puntosSiguienteNivel, id]
        );
        
        if (diferencia !== 0) {
          const usuarioNombre = existing[0].usuario;
          
          if (diferencia > 0) {
            await crearTransaccion(
              connection, id, 'ajuste', diferencia, 0,
              `AJUSTE-${Date.now()}`, 'Sistema',
              { motivo, operacion: 'suma', puntos_anteriores: puntosAnteriores, 
                puntos_nuevos: puntosAcumulados, usuario: usuarioNombre, 
                admin: req.user.usuario },
              null
            );
            
            await crearNotificacion(
              connection, id, 'puntos',
              `🎉 +${diferencia} puntos agregados`,
              `Se agregaron ${diferencia} puntos a tu cuenta. Motivo: ${motivo}. Total actual: ${puntosAcumulados} puntos.`,
              { operacion: 'suma', puntos: diferencia, total_actual: puntosAcumulados, motivo, admin: req.user.usuario },
              0
            );
          } else {
            const puntosRestados = Math.abs(diferencia);
            await crearTransaccion(
              connection, id, 'ajuste', 0, puntosRestados,
              `AJUSTE-${Date.now()}`, 'Sistema',
              { motivo, operacion: 'resta', puntos_anteriores: puntosAnteriores,
                puntos_nuevos: puntosAcumulados, usuario: usuarioNombre,
                admin: req.user.usuario },
              null
            );
            
            await crearNotificacion(
              connection, id, 'puntos',
              `🔴 -${puntosRestados} puntos descontados`,
              `Se descontaron ${puntosRestados} puntos de tu cuenta. Motivo: ${motivo}. Total actual: ${puntosAcumulados} puntos.`,
              { operacion: 'resta', puntos: puntosRestados, total_actual: puntosAcumulados, motivo, admin: req.user.usuario },
              1
            );
          }
        }
        
        await connection.commit();
        clearUsersCache();
        
        logger.info(`Puntos actualizados: Usuario ${id} - Diferencia: ${diferencia} por admin ${req.user.id}`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          emitirEventoPuntos(io, 'puntos_actualizados', {
            user_id: id,
            puntos_totales: puntosAcumulados,
            puntos_anteriores: puntosAnteriores,
            diferencia: diferencia,
            nuevo_nivel: nivelInfo.nivel,
            motivo: motivo,
            actualizado_por: req.user.usuario
          });
          
          // Emitir notificación específica
          io.to(`user_${id}`).emit('notificacion_puntos', {
            tipo: diferencia > 0 ? 'suma' : 'resta',
            puntos: Math.abs(diferencia),
            total_actual: puntosAcumulados,
            motivo: motivo,
            admin: req.user.usuario,
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({
          success: true,
          message: 'Puntos actualizados exitosamente',
          nuevosPuntos: puntosAcumulados,
          nuevoNivel: nivelInfo.nivel,
          diferencia: diferencia
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT puntos usuario ${req.params.id}`, res);
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
        logger.info(`PUT /api/suma-puntos/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { email, usuario, contra, rol, activo } = req.body;
        
        const [existing] = await connection.query('SELECT * FROM user WHERE id = ?', [id]);
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        // Verificar email duplicado
        if (email && email !== existing[0].email) {
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
        if (usuario && usuario !== existing[0].usuario) {
          const [userExists] = await connection.query(
            'SELECT id FROM user WHERE usuario = ? AND id != ?',
            [usuario, id]
          );
          if (userExists.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está registrado' });
          }
        }
        
        const updateFields = [];
        const values = [];
        
        const fieldsMap = { email, usuario, rol };
        for (const [field, value] of Object.entries(fieldsMap)) {
          if (value !== undefined) {
            updateFields.push(`${field} = ?`);
            values.push(value);
          }
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
          await connection.query(`UPDATE user SET ${updateFields.join(', ')} WHERE id = ?`, values);
        }
        
        await connection.commit();
        clearUsersCache();
        
        logger.info(`Usuario actualizado: ID ${id} por admin ${req.user.id}`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          io.emit('usuario_actualizado', {
            user_id: id,
            campos_actualizados: updateFields.map(f => f.split(' ')[0]),
            actualizado_por: req.user.usuario,
            timestamp: new Date().toISOString()
          });
          
          if (activo !== undefined) {
            io.to(`user_${id}`).emit('estado_cuenta', {
              activo: activo,
              mensaje: activo ? 'Tu cuenta ha sido activada' : 'Tu cuenta ha sido desactivada'
            });
          }
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
        logger.info(`DELETE /api/suma-puntos/${req.params.id} - Admin:`, req.user.id);
        
        const { id } = req.params;
        
        // No permitir eliminar el propio usuario
        if (parseInt(id) === req.user.id) {
          return res.status(400).json({ success: false, message: 'No puedes desactivar tu propio usuario' });
        }
        
        const [existing] = await pool.query('SELECT * FROM user WHERE id = ?', [id]);
        
        if (existing.length === 0) {
          return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        await pool.query('UPDATE user SET activo = 0 WHERE id = ?', [id]);
        clearUsersCache();
        
        logger.info(`Usuario desactivado: ID ${id} por admin ${req.user.id}`);
        
        // ✅ EMITIR EVENTO DE SOCKET.IO
        if (io) {
          io.emit('usuario_desactivado', {
            user_id: id,
            usuario: existing[0].usuario,
            desactivado_por: req.user.usuario,
            timestamp: new Date().toISOString()
          });
          
          io.to(`user_${id}`).emit('cuenta_desactivada', {
            mensaje: 'Tu cuenta ha sido desactivada por el administrador.'
          });
        }
        
        res.json({ success: true, message: 'Usuario desactivado exitosamente' });
        
      } catch (error) {
        handleError(error, `DELETE usuario ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};