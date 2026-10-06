const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');

// ============================================
// VARIABLE GLOBAL PARA SOCKET.IO
// ============================================
let io = null;

// ============================================
// CONFIGURACIÓN
// ============================================

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../img-premios');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// Asegurar que el directorio existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================
// MIDDLEWARES DE SEGURIDAD
// ============================================

// Rate limiting
const createLimiter = (minutes = 15, max = 100) => rateLimit({
  windowMs: minutes * 60 * 1000,
  max,
  message: { success: false, message: 'Demasiadas solicitudes, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware de autenticación
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      logger.warn('Token no proporcionado');
      return res.status(401).json({ success: false, message: 'Token no proporcionado' });
    }
    
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

// Autorización - solo admin
const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    logger.warn(`Intento no autorizado: ${req.user?.rol} intentó acceder a ${req.path}`);
    return res.status(403).json({ 
      success: false, 
      message: 'Se requieren permisos de administrador' 
    });
  }
  next();
};

// Configuración de multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const sanitizedName = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${sanitizedName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no permitido. Use: jpeg, jpg, png, gif, webp'));
    }
  }
});

// Middleware para optimizar imagen
const optimizeImage = async (req, res, next) => {
  if (!req.file) {
    return next();
  }
  
  try {
    const filePath = req.file.path;
    const optimizedPath = filePath.replace(/\.\w+$/, '.webp');
    
    await sharp(filePath)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(optimizedPath);
    
    fs.unlinkSync(filePath);
    req.file.path = optimizedPath;
    req.file.filename = path.basename(optimizedPath);
    req.file.mimetype = 'image/webp';
    
    next();
  } catch (error) {
    logger.error('Error optimizando imagen:', error);
    next();
  }
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const premioValidations = {
  create: Joi.object({
    nombre: Joi.string().min(3).max(100).required().trim(),
    categoria: Joi.string().min(2).max(50).required().trim(),
    puntos: Joi.number().integer().min(1).max(999999).required(),
    descripcion: Joi.string().min(10).max(1000).required().trim(),
    stock: Joi.number().integer().min(0).max(999999).default(1),
    fechaVencimiento: Joi.any().optional().allow(null, ''),
    disponible: Joi.any().optional().default(true)
  }),
  
  update: Joi.object({
    nombre: Joi.string().min(3).max(100).optional().trim(),
    categoria: Joi.string().min(2).max(50).optional().trim(),
    puntos: Joi.number().integer().min(1).max(999999).optional(),
    descripcion: Joi.string().min(10).max(1000).optional().trim(),
    stock: Joi.number().integer().min(0).max(999999).optional(),
    fechaVencimiento: Joi.any().optional().allow(null, ''),
    disponible: Joi.any().optional(),
    vecesCanjeado: Joi.number().integer().min(0).optional()
  }).min(1),
  
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  categoria: Joi.object({
    categoria: Joi.string().min(2).max(50).required()
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

// Función para formatear fecha - maneja cualquier formato
const formatDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    // Si es objeto Date
    if (dateString instanceof Date) {
      const year = dateString.getFullYear();
      const month = String(dateString.getMonth() + 1).padStart(2, '0');
      const day = String(dateString.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Convertir a string
    const strDate = String(dateString);
    
    // Si ya tiene formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(strDate)) return strDate;
    
    // Si tiene formato ISO (con T)
    if (strDate.includes('T')) {
      const isoDate = new Date(strDate);
      if (!isNaN(isoDate.getTime())) {
        return isoDate.toISOString().split('T')[0];
      }
    }
    
    // Intentar parsear como fecha
    const parsedDate = new Date(strDate);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }
    
    return null;
  } catch (error) {
    logger.error('Error formateando fecha:', error);
    return null;
  }
};

// Función para normalizar boolean - acepta string, boolean, number
const normalizeBoolean = (value) => {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'on';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
};

const handleError = (error, context, res) => {
  logger.error(`Error en ${context}:`, {
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
  
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Premio duplicado' });
  }
  
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  
  const fullPath = path.join(UPLOAD_DIR, path.basename(imagePath));
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      logger.info(`Imagen eliminada: ${fullPath}`);
    } catch (err) {
      logger.error(`Error eliminando imagen ${fullPath}:`, err);
    }
  }
};

// Cache keys
const CACHE_KEYS = {
  ALL_PREMIOS: 'premios_all',
  AVAILABLE_PREMIOS: 'premios_available',
  CATEGORY_PREFIX: 'premios_categoria_'
};

// ✅ CORREGIDO: Limpia también la caché del otro endpoint
const clearPremiosCache = () => {
  cache.del(CACHE_KEYS.ALL_PREMIOS);
  cache.del(CACHE_KEYS.AVAILABLE_PREMIOS);
  cache.del('premios_disponibles'); // ✅ Agregado - Clave usada en user-premios.js
  const keys = cache.keys();
  keys.forEach(key => {
    if (key.startsWith(CACHE_KEYS.CATEGORY_PREFIX)) {
      cache.del(key);
    }
  });
};

// ============================================
// FUNCIONES DE EMISIÓN SOCKET
// ============================================

const emitPremioEvent = (io, event, premio) => {
  if (!io) return;

  try {
    const datos = {
      premio: premio,
      timestamp: new Date().toISOString()
    };
    
    // Emitir a todos los usuarios conectados
    io.emit(event, datos);
    
    // Emitir específicamente a la sala de administradores
    io.to('admin').emit(`${event}_admin`, datos);
    
    logger.info(`📡 Evento Socket emitido: ${event} - Premio ID: ${premio?.id || 'N/A'}`);
  } catch (socketError) {
    logger.error('Error emitiendo evento de premios:', socketError);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;
  
  // GET / - Obtener todos los premios (SOLO ADMIN)
  router.get('/',
    authenticate,
    authorizeAdmin,
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /api/premios - Admin:', req.user.id);
        
        let premios = cache.get(CACHE_KEYS.ALL_PREMIOS);
        
        if (!premios) {
          const [results] = await pool.query(`SELECT * FROM premios ORDER BY id DESC`);
          premios = results;
          cache.put(CACHE_KEYS.ALL_PREMIOS, premios, 5 * 60 * 1000);
        }
        
        res.json({ success: true, premios });
      } catch (error) {
        handleError(error, 'GET premios', res);
      }
    }
  );

  // GET /disponibles - Obtener premios disponibles (PÚBLICO)
  router.get('/disponibles',
    createLimiter(5, 200),
    async (req, res) => {
      try {
        logger.info('GET /api/premios/disponibles');
        
        let premios = cache.get(CACHE_KEYS.AVAILABLE_PREMIOS);
        
        if (!premios) {
          const [results] = await pool.query(`
            SELECT * FROM premios 
            WHERE disponible = 1 AND stock > 0 AND (fechaVencimiento IS NULL OR fechaVencimiento >= CURDATE())
            ORDER BY puntos ASC
          `);
          premios = results;
          cache.put(CACHE_KEYS.AVAILABLE_PREMIOS, premios, 5 * 60 * 1000);
        }
        
        res.json({ success: true, premios });
      } catch (error) {
        handleError(error, 'GET premios disponibles', res);
      }
    }
  );

  // GET /categoria/:categoria - Obtener premios por categoría (PÚBLICO)
  router.get('/categoria/:categoria',
    createLimiter(5, 200),
    validateParams(premioValidations.categoria),
    async (req, res) => {
      try {
        const { categoria } = req.params;
        logger.info(`GET /api/premios/categoria/${categoria}`);
        
        const cacheKey = CACHE_KEYS.CATEGORY_PREFIX + categoria;
        let premios = cache.get(cacheKey);
        
        if (!premios) {
          const [results] = await pool.query(`
            SELECT * FROM premios 
            WHERE categoria = ? 
            ORDER BY puntos ASC
          `, [categoria]);
          premios = results;
          cache.put(cacheKey, premios, 5 * 60 * 1000);
        }
        
        res.json({ success: true, premios });
      } catch (error) {
        handleError(error, 'GET premios por categoria', res);
      }
    }
  );

  // GET /:id - Obtener premio por ID (PÚBLICO)
  router.get('/:id',
    createLimiter(5, 200),
    validateParams(premioValidations.id),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /api/premios/${id}`);
        
        const [premios] = await pool.query(`SELECT * FROM premios WHERE id = ?`, [id]);
        
        if (premios.length === 0) {
          return res.status(404).json({ success: false, message: 'Premio no encontrado' });
        }
        
        res.json({ success: true, premio: premios[0] });
      } catch (error) {
        handleError(error, `GET premio ${req.params.id}`, res);
      }
    }
  );

  // POST / - Crear nuevo premio (SOLO ADMIN)
  router.post('/',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    upload.single('imagen'),
    optimizeImage,
    validate(premioValidations.create),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /api/premios - Admin:', req.user.id);
        await connection.beginTransaction();
        
        const { nombre, categoria, puntos, descripcion, stock, fechaVencimiento, disponible } = req.body;
        
        const fechaVencimientoFormateada = formatDate(fechaVencimiento);
        let imagenRuta = null;
        
        if (req.file) {
          imagenRuta = `/img-premios/${req.file.filename}`;
        }
        
        // Normalizar disponible
        const disponibleNormalizado = normalizeBoolean(disponible) ? 1 : 0;
        
        const [result] = await connection.query(
          `INSERT INTO premios 
           (nombre, categoria, puntos, descripcion, stock, fechaVencimiento, disponible, imagen, vecesCanjeado, fechaRegistro) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
          [nombre, categoria, puntos, descripcion, stock || 1, fechaVencimientoFormateada, disponibleNormalizado, imagenRuta]
        );
        
        await connection.commit();
        
        clearPremiosCache();
        
        // ✅ Emitir evento Socket.IO
        const nuevoPremio = {
          id: result.insertId,
          nombre,
          categoria,
          puntos,
          descripcion,
          stock: stock || 1,
          fechaVencimiento: fechaVencimientoFormateada,
          disponible: disponibleNormalizado === 1,
          imagen: imagenRuta,
          vecesCanjeado: 0
        };
        emitPremioEvent(io, 'premio_creado', nuevoPremio);
        
        logger.info(`Premio creado: ID ${result.insertId} por admin ${req.user.id}`);
        
        res.status(201).json({
          success: true,
          message: 'Premio creado exitosamente',
          id: result.insertId,
          imagen: imagenRuta
        });
        
      } catch (error) {
        await connection.rollback();
        if (req.file) deleteImageFile(req.file.path);
        handleError(error, 'POST premio', res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /:id - Actualizar premio (SOLO ADMIN)
  router.put('/:id',
    authenticate,
    authorizeAdmin,
    createLimiter(1, 30),
    upload.single('imagen'),
    optimizeImage,
    validateParams(premioValidations.id),
    validate(premioValidations.update),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`PUT /api/premios/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { nombre, categoria, puntos, descripcion, stock, fechaVencimiento, disponible, vecesCanjeado } = req.body;
        
        const [existing] = await connection.query('SELECT * FROM premios WHERE id = ?', [id]);
        
        if (existing.length === 0) {
          if (req.file) deleteImageFile(req.file.path);
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Premio no encontrado' });
        }
        
        // Construir query dinámica
        const updateFields = [];
        const values = [];
        
        // Solo agregar campos que vienen en la petición
        if (nombre !== undefined && nombre !== '') {
          updateFields.push('nombre = ?');
          values.push(nombre);
        }
        
        if (categoria !== undefined && categoria !== '') {
          updateFields.push('categoria = ?');
          values.push(categoria);
        }
        
        if (puntos !== undefined && puntos !== '') {
          updateFields.push('puntos = ?');
          values.push(parseInt(puntos));
        }
        
        if (descripcion !== undefined && descripcion !== '') {
          updateFields.push('descripcion = ?');
          values.push(descripcion);
        }
        
        if (stock !== undefined && stock !== '') {
          updateFields.push('stock = ?');
          values.push(parseInt(stock));
        }
        
        if (vecesCanjeado !== undefined && vecesCanjeado !== '') {
          updateFields.push('vecesCanjeado = ?');
          values.push(parseInt(vecesCanjeado));
        }
        
        if (fechaVencimiento !== undefined) {
          const fechaFormateada = formatDate(fechaVencimiento);
          if (fechaFormateada) {
            updateFields.push('fechaVencimiento = ?');
            values.push(fechaFormateada);
          } else {
            updateFields.push('fechaVencimiento = ?');
            values.push(null);
          }
        }
        
        // Normalizar disponible
        if (disponible !== undefined) {
          updateFields.push('disponible = ?');
          const disponibleNormalizado = normalizeBoolean(disponible) ? 1 : 0;
          values.push(disponibleNormalizado);
        }
        
        // Manejar nueva imagen
        if (req.file) {
          if (existing[0].imagen) {
            deleteImageFile(existing[0].imagen);
          }
          const imagenRuta = `/img-premios/${req.file.filename}`;
          updateFields.push('imagen = ?');
          values.push(imagenRuta);
        }
        
        if (updateFields.length > 0) {
          values.push(id);
          await connection.query(
            `UPDATE premios SET ${updateFields.join(', ')} WHERE id = ?`,
            values
          );
        }
        
        await connection.commit();
        
        clearPremiosCache();
        
        // ✅ Emitir evento Socket.IO
        const [premioActualizado] = await pool.query('SELECT * FROM premios WHERE id = ?', [id]);
        if (premioActualizado.length > 0) {
          emitPremioEvent(io, 'premio_actualizado', premioActualizado[0]);
        }
        
        logger.info(`Premio actualizado: ID ${id} por admin ${req.user.id}`);
        
        res.json({ success: true, message: 'Premio actualizado exitosamente' });
        
      } catch (error) {
        await connection.rollback();
        if (req.file) deleteImageFile(req.file.path);
        handleError(error, `PUT premio ${req.params.id}`, res);
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
    validateParams(premioValidations.id),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info(`DELETE /api/premios/${req.params.id} - Admin:`, req.user.id);
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        const [existing] = await connection.query(
          'SELECT * FROM premios WHERE id = ?',
          [id]
        );
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Premio no encontrado' });
        }
        
        await connection.query(
          'UPDATE premios SET disponible = 0, stock = 0 WHERE id = ?',
          [id]
        );
        
        await connection.commit();
        
        clearPremiosCache();
        
        // ✅ Emitir evento Socket.IO
        emitPremioEvent(io, 'premio_eliminado', { id: parseInt(id) });
        
        logger.info(`Premio desactivado (soft delete): ID ${id} por admin ${req.user.id}`);
        
        res.json({ success: true, message: 'Premio eliminado exitosamente' });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, `DELETE premio ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};