const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

console.log("✅ Archivo ObtenerInfo.js cargado");

// ============================================
// CONFIGURACIÓN DE CARPETA PARA FOTOS
// ============================================

const UPLOAD_DIR_USERS = process.env.UPLOAD_DIR_USERS || path.join(__dirname, '../../img-usuarios');

// Asegurar que el directorio existe
if (!fs.existsSync(UPLOAD_DIR_USERS)) {
  fs.mkdirSync(UPLOAD_DIR_USERS, { recursive: true });
}

// Configuración de multer para fotos de perfil
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR_USERS);
  },
  filename: (req, file, cb) => {
    const sanitizedName = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${sanitizedName}${ext}`);
  }
});

const uploadFoto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no permitido. Use: jpeg, jpg, png, gif, webp'));
    }
  }
});

// Middleware para optimizar imagen
const optimizeUserImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }
  
  try {
    const filePath = req.file.path;
    const optimizedPath = filePath.replace(/\.\w+$/, '.webp');
    
    await sharp(filePath)
      .resize(300, 300, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(optimizedPath);
    
    fs.unlinkSync(filePath);
    req.file.path = optimizedPath;
    req.file.filename = path.basename(optimizedPath);
    req.file.mimetype = 'image/webp';
    
    next();
  } catch (error) {
    logger.error('Error optimizando imagen de perfil:', error);
    next();
  }
};

// Función para eliminar imagen anterior
const deleteOldImage = (imagePath) => {
  if (!imagePath) return;
  
  const fullPath = path.join(UPLOAD_DIR_USERS, path.basename(imagePath));
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      logger.info(`Imagen de perfil eliminada: ${fullPath}`);
    } catch (err) {
      logger.error(`Error eliminando imagen ${fullPath}:`, err);
    }
  }
};

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

// Verificar que el usuario solo acceda a sus propios datos
// NOTA: req.user ya viene del middleware authenticateToken de server.js
const authorizeSelf = (req, res, next) => {
  const userId = parseInt(req.params.id);
  // Usar req.user.id (viene del token) en lugar de req.user.usuarioId
  if (req.user.rol !== 'admin' && req.user.id !== userId) {
    logger.warn(`Usuario ${req.user.id} intentó acceder a datos de usuario ${userId}`);
    return res.status(403).json({ success: false, message: 'No tienes permiso para acceder a estos datos' });
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
  
  notifIdParam: Joi.object({
    id: Joi.number().integer().positive().required(),
    notifId: Joi.number().integer().positive().required()
  }),
  
  transaccionQuery: Joi.object({
    tipo: Joi.string().valid('compra', 'canje', 'ajuste', 'todos').optional(),
    estado: Joi.string().valid('pendiente', 'completado', 'cancelado', 'todos').optional(),
    fecha_desde: Joi.date().iso().optional(),
    fecha_hasta: Joi.date().iso().optional(),
    limite: Joi.number().integer().min(1).max(100).default(50),
    pagina: Joi.number().integer().min(1).default(1)
  }),
  
  notificacionQuery: Joi.object({
    leida: Joi.string().valid('true', 'false').optional(),
    importante: Joi.string().valid('true', 'false').optional(),
    limite: Joi.number().integer().min(1).max(100).default(20),
    tipo: Joi.string().max(50).optional()
  }),
  
  configuracion: Joi.object({
    email_notificaciones: Joi.number().integer().min(0).max(1).optional(),
    push_notificaciones: Joi.number().integer().min(0).max(1).optional(),
    puntos_notif: Joi.number().integer().min(0).max(1).optional(),
    canjes_notif: Joi.number().integer().min(0).max(1).optional(),
    promociones_notif: Joi.number().integer().min(0).max(1).optional(),
    recordatorios_notif: Joi.number().integer().min(0).max(1).optional()
  }),
  
  configPuntos: Joi.object({
    valor_punto: Joi.number().positive().max(1).required(),
    tasa_conversion: Joi.number().positive().required(),
    umbral_minimo: Joi.number().positive().required(),
    puntos_fijos: Joi.number().integer().min(0).required(),
    redondeo: Joi.string().valid('none', 'floor', 'ceil', 'round').required()
  }),
  
  canje: Joi.object({
    puntos: Joi.number().integer().min(1).required(),
    tipo: Joi.string().valid('efectivo', 'producto').required(),
    valor: Joi.number().when('tipo', {
      is: 'efectivo',
      then: Joi.number().positive().required(),
      otherwise: Joi.optional()
    })
  }),
  
  perfil: Joi.object({
    nombre: Joi.string().min(3).max(100).optional(),
    email: Joi.string().email().max(100).optional(),
    celular: Joi.string().pattern(/^09[0-9]{8}$/).allow(null).optional(),
    direccion: Joi.string().max(200).allow(null).optional(),
    contraseña_anterior: Joi.string().min(6).when('contraseña_nueva', {
      is: Joi.exist(),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    contraseña_nueva: Joi.string().min(6).optional()
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
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// Cache keys
const CACHE_KEYS = {
  USUARIO_INFO_PREFIX: 'usuario_info_',
  TRANSACCIONES_PREFIX: 'transacciones_',
  NOTIFICACIONES_PREFIX: 'notificaciones_',
  CONFIG_PUNTOS: 'config_puntos'
};

const clearUserCache = (userId) => {
  cache.del(`${CACHE_KEYS.USUARIO_INFO_PREFIX}${userId}`);
  cache.del(`${CACHE_KEYS.TRANSACCIONES_PREFIX}${userId}`);
  cache.del(`${CACHE_KEYS.NOTIFICACIONES_PREFIX}${userId}`);
};

// ============================================
// FUNCIONES DE EMISIÓN SOCKET (YA INTEGRADAS)
// ============================================

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

const emitirNuevaTransaccion = (io, userId, transaccion) => {
  if (io) {
    io.to(`user_${userId}`).emit('nueva_transaccion', {
      user_id: userId,
      transaccion: transaccion,
      timestamp: new Date().toISOString()
    });
    logger.info(`📡 Emitida nueva transacción para usuario ${userId}`);
  }
};

// ✅ Función para emitir notificaciones en tiempo real
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
      icono: notificacion.icono || getIconoPorTipo(notificacion.tipo),
      color: notificacion.color || getColorPorTipo(notificacion.tipo),
      timestamp: new Date().toISOString()
    });
    logger.info(`📡 Emitida nueva notificación para usuario ${userId}: ${notificacion.titulo}`);
  }
};

// ✅ Función para emitir cuando una notificación es marcada como leída
const emitirNotificacionLeida = (io, userId, notificacionId) => {
  if (io) {
    io.to(`user_${userId}`).emit('notificacion_leida', {
      user_id: userId,
      notificacion_id: notificacionId,
      timestamp: new Date().toISOString()
    });
    logger.info(`📡 Emitida notificación leída para usuario ${userId}: ${notificacionId}`);
  }
};

// Funciones auxiliares para obtener icono y color por tipo
const getIconoPorTipo = (tipo) => {
  const iconos = {
    puntos: '💰',
    canje: '🎁',
    promocion: '🔥',
    sistema: '🔄',
    recordatorio: '⏰'
  };
  return iconos[tipo] || '🔔';
};

const getColorPorTipo = (tipo) => {
  const colores = {
    puntos: '#10b981',
    canje: '#3b82f6',
    promocion: '#ef4444',
    sistema: '#8b5cf6',
    recordatorio: '#ec4899'
  };
  return colores[tipo] || '#6b7280';
};

// ============================================
// ENDPOINTS (CON SOCKET.IO YA INTEGRADO)
// ============================================

module.exports = (pool, io) => {

  // GET /usuario/:id/info - Obtener información completa del usuario
  router.get('/usuario/:id/info',
    authorizeSelf,
    createLimiter(5, 50),
    validateParams(validations.idParam),
    async (req, res) => {
      const userId = req.params.id;
      const cacheKey = `${CACHE_KEYS.USUARIO_INFO_PREFIX}${userId}`;
      
      // ✅ ELIMINAR CACHÉ - Siempre consultar BD
      // const cached = cache.get(cacheKey);
      // if (cached) {
      //   return res.status(200).json(cached);
      // }
      
      try {
        const connection = await pool.getConnection();
        
        try {
          const [usuario] = await connection.query(
            'SELECT id, email, usuario, rol, telefono, google_id, direccion, foto_url FROM user WHERE id = ?',
            [userId]
          );
          
          if (usuario.length === 0) {
            return res.status(404).json({
              success: false,
              message: 'Usuario no encontrado'
            });
          }
          
          const [puntos] = await connection.query(
            'SELECT * FROM user_puntos WHERE user_id = ?',
            [userId]
          );
          
          const [config] = await connection.query(
            'SELECT * FROM user_config WHERE user_id = ?',
            [userId]
          );
          
          const [notificaciones] = await connection.query(
            `SELECT * FROM notificaciones 
             WHERE user_id = ? AND leida = 0 
             ORDER BY fecha DESC 
             LIMIT 10`,
            [userId]
          );
          
          const [transacciones] = await connection.query(
            `SELECT * FROM transacciones 
             WHERE user_id = ? 
             ORDER BY fecha DESC 
             LIMIT 5`,
            [userId]
          );
          
          const [estadisticas] = await connection.query(
            `SELECT 
              COUNT(*) as total_transacciones,
              SUM(CASE WHEN tipo = 'compra' THEN 1 ELSE 0 END) as total_compras,
              SUM(CASE WHEN tipo = 'canje' THEN 1 ELSE 0 END) as total_canjes,
              SUM(puntos) as puntos_totales_ganados,
              SUM(puntos_usados) as puntos_totales_usados
             FROM transacciones 
             WHERE user_id = ? AND estado = 'completado'`,
            [userId]
          );
          
          const nivelUsuario = puntos[0]?.nivel || 'Bronce';
          
          let siguienteNivel = '';
          let puntosParaSiguiente = 0;
          
          if (puntos.length > 0) {
            const puntosData = puntos[0];
            const niveles = ['Bronce', 'Plata', 'Oro', 'Diamante'];
            const nivelIndex = niveles.indexOf(puntosData.nivel);
            
            if (nivelIndex < niveles.length - 1) {
              siguienteNivel = niveles[nivelIndex + 1];
              puntosParaSiguiente = puntosData.puntos_siguiente_nivel - puntosData.puntos_nivel_actual;
            } else {
              siguienteNivel = 'Máximo';
              puntosParaSiguiente = 0;
            }
          }
          
          const respuesta = {
            success: true,
            data: {
              usuario: usuario[0],
              puntos: puntos[0] || {
                user_id: userId,
                nivel: 'Bronce',
                puntos_totales: 0,
                nivel_actual: 1,
                puntos_nivel_actual: 0,
                puntos_siguiente_nivel: 5000
              },
              configuracion: config[0] || {
                user_id: userId,
                email_notificaciones: 1,
                push_notificaciones: 1,
                puntos_notif: 1,
                canjes_notif: 1,
                promociones_notif: 1,
                recordatorios_notif: 0
              },
              notificaciones: {
                total: notificaciones.length,
                listado: notificaciones
              },
              transacciones: {
                recientes: transacciones,
                estadisticas: estadisticas[0]
              },
              resumen: {
                nivel_actual: nivelUsuario,
                siguiente_nivel: siguienteNivel,
                puntos_para_siguiente: puntosParaSiguiente,
                notificaciones_pendientes: notificaciones.length,
                ultima_transaccion: transacciones.length > 0 ? transacciones[0] : null
              }
            }
          };
          
          // ✅ ELIMINAR CACHÉ - Ya no se guarda en caché
          // cache.put(cacheKey, respuesta, 5 * 1000);
          
          res.status(200).json(respuesta);
          
        } finally {
          connection.release();
        }
        
      } catch (error) {
        handleError(error, `GET usuario/${userId}/info`, res);
      }
    }
  );

  // GET /usuario/:id/transacciones - Obtener transacciones con filtros
  router.get('/usuario/:id/transacciones',
    authorizeSelf,
    createLimiter(5, 100),
    validateParams(validations.idParam),
    validateQuery(validations.transaccionQuery),
    async (req, res) => {
      const userId = req.params.id;
      const { tipo, estado, fecha_desde, fecha_hasta, limite, pagina } = req.query;
      
      // VALIDACIÓN Y SANITIZACIÓN DE NÚMEROS
      let limiteNum = parseInt(limite);
      let paginaNum = parseInt(pagina);
      
      if (isNaN(limiteNum) || limiteNum < 1) {
        limiteNum = 50;
      }
      if (isNaN(paginaNum) || paginaNum < 1) {
        paginaNum = 1;
      }
      
      limiteNum = Math.min(limiteNum, 100);
      
      const offset = (paginaNum - 1) * limiteNum;
      
      // ✅ ELIMINAR CACHÉ - Siempre consultar BD
      // const cacheKey = `${CACHE_KEYS.TRANSACCIONES_PREFIX}${userId}_${tipo || 'all'}_${estado || 'all'}_${fecha_desde || 'all'}_${fecha_hasta || 'all'}_${paginaNum}`;
      // const cached = cache.get(cacheKey);
      // if (cached) {
      //   return res.status(200).json(cached);
      // }
      
      try {
        let query = 'SELECT * FROM transacciones WHERE user_id = ?';
        const queryParams = [userId];
        
        if (tipo && tipo !== 'todos') {
          query += ' AND tipo = ?';
          queryParams.push(tipo);
        }
        
        if (estado && estado !== 'todos') {
          query += ' AND estado = ?';
          queryParams.push(estado);
        }
        
        if (fecha_desde) {
          query += ' AND fecha >= ?';
          queryParams.push(fecha_desde);
        }
        
        if (fecha_hasta) {
          query += ' AND fecha <= ?';
          queryParams.push(fecha_hasta);
        }
        
        query += ' ORDER BY fecha DESC LIMIT ? OFFSET ?';
        queryParams.push(limiteNum, offset);
        
        let countQuery = 'SELECT COUNT(*) as total FROM transacciones WHERE user_id = ?';
        const countParams = [userId];
        
        if (tipo && tipo !== 'todos') {
          countQuery += ' AND tipo = ?';
          countParams.push(tipo);
        }
        
        if (estado && estado !== 'todos') {
          countQuery += ' AND estado = ?';
          countParams.push(estado);
        }
        
        if (fecha_desde) {
          countQuery += ' AND fecha >= ?';
          countParams.push(fecha_desde);
        }
        
        if (fecha_hasta) {
          countQuery += ' AND fecha <= ?';
          countParams.push(fecha_hasta);
        }
        
        const [transacciones] = await pool.query(query, queryParams);
        const [conteo] = await pool.query(countQuery, countParams);
        
        const puntosNetos = transacciones.reduce((sum, t) => {
          return sum + (t.puntos - t.puntos_usados);
        }, 0);
        
        const response = {
          success: true,
          data: {
            transacciones,
            paginacion: {
              pagina: paginaNum,
              limite: limiteNum,
              total: conteo[0].total,
              total_paginas: Math.ceil(conteo[0].total / limiteNum)
            },
            estadisticas: {
              total_transacciones: transacciones.length,
              puntos_netos: puntosNetos,
              puntos_obtenidos: transacciones.reduce((sum, t) => sum + t.puntos, 0),
              puntos_usados: transacciones.reduce((sum, t) => sum + t.puntos_usados, 0)
            }
          }
        };
        
        // ✅ ELIMINAR CACHÉ - Ya no se guarda en caché
        // cache.put(cacheKey, response, 1 * 60 * 1000);
        
        res.status(200).json(response);
        
      } catch (error) {
        handleError(error, `GET usuario/${userId}/transacciones`, res);
      }
    }
  );

  // GET /usuario/:id/notificaciones - Obtener notificaciones
  router.get('/usuario/:id/notificaciones',
    authorizeSelf,
    createLimiter(5, 100),
    validateParams(validations.idParam),
    validateQuery(validations.notificacionQuery),
    async (req, res) => {
      const userId = req.params.id;
      const { leida, importante, limite, tipo } = req.query;
      
      // ✅ ELIMINAR CACHÉ - Siempre consultar BD
      // const cacheKey = `${CACHE_KEYS.NOTIFICACIONES_PREFIX}${userId}_${leida || 'all'}_${importante || 'all'}`;
      // const cached = cache.get(cacheKey);
      // if (cached) {
      //   return res.status(200).json(cached);
      // }
      
      try {
        let query = 'SELECT * FROM notificaciones WHERE user_id = ?';
        const queryParams = [userId];
        
        if (leida !== undefined) {
          query += ' AND leida = ?';
          queryParams.push(leida === 'true' ? 1 : 0);
        }
        
        if (importante !== undefined) {
          query += ' AND importante = ?';
          queryParams.push(importante === 'true' ? 1 : 0);
        }
        
        if (tipo && tipo !== 'todos') {
          query += ' AND tipo = ?';
          queryParams.push(tipo);
        }
        
        query += ' ORDER BY fecha DESC LIMIT ?';
        queryParams.push(parseInt(limite));
        
        const [notificaciones] = await pool.query(query, queryParams);
        const [conteo] = await pool.query(
          'SELECT COUNT(*) as no_leidas FROM notificaciones WHERE user_id = ? AND leida = 0',
          [userId]
        );
        
        const response = {
          success: true,
          data: {
            notificaciones,
            estadisticas: {
              total: notificaciones.length,
              no_leidas: conteo[0].no_leidas,
              importantes: notificaciones.filter(n => n.importante).length
            }
          }
        };
        
        // ✅ ELIMINAR CACHÉ - Ya no se guarda en caché
        // cache.put(cacheKey, response, 30 * 1000);
        
        res.status(200).json(response);
        
      } catch (error) {
        handleError(error, `GET usuario/${userId}/notificaciones`, res);
      }
    }
  );

  // PUT /usuario/:id/notificaciones/:notifId/leer - Marcar notificación como leída (CON SOCKET.IO)
  router.put('/usuario/:id/notificaciones/:notifId/leer',
    authorizeSelf,
    createLimiter(5, 50),
    validateParams(validations.notifIdParam),
    async (req, res) => {
      const { id: userId, notifId } = req.params;
      
      try {
        const [result] = await pool.query(
          'UPDATE notificaciones SET leida = 1 WHERE id = ? AND user_id = ?',
          [notifId, userId]
        );
        
        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            message: 'Notificación no encontrada'
          });
        }
        
        clearUserCache(userId);
        
        // ✅ Emitir evento para actualizar en tiempo real
        if (io) {
          emitirNotificacionLeida(io, userId, notifId);
        }
        
        res.status(200).json({
          success: true,
          message: 'Notificación marcada como leída'
        });
        
      } catch (error) {
        handleError(error, `PUT usuario/${userId}/notificaciones/${notifId}/leer`, res);
      }
    }
  );

  // PUT /usuario/:id/configuracion - Actualizar configuración
  router.put('/usuario/:id/configuracion',
    authorizeSelf,
    createLimiter(1, 30),
    validateParams(validations.idParam),
    validate(validations.configuracion),
    async (req, res) => {
      const userId = req.params.id;
      const configData = req.body;
      
      try {
        const [usuario] = await pool.query('SELECT id FROM user WHERE id = ?', [userId]);
        
        if (usuario.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Usuario no encontrado'
          });
        }
        
        const [configExistente] = await pool.query(
          'SELECT user_id FROM user_config WHERE user_id = ?',
          [userId]
        );
        
        if (configExistente.length === 0) {
          await pool.query(
            `INSERT INTO user_config (user_id, email_notificaciones, push_notificaciones, 
             puntos_notif, canjes_notif, promociones_notif, recordatorios_notif) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              configData.email_notificaciones || 1,
              configData.push_notificaciones || 1,
              configData.puntos_notif || 1,
              configData.canjes_notif || 1,
              configData.promociones_notif || 1,
              configData.recordatorios_notif || 0
            ]
          );
        } else {
          const camposPermitidos = [
            'email_notificaciones', 'push_notificaciones', 'puntos_notif',
            'canjes_notif', 'promociones_notif', 'recordatorios_notif'
          ];
          
          const camposActualizar = [];
          const valoresActualizar = [];
          
          camposPermitidos.forEach(campo => {
            if (configData[campo] !== undefined) {
              camposActualizar.push(`${campo} = ?`);
              valoresActualizar.push(configData[campo] ? 1 : 0);
            }
          });
          
          if (camposActualizar.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'No se proporcionaron datos para actualizar'
            });
          }
          
          valoresActualizar.push(userId);
          
          await pool.query(
            `UPDATE user_config SET ${camposActualizar.join(', ')} WHERE user_id = ?`,
            valoresActualizar
          );
        }
        
        clearUserCache(userId);
        
        res.status(200).json({
          success: true,
          message: 'Configuración actualizada correctamente'
        });
        
      } catch (error) {
        handleError(error, `PUT usuario/${userId}/configuracion`, res);
      }
    }
  );

  // NOTA: La ruta GET /config-puntos ha sido eliminada de este archivo
  // Ahora se maneja exclusivamente en admin_config_puntos.js como ruta pública

  // PUT /config-puntos - Actualizar configuración de puntos (SOLO ADMIN)
  router.put('/config-puntos',
    createLimiter(1, 20),
    validate(validations.configPuntos),
    async (req, res) => {
      if (req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'Permisos insuficientes' });
      }
      
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const { valor_punto, tasa_conversion, umbral_minimo, puntos_fijos, redondeo } = req.body;
        
        await connection.query(
          `UPDATE config_puntos 
           SET valor_punto = ?, tasa_conversion = ?, umbral_minimo = ?, puntos_fijos = ?, redondeo = ?, updated_at = NOW()
           WHERE id = 1`,
          [valor_punto, tasa_conversion, umbral_minimo, puntos_fijos, redondeo]
        );
        
        await connection.commit();
        
        cache.del(CACHE_KEYS.CONFIG_PUNTOS);
        
        if (io) {
          io.emit('valor_punto_actualizado', {
            valor_punto: parseFloat(valor_punto),
            tasa_conversion: parseFloat(tasa_conversion),
            actualizado_en: new Date().toISOString()
          });
          logger.info(`📡 Emitido valor_punto_actualizado: ${valor_punto}`);
        }
        
        res.json({ 
          success: true, 
          message: 'Configuración actualizada correctamente',
          config: { valor_punto, tasa_conversion, umbral_minimo, puntos_fijos, redondeo }
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'PUT config-puntos', res);
      } finally {
        connection.release();
      }
    }
  );

  // POST /usuario/:id/canjear - Canjear puntos (CON EMISIÓN DE NOTIFICACIONES)
  router.post('/usuario/:id/canjear',
    authorizeSelf,
    createLimiter(1, 20),
    validateParams(validations.idParam),
    validate(validations.canje),
    async (req, res) => {
      const userId = req.params.id;
      const { puntos, tipo, valor } = req.body;
      
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const [puntosActuales] = await connection.query(
          'SELECT puntos_totales FROM user_puntos WHERE user_id = ?',
          [userId]
        );
        
        if (puntosActuales.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        if (puntosActuales[0].puntos_totales < puntos) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Puntos insuficientes' });
        }
        
        const nuevosPuntos = puntosActuales[0].puntos_totales - puntos;
        
        await connection.query(
          'UPDATE user_puntos SET puntos_totales = ? WHERE user_id = ?',
          [nuevosPuntos, userId]
        );
        
        await connection.query(
          `INSERT INTO transacciones (user_id, tipo, puntos, puntos_usados, referencia, tienda, detalles, estado, fecha)
           VALUES (?, 'canje', 0, ?, CONCAT('CANJE-', UNIX_TIMESTAMP()), 'Sistema', ?, 'completado', NOW())`,
          [userId, puntos, JSON.stringify({ tipo_canje: tipo, valor_recibido: valor })]
        );
        
        const mensajeNotificacion = `Has canjeado ${puntos} puntos por ${tipo === 'efectivo' ? `$${valor} USD` : 'un regalo'}`;
        
        const [notificacionResult] = await connection.query(
          `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, importante, leida, estado, fecha)
           VALUES (?, 'canje', '🎁 Canje realizado', ?, 1, 0, 'completado', NOW())`,
          [userId, mensajeNotificacion]
        );
        
        await connection.commit();
        
        clearUserCache(userId);
        
        if (io) {
          emitirActualizacionPuntos(io, userId, nuevosPuntos, { tipo: 'canje', puntos_usados: puntos });
          
          // ✅ Emitir notificación en tiempo real
          const notificacionId = notificacionResult.insertId;
          emitirNuevaNotificacion(io, userId, {
            id: notificacionId,
            tipo: 'canje',
            titulo: '🎁 Canje realizado',
            mensaje: mensajeNotificacion,
            importante: true,
            leida: false,
            fecha: new Date().toISOString()
          });
        }
        
        res.json({ 
          success: true, 
          message: 'Canje realizado exitosamente',
          puntos_restantes: nuevosPuntos
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `POST usuario/${userId}/canjear`, res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /usuario/:id/perfil - Actualizar perfil de usuario (CON FOTO)
  router.put('/usuario/:id/perfil',
    authorizeSelf,
    createLimiter(1, 20),
    uploadFoto.single('foto'),
    optimizeUserImage,
    validateParams(validations.idParam),
    validate(validations.perfil),
    async (req, res) => {
      const userId = req.params.id;
      const { nombre, email, celular, direccion, contraseña_anterior, contraseña_nueva } = req.body;
      
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const [usuario] = await connection.query(
          'SELECT id, email, usuario, contra, google_id, foto_url FROM user WHERE id = ?',
          [userId]
        );
        
        if (usuario.length === 0) {
          if (req.file) deleteOldImage(req.file.path);
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: 'Usuario no encontrado'
          });
        }
        
        const camposActualizar = [];
        const valoresActualizar = [];
        
        if (nombre && nombre.trim()) {
          if (nombre.trim().length < 3) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'El nombre debe tener al menos 3 caracteres'
            });
          }
          camposActualizar.push('usuario = ?');
          valoresActualizar.push(nombre.trim());
        }
        
        if (email && email.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'Email inválido'
            });
          }
          
          const [emailExistente] = await connection.query(
            'SELECT id FROM user WHERE email = ? AND id != ?',
            [email.trim(), userId]
          );
          
          if (emailExistente.length > 0) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'El email ya está registrado por otro usuario'
            });
          }
          
          camposActualizar.push('email = ?');
          valoresActualizar.push(email.trim());
        }
        
        if (celular !== undefined) {
          if (celular && celular.trim()) {
            let numeroLimpio = celular.trim().replace(/\D/g, '');
            const celularRegex = /^09[0-9]{8}$/;
            if (!celularRegex.test(numeroLimpio)) {
              if (req.file) deleteOldImage(req.file.path);
              await connection.rollback();
              return res.status(400).json({
                success: false,
                message: 'Formato de celular inválido. Use 099XXXXXXXX'
              });
            }
            camposActualizar.push('telefono = ?');
            valoresActualizar.push(numeroLimpio);
          } else {
            camposActualizar.push('telefono = ?');
            valoresActualizar.push(null);
          }
        }
        
        if (direccion !== undefined) {
          camposActualizar.push('direccion = ?');
          valoresActualizar.push(direccion?.trim() || null);
        }
        
        // Manejar foto de perfil
        if (req.file) {
          // Eliminar foto anterior si existe
          if (usuario[0].foto_url) {
            deleteOldImage(usuario[0].foto_url);
          }
          const fotoRuta = `/img-usuarios/${req.file.filename}`;
          camposActualizar.push('foto_url = ?');
          valoresActualizar.push(fotoRuta);
        }
        
        if (contraseña_nueva && contraseña_nueva.trim()) {
          if (!usuario[0].contra || usuario[0].google_id) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'Este usuario usa inicio de sesión con Google. No puede cambiar la contraseña aquí.'
            });
          }
          
          if (!contraseña_anterior) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'Debes ingresar tu contraseña actual para cambiarla'
            });
          }
          
          const contraseñaValida = await bcrypt.compare(contraseña_anterior, usuario[0].contra);
          
          if (!contraseñaValida) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(401).json({
              success: false,
              message: 'La contraseña actual es incorrecta'
            });
          }
          
          if (contraseña_nueva.length < 6) {
            if (req.file) deleteOldImage(req.file.path);
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: 'La nueva contraseña debe tener al menos 6 caracteres'
            });
          }
          
          const hashedPassword = await bcrypt.hash(contraseña_nueva, 10);
          camposActualizar.push('contra = ?');
          valoresActualizar.push(hashedPassword);
        }
        
        if (camposActualizar.length > 0) {
          valoresActualizar.push(userId);
          
          await connection.query(
            `UPDATE user SET ${camposActualizar.join(', ')} WHERE id = ?`,
            valoresActualizar
          );
        }
        
        await connection.commit();
        
        clearUserCache(userId);
        
        const [usuarioActualizado] = await connection.query(
          'SELECT id, email, usuario, rol, telefono, direccion, google_id, foto_url FROM user WHERE id = ?',
          [userId]
        );
        
        res.status(200).json({
          success: true,
          message: 'Perfil actualizado correctamente',
          usuario: usuarioActualizado[0]
        });
        
      } catch (error) {
        await connection.rollback();
        if (req.file) deleteOldImage(req.file.path);
        handleError(error, `PUT usuario/${userId}/perfil`, res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};