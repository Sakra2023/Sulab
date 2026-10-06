const express = require('express');
const router = express.Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
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

// Autorización - solo admin y colaboradores
const authorizeProductos = (req, res, next) => {
  if (!req.user || !['admin', 'colab'].includes(req.user.rol)) {
    logger.warn(`Acceso denegado: ${req.user?.rol} intentó acceder a ${req.path}`);
    return res.status(403).json({ success: false, message: 'Permisos insuficientes' });
  }
  next();
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const productValidations = {
  create: Joi.object({
    emprendimiento_id: Joi.number().integer().positive().required(),
    usuario_id: Joi.number().integer().positive().required(),
    codigo: Joi.string().min(1).max(50).required(),
    nombre: Joi.string().min(1).max(100).required(),
    descripcion: Joi.string().max(500).allow(null).optional(),
    categoria: Joi.string().max(50).allow(null).optional(),
    precio_venta: Joi.number().positive().precision(2).required(),
    precio_compra: Joi.number().min(0).precision(2).default(0),
    stock: Joi.number().integer().min(0).default(0),
    stock_minimo: Joi.number().integer().min(0).default(5),
    unidad_medida: Joi.string().max(20).default('unidad'),
    proveedor: Joi.string().max(100).allow(null).optional(),
    iva: Joi.number().integer().min(0).max(100).default(16),
    activo: Joi.boolean().default(true),
    atributos: Joi.object().allow(null).optional()
  }),

  update: Joi.object({
    codigo: Joi.string().min(1).max(50).optional(),
    nombre: Joi.string().min(1).max(100).optional(),
    descripcion: Joi.string().max(500).allow(null).optional(),
    categoria: Joi.string().max(50).allow(null).optional(),
    precio_venta: Joi.number().positive().precision(2).optional(),
    precio_compra: Joi.number().min(0).precision(2).optional(),
    stock: Joi.number().integer().min(0).optional(),
    stock_minimo: Joi.number().integer().min(0).optional(),
    unidad_medida: Joi.string().max(20).optional(),
    proveedor: Joi.string().max(100).allow(null).optional(),
    iva: Joi.number().integer().min(0).max(100).optional(),
    activo: Joi.boolean().optional(),
    atributos: Joi.object().allow(null).optional()
  }).min(1),

  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
  }),

  emprendimientoIdParam: Joi.object({
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
    return res.status(409).json({ success: false, message: 'El código del producto ya existe' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ success: false, message: 'Emprendimiento no encontrado' });
  }

  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// Cache keys
const CACHE_KEYS = {
  PRODUCTOS_PREFIX: 'productos_emprendimiento_'
};

const clearProductosCache = (emprendimientoId) => {
  cache.del(`${CACHE_KEYS.PRODUCTOS_PREFIX}${emprendimientoId}`);
};

// Verificar que el usuario tenga permiso sobre el emprendimiento
const verifyEmprendimientoPermission = async (connection, emprendimientoId, usuarioId, userRol) => {
  if (userRol === 'admin') return true;
  
  const [emprendimiento] = await connection.query(
    'SELECT propietario_id FROM emprendimientos WHERE id = ? AND activo = 1',
    [emprendimientoId]
  );
  
  if (emprendimiento.length === 0) return false;
  return emprendimiento[0].propietario_id === usuarioId;
};

// ============================================
// FUNCIÓN PARA EMITIR EVENTOS DE SOCKET.IO
// ============================================

const emitirEventosInventario = (io, evento, datos) => {
  if (!io) return;

  try {
    // Emitir a la sala del emprendimiento específico
    if (datos.emprendimiento_id) {
      io.to(`emprendimiento_${datos.emprendimiento_id}`).emit(evento, {
        ...datos,
        timestamp: new Date().toISOString()
      });
      logger.info(`📡 Evento ${evento} emitido para emprendimiento ${datos.emprendimiento_id}`);
    }

    // También emitir globalmente para administradores
    io.emit(`inventario_${evento}`, {
      ...datos,
      timestamp: new Date().toISOString()
    });
  } catch (socketError) {
    logger.error('Error emitiendo evento de inventario:', socketError);
  }
};

// ============================================
// ENDPOINTS
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;

  // GET /emprendimiento/:id - Obtener productos por emprendimiento
  router.get('/emprendimiento/:id',
    authenticate,
    authorizeProductos,
    createLimiter(5, 100),
    validateParams(productValidations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /productos/emprendimiento/${id} - User: ${req.user.id}`);

        // Intentar obtener del caché
        const cacheKey = `${CACHE_KEYS.PRODUCTOS_PREFIX}${id}`;
        let productos = cache.get(cacheKey);

        if (!productos) {
          const [results] = await pool.query(`
            SELECT p.*, e.nombre as emprendimiento_nombre
            FROM productos p
            JOIN emprendimientos e ON p.emprendimiento_id = e.id
            WHERE p.emprendimiento_id = ?
            ORDER BY p.id DESC
          `, [id]);
          
          productos = results;
          cache.put(cacheKey, productos, 5 * 60 * 1000); // Cache 5 minutos
        }

        res.json({ success: true, productos });
      } catch (error) {
        handleError(error, `GET productos/emprendimiento/${req.params.id}`, res);
      }
    }
  );

  // GET /buscar - Buscar productos por emprendimiento y query
  router.get('/buscar',
    authenticate,
    authorizeProductos,
    createLimiter(10, 200),
    async (req, res) => {
      try {
        const { emprendimiento_id, query } = req.query;
        
        if (!emprendimiento_id) {
          return res.status(400).json({ success: false, message: 'emprendimiento_id es requerido' });
        }
        
        if (!query || query.length < 2) {
          return res.json({ success: true, productos: [] });
        }
        
        logger.info(`GET /productos/buscar - Emprendimiento: ${emprendimiento_id}, Query: ${query} - User: ${req.user.id}`);
        
        const [productos] = await pool.query(
          `SELECT id, codigo, nombre, precio_venta, stock, categoria, atributos
           FROM productos 
           WHERE emprendimiento_id = ? AND activo = 1 
           AND (nombre LIKE ? OR codigo LIKE ?)
           LIMIT 10`,
          [emprendimiento_id, `%${query}%`, `%${query}%`]
        );
        
        // Parsear atributos si es necesario
        const productosParseados = productos.map(p => ({
          ...p,
          atributos: p.atributos ? (typeof p.atributos === 'string' ? JSON.parse(p.atributos) : p.atributos) : {}
        }));
        
        res.json({ success: true, productos: productosParseados });
      } catch (error) {
        handleError(error, 'GET buscar productos', res);
      }
    }
  );

  // POST / - Crear producto
  router.post('/',
    authenticate,
    authorizeProductos,
    createLimiter(1, 50),
    validate(productValidations.create),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        logger.info(`POST /productos - User: ${req.user.id}`);
        await connection.beginTransaction();

        const { 
          emprendimiento_id, usuario_id, codigo, nombre, descripcion, 
          categoria, precio_venta, precio_compra, stock, stock_minimo, unidad_medida, 
          proveedor, iva, activo, atributos 
        } = req.body;

        // Verificar permisos del usuario sobre el emprendimiento
        const hasPermission = await verifyEmprendimientoPermission(
          connection, emprendimiento_id, usuario_id, req.user.rol
        );
        
        if (!hasPermission && req.user.rol !== 'admin') {
          await connection.rollback();
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para crear productos en este emprendimiento' 
          });
        }

        // Verificar emprendimiento
        const [emprendimiento] = await connection.query(
          'SELECT id FROM emprendimientos WHERE id = ? AND activo = 1',
          [emprendimiento_id]
        );

        if (emprendimiento.length === 0) {
          await connection.rollback();
          return res.status(404).json({ 
            success: false, 
            message: 'Emprendimiento no encontrado' 
          });
        }

        // Verificar código único
        const [existente] = await connection.query(
          'SELECT id FROM productos WHERE codigo = ?',
          [codigo]
        );

        if (existente.length > 0) {
          await connection.rollback();
          return res.status(400).json({ 
            success: false, 
            message: 'El código ya existe' 
          });
        }

        const [result] = await connection.query(
          `INSERT INTO productos 
           (emprendimiento_id, usuario_id, codigo, nombre, descripcion, categoria, 
            precio_venta, precio_compra, stock, stock_minimo, unidad_medida, proveedor, iva, activo, atributos) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [emprendimiento_id, usuario_id, codigo, nombre, descripcion || null, categoria || null,
           precio_venta, precio_compra, stock, stock_minimo, unidad_medida, 
           proveedor || null, iva, activo ? 1 : 0, atributos ? JSON.stringify(atributos) : null]
        );

        await connection.commit();

        // Limpiar caché
        clearProductosCache(emprendimiento_id);

        logger.info(`Producto creado: ID ${result.insertId} - Código: ${codigo} por usuario ${req.user.id}`);

        // ✅ EMITIR EVENTO DE SOCKET.IO
        emitirEventosInventario(io, 'producto_creado', {
          producto_id: result.insertId,
          emprendimiento_id: emprendimiento_id,
          codigo: codigo,
          nombre: nombre,
          stock: stock,
          precio_venta: precio_venta,
          usuario_id: req.user.id,
          usuario: req.user.usuario
        });

        res.status(201).json({
          success: true,
          message: 'Producto creado exitosamente',
          id: result.insertId
        });

      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST producto', res);
      } finally {
        connection.release();
      }
    }
  );

  // PUT /:id - Actualizar producto
  router.put('/:id',
    authenticate,
    authorizeProductos,
    createLimiter(1, 30),
    validateParams(productValidations.idParam),
    validate(productValidations.update),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        const { id } = req.params;
        logger.info(`PUT /productos/${id} - User: ${req.user.id}`);
        await connection.beginTransaction();

        const [existing] = await connection.query(
          'SELECT * FROM productos WHERE id = ?',
          [id]
        );

        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }

        const productoActual = existing[0];

        // Verificar permisos
        const hasPermission = await verifyEmprendimientoPermission(
          connection, productoActual.emprendimiento_id, productoActual.usuario_id, req.user.rol
        );

        if (!hasPermission && req.user.rol !== 'admin') {
          await connection.rollback();
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para modificar este producto' 
          });
        }

        const updates = req.body;

        // Si actualiza código, verificar unicidad
        if (updates.codigo && updates.codigo !== productoActual.codigo) {
          const [duplicado] = await connection.query(
            'SELECT id FROM productos WHERE codigo = ? AND id != ?',
            [updates.codigo, id]
          );
          if (duplicado.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'El código ya existe' });
          }
        }

        const updateFields = [];
        const values = [];

        const allowedFields = ['codigo', 'nombre', 'descripcion', 'categoria', 'precio_venta', 'precio_compra',
                                'stock', 'stock_minimo', 'unidad_medida', 'proveedor', 'iva', 'activo', 'atributos'];

        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            updateFields.push(`${field} = ?`);
            if (field === 'atributos' && updates[field]) {
              values.push(JSON.stringify(updates[field]));
            } else if (field === 'activo') {
              values.push(updates[field] ? 1 : 0);
            } else {
              values.push(updates[field]);
            }
          }
        }

        if (updateFields.length > 0) {
          values.push(id);
          await connection.query(
            `UPDATE productos SET ${updateFields.join(', ')} WHERE id = ?`,
            values
          );
        }

        await connection.commit();

        // Limpiar caché
        clearProductosCache(productoActual.emprendimiento_id);

        logger.info(`Producto ${id} actualizado por usuario ${req.user.id}`);

        // ✅ EMITIR EVENTO DE SOCKET.IO
        emitirEventosInventario(io, 'producto_actualizado', {
          producto_id: id,
          emprendimiento_id: productoActual.emprendimiento_id,
          codigo: updates.codigo || productoActual.codigo,
          nombre: updates.nombre || productoActual.nombre,
          stock: updates.stock !== undefined ? updates.stock : productoActual.stock,
          precio_venta: updates.precio_venta || productoActual.precio_venta,
          usuario_id: req.user.id,
          usuario: req.user.usuario,
          cambios: Object.keys(updates)
        });

        res.json({ success: true, message: 'Producto actualizado exitosamente' });

      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT producto ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // DELETE /:id - Soft Delete producto
  router.delete('/:id',
    authenticate,
    authorizeProductos,
    createLimiter(1, 20),
    validateParams(productValidations.idParam),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        const { id } = req.params;
        logger.info(`DELETE /productos/${id} - User: ${req.user.id}`);
        await connection.beginTransaction();

        const [existing] = await connection.query(
          'SELECT * FROM productos WHERE id = ?',
          [id]
        );

        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }

        const productoActual = existing[0];

        // Verificar permisos
        const hasPermission = await verifyEmprendimientoPermission(
          connection, productoActual.emprendimiento_id, productoActual.usuario_id, req.user.rol
        );

        if (!hasPermission && req.user.rol !== 'admin') {
          await connection.rollback();
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para eliminar este producto' 
          });
        }

        await connection.query('UPDATE productos SET activo = 0 WHERE id = ?', [id]);

        await connection.commit();

        // Limpiar caché
        clearProductosCache(productoActual.emprendimiento_id);

        logger.info(`Producto ${id} desactivado (soft delete) por usuario ${req.user.id}`);

        // ✅ EMITIR EVENTO DE SOCKET.IO
        emitirEventosInventario(io, 'producto_eliminado', {
          producto_id: id,
          emprendimiento_id: productoActual.emprendimiento_id,
          codigo: productoActual.codigo,
          nombre: productoActual.nombre,
          usuario_id: req.user.id,
          usuario: req.user.usuario
        });

        res.json({ success: true, message: 'Producto eliminado exitosamente' });

      } catch (error) {
        await connection.rollback();
        handleError(error, `DELETE producto ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // ✅ NUEVO ENDPOINT: PATCH /:id/stock - Actualizar stock específico
  router.patch('/:id/stock',
    authenticate,
    authorizeProductos,
    createLimiter(1, 30),
    validateParams(productValidations.idParam),
    async (req, res) => {
      const connection = await pool.getConnection();

      try {
        const { id } = req.params;
        const { stock } = req.body;

        if (stock === undefined || stock === null || stock < 0) {
          await connection.release();
          return res.status(400).json({ 
            success: false, 
            message: 'El stock es requerido y debe ser mayor o igual a 0' 
          });
        }

        logger.info(`PATCH /productos/${id}/stock - User: ${req.user.id}, Nuevo stock: ${stock}`);
        await connection.beginTransaction();

        const [existing] = await connection.query(
          'SELECT * FROM productos WHERE id = ?',
          [id]
        );

        if (existing.length === 0) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }

        const productoActual = existing[0];

        // Verificar permisos
        const hasPermission = await verifyEmprendimientoPermission(
          connection, productoActual.emprendimiento_id, productoActual.usuario_id, req.user.rol
        );

        if (!hasPermission && req.user.rol !== 'admin') {
          await connection.rollback();
          return res.status(403).json({ 
            success: false, 
            message: 'No tienes permiso para modificar este producto' 
          });
        }

        const stockAnterior = productoActual.stock;

        await connection.query(
          'UPDATE productos SET stock = ? WHERE id = ?',
          [stock, id]
        );

        await connection.commit();

        // Limpiar caché
        clearProductosCache(productoActual.emprendimiento_id);

        logger.info(`Stock de producto ${id} actualizado: ${stockAnterior} → ${stock} por usuario ${req.user.id}`);

        // ✅ EMITIR EVENTO DE SOCKET.IO
        emitirEventosInventario(io, 'stock_actualizado', {
          producto_id: id,
          emprendimiento_id: productoActual.emprendimiento_id,
          codigo: productoActual.codigo,
          nombre: productoActual.nombre,
          stock_anterior: stockAnterior,
          stock_nuevo: stock,
          usuario_id: req.user.id,
          usuario: req.user.usuario
        });

        res.json({ 
          success: true, 
          message: 'Stock actualizado exitosamente',
          stock_anterior: stockAnterior,
          stock_nuevo: stock
        });

      } catch (error) {
        await connection.rollback();
        handleError(error, `PATCH stock producto ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  return router;
};