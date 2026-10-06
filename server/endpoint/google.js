const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

const router = express.Router();
console.log("✅ Archivo registroGoogle.js cargado");

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

const registroGoogleValidation = Joi.object({
  nombreCompleto: Joi.string().max(100).allow(null).optional(),
  nombreUsuario: Joi.string().min(3).max(50).pattern(/^[a-zA-Z0-9_]+$/).allow(null).optional(),
  email: Joi.string().email().max(100).required(),
  googleId: Joi.string().min(5).max(255).required(),
  photoURL: Joi.string().uri().max(500).allow(null).optional()
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
      message: 'El email ya está registrado' 
    });
  }
  
  if (error.code === 'ER_BAD_FIELD_ERROR') {
    return res.status(500).json({ 
      success: false, 
      message: 'Error en la estructura de la tabla. Contacte al administrador.' 
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
  console.log("✅ Router de registro con Google creado con pool");

  router.post('/', 
    registroLimiter,
    async (req, res) => {
      logger.info("📥 Nueva petición a /api/registro/google");
      logger.debug("Body recibido:", { ...req.body, googleId: req.body.googleId?.substring(0, 10) + '...' });
      
      // Validar entrada
      const { error, value } = registroGoogleValidation.validate(req.body);
      if (error) {
        logger.warn(`Validación falló: ${error.message}`);
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      const { nombreCompleto, nombreUsuario, email, googleId, photoURL } = value;
      
      // Generar nombre de usuario si no se proporciona
      const nombreUsuarioFinal = nombreUsuario || 
        (nombreCompleto ? nombreCompleto.split(' ')[0] : email.split('@')[0]);
      
      // Validar que nombreUsuarioFinal sea válido
      const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
      if (!usernameRegex.test(nombreUsuarioFinal)) {
        return res.status(400).json({ 
          success: false, 
          message: 'El nombre de usuario debe tener 3-50 caracteres (letras, números, guión bajo)' 
        });
      }
      
      // Usar pool directamente sin .promise() para consistencia
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        logger.info(`🔍 Buscando usuario con email: ${email}`);
        const [existingUsers] = await connection.query(
          'SELECT * FROM user WHERE email = ?',
          [email]
        );
        logger.debug(`Usuarios encontrados: ${existingUsers.length}`);

        // ============================================
        // USUARIO EXISTENTE
        // ============================================
        if (existingUsers.length > 0) {
          const user = existingUsers[0];
          logger.info(`👤 Usuario existente ID: ${user.id}`);
          
          // Verificar cuenta activa
          if (user.activo === 0) {
            await connection.rollback();
            return res.status(403).json({
              success: false,
              message: 'Cuenta desactivada. Contacta al administrador.'
            });
          }
          
          // Validar conflicto de Google ID
          if (user.google_id && user.google_id !== googleId) {
            await connection.rollback();
            return res.status(409).json({
              success: false,
              message: 'Esta cuenta ya está vinculada a otra cuenta de Google.'
            });
          }
          
          // Actualizar google_id si no tiene
          if (!user.google_id) {
            logger.info(`🔄 Actualizando google_id para usuario: ${user.id}`);
            await connection.query(
              'UPDATE user SET google_id = ? WHERE id = ?',
              [googleId, user.id]
            );
            
            if (photoURL && !user.foto_url) {
              await connection.query(
                'UPDATE user SET foto_url = ? WHERE id = ?',
                [photoURL, user.id]
              );
            }
          }
          
          await connection.commit();
          
          const token = generateToken(user);
          
          logger.info(`✅ Login con Google exitoso para usuario: ${user.id}`);
          
          return res.json({
            success: true,
            token,
            message: user.google_id ? 'Login con Google exitoso' : 'Usuario existente vinculado con Google',
            user: {
              id: user.id,
              usuario: user.usuario,
              email: user.email,
              rol: user.rol,
              foto_url: user.foto_url || photoURL
            }
          });
        }

        // ============================================
        // NUEVO USUARIO
        // ============================================
        logger.info("🆕 Creando nuevo usuario con Google");
        
        // Verificar si el nombre de usuario ya existe
        const [existingUsername] = await connection.query(
          'SELECT id FROM user WHERE usuario = ?',
          [nombreUsuarioFinal]
        );
        
        let nombreFinal = nombreUsuarioFinal;
        if (existingUsername.length > 0) {
          // Agregar sufijo numérico si el nombre ya existe
          nombreFinal = `${nombreUsuarioFinal}_${Date.now() % 10000}`;
          logger.info(`📝 Nombre de usuario modificado a: ${nombreFinal}`);
        }
        
        const rol = 'usuario';
        
        const [userResult] = await connection.query(
          `INSERT INTO user 
           (usuario, email, rol, google_id, foto_url, activo, fecha_registro) 
           VALUES (?, ?, ?, ?, ?, 1, NOW())`,
          [nombreFinal, email, rol, googleId, photoURL || null]
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
                   'Gracias por registrarte con Google. Empieza a acumular puntos y descubre todas nuestras promociones.', 
                   NOW(), 0, 1, '👋', '#4CAF50')`,
          [userId]
        );

        await connection.commit();
        logger.info(`✅ Transacción completada exitosamente para usuario ${userId}`);

        const token = generateToken({ id: userId, usuario: nombreFinal, rol: 'usuario' });

        res.status(201).json({
          success: true,
          token,
          message: 'Usuario registrado con Google exitosamente',
          user: {
            id: userId,
            usuario: nombreFinal,
            email: email,
            rol: 'usuario',
            foto_url: photoURL || null
          }
        });

      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST /api/registro/google', res);
      } finally {
        connection.release();
        logger.debug("🔚 Conexión liberada");
      }
    }
  );

  return router;
};