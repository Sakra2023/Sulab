// D:\SuLab\Prueba\server\endpoint\colab\colab_inicio.js
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const MetricsService = require('./metricaService');
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

// Autorización - solo colaboradores y admins
const authorizeColab = (req, res, next) => {
  if (!req.user || !['colab', 'admin'].includes(req.user.rol)) {
    logger.warn(`Acceso denegado: ${req.user?.rol} intentó acceder a ${req.path}`);
    return res.status(403).json({ success: false, message: 'Se requieren permisos de colaborador' });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI - CORREGIDAS CON SOPORTE PARA FECHAS
// ============================================

const validations = {
  usuarioIdParam: Joi.object({
    usuarioId: Joi.number().integer().positive().required()
  }),
  
  emprendimientoIdParam: Joi.object({
    emprendimientoId: Joi.number().integer().positive().required()
  }),
  
  emprendimientoIdParam2: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  alertaIdParam: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  // ✅ VALIDACIÓN PARA DASHBOARD CON PERIODO O FECHAS PERSONALIZADAS
  dashboardQuery: Joi.object({
    periodo: Joi.string().valid('hoy', 'semana', 'mes', 'año', 'personalizado').default('hoy'),
    fechaInicio: Joi.date().iso().optional(),
    fechaFin: Joi.date().iso().optional()
  }).unknown(true),
  
  // ✅ VALIDACIÓN PARA MÉTRICAS CON FECHAS PERSONALIZADAS
  metricasQuery: Joi.object({
    periodo: Joi.string().valid('hoy', 'semana', 'mes', 'año', 'personalizado').default('hoy'),
    fechaInicio: Joi.date().iso().optional(),
    fechaFin: Joi.date().iso().optional()
  }).unknown(true),
  
  updateEmprendimiento: Joi.object({
    nombre: Joi.string().trim().min(3).max(100).required(),
    categoria: Joi.string().trim().min(2).max(50).required(),
    ubicacion: Joi.string().trim().min(5).max(200).required(),
    ciudad: Joi.string().trim().min(2).max(50).required(),
    horario: Joi.string().trim().max(100).allow(null, '').optional(),
    // ✅ CORREGIDO: trim + acepta número de teléfono O URL (con o sin espacios)
    whatsapp: Joi.string().trim().pattern(/^([0-9+\-\s]{8,20}|https?:\/\/.+)$/).allow(null, '').optional(),
    // ✅ CORREGIDO: trim + uri + límite ampliado para URLs con parámetros
    instagram: Joi.string().trim().uri().max(200).allow(null, '').optional(),
    tiktok: Joi.string().trim().uri().max(200).allow(null, '').optional()
  }),
  
  marcarTodasAlertas: Joi.object({
    emprendimientoId: Joi.number().integer().positive().required()
  }),
  
  marcarLeida: Joi.object({
    tipo: Joi.string().valid('canje', 'notificacion', 'stock').optional()
  }),
  
  deleteAlerta: Joi.object({
    tipo: Joi.string().valid('canje', 'notificacion', 'stock').required()
  }).unknown(true)
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
    // ✅ Eliminar parámetros internos antes de validar
    const queryToValidate = { ...req.query };
    delete queryToValidate._; // Eliminar timestamp
    
    const { error, value } = schema.validate(queryToValidate);
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

// ============================================
// FUNCIONES DE EMISIÓN DE SOCKET.IO
// ============================================

const emitirEventoDashboard = (io, evento, datos) => {
  if (!io) return;

  try {
    if (datos.emprendimiento_id) {
      io.to(`emprendimiento_${datos.emprendimiento_id}`).emit(evento, {
        ...datos,
        timestamp: new Date().toISOString()
      });
      logger.info(`📡 Evento ${evento} emitido para emprendimiento ${datos.emprendimiento_id}`);
    }

    io.emit(`dashboard_${evento}`, {
      ...datos,
      timestamp: new Date().toISOString()
    });
  } catch (socketError) {
    logger.error('Error emitiendo evento de dashboard:', socketError);
  }
};

const emitirAlertaTiempoReal = (io, emprendimientoId, alerta) => {
  if (!io) return;

  try {
    const datosAlerta = {
      emprendimiento_id: emprendimientoId,
      alerta: alerta,
      timestamp: new Date().toISOString()
    };

    io.to(`emprendimiento_${emprendimientoId}`).emit('nueva_alerta', datosAlerta);
    io.to('admin').emit('nueva_alerta_admin', datosAlerta);
    
    logger.info(`📡 Alerta en tiempo real emitida para emprendimiento ${emprendimientoId}`);
  } catch (socketError) {
    logger.error('Error emitiendo alerta en tiempo real:', socketError);
  }
};

// ============================================
// FUNCIÓN PARA OBTENER FECHAS SEGÚN PERÍODO
// ============================================

const obtenerRangoFechas = (periodo, fechaInicio, fechaFin) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  let inicio = new Date(hoy);
  let fin = new Date(hoy);
  fin.setHours(23, 59, 59, 999);

  // ✅ Si hay fechas personalizadas, usarlas
  if (periodo === 'personalizado' && fechaInicio && fechaFin) {
    inicio = new Date(fechaInicio);
    inicio.setHours(0, 0, 0, 0);
    fin = new Date(fechaFin);
    fin.setHours(23, 59, 59, 999);
    return { inicio, fin };
  }

  switch(periodo) {
    case 'hoy':
      // Ya está configurado
      break;
    case 'semana':
      inicio.setDate(hoy.getDate() - 7);
      break;
    case 'mes':
      inicio.setMonth(hoy.getMonth() - 1);
      break;
    case 'año':
      inicio.setFullYear(hoy.getFullYear() - 1);
      break;
    default:
      break;
  }
  
  return { inicio, fin };
};

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;
  
  const metricsService = new MetricsService(pool);

  // Helper para obtener conexión segura
  const getConnection = async () => {
    return await pool.getConnection();
  };

  // Helper para validar emprendimiento por usuario
  const getEmprendimientoByUsuario = async (connection, usuarioId) => {
    const [emprendimiento] = await connection.query(
      `SELECT e.* FROM emprendimientos e WHERE e.propietario_id = ? AND e.activo = 1`,
      [usuarioId]
    );
    return emprendimiento.length > 0 ? emprendimiento[0] : null;
  };

  // ============================================
  // DASHBOARD COMPLETO - CON SOPORTE PARA FECHAS PERSONALIZADAS
  // ============================================
  router.get('/dashboard/:usuarioId',
    authenticate,
    authorizeColab,
    createLimiter(5, 50),
    validateParams(validations.usuarioIdParam),
    validateQuery(validations.dashboardQuery),
    async (req, res) => {
      const { usuarioId } = req.params;
      const { periodo, fechaInicio, fechaFin } = req.query;
      let connection;
      
      // Verificar que el usuario autenticado solo acceda a sus propios datos
      if (req.user.rol !== 'admin' && req.user.id !== parseInt(usuarioId)) {
        logger.warn(`Usuario ${req.user.id} intentó acceder a dashboard de ${usuarioId}`);
        return res.status(403).json({ success: false, message: 'No tienes permiso para ver este dashboard' });
      }
      
      try {
        logger.info(`GET /dashboard/${usuarioId} - Periodo: ${periodo} - Fechas: ${fechaInicio} - ${fechaFin} - User: ${req.user.id}`);
        connection = await getConnection();
        
        const emprendimiento = await getEmprendimientoByUsuario(connection, usuarioId);
        
        if (!emprendimiento) {
          return res.json({ success: false, message: 'No tienes un emprendimiento asociado' });
        }
        
        const emprendimientoId = emprendimiento.id;
        
        connection.release();
        connection = null;
        
        // ✅ Obtener rango de fechas
        const { inicio, fin } = obtenerRangoFechas(periodo, fechaInicio, fechaFin);
        
        // ✅ Pasar fechas al servicio de métricas
        const metricas = await metricsService.getMetricas(emprendimientoId, periodo, inicio, fin);
        const costosReales = await metricsService.getCostosReales(emprendimientoId, periodo, inicio, fin);
        
        metricas.costosTotales = {
          cantidad: costosReales,
          crecimiento: metricas.ventas?.crecimiento || 0,
          tendencia: metricas.ventas?.tendencia || 'stable'
        };
        
        const alertas = await metricsService.getAlertasConDetalle(emprendimientoId);
        
        const responseData = {
          success: true,
          emprendimiento: emprendimiento,
          metricas: metricas,
          alertas: alertas
        };
        
        res.json(responseData);
        
      } catch (error) {
        handleError(error, `GET dashboard/${usuarioId}`, res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // ============================================
  // OBTENER EMPRENDIMIENTO POR USUARIO ID
  // ============================================
  router.get('/emprendimiento/propietario/:usuarioId',
    authenticate,
    authorizeColab,
    createLimiter(5, 100),
    validateParams(validations.usuarioIdParam),
    async (req, res) => {
      let connection;
      
      if (req.user.rol !== 'admin' && req.user.id !== parseInt(req.params.usuarioId)) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para ver este emprendimiento' });
      }
      
      try {
        const { usuarioId } = req.params;
        logger.info(`GET /emprendimiento/propietario/${usuarioId} - User: ${req.user.id}`);
        
        connection = await getConnection();
        
        const [emprendimiento] = await connection.query(
          `SELECT * FROM emprendimientos WHERE propietario_id = ? AND activo = 1`,
          [usuarioId]
        );
        
        if (emprendimiento.length === 0) {
          return res.json({ success: false, message: 'No tienes un emprendimiento asociado' });
        }
        
        res.json({ success: true, emprendimiento: emprendimiento[0] });
      } catch (error) {
        handleError(error, `GET emprendimiento/propietario/${req.params.usuarioId}`, res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // ============================================
  // ACTUALIZAR EMPRENDIMIENTO
  // ============================================
  router.put('/emprendimiento/:id',
    authenticate,
    authorizeColab,
    createLimiter(1, 30),
    validateParams(validations.emprendimientoIdParam2),
    validate(validations.updateEmprendimiento),
    async (req, res) => {
      let connection;
      
      try {
        const { id } = req.params;
        const { nombre, categoria, ubicacion, ciudad, horario, whatsapp, instagram, tiktok } = req.body;
        const usuarioId = req.user.id;
        
        logger.info(`PUT /emprendimiento/${id} - User: ${req.user.id}`);
        
        connection = await getConnection();
        
        const [validar] = await connection.query(
          `SELECT id, propietario_id FROM emprendimientos WHERE id = ? AND activo = 1`,
          [id]
        );
        
        if (validar.length === 0) {
          return res.status(404).json({ success: false, message: 'Emprendimiento no encontrado' });
        }
        
        if (validar[0].propietario_id !== usuarioId && req.user.rol !== 'admin') {
          return res.status(403).json({ success: false, message: 'No tienes permiso para modificar este emprendimiento' });
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
        
        metricsService.clearCache(id);
        
        if (io) {
          emitirEventoDashboard(io, 'emprendimiento_actualizado', {
            emprendimiento_id: id,
            usuario_id: usuarioId,
            datos: { nombre, categoria, ubicacion, ciudad }
          });
          
          io.to(`user_${usuarioId}`).emit('emprendimiento_actualizado', {
            emprendimiento_id: id,
            mensaje: `El emprendimiento "${nombre}" ha sido actualizado`,
            datos: { nombre, categoria, ubicacion, ciudad },
            timestamp: new Date().toISOString()
          });
        }
        
        logger.info(`Emprendimiento ${id} actualizado por usuario ${req.user.id}`);
        
        res.json({ success: true, message: 'Emprendimiento actualizado correctamente' });
      } catch (error) {
        handleError(error, `PUT emprendimiento/${req.params.id}`, res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // ============================================
  // MÉTRICAS ENDPOINT - CON SOPORTE PARA FECHAS PERSONALIZADAS
  // ============================================
  router.get('/metricas/:emprendimientoId',
    authenticate,
    authorizeColab,
    createLimiter(5, 50),
    validateParams(validations.emprendimientoIdParam),
    validateQuery(validations.metricasQuery),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        const { periodo, fechaInicio, fechaFin } = req.query;
        
        logger.info(`GET /metricas/${emprendimientoId} - Periodo: ${periodo} - Fechas: ${fechaInicio} - ${fechaFin} - User: ${req.user.id}`);
        
        // ✅ Obtener rango de fechas
        const { inicio, fin } = obtenerRangoFechas(periodo, fechaInicio, fechaFin);
        
        const metricas = await metricsService.getMetricas(emprendimientoId, periodo, inicio, fin);
        const costosReales = await metricsService.getCostosReales(emprendimientoId, periodo, inicio, fin);
        
        metricas.costosTotales = { 
          cantidad: costosReales,
          crecimiento: metricas.ventas?.crecimiento || 0,
          tendencia: metricas.ventas?.tendencia || 'stable'
        };
        
        res.json({ success: true, metricas });
      } catch (error) {
        handleError(error, `GET metricas/${req.params.emprendimientoId}`, res);
      }
    }
  );

  // ============================================
  // ALERTAS ENDPOINT
  // ============================================
  router.get('/alertas/:emprendimientoId',
    authenticate,
    authorizeColab,
    createLimiter(5, 50),
    validateParams(validations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /alertas/${emprendimientoId} - User: ${req.user.id}`);
        
        const alertas = await metricsService.getAlertasConDetalle(emprendimientoId);
        res.json({ success: true, alertas });
      } catch (error) {
        handleError(error, `GET alertas/${req.params.emprendimientoId}`, res);
      }
    }
  );

  // ============================================
  // ELIMINAR ALERTA
  // ============================================
  router.delete('/alertas/:id',
    authenticate,
    authorizeColab,
    createLimiter(1, 20),
    validateParams(validations.alertaIdParam),
    validateQuery(validations.deleteAlerta),
    async (req, res) => {
      let connection;
      let emprendimientoId = null;
      
      try {
        const { id } = req.params;
        const { tipo } = req.query;
        
        logger.info(`DELETE /alertas/${id} - Tipo: ${tipo} - User: ${req.user.id}`);
        
        connection = await getConnection();
        
        let eliminado = false;
        
        const [notif] = await connection.query(
          `SELECT user_id FROM notificaciones WHERE id = ?`,
          [id]
        );
        
        if (notif.length > 0) {
          await connection.query(`DELETE FROM notificaciones WHERE id = ?`, [id]);
          
          const [emp] = await connection.query(
            `SELECT id FROM emprendimientos WHERE propietario_id = ? AND activo = 1`,
            [notif[0].user_id]
          );
          emprendimientoId = emp.length > 0 ? emp[0].id : null;
          eliminado = true;
          logger.info(`✅ Notificación ${id} eliminada de tabla notificaciones`);
        }
        
        if (!eliminado && tipo === 'canje') {
          const [solicitud] = await connection.query(
            `SELECT emprendimiento_id FROM solicitudes_canje WHERE id = ?`,
            [id]
          );
          
          if (solicitud.length > 0) {
            await connection.query(`DELETE FROM solicitudes_canje WHERE id = ?`, [id]);
            emprendimientoId = solicitud[0].emprendimiento_id;
            eliminado = true;
            logger.info(`✅ Solicitud ${id} eliminada de tabla solicitudes_canje`);
          }
        }
        
        if (tipo === 'stock') {
          logger.info(`Alerta de stock ${id} - No persiste en BD, ignorando eliminación`);
          return res.json({ success: true, message: 'Alerta de stock eliminada (no persistente)' });
        }
        
        if (!eliminado) {
          return res.status(404).json({ success: false, message: 'Alerta no encontrada' });
        }
        
        if (io && emprendimientoId) {
          io.to(`emprendimiento_${emprendimientoId}`).emit('alerta_eliminada', {
            alerta_id: id,
            tipo: tipo,
            timestamp: new Date().toISOString()
          });
          
          io.to(`emprendimiento_${emprendimientoId}`).emit('canje_procesado', {
            action: 'eliminar_alerta',
            timestamp: new Date().toISOString()
          });
        }
        
        logger.info(`Alerta ${id} eliminada por usuario ${req.user.id}`);
        res.json({ success: true, message: 'Alerta eliminada correctamente' });
        
      } catch (error) {
        handleError(error, `DELETE alerta/${req.params.id}`, res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // ============================================
  // MARCAR ALERTA COMO LEÍDA
  // ============================================
  router.put('/alertas/:id/leida',
    authenticate,
    authorizeColab,
    createLimiter(1, 30),
    validateParams(validations.alertaIdParam),
    validate(validations.marcarLeida),
    async (req, res) => {
      let connection;
      
      try {
        const { id } = req.params;
        const { tipo } = req.body;
        
        logger.info(`PUT /alertas/${id}/leida - Tipo: ${tipo} - User: ${req.user.id}`);
        
        connection = await getConnection();
        
        if (tipo === 'canje') {
          await connection.query(
            `UPDATE solicitudes_canje SET estado = 'visto' WHERE id = ? AND estado = 'pendiente'`,
            [id]
          );
        } else if (tipo === 'notificacion') {
          await connection.query(
            `UPDATE notificaciones SET leida = 1 WHERE id = ?`,
            [id]
          );
        } else {
          await connection.query(
            `UPDATE solicitudes_canje SET estado = 'visto' WHERE id = ? AND estado = 'pendiente'`,
            [id]
          );
          await connection.query(
            `UPDATE notificaciones SET leida = 1 WHERE solicitud_id = ? OR id = ?`,
            [id, id]
          );
        }
        
        if (io) {
          io.emit('alerta_marcada_leida', {
            alerta_id: id,
            tipo: tipo || 'general',
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({ success: true, message: 'Alerta marcada como leída' });
      } catch (error) {
        handleError(error, `PUT alerta/${req.params.id}/leida`, res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // ============================================
  // MARCAR TODAS LAS ALERTAS
  // ============================================
  router.put('/alertas/marcar-todas',
    authenticate,
    authorizeColab,
    createLimiter(1, 20),
    validate(validations.marcarTodasAlertas),
    async (req, res) => {
      let connection;
      
      try {
        const { emprendimientoId } = req.body;
        
        logger.info(`PUT /alertas/marcar-todas - Emprendimiento: ${emprendimientoId} - User: ${req.user.id}`);
        
        connection = await getConnection();
        
        await connection.query(
          `UPDATE solicitudes_canje 
           SET estado = 'visto' 
           WHERE estado = 'pendiente' 
           AND emprendimiento_id = ?`,
          [emprendimientoId]
        );
        
        await connection.query(
          `UPDATE solicitudes_canje 
           SET estado = 'visto' 
           WHERE estado = 'pendiente' 
           AND emprendimiento_id IS NULL 
           AND JSON_EXTRACT(metadata, '$.emprendimiento_id') = ?`,
          [emprendimientoId]
        );
        
        const [emprendimiento] = await connection.query(
          `SELECT propietario_id FROM emprendimientos WHERE id = ? AND activo = 1`,
          [emprendimientoId]
        );
        
        if (emprendimiento.length > 0) {
          await connection.query(
            `UPDATE notificaciones SET leida = 1 WHERE user_id = ? AND leida = 0`,
            [emprendimiento[0].propietario_id]
          );
        }
        
        if (io) {
          io.to(`emprendimiento_${emprendimientoId}`).emit('todas_alertas_leidas', {
            emprendimiento_id: emprendimientoId,
            timestamp: new Date().toISOString()
          });
        }
        
        logger.info(`Todas las alertas marcadas como leídas para emprendimiento ${emprendimientoId}`);
        
        res.json({ success: true, message: 'Todas las alertas marcadas como leídas' });
      } catch (error) {
        handleError(error, 'PUT alertas/marcar-todas', res);
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // ============================================
  // UNIRSE A SALA DE USUARIO PARA SOCKET.IO
  // ============================================
  router.post('/unirse-sala',
    authenticate,
    authorizeColab,
    async (req, res) => {
      try {
        const { socketId } = req.body;
        
        if (!socketId) {
          return res.status(400).json({ success: false, message: 'socketId es requerido' });
        }
        
        if (!io) {
          logger.error('❌ io no disponible en /unirse-sala');
          return res.status(500).json({ success: false, message: 'Socket.io no disponible' });
        }
        
        const socket = io.sockets.sockets.get(socketId);
        
        if (!socket) {
          logger.warn(`❌ Socket ${socketId} no encontrado`);
          return res.status(404).json({ success: false, message: 'Socket no encontrado' });
        }
        
        const userId = req.user.id;
        socket.join(`user_${userId}`);
        
        logger.info(`✅ Usuario ${userId} (${req.user.usuario}) unido a sala user_${userId}`);
        
        res.json({ success: true, message: 'Unido a sala de usuario' });
      } catch (error) {
        handleError(error, 'POST unirse-sala', res);
      }
    }
  );

  return router;
};