const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

const router = express.Router();
console.log("✅ Archivo loginGoogle.js cargado");

// ============================================
// MIDDLEWARES DE SEGURIDAD
// ============================================

// Rate limiting específico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 intentos por IP
  message: { success: false, message: 'Demasiados intentos de login. Intente más tarde.' },
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

const loginGoogleValidation = Joi.object({
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
      message: 'Email duplicado' 
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
  console.log("✅ Router de login con Google creado con pool");

  router.post('/', 
    loginLimiter,
    async (req, res) => {
      logger.info("📥 Nueva petición a /api/login-google");
      logger.debug("Body recibido:", { 
        email: req.body.email, 
        googleId: req.body.googleId?.substring(0, 10) + '...',
        hasPhotoURL: !!req.body.photoURL 
      });
      
      // Validar entrada
      const { error, value } = loginGoogleValidation.validate(req.body);
      if (error) {
        logger.warn(`Validación falló: ${error.message}`);
        return res.status(400).json({ 
          success: false, 
          message: error.message 
        });
      }
      
      const { email, googleId, photoURL } = value;
      
      const connection = await pool.getConnection();
      
      try {
        logger.info(`🔍 Buscando usuario con email: ${email}`);
        
        const [users] = await connection.query(
          'SELECT * FROM user WHERE email = ?',
          [email]
        );

        logger.debug(`Usuarios encontrados: ${users.length}`);

        if (users.length === 0) {
          logger.warn(`❌ Usuario no encontrado: ${email}`);
          return res.status(404).json({ 
            success: false, 
            message: 'Cuenta no registrada. Debes registrarte primero con Google o con email tradicional.' 
          });
        }

        const user = users[0];
        logger.info(`👤 Usuario encontrado ID: ${user.id}, Rol: ${user.rol}`);

        // Verificar cuenta activa
        if (user.activo === 0) {
          logger.warn(`Cuenta desactivada: ${user.id}`);
          return res.status(403).json({
            success: false,
            message: 'Cuenta desactivada. Contacta al administrador.'
          });
        }

        // Validar Google ID conflictivo
        if (user.google_id && user.google_id !== googleId) {
          logger.warn(`Conflicto de Google ID para usuario ${user.id}: esperado ${user.google_id}, recibido ${googleId.substring(0, 10)}...`);
          return res.status(409).json({
            success: false,
            message: 'Esta cuenta ya está vinculada a otra cuenta de Google.'
          });
        }

        // Si el usuario no tiene google_id (se registró con email tradicional), vincularlo
        if (!user.google_id) {
          logger.info(`🔄 Vinculando google_id para usuario: ${user.id}`);
          await connection.query(
            'UPDATE user SET google_id = ? WHERE id = ?',
            [googleId, user.id]
          );
        }
        
        // Actualizar foto si es necesario
        if (photoURL && !user.foto_url) {
          logger.info(`🔄 Actualizando foto_url para usuario: ${user.id}`);
          await connection.query(
            'UPDATE user SET foto_url = ? WHERE id = ?',
            [photoURL, user.id]
          );
        }
        
        // Actualizar último acceso
        await connection.query(
          'UPDATE user SET ultimo_acceso = NOW() WHERE id = ?',
          [user.id]
        );

        logger.info(`✅ Login con Google exitoso para usuario: ${user.usuario} (ID: ${user.id})`);

        const token = generateToken(user);

        return res.json({
          success: true,
          token,
          message: 'Login con Google exitoso',
          user: {
            id: user.id,
            usuario: user.usuario,
            email: user.email,
            rol: user.rol,
            foto_url: user.foto_url || photoURL
          }
        });

      } catch (error) {
        handleError(error, 'POST /api/login-google', res);
      } finally {
        connection.release();
        logger.debug("🔚 Conexión liberada");
      }
    }
  );

  return router;
};