const express = require('express');
const router = express.Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const xss = require('xss');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// ============================================
// CONFIGURACIÓN DE IMÁGENES
// ============================================

const UPLOAD_DIR_EMPRENDIMIENTOS = process.env.UPLOAD_DIR_EMPRENDIMIENTOS || path.join(__dirname, '../../img-emprendimientos');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// Asegurar que el directorio existe
if (!fs.existsSync(UPLOAD_DIR_EMPRENDIMIENTOS)) {
  fs.mkdirSync(UPLOAD_DIR_EMPRENDIMIENTOS, { recursive: true });
}

// Configuración de multer para almacenamiento de imágenes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR_EMPRENDIMIENTOS);
  },
  filename: (req, file, cb) => {
    const sanitizedName = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${sanitizedName}${ext}`);
  }
});

const uploadImage = multer({
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
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(optimizedPath);
    
    fs.unlinkSync(filePath);
    req.file.path = optimizedPath;
    req.file.filename = path.basename(optimizedPath);
    req.file.mimetype = 'image/webp';
    
    next();
  } catch (error) {
    logger.error('Error optimizando imagen de emprendimiento:', error);
    next();
  }
};

// Función para eliminar archivo de imagen
const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  
  const fullPath = path.join(UPLOAD_DIR_EMPRENDIMIENTOS, path.basename(imagePath));
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      logger.info(`Imagen de emprendimiento eliminada: ${fullPath}`);
    } catch (err) {
      logger.error(`Error eliminando imagen ${fullPath}:`, err);
    }
  }
};

// ============================================
// MIDDLEWARES Y CONFIGURACIÓN
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

// Middleware de autorización por roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      logger.warn(`Acceso denegado: ${req.user?.rol} intentó acceder a ${req.path}`);
      return res.status(403).json({ 
        success: false, 
        message: `Permisos insuficientes. Se requiere rol: ${roles.join(' o ')}` 
      });
    }
    next();
  };
};

// Sanitización de inputs
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key]);
      }
    });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI (CORREGIDO)
// ============================================

const emprendimientoValidation = {
  create: Joi.object({
    nombre: Joi.string().min(3).max(100).required().trim(),
    categoria: Joi.string().min(2).max(50).required().trim(),
    ubicacion: Joi.string().min(5).max(200).required().trim(),
    ciudad: Joi.string().min(2).max(50).required().trim(),
    horario: Joi.string().max(100).allow(null, '').optional(),
    whatsapp: Joi.string().max(200).allow(null, '').optional(),
    instagram: Joi.string().max(200).allow(null, '').optional(),
    tiktok: Joi.string().max(200).allow(null, '').optional(),
    logo: Joi.string().max(255).allow(null, '').optional(),
    propietario_id: Joi.number().integer().positive().required()
  }),
  
  update: Joi.object({
    nombre: Joi.string().min(3).max(100).optional().trim(),
    categoria: Joi.string().min(2).max(50).optional().trim(),
    ubicacion: Joi.string().min(5).max(200).optional().trim(),
    ciudad: Joi.string().min(2).max(50).optional().trim(),
    horario: Joi.string().max(100).allow(null, '').optional(),
    whatsapp: Joi.string().max(200).allow(null, '').optional(),
    instagram: Joi.string().max(200).allow(null, '').optional(),
    tiktok: Joi.string().max(200).allow(null, '').optional(),
    // ✅ CORRECCIÓN: Permitir null, string vacío, espacios, cualquier string
    logo: Joi.string().allow(null, '', ' ').optional(),
    propietario_id: Joi.number().integer().positive().optional(),
    // ✅ CORRECCIÓN: Aceptar tanto boolean como number (0/1)
    activo: Joi.alternatives().try(
      Joi.boolean(),
      Joi.number().valid(0, 1)
    ).optional()
  }).min(1),
  
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  })
};

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property]);
    if (error) {
      logger.warn(`Validation error: ${error.details[0].message}`);
      return res.status(400).json({ 
        success: false, 
        message: error.details[0].message 
      });
    }
    next();
  };
};

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

const handleDatabaseError = (error, context, res) => {
  logger.error(`Database error in ${context}:`, {
    message: error.message,
    code: error.code,
    stack: error.stack
  });
  
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Registro duplicado' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ success: false, message: 'Referencia inválida' });
  }
  
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// Función para emitir eventos Socket.IO
const emitSocketEvent = (io, event, data, rooms = []) => {
  if (!io) return;
  
  if (rooms.length === 0) {
    io.emit(event, data);
  } else {
    rooms.forEach(room => {
      io.to(room).emit(event, data);
    });
  }
  logger.info(`📡 Evento Socket.IO emitido: ${event}`, { rooms, data });
};

// Limpiar cache de emprendimientos
const clearEmprendimientosCache = (id = null) => {
  cache.del('emprendimientos_list');
  if (id) {
    cache.del(`emprendimiento_${id}`);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool) => {
  
  // GET / - Listar emprendimientos con paginación, filtros y cache
  router.get('/', 
    createLimiter(5, 200),
    async (req, res) => {
      try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;
        
        const { categoria, ciudad, search } = req.query;
        let filters = [];
        let params = [];
        
        if (categoria) {
          filters.push('e.categoria = ?');
          params.push(categoria);
        }
        if (ciudad) {
          filters.push('e.ciudad = ?');
          params.push(ciudad);
        }
        if (search) {
          filters.push('(e.nombre LIKE ? OR e.ubicacion LIKE ?)');
          params.push(`%${search}%`, `%${search}%`);
        }
        
        const whereClause = filters.length > 0 
          ? `WHERE e.activo = 1 AND ${filters.join(' AND ')}`
          : 'WHERE e.activo = 1';
        
        const countQuery = `
          SELECT COUNT(*) as total 
          FROM emprendimientos e
          LEFT JOIN user u ON e.propietario_id = u.id
          ${whereClause}
        `;
        
        const [[{ total }]] = await pool.query(countQuery, params);
        
        if (total === 0) {
          return res.json({
            success: true,
            data: [],
            pagination: { page, limit, total, pages: 0 }
          });
        }
        
        const dataQuery = `
          SELECT e.*, u.usuario as propietario_nombre, u.rol as propietario_rol
          FROM emprendimientos e
          LEFT JOIN user u ON e.propietario_id = u.id
          ${whereClause}
          ORDER BY e.id DESC
          LIMIT ? OFFSET ?
        `;
        
        const [emprendimientos] = await pool.query(dataQuery, [...params, limit, offset]);
        
        res.json({
          success: true,
          data: emprendimientos,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        });
        
      } catch (error) {
        handleDatabaseError(error, 'GET /emprendimientos', res);
      }
    }
  );
  
  // GET /:id - Obtener por ID con cache
  router.get('/:id',
    createLimiter(5, 300),
    validate(emprendimientoValidation.id, 'params'),
    async (req, res) => {
      try {
        const { id } = req.params;
        
        const cacheKey = `emprendimiento_${id}`;
        const cached = cache.get(cacheKey);
        if (cached) {
          return res.json({ success: true, data: cached });
        }
        
        const [emprendimientos] = await pool.query(`
          SELECT e.*, u.usuario as propietario_nombre, u.rol as propietario_rol
          FROM emprendimientos e
          LEFT JOIN user u ON e.propietario_id = u.id
          WHERE e.id = ? AND e.activo = 1
        `, [id]);
        
        if (emprendimientos.length === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'Emprendimiento no encontrado' 
          });
        }
        
        cache.put(cacheKey, emprendimientos[0], 5 * 60 * 1000);
        
        res.json({
          success: true,
          data: emprendimientos[0]
        });
        
      } catch (error) {
        handleDatabaseError(error, `GET /emprendimientos/${req.params.id}`, res);
      }
    }
  );
  
  // POST / - Crear emprendimiento (SOLO ADMIN y COLAB) CON IMAGEN
  router.post('/',
    authenticate,
    authorize('admin', 'colab'),
    uploadImage.single('logo_imagen'),
    optimizeImage,
    sanitizeInput,
    createLimiter(1, 50),
    validate(emprendimientoValidation.create),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const { 
          nombre, categoria, ubicacion, ciudad, horario, 
          whatsapp, instagram, tiktok, logo, 
          propietario_id 
        } = req.body;
        
        const [propietario] = await connection.query(
          'SELECT id, rol FROM user WHERE id = ? AND activo = 1',
          [propietario_id]
        );
        
        if (propietario.length === 0) {
          await connection.rollback();
          if (req.file) deleteImageFile(req.file.path);
          return res.status(400).json({ 
            success: false, 
            message: 'Propietario no encontrado o inactivo' 
          });
        }
        
        if (!['admin', 'colab'].includes(propietario[0].rol)) {
          await connection.rollback();
          if (req.file) deleteImageFile(req.file.path);
          return res.status(403).json({ 
            success: false, 
            message: 'Solo administradores y colaboradores pueden ser propietarios' 
          });
        }
        
        if (req.user.rol === 'colab' && req.user.id !== propietario_id) {
          await connection.rollback();
          if (req.file) deleteImageFile(req.file.path);
          return res.status(403).json({ 
            success: false, 
            message: 'No puedes asignar otro propietario' 
          });
        }
        
        let logoImagenRuta = null;
        if (req.file) {
          logoImagenRuta = `/img-emprendimientos/${req.file.filename}`;
        }
        
        const [result] = await connection.query(
          `INSERT INTO emprendimientos 
           (nombre, categoria, ubicacion, ciudad, horario, whatsapp, instagram, 
            tiktok, logo, logo_imagen, propietario_id, fecha_registro, activo) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)`,
          [nombre, categoria, ubicacion, ciudad, horario || null, 
           whatsapp || null, instagram || null, tiktok || null, 
           logo || null, logoImagenRuta, propietario_id]
        );
        
        await connection.commit();
        
        logger.info(`Emprendimiento creado: ID ${result.insertId} por usuario ${req.user.id}`);
        
        clearEmprendimientosCache();
        
        // Socket.IO - Emitir evento de nuevo emprendimiento
        const io = req.app.get('io');
        const nuevoEmprendimiento = {
          id: result.insertId,
          nombre,
          categoria,
          ubicacion,
          ciudad,
          propietario_id,
          activo: 1,
          logo_imagen: logoImagenRuta
        };
        
        emitSocketEvent(io, 'nuevo_emprendimiento', nuevoEmprendimiento, ['admin', 'colab']);
        
        res.status(201).json({
          success: true,
          message: 'Emprendimiento creado exitosamente',
          data: { id: result.insertId, logo_imagen: logoImagenRuta }
        });
        
      } catch (error) {
        await connection.rollback();
        if (req.file) deleteImageFile(req.file.path);
        handleDatabaseError(error, 'POST /emprendimientos', res);
      } finally {
        connection.release();
      }
    }
  );
  
  // PUT /:id - Actualizar emprendimiento (SOLO ADMIN y COLAB) CON IMAGEN
  router.put('/:id',
    authenticate,
    authorize('admin', 'colab'),
    uploadImage.single('logo_imagen'),
    optimizeImage,
    sanitizeInput,
    createLimiter(1, 30),
    validate(emprendimientoValidation.id, 'params'),
    validate(emprendimientoValidation.update),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const updateData = { ...req.body };
        
        const [existing] = await connection.query(
          'SELECT * FROM emprendimientos WHERE id = ?',
          [id]
        );
        
        if (existing.length === 0) {
          await connection.rollback();
          if (req.file) deleteImageFile(req.file.path);
          return res.status(404).json({ 
            success: false, 
            message: 'Emprendimiento no encontrado' 
          });
        }
        
        const current = existing[0];
        
        if (req.user.rol === 'colab' && current.propietario_id !== req.user.id) {
          await connection.rollback();
          if (req.file) deleteImageFile(req.file.path);
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para editar este emprendimiento' 
          });
        }
        
        if (updateData.propietario_id && updateData.propietario_id !== current.propietario_id) {
          if (req.user.rol !== 'admin') {
            await connection.rollback();
            if (req.file) deleteImageFile(req.file.path);
            return res.status(403).json({ 
              success: false, 
              message: 'Solo administradores pueden cambiar el propietario' 
            });
          }
          
          const [propietario] = await connection.query(
            'SELECT id, rol FROM user WHERE id = ? AND activo = 1',
            [updateData.propietario_id]
          );
          
          if (propietario.length === 0) {
            await connection.rollback();
            if (req.file) deleteImageFile(req.file.path);
            return res.status(400).json({ 
              success: false, 
              message: 'Propietario no encontrado o inactivo' 
            });
          }
          
          if (!['admin', 'colab'].includes(propietario[0].rol)) {
            await connection.rollback();
            if (req.file) deleteImageFile(req.file.path);
            return res.status(403).json({ 
              success: false, 
              message: 'Solo administradores y colaboradores pueden ser propietarios' 
            });
          }
        }
        
        const allowedFields = ['nombre', 'categoria', 'ubicacion', 'ciudad', 'horario', 
                               'whatsapp', 'instagram', 'tiktok', 'logo', 
                               'propietario_id', 'activo'];
        
        const updateFields = [];
        const values = [];
        
        for (const field of allowedFields) {
          if (updateData[field] !== undefined) {
            updateFields.push(`${field} = ?`);
            // Convertir activo a número 0/1 si es necesario
            if (field === 'activo') {
              // Normalizar: boolean o number a 0/1
              let activoValue = 1;
              if (updateData[field] === false || updateData[field] === 0 || updateData[field] === '0') {
                activoValue = 0;
              } else if (updateData[field] === true || updateData[field] === 1 || updateData[field] === '1') {
                activoValue = 1;
              } else {
                activoValue = updateData[field] ? 1 : 0;
              }
              values.push(activoValue);
            } else {
              values.push(updateData[field] || null);
            }
          }
        }
        
        // Manejar nueva imagen
        if (req.file) {
          if (current.logo_imagen) {
            deleteImageFile(current.logo_imagen);
          }
          const logoImagenRuta = `/img-emprendimientos/${req.file.filename}`;
          updateFields.push('logo_imagen = ?');
          values.push(logoImagenRuta);
        }
        
        if (updateFields.length === 0) {
          await connection.rollback();
          if (req.file) deleteImageFile(req.file.path);
          return res.status(400).json({ 
            success: false, 
            message: 'No hay campos válidos para actualizar' 
          });
        }
        
        values.push(id);
        await connection.query(
          `UPDATE emprendimientos SET ${updateFields.join(', ')} WHERE id = ?`,
          values
        );
        
        await connection.commit();
        
        logger.info(`Emprendimiento actualizado: ID ${id} por usuario ${req.user.id}`);
        
        clearEmprendimientosCache(id);
        
        // Socket.IO - Emitir evento de emprendimiento actualizado
        const io = req.app.get('io');
        const [emprendimientoActualizado] = await pool.query(
          'SELECT * FROM emprendimientos WHERE id = ?',
          [id]
        );
        
        if (emprendimientoActualizado.length > 0) {
          emitSocketEvent(io, 'emprendimiento_actualizado', emprendimientoActualizado[0], [
            `emprendimiento_${id}`,
            'admin',
            `usuario_${current.propietario_id}`
          ]);
        }
        
        res.json({
          success: true,
          message: 'Emprendimiento actualizado exitosamente'
        });
        
      } catch (error) {
        await connection.rollback();
        if (req.file) deleteImageFile(req.file.path);
        handleDatabaseError(error, `PUT /emprendimientos/${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );
  
  // DELETE /:id - Soft delete (SOLO ADMIN y COLAB)
  router.delete('/:id',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(1, 20),
    validate(emprendimientoValidation.id, 'params'),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        const [existing] = await connection.query(
          'SELECT * FROM emprendimientos WHERE id = ? AND activo = 1',
          [id]
        );
        
        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ 
            success: false, 
            message: 'Emprendimiento no encontrado o ya eliminado' 
          });
        }
        
        const current = existing[0];
        
        if (req.user.rol === 'colab' && current.propietario_id !== req.user.id) {
          await connection.rollback();
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para eliminar este emprendimiento' 
          });
        }
        
        await connection.query(
          'UPDATE emprendimientos SET activo = 0 WHERE id = ?',
          [id]
        );
        
        await connection.commit();
        
        logger.warn(`Emprendimiento eliminado (soft): ID ${id} por usuario ${req.user.id}`);
        
        clearEmprendimientosCache(id);
        
        // Socket.IO - Emitir evento de emprendimiento eliminado
        const io = req.app.get('io');
        emitSocketEvent(io, 'emprendimiento_eliminado', { id: parseInt(id), activo: 0 }, [
          'admin',
          `emprendimiento_${id}`,
          `usuario_${current.propietario_id}`
        ]);
        
        res.json({
          success: true,
          message: 'Emprendimiento eliminado exitosamente'
        });
        
      } catch (error) {
        await connection.rollback();
        handleDatabaseError(error, `DELETE /emprendimientos/${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );
  
  return router;
};