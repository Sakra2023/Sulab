const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

const router = express.Router();
console.log("✅ Archivo registro.js cargado");

// ============================================
// MIDDLEWARES DE SEGURIDAD
// ============================================

// Rate limiting específico para registro
const registroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 intentos por IP
  message: { success: false, message: 'Demasiados intentos de registro. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Verificar que JWT_SECRET esté configurado
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET no está configurado en las variables de entorno');
  throw new Error('JWT_SECRET no está configurado');
}

// ============================================
// VALIDACIONES CON JOI
// ============================================

const registroValidation = Joi.object({
  usuario: Joi.string().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/).required(),
  correo: Joi.string().email().max(100).required(),
  contra: Joi.string().min(6).max(100).required()
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
    return res.status(409).json({ 
      success: false, 
      message: 'Email o nombre de usuario ya registrado' 
    });
  }
  
  res.status(500).json({ 
    success: false, 
    message: 'Error interno del servidor' 
  });
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, usuario: user.usuario, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// ============================================
// ENDPOINT PRINCIPAL
// ============================================

module.exports = (pool) => {
  console.log("✅ Router de registro creado con pool");

  router.post('/', 
    registroLimiter,
    async (req, res) => {
      logger.info("📥 Nueva petición a /api/registro");
      logger.debug("Body recibido:", { 
        usuario: req.body.usuario, 
        correo: req.body.correo,
        contra_length: req.body.contra?.length 
      });
      
      // Validar entrada
      const { error, value } = registroValidation.validate(req.body);
      if (error) {
        logger.warn(`Validación falló: ${error.message}`);
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      const { usuario, correo, contra } = value;
      
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        logger.info(`🔍 Verificando si usuario ${usuario} o email ${correo} ya existe`);
        
        const [existingUsers] = await connection.query(
          'SELECT * FROM user WHERE usuario = ? OR email = ?',
          [usuario, correo]
        );

        if (existingUsers.length > 0) {
          const existingUser = existingUsers[0];
          if (existingUser.usuario === usuario) {
            await connection.rollback();
            logger.warn(`❌ Nombre de usuario ya registrado: ${usuario}`);
            return res.status(400).json({ 
              success: false, 
              message: 'El nombre de usuario ya está registrado' 
            });
          }
          if (existingUser.email === correo) {
            await connection.rollback();
            logger.warn(`❌ Email ya registrado: ${correo}`);
            return res.status(400).json({ 
              success: false, 
              message: 'El correo electrónico ya está registrado' 
            });
          }
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(contra, saltRounds);
        logger.debug(`✅ Contraseña hasheada para usuario: ${usuario}`);

        const [userResult] = await connection.query(
          `INSERT INTO user (email, usuario, contra, rol, activo, fecha_registro) 
           VALUES (?, ?, ?, 'usuario', 1, NOW())`,
          [correo, usuario, hashedPassword]
        );

        const userId = userResult.insertId;
        logger.info(`✅ Usuario creado con ID: ${userId}`);

        // Insertar puntos iniciales
        await connection.query(
          `INSERT INTO user_puntos (user_id, puntos_totales, nivel, nivel_actual, puntos_nivel_actual, puntos_siguiente_nivel) 
           VALUES (?, 0, 'Bronce', 1, 0, 5000)`,
          [userId]
        );

        // Insertar configuración predeterminada
        await connection.query(
          `INSERT INTO user_config 
           (user_id, email_notificaciones, push_notificaciones, 
            puntos_notif, canjes_notif, promociones_notif, recordatorios_notif) 
           VALUES (?, 1, 1, 1, 1, 1, 0)`,
          [userId]
        );

        // Insertar notificación de bienvenida
        await connection.query(
          `INSERT INTO notificaciones 
           (user_id, tipo, titulo, mensaje, fecha, leida, importante, icono, color) 
           VALUES (?, 'sistema', '¡Bienvenido a nuestro sistema!', 
                   'Gracias por registrarte. Empieza a acumular puntos y descubre todas nuestras promociones.', 
                   NOW(), 0, 1, '👋', '#4CAF50')`,
          [userId]
        );

        await connection.commit();
        logger.info(`✅ Transacción completada exitosamente para usuario ${userId}`);

        // Generar token para login automático
        const token = generateToken({ id: userId, usuario, rol: 'usuario' });

        res.status(201).json({
          success: true,
          message: 'Usuario registrado exitosamente',
          token,
          userId: userId,
          user: {
            id: userId,
            usuario: usuario,
            email: correo,
            rol: 'usuario'
          }
        });

      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST /api/registro', res);
      } finally {
        connection.release();
        logger.debug("🔚 Conexión liberada");
      }
    }
  );

  return router;
};