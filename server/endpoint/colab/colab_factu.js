const express = require('express');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const cache = require('memory-cache');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const router = express.Router();

// ============================================
// CONFIGURACIÓN
// ============================================

// Variable global para Socket.IO
let io = null;

// Carpeta para PDFs
const pdfDir = path.join(process.cwd(), 'facturas_pdf');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

// Pool de navegadores para Puppeteer (reutilizar)
let browserPool = null;
let browserPoolUsage = 0;
const BROWSER_POOL_MAX = 10;

const getBrowser = async () => {
  if (!browserPool) {
    browserPool = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  browserPoolUsage++;
  return browserPool;
};

const closeBrowser = async () => {
  if (browserPool && browserPoolUsage === 0) {
    await browserPool.close();
    browserPool = null;
  }
};

// ============================================
// 📧 CONFIGURACIÓN DE EMAIL (CORREGIDO)
// ============================================

// Obtener credenciales con fallback
const emailUser = process.env.EMAIL_USER || process.env.SMTP_USERNAME;
const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
const emailHost = process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
const emailPort = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587;
const emailSecure = process.env.EMAIL_SECURE === 'true' || process.env.SMTP_SECURE === 'true';

// Configuración de nodemailer (validada)
const transporter = nodemailer.createTransport({
  host: emailHost,
  port: emailPort,
  secure: emailSecure,
  auth: {
    user: emailUser,
    pass: emailPass
  }
});

// Verificar conexión de email al inicio
if (emailUser && emailPass) {
  transporter.verify((error, success) => {
    if (error) {
      logger.error('Error de configuración de email:', error);
    } else {
      logger.info('✅ Email service ready');
    }
  });
} else {
  logger.warn('⚠️ Email no configurado. Las variables EMAIL_USER/EMAIL_PASS o SMTP_USERNAME/SMTP_PASSWORD no están definidas.');
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

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN CORREGIDO
// ============================================
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

// Autorización por roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      logger.warn(`Acceso denegado: ${req.user?.rol} intentó acceder a ${req.path}`);
      return res.status(403).json({ success: false, message: 'Permisos insuficientes' });
    }
    next();
  };
};

// ============================================
// VALIDACIONES CON JOI
// ============================================

const validations = {
  factura: Joi.object({
    emprendimiento_id: Joi.number().integer().positive().required(),
    usuario_id: Joi.number().integer().positive().required(),
    numero: Joi.string().max(50).required(),
    fecha: Joi.date().iso().required(),
    hora: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    cliente: Joi.string().max(100).allow(null).optional(),
    clienteDireccion: Joi.string().max(200).allow(null).optional(),
    clienteEmail: Joi.string().email().max(100).allow(null).optional(),
    clienteTelefono: Joi.string().pattern(/^[0-9+\-\s]{8,20}$/).allow(null).optional(),
    items: Joi.array().items(Joi.object({
      productoId: Joi.number().integer().positive().required(),
      codigo: Joi.string().max(50).required(),
      nombre: Joi.string().max(100).required(),
      precio: Joi.number().positive().required(),
      cantidad: Joi.number().integer().min(1).required(),
      subtotal: Joi.number().positive().required()
    })).min(1).required(),
    subtotal: Joi.number().positive().required(),
    impuesto: Joi.number().min(0).required(),
    total: Joi.number().positive().required(),
    metodoPago: Joi.string().valid('efectivo', 'tarjeta', 'transferencia').required(),
    pagoRecibido: Joi.number().min(0).optional(),
    vuelto: Joi.number().min(0).optional(),
    referencia: Joi.string().max(100).allow(null).optional(),
    estado: Joi.string().valid('pendiente', 'completado', 'cancelado').default('completado'),
    comanda_id: Joi.number().integer().positive().allow(null).optional()
  }),

  comanda: Joi.object({
    emprendimiento_id: Joi.number().integer().positive().required(),
    nombre: Joi.string().max(100).required(),
    cliente_id: Joi.number().integer().positive().allow(null).optional(),
    cliente_nombre: Joi.string().max(100).allow(null).optional(),
    cliente_telefono: Joi.string().pattern(/^[0-9+\-\s]{8,20}$/).allow(null).optional(),
    cliente_direccion: Joi.string().max(200).allow(null).optional(),
    items: Joi.array().items(Joi.object({
      productoId: Joi.number().integer().positive().required(),
      nombre: Joi.string().max(100).required(),
      precio: Joi.number().positive().required(),
      cantidad: Joi.number().integer().min(1).required(),
      subtotal: Joi.number().positive().required()
    })).min(1).required(),
    subtotal: Joi.number().positive().required(),
    impuesto: Joi.number().min(0).required(),
    total: Joi.number().positive().required()
  }),

  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
  }),

  emprendimientoIdParam: Joi.object({
    emprendimientoId: Joi.number().integer().positive().required()
  }),

  rolParam: Joi.object({
    rol: Joi.string().valid('admin', 'colab', 'usuario').required()
  }),

  stockUpdate: Joi.object({
    stock: Joi.number().integer().min(0).required()
  }),

  puntosUpdate: Joi.object({
    puntos: Joi.number().integer().min(0).required()
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
    return res.status(409).json({ success: false, message: 'Registro duplicado' });
  }
  if (error.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ success: false, message: 'Referencia inválida' });
  }
  
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

const formatearMonedaHelper = (monto) => {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(monto);
};

// Función para inicializar Socket.IO
const initSocket = (socketIO) => {
  io = socketIO;
  logger.info('Socket.IO inicializado en facturas router');
};

// ============================================
// FUNCIONES DE NEGOCIO
// ============================================

const generarHTMLFactura = (factura, datosCliente, numeroFactura, emprendimiento) => {
  const fechaActual = new Date(factura.fecha).toLocaleDateString('es-EC');
  const horaActual = factura.hora || new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  
  const formatearMoneda = (monto) => {
    return new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(monto);
  };

  const nombreTienda = emprendimiento?.nombre || 'MI TIENDA';
  const ubicacion = emprendimiento?.ubicacion || 'Dirección no registrada';
  const ciudad = emprendimiento?.ciudad || '';
  const telefono = emprendimiento?.telefono || emprendimiento?.whatsapp || 'Teléfono no registrado';
  const direccionCompleta = ciudad ? `${ubicacion}, ${ciudad}` : ubicacion;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Comprobante de Venta ${numeroFactura}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .factura-container { max-width: 800px; margin: 0 auto; background: white; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .tienda-nombre { font-size: 24px; font-weight: bold; color: #333; }
        .tienda-info { font-size: 12px; color: #666; margin-top: 5px; }
        .factura-titulo { font-size: 20px; font-weight: bold; margin: 20px 0 5px 0; }
        .factura-numero { font-size: 16px; color: #666; margin-bottom: 20px; }
        .datos-cliente { margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
        .tabla-productos { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .tabla-productos th, .tabla-productos td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .tabla-productos th { background-color: #f2f2f2; }
        .totales { text-align: right; margin-top: 20px; }
        .total-final { font-size: 18px; font-weight: bold; color: #d32f2f; }
        .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="factura-container">
        <div class="header">
          <div class="tienda-nombre">${nombreTienda}</div>
          <div class="tienda-info">${direccionCompleta}</div>
          <div class="tienda-info">Tel: ${telefono}</div>
        </div>
        
        <div class="factura-titulo">COMPROBANTE DE VENTA</div>
        <div class="factura-numero">N°: ${numeroFactura}</div>
        
        <div class="datos-cliente">
          <strong>Cliente:</strong> ${datosCliente?.nombre || 'Consumidor Final'}<br>
          ${datosCliente?.direccion ? `<strong>Dirección:</strong> ${datosCliente.direccion}<br>` : ''}
          ${datosCliente?.telefono ? `<strong>Teléfono:</strong> ${datosCliente.telefono}<br>` : ''}
          <strong>Fecha:</strong> ${fechaActual} - ${horaActual}
        </div>
        
        <table class="tabla-productos">
          <thead>
            <tr><th>Cant.</th><th>Producto</th><th>Precio</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            ${factura.items.map(item => `
              <tr>
                <td>${item.cantidad}</td>
                <td>${item.nombre}</td>
                <td>${formatearMoneda(item.precio)}</td>
                <td>${formatearMoneda(item.subtotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="totales">
          <div>Subtotal: ${formatearMoneda(factura.subtotal)}</div>
          <div>IVA: ${formatearMoneda(factura.impuesto)}</div>
          <div class="total-final">Total: ${formatearMoneda(factura.total)}</div>
          ${factura.metodo_pago === 'efectivo' ? `<div>Efectivo recibido: ${formatearMoneda(factura.pago_recibido)}</div><div>Vuelto: ${formatearMoneda(factura.vuelto)}</div>` : ''}
          <div>Método de pago: ${factura.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}</div>
          ${factura.puntos_otorgados > 0 ? `<div>Puntos otorgados: ${factura.puntos_otorgados}</div>` : ''}
        </div>
        
        <div class="footer">
          <p>¡Gracias por su compra!</p>
          <p>Este documento es un comprobante de venta interno - Sin validez tributaria</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const crearNotificacion = async (connection, userId, tipo, titulo, mensaje, metadata = null, importante = 0) => {
  await connection.query(
    `INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, metadata, importante, leida, estado, fecha)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', NOW())`,
    [userId, tipo, titulo, mensaje, metadata ? JSON.stringify(metadata) : null, importante]
  );
};

const crearTransaccion = async (connection, userId, tipo, puntos, puntosUsados, referencia, tienda, detalles, emprendimientoId = null) => {
  await connection.query(
    `INSERT INTO transacciones (user_id, tipo, puntos, puntos_usados, referencia, tienda, detalles, estado, fecha, emprendimiento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'completado', NOW(), ?)`,
    [userId, tipo, puntos, puntosUsados, referencia, tienda, JSON.stringify(detalles), emprendimientoId]
  );
};

const getPromocionActiva = async (connection, emprendimientoId) => {
  const [promocion] = await connection.query(
    `SELECT id, nombre, multiplicador 
     FROM promociones 
     WHERE emprendimiento_id = ? 
       AND activo = 1 
       AND NOW() BETWEEN fechaInicio AND fechaFin
     LIMIT 1`,
    [emprendimientoId]
  );
  return promocion[0] || null;
};

const getConfigPuntos = async (connection) => {
  const [config] = await connection.query(
    `SELECT tasa_conversion, valor_punto, umbral_minimo, puntos_fijos, redondeo 
     FROM config_puntos 
     LIMIT 1`
  );
  return config[0] || { tasa_conversion: 10, valor_punto: 0.005, umbral_minimo: 0.99, puntos_fijos: 5, redondeo: 'floor' };
};

const calcularPuntos = async (monto, config, connection, emprendimientoId) => {
  let puntosBase = 0;
  
  if (monto < config.umbral_minimo) {
    puntosBase = config.puntos_fijos;
  } else {
    puntosBase = monto * config.tasa_conversion;
    switch (config.redondeo) {
      case 'floor': puntosBase = Math.floor(puntosBase); break;
      case 'ceil': puntosBase = Math.ceil(puntosBase); break;
      case 'round': puntosBase = Math.round(puntosBase); break;
      default: puntosBase = Math.floor(puntosBase);
    }
  }
  
  const promocionActiva = await getPromocionActiva(connection, emprendimientoId);
  if (promocionActiva) {
    return {
      puntosBase,
      puntosFinal: puntosBase * promocionActiva.multiplicador,
      promocion: promocionActiva
    };
  }
  return {
    puntosBase,
    puntosFinal: puntosBase,
    promocion: null
  };
};

const getRangoPorPuntos = (puntos) => {
  if (puntos >= 10000) return 'Diamante';
  if (puntos >= 5000) return 'Oro';
  if (puntos >= 1000) return 'Plata';
  return 'Bronce';
};

const getNivelPorRango = (rango) => {
  switch (rango) {
    case 'Bronce': return 1;
    case 'Plata': return 2;
    case 'Oro': return 3;
    case 'Diamante': return 4;
    default: return 1;
  }
};

const actualizarPuntosUsuario = async (connection, userId, puntosGanados) => {
  const [existing] = await connection.query(
    `SELECT * FROM user_puntos WHERE user_id = ?`,
    [userId]
  );
  
  if (existing.length === 0) {
    const nuevoRango = getRangoPorPuntos(puntosGanados);
    const nuevoNivel = getNivelPorRango(nuevoRango);
    
    await connection.query(
      `INSERT INTO user_puntos (user_id, nivel, puntos_totales, nivel_actual, 
        puntos_nivel_actual, puntos_siguiente_nivel, fecha_registro)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, nuevoRango, puntosGanados, nuevoNivel, puntosGanados, 0]
    );
  } else {
    const nuevosPuntosTotales = existing[0].puntos_totales + puntosGanados;
    const nuevoRango = getRangoPorPuntos(nuevosPuntosTotales);
    const nuevoNivel = getNivelPorRango(nuevoRango);
    
    await connection.query(
      `UPDATE user_puntos 
       SET puntos_totales = puntos_totales + ?,
           nivel = ?,
           nivel_actual = ?
       WHERE user_id = ?`,
      [puntosGanados, nuevoRango, nuevoNivel, userId]
    );
  }
};

const generarYGuardarPDF = async (facturaData, datosCliente, numeroFactura, facturaId, emprendimiento) => {
  const html = generarHTMLFactura(facturaData, datosCliente, numeroFactura, emprendimiento);
  const fileName = `factura_${facturaId}_${numeroFactura.replace(/\//g, '_')}.pdf`;
  const pdfPath = path.join(pdfDir, fileName);
  
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await page.close();
    browserPoolUsage--;
    await closeBrowser();
    return `/facturas_pdf/${fileName}`;
  } catch (error) {
    logger.error('Error generando PDF:', error);
    const htmlPath = path.join(pdfDir, `factura_${facturaId}_${numeroFactura}.html`);
    fs.writeFileSync(htmlPath, html);
    return `/facturas_pdf/factura_${facturaId}_${numeroFactura}.html`;
  }
};

// ============================================
// FUNCIÓN PARA EMITIR EVENTOS DE SOCKET.IO
// ============================================

const emitirEventosFactura = async (connection, io, facturaData) => {
  const {
    facturaId,
    numero,
    cliente,
    clienteId,
    totalFinal,
    puntosCalculados,
    fecha,
    hora,
    metodoPago,
    datosEmprendimiento,
    items,
    promocionActiva,
    puntosBaseTotal
  } = facturaData;

  if (!io) return;

  try {
    // 1. Emitir nueva factura (para todos o solo admins)
    io.emit('nueva_factura', {
      id: facturaId,
      numero: numero,
      cliente_nombre: cliente || 'Consumidor Final',
      total: formatearMonedaHelper(totalFinal),
      puntos_otorgados: puntosCalculados || 0,
      fecha: fecha,
      hora: hora,
      metodo_pago: metodoPago,
      emprendimiento: datosEmprendimiento?.nombre || 'Mi Tienda'
    });
    logger.info(`📡 Factura emitida: ${numero}`);

    // 2. Si hay un cliente y puntos, emitir actualización en tiempo real
    if (clienteId && puntosCalculados > 0) {
      const [puntosActualizados] = await connection.query(
        `SELECT puntos_totales, nivel FROM user_puntos WHERE user_id = ?`,
        [clienteId]
      );
      
      if (puntosActualizados.length > 0) {
        // Emitir a la sala personal del usuario
        io.to(`user_${clienteId}`).emit('puntos_actualizados', {
          user_id: clienteId,
          puntos_totales: puntosActualizados[0].puntos_totales,
          puntos_ganados: puntosCalculados,
          nivel: puntosActualizados[0].nivel,
          transaccion: {
            tipo: 'compra',
            puntos: puntosCalculados,
            total: totalFinal,
            factura_id: facturaId,
            numero_factura: numero,
            tienda: datosEmprendimiento?.nombre || 'Mi Tienda'
          },
          timestamp: new Date().toISOString()
        });
        logger.info(`📡 Puntos actualizados para usuario ${clienteId}: +${puntosCalculados}`);
      }

      // 3. Emitir nueva notificación
      const multiplicadorTexto = promocionActiva ? ` (x${promocionActiva.multiplicador} por promoción "${promocionActiva.nombre}")` : '';
      io.to(`user_${clienteId}`).emit('nueva_notificacion', {
        user_id: clienteId,
        tipo: 'puntos',
        titulo: `🎉 +${puntosCalculados} puntos ganados${multiplicadorTexto}`,
        mensaje: `¡Felicidades! Ganaste ${puntosCalculados} puntos por tu compra en ${datosEmprendimiento?.nombre || 'la tienda'}. Total: ${formatearMonedaHelper(totalFinal)}`,
        importante: 0,
        leida: 0,
        fecha: new Date().toISOString(),
        icono: '💰',
        color: '#10b981'
      });
      logger.info(`📡 Notificación emitida para usuario ${clienteId}`);

      // 4. Emitir nueva transacción
      io.to(`user_${clienteId}`).emit('nueva_transaccion', {
        user_id: clienteId,
        transaccion: {
          tipo: 'compra',
          puntos: puntosCalculados,
          total: totalFinal,
          factura_id: facturaId,
          numero_factura: numero,
          tienda: datosEmprendimiento?.nombre || 'Mi Tienda',
          fecha: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      logger.info(`📡 Transacción emitida para usuario ${clienteId}`);
    }
  } catch (socketError) {
    logger.error('Error emitiendo eventos Socket.IO:', socketError);
  }
};

// ============================================
// ENDPOINTS (con autenticación y validaciones)
// ============================================

module.exports = (pool, ioParam) => {
  // Asignar io global
  io = ioParam;

  // ============================================
  // ✅ NUEVO ENDPOINT PARA CLIENTES (COLABORADORES)
  // ============================================
  router.get('/clientes',
    authenticate,
    authorize('colab', 'admin'),
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info(`GET /clientes - User: ${req.user.id} (${req.user.rol})`);
        
        const [usuarios] = await pool.query(
          `SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, u.activo, u.foto_url,
                  u.telefono, u.direccion, COALESCE(up.puntos_totales, 0) as puntos
           FROM user u
           LEFT JOIN user_puntos up ON u.id = up.user_id
           WHERE u.rol = 'usuario' AND u.activo = 1
           ORDER BY u.usuario ASC`
        );
        
        res.json({ success: true, usuarios });
      } catch (error) {
        handleError(error, 'GET clientes', res);
      }
    }
  );

  // GET /usuarios/rol/:rol - Obtener usuarios por rol (ADMIN Y COLAB)
  router.get('/usuarios/rol/:rol',
    authenticate,
    authorize('admin', 'colab'),
    createLimiter(5, 100),
    validateParams(validations.rolParam),
    async (req, res) => {
      try {
        const { rol } = req.params;
        logger.info(`GET /usuarios/rol/${rol} - User: ${req.user.id} (${req.user.rol})`);
        
        let whereClause = 'u.rol = ? AND u.activo = 1';
        const params = [rol];
        
        if (req.user.rol === 'colab' && rol === 'usuario') {
          whereClause = 'u.rol = ? AND u.activo = 1';
        } else if (req.user.rol === 'colab' && rol !== 'usuario') {
          return res.json({ success: true, usuarios: [] });
        }
        
        const [usuarios] = await pool.query(
          `SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, u.activo, u.foto_url,
                  u.telefono, u.direccion, COALESCE(up.puntos_totales, 0) as puntos
           FROM user u
           LEFT JOIN user_puntos up ON u.id = up.user_id
           WHERE ${whereClause}`,
          params
        );
        
        res.json({ success: true, usuarios });
      } catch (error) {
        handleError(error, 'GET usuarios por rol', res);
      }
    }
  );

  // GET /usuarios - Obtener todos los usuarios activos (ADMIN)
  router.get('/usuarios',
    authenticate,
    authorize('admin'),
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /usuarios - Admin:', req.user.id);
        
        const [usuarios] = await pool.query(
          `SELECT u.id, u.email, u.usuario, u.rol, u.fecha_registro, u.ultimo_acceso, u.activo, u.foto_url,
                  u.telefono, u.direccion, COALESCE(up.puntos_totales, 0) as puntos
           FROM user u
           LEFT JOIN user_puntos up ON u.id = up.user_id
           WHERE u.activo = 1
           ORDER BY u.id DESC`
        );
        
        res.json({ success: true, usuarios });
      } catch (error) {
        handleError(error, 'GET usuarios', res);
      }
    }
  );

  // GET /productos/emprendimiento/:emprendimientoId - Obtener productos por emprendimiento
  router.get('/productos/emprendimiento/:emprendimientoId',
    authenticate,
    createLimiter(5, 200),
    validateParams(validations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /productos/emprendimiento/${emprendimientoId}`);
        
        const [productos] = await pool.query(
          `SELECT id, emprendimiento_id, usuario_id, codigo, nombre, descripcion, 
                  categoria, precio_venta, stock, stock_minimo, unidad_medida, 
                  proveedor, iva, activo, atributos, fecha_creacion, precio_compra
           FROM productos 
           WHERE emprendimiento_id = ? AND activo = 1
           ORDER BY id DESC`,
          [emprendimientoId]
        );
        
        res.json({ success: true, productos });
      } catch (error) {
        handleError(error, 'GET productos por emprendimiento', res);
      }
    }
  );

  // GET /productos/:id - Obtener producto por ID
  router.get('/productos/:id',
    authenticate,
    createLimiter(5, 200),
    validateParams(validations.idParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /productos/${id}`);
        
        const [producto] = await pool.query(
          `SELECT * FROM productos WHERE id = ? AND activo = 1`,
          [id]
        );
        
        if (producto.length === 0) {
          return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }
        
        res.json({ success: true, producto: producto[0] });
      } catch (error) {
        handleError(error, 'GET producto por ID', res);
      }
    }
  );

  // ============================================
  // 📧 POST /enviar-factura - Enviar factura por email (CORREGIDO)
  // ============================================
  router.post('/enviar-factura',
    authenticate,
    createLimiter(1, 30),
    async (req, res) => {
      try {
        const { factura, datosCliente, numeroFactura, emprendimiento } = req.body;
        
        if (!factura || !numeroFactura) {
          return res.status(400).json({ success: false, message: 'Datos incompletos' });
        }
        
        const emailCliente = datosCliente?.email || factura.cliente_email || factura.clienteEmail;
        
        if (!emailCliente) {
          return res.status(400).json({ success: false, message: 'El cliente no tiene email registrado' });
        }
        
        // ✅ Usar credenciales con fallback
        const emailUser = process.env.EMAIL_USER || process.env.SMTP_USERNAME;
        const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;
        
        if (!emailUser || !emailPass) {
          return res.status(500).json({ success: false, message: 'Email no configurado' });
        }
        
        const htmlContent = generarHTMLFactura(factura, datosCliente, numeroFactura, emprendimiento);
        
        const mailOptions = {
          from: emailUser,
          to: emailCliente,
          subject: `Comprobante de Venta ${numeroFactura} - ${emprendimiento?.nombre || 'Mi Tienda'}`,
          html: htmlContent
        };
        
        await transporter.sendMail(mailOptions);
        logger.info(`Comprobante de Venta ${numeroFactura} enviado a ${emailCliente}`);
        
        res.json({ success: true, message: 'Comprobante de venta enviado exitosamente' });
      } catch (error) {
        handleError(error, 'POST enviar-factura', res);
      }
    }
  );

  // POST /comandas - Crear nueva comanda
  router.post('/comandas',
    authenticate,
    createLimiter(1, 50),
    validate(validations.comanda),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /comandas - User:', req.user.id);
        await connection.beginTransaction();

        const {
          emprendimiento_id,
          nombre,
          cliente_id,
          cliente_nombre,
          cliente_telefono,
          cliente_direccion,
          items,
          subtotal,
          impuesto,
          total
        } = req.body;

        for (const item of items) {
          const [producto] = await connection.query(
            `SELECT stock, nombre FROM productos WHERE id = ? FOR UPDATE`,
            [item.productoId]
          );
          
          if (producto.length === 0) {
            throw new Error(`Producto no encontrado: ${item.nombre}`);
          }
          
          if (producto[0].stock < item.cantidad) {
            throw new Error(`Stock insuficiente para "${producto[0].nombre}". Disponible: ${producto[0].stock}`);
          }
        }

        const [result] = await connection.query(
          `INSERT INTO comandas (
            emprendimiento_id, nombre, cliente_id, cliente_nombre, 
            cliente_telefono, cliente_direccion, items, subtotal, impuesto, total, estado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa')`,
          [
            emprendimiento_id, nombre, cliente_id || null, cliente_nombre || null,
            cliente_telefono || null, cliente_direccion || null,
            JSON.stringify(items), subtotal, impuesto, total
          ]
        );

        await connection.commit();
        logger.info(`Comanda creada: ID ${result.insertId}`);
        
        res.json({ success: true, message: 'Comanda creada exitosamente', id: result.insertId });
      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST comanda', res);
      } finally {
        connection.release();
      }
    }
  );

  // GET /comandas/emprendimiento/:emprendimientoId - Obtener comandas por emprendimiento
  router.get('/comandas/emprendimiento/:emprendimientoId',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /comandas/emprendimiento/${emprendimientoId}`);
        
        const [comandas] = await pool.query(
          `SELECT * FROM comandas 
           WHERE emprendimiento_id = ? AND estado = 'activa'
           ORDER BY creada_en DESC`,
          [emprendimientoId]
        );
        
        const comandasParseadas = comandas.map(c => ({
          ...c,
          items: typeof c.items === 'string' ? JSON.parse(c.items) : c.items
        }));
        
        res.json({ success: true, comandas: comandasParseadas });
      } catch (error) {
        handleError(error, 'GET comandas por emprendimiento', res);
      }
    }
  );

  // GET /comandas/:id - Obtener comanda por ID
  router.get('/comandas/:id',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.idParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /comandas/${id}`);
        
        const [comanda] = await pool.query(`SELECT * FROM comandas WHERE id = ?`, [id]);
        
        if (comanda.length === 0) {
          return res.status(404).json({ success: false, message: 'Comanda no encontrada' });
        }
        
        comanda[0].items = typeof comanda[0].items === 'string' ? JSON.parse(comanda[0].items) : comanda[0].items;
        res.json({ success: true, comanda: comanda[0] });
      } catch (error) {
        handleError(error, 'GET comanda por ID', res);
      }
    }
  );

  // PUT /comandas/:id - Actualizar comanda
  router.put('/comandas/:id',
    authenticate,
    createLimiter(1, 30),
    validateParams(validations.idParam),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        const { id } = req.params;
        const { items, subtotal, impuesto, total } = req.body;
        
        logger.info(`PUT /comandas/${id} - User:`, req.user.id);
        await connection.beginTransaction();
        
        for (const item of items) {
          const [producto] = await connection.query(
            `SELECT stock FROM productos WHERE id = ? FOR UPDATE`,
            [item.productoId]
          );
          
          if (producto.length === 0) {
            throw new Error(`Producto no encontrado: ${item.nombre}`);
          }
          
          if (producto[0].stock < item.cantidad) {
            throw new Error(`Stock insuficiente para "${item.nombre}"`);
          }
        }
        
        const [result] = await connection.query(
          `UPDATE comandas 
           SET items = ?, subtotal = ?, impuesto = ?, total = ?, actualizada_en = NOW()
           WHERE id = ? AND estado = 'activa'`,
          [JSON.stringify(items), subtotal, impuesto, total, id]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('Comanda no encontrada o ya está cerrada');
        }
        
        await connection.commit();
        res.json({ success: true, message: 'Comanda actualizada exitosamente' });
      } catch (error) {
        await connection.rollback();
        handleError(error, `PUT comanda ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // POST /comandas/:id/facturar - Pasar comanda a factura
  router.post('/comandas/:id/facturar',
    authenticate,
    createLimiter(1, 30),
    validateParams(validations.idParam),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        const { id } = req.params;
        logger.info(`POST /comandas/${id}/facturar - User:`, req.user.id);
        await connection.beginTransaction();
        
        const [comanda] = await connection.query(
          `SELECT * FROM comandas WHERE id = ? AND estado = 'activa' FOR UPDATE`,
          [id]
        );
        
        if (comanda.length === 0) {
          throw new Error('Comanda no encontrada o ya fue facturada');
        }
        
        const comandaData = comanda[0];
        const items = typeof comandaData.items === 'string' ? JSON.parse(comandaData.items) : comandaData.items;
        
        for (const item of items) {
          await connection.query(
            `UPDATE productos SET stock = stock - ? WHERE id = ?`,
            [item.cantidad, item.productoId]
          );
        }
        
        await connection.query(
          `UPDATE comandas SET estado = 'facturada', actualizada_en = NOW() WHERE id = ?`,
          [id]
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Comanda facturada exitosamente', comanda: { ...comandaData, items } });
      } catch (error) {
        await connection.rollback();
        handleError(error, `POST facturar comanda ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // DELETE /comandas/:id - Cancelar comanda
  router.delete('/comandas/:id',
    authenticate,
    createLimiter(1, 20),
    validateParams(validations.idParam),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        const { id } = req.params;
        logger.info(`DELETE /comandas/${id} - User:`, req.user.id);
        
        const [result] = await connection.query(
          `UPDATE comandas SET estado = 'cancelada', actualizada_en = NOW() 
           WHERE id = ? AND estado = 'activa'`,
          [id]
        );
        
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Comanda no encontrada' });
        }
        
        res.json({ success: true, message: 'Comanda cancelada exitosamente' });
      } catch (error) {
        handleError(error, `DELETE comanda ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // ============================================
  // ✅ POST /facturas - Guardar factura
  // ============================================
  router.post('/facturas',
    authenticate,
    createLimiter(1, 50),
    validate(validations.factura),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        logger.info('POST /facturas - User:', req.user.id);
        await connection.beginTransaction();
        
        const {
          emprendimiento_id,
          usuario_id,
          numero,
          fecha,
          hora,
          cliente,
          clienteDireccion,
          clienteEmail,
          clienteTelefono,
          items,
          subtotal,
          impuesto,
          total,
          metodoPago,
          pagoRecibido,
          vuelto,
          referencia,
          estado,
          comanda_id
        } = req.body;

        const [emprendimiento] = await connection.query(
          `SELECT nombre, ubicacion, ciudad, whatsapp FROM emprendimientos WHERE id = ?`,
          [emprendimiento_id]
        );
        
        const datosEmprendimiento = emprendimiento[0] || null;
        
        // ============================================
        // 🔥 CORRECCIÓN: Calcular IVA desde productos
        // ============================================
        let subtotalCalculado = 0;
        let impuestoCalculado = 0;
        let totalCalculado = 0;

        for (const item of items) {
          const [producto] = await connection.query(
            `SELECT stock, nombre, iva FROM productos WHERE id = ? FOR UPDATE`,
            [item.productoId]
          );
          
          if (producto.length === 0) {
            throw new Error(`Producto no encontrado: ${item.nombre}`);
          }
          
          if (producto[0].stock < item.cantidad) {
            throw new Error(`Stock insuficiente para "${producto[0].nombre}". Disponible: ${producto[0].stock}, Solicitado: ${item.cantidad}`);
          }
          
          const subtotalItem = item.precio * item.cantidad;
          subtotalCalculado += subtotalItem;
          
          const ivaPorcentaje = parseFloat(producto[0].iva) || 0;
          const impuestoItem = subtotalItem * (ivaPorcentaje / 100);
          impuestoCalculado += impuestoItem;
        }
        
        totalCalculado = subtotalCalculado + impuestoCalculado;
        
        subtotalCalculado = Math.round(subtotalCalculado * 100) / 100;
        impuestoCalculado = Math.round(impuestoCalculado * 100) / 100;
        totalCalculado = Math.round(totalCalculado * 100) / 100;

        const subtotalFinal = subtotalCalculado;
        const impuestoFinal = impuestoCalculado;
        const totalFinal = totalCalculado;
        
        const configPuntos = await getConfigPuntos(connection);
        const promocionActiva = await getPromocionActiva(connection, emprendimiento_id);
        
        let clienteId = null;
        if (cliente && cliente.trim() !== '') {
          const [clienteExistente] = await connection.query(
            `SELECT id FROM user WHERE usuario = ? OR email = ?`,
            [cliente, clienteEmail || '']
          );
          
          if (clienteExistente.length > 0) {
            clienteId = clienteExistente[0].id;
          } else if (clienteEmail && clienteEmail.trim() !== '') {
            const [result] = await connection.query(
              `INSERT INTO user (usuario, email, telefono, direccion, rol, activo, fecha_registro) 
               VALUES (?, ?, ?, ?, 'usuario', 1, NOW())`,
              [cliente, clienteEmail, clienteTelefono || '', clienteDireccion || '']
            );
            clienteId = result.insertId;
            
            await connection.query(
              `INSERT INTO user_puntos (user_id, nivel, puntos_totales, nivel_actual, 
                puntos_nivel_actual, puntos_siguiente_nivel, fecha_registro)
               VALUES (?, 'Bronce', 0, 1, 0, 1000, NOW())`,
              [clienteId]
            );
          }
        }
        
        // ============================================
        // 🔥 CORRECCIÓN: Calcular puntos con promoción
        // ============================================
        let puntosBaseTotal = 0;
        let puntosFinalTotal = 0;
        
        for (const item of items) {
          const montoItem = item.precio * item.cantidad;
          const resultadoPuntos = await calcularPuntos(montoItem, configPuntos, connection, emprendimiento_id);
          puntosBaseTotal += resultadoPuntos.puntosBase;
          puntosFinalTotal += resultadoPuntos.puntosFinal;
        }
        
        const puntosCalculados = puntosFinalTotal;
        
        const [result] = await connection.query(
          `INSERT INTO facturas (
            emprendimiento_id, usuario_id, cliente_id, numero, fecha, hora, 
            cliente_nombre, cliente_direccion, cliente_email, cliente_telefono,
            subtotal, impuesto, total, metodo_pago, pago_recibido, vuelto,
            puntos_otorgados, referencia, estado, promocion_aplicada, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            emprendimiento_id, usuario_id, clienteId, numero, fecha, hora,
            cliente, clienteDireccion, clienteEmail, clienteTelefono,
            subtotalFinal, impuestoFinal, totalFinal, metodoPago, pagoRecibido, vuelto,
            puntosCalculados, referencia, estado,
            promocionActiva ? promocionActiva.id : null
          ]
        );
        
        const facturaId = result.insertId;
        
        for (const item of items) {
          const resultadoPuntos = await calcularPuntos(item.precio * item.cantidad, configPuntos, connection, emprendimiento_id);
          
          await connection.query(
            `INSERT INTO factura_items (
              factura_id, producto_id, codigo, nombre, 
              precio, cantidad, subtotal, puntos
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [facturaId, item.productoId, item.codigo, item.nombre, item.precio, item.cantidad, item.subtotal, resultadoPuntos.puntosFinal]
          );
          
          await connection.query(
            `UPDATE productos SET stock = stock - ? WHERE id = ?`,
            [item.cantidad, item.productoId]
          );
        }
        
        if (comanda_id) {
          await connection.query(
            `UPDATE comandas SET estado = 'facturada', actualizada_en = NOW() WHERE id = ?`,
            [comanda_id]
          );
        }
        
        if (clienteId && puntosCalculados > 0) {
          await actualizarPuntosUsuario(connection, clienteId, puntosCalculados);
          
          const multiplicadorTexto = promocionActiva ? ` (x${promocionActiva.multiplicador} por promoción "${promocionActiva.nombre}")` : '';
          const tituloNotificacion = `🎉 +${puntosCalculados} puntos ganados${multiplicadorTexto}`;
          const mensajeNotificacion = `¡Felicidades! Ganaste ${puntosCalculados} puntos por tu compra en ${datosEmprendimiento?.nombre || 'la tienda'}. Total: ${formatearMonedaHelper(totalFinal)} | Método: ${metodoPago}`;
          
          await crearNotificacion(
            connection, clienteId, 'puntos', tituloNotificacion, mensajeNotificacion,
            {
              tipo_transaccion: 'compra',
              puntos: puntosCalculados,
              puntos_base: puntosBaseTotal,
              total: totalFinal,
              factura_id: facturaId,
              numero_factura: numero,
              metodo_pago: metodoPago,
              tienda: datosEmprendimiento?.nombre || 'la tienda',
              promocion: promocionActiva ? {
                id: promocionActiva.id,
                nombre: promocionActiva.nombre,
                multiplicador: promocionActiva.multiplicador
              } : null
            }, 0
          );
          
          await crearTransaccion(
            connection, clienteId, 'compra', puntosCalculados, 0, numero,
            datosEmprendimiento?.nombre || 'la tienda',
            {
              factura_id: facturaId,
              productos: items.map(i => i.nombre),
              total: totalFinal,
              metodo_pago: metodoPago,
              puntos_base: puntosBaseTotal,
              promocion: promocionActiva ? {
                nombre: promocionActiva.nombre,
                multiplicador: promocionActiva.multiplicador
              } : null
            }, emprendimiento_id
          );
        }
        
        const facturaData = { 
          fecha, hora, items, 
          subtotal: subtotalFinal, 
          impuesto: impuestoFinal, 
          total: totalFinal, 
          metodo_pago: metodoPago, 
          pago_recibido: pagoRecibido, 
          vuelto, 
          puntos_otorgados: puntosCalculados 
        };
        
        const datosClientePDF = { nombre: cliente, telefono: clienteTelefono, direccion: clienteDireccion };
        const rutaPDFFactura = await generarYGuardarPDF(facturaData, datosClientePDF, numero, facturaId, datosEmprendimiento);
        
        await connection.query(`UPDATE facturas SET ruta_pdf = ? WHERE id = ?`, [rutaPDFFactura, facturaId]);
        await connection.commit();
        
        // ✅ EMITIR EVENTOS DE SOCKET.IO EN TIEMPO REAL
        await emitirEventosFactura(connection, io, {
          facturaId,
          numero,
          cliente,
          clienteId,
          totalFinal,
          puntosCalculados,
          fecha,
          hora,
          metodoPago,
          datosEmprendimiento,
          items,
          promocionActiva,
          puntosBaseTotal
        });
        
        res.json({
          success: true, 
          message: 'Comprobante de venta guardado exitosamente', 
          id: facturaId,
          puntosOtorgados: puntosCalculados,
          puntosBase: puntosBaseTotal,
          ruta_pdf: rutaPDFFactura,
          subtotal_calculado: subtotalFinal,
          impuesto_calculado: impuestoFinal,
          total_calculado: totalFinal,
          promocion_aplicada: promocionActiva ? {
            id: promocionActiva.id, 
            nombre: promocionActiva.nombre, 
            multiplicador: promocionActiva.multiplicador
          } : null
        });
        
      } catch (error) {
        await connection.rollback();
        handleError(error, 'POST factura', res);
      } finally {
        connection.release();
      }
    }
  );

  // GET /facturas/emprendimiento/:emprendimientoId - Obtener facturas por emprendimiento
  router.get('/facturas/emprendimiento/:emprendimientoId',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /facturas/emprendimiento/${emprendimientoId}`);
        
        const [facturas] = await pool.query(
          `SELECT f.*, 
           (SELECT COUNT(*) FROM factura_items WHERE factura_id = f.id) as total_items,
           p.nombre as promocion_nombre, p.multiplicador as promocion_multiplicador
           FROM facturas f
           LEFT JOIN promociones p ON f.promocion_aplicada = p.id
           WHERE f.emprendimiento_id = ?
           ORDER BY f.created_at DESC`,
          [emprendimientoId]
        );
        
        for (let factura of facturas) {
          const [items] = await pool.query(`SELECT * FROM factura_items WHERE factura_id = ?`, [factura.id]);
          factura.items = items;
        }
        
        res.json({ success: true, facturas });
      } catch (error) {
        handleError(error, 'GET facturas por emprendimiento', res);
      }
    }
  );

  // GET /facturas/:id - Obtener factura por ID
  router.get('/facturas/:id',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.idParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /facturas/${id}`);
        
        const [factura] = await pool.query(
          `SELECT f.*, p.nombre as promocion_nombre, p.multiplicador as promocion_multiplicador
           FROM facturas f
           LEFT JOIN promociones p ON f.promocion_aplicada = p.id
           WHERE f.id = ?`,
          [id]
        );
        
        if (factura.length === 0) {
          return res.status(404).json({ success: false, message: 'Comprobante no encontrado' });
        }
        
        const [items] = await pool.query(`SELECT * FROM factura_items WHERE factura_id = ?`, [id]);
        res.json({ success: true, factura: { ...factura[0], items } });
      } catch (error) {
        handleError(error, 'GET factura por ID', res);
      }
    }
  );

  // GET /promociones/activas/:emprendimientoId - Obtener promociones activas
  router.get('/promociones/activas/:emprendimientoId',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.emprendimientoIdParam),
    async (req, res) => {
      try {
        const { emprendimientoId } = req.params;
        logger.info(`GET /promociones/activas/${emprendimientoId}`);
        
        const [promociones] = await pool.query(
          `SELECT id, nombre, descripcion, multiplicador, fechaInicio, fechaFin
           FROM promociones 
           WHERE emprendimiento_id = ? AND activo = 1 AND NOW() BETWEEN fechaInicio AND fechaFin`,
          [emprendimientoId]
        );
        
        res.json({ success: true, promociones });
      } catch (error) {
        handleError(error, 'GET promociones activas', res);
      }
    }
  );

  // PATCH /productos/:id/stock - Actualizar stock de producto
  router.patch('/productos/:id/stock',
    authenticate,
    createLimiter(1, 30),
    validateParams(validations.idParam),
    validate(validations.stockUpdate),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { stock } = req.body;
        logger.info(`PATCH /productos/${id}/stock - User:`, req.user.id);
        
        const [result] = await pool.query(`UPDATE productos SET stock = ? WHERE id = ?`, [stock, id]);
        
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }
        
        if (io) {
          io.emit('stock_actualizado', { producto_id: id, stock });
        }
        
        res.json({ success: true, message: 'Stock actualizado exitosamente' });
      } catch (error) {
        handleError(error, 'PATCH stock producto', res);
      }
    }
  );

  // PATCH /usuarios/:id/puntos - Actualizar puntos del usuario
  router.patch('/usuarios/:id/puntos',
    authenticate,
    authorize('admin'),
    createLimiter(1, 30),
    validateParams(validations.idParam),
    validate(validations.puntosUpdate),
    async (req, res) => {
      const connection = await pool.getConnection();
      
      try {
        const { id } = req.params;
        const { puntos } = req.body;
        logger.info(`PATCH /usuarios/${id}/puntos - Admin:`, req.user.id);
        
        await connection.beginTransaction();
        await actualizarPuntosUsuario(connection, id, puntos);
        await connection.commit();
        
        if (io) {
          const [puntosActualizados] = await connection.query(
            `SELECT puntos_totales, nivel FROM user_puntos WHERE user_id = ?`,
            [id]
          );
          if (puntosActualizados.length > 0) {
            io.emit(`puntos_actualizados_${id}`, {
              user_id: id, puntos_totales: puntosActualizados[0].puntos_totales,
              puntos_ganados: puntos, nivel: puntosActualizados[0].nivel
            });
          }
        }
        
        res.json({ success: true, message: 'Puntos actualizados exitosamente' });
      } catch (error) {
        await connection.rollback();
        handleError(error, `PATCH puntos usuario ${req.params.id}`, res);
      } finally {
        connection.release();
      }
    }
  );

  // GET /usuarios/:id/puntos - Obtener puntos de un usuario
  router.get('/usuarios/:id/puntos',
    authenticate,
    createLimiter(5, 100),
    validateParams(validations.idParam),
    async (req, res) => {
      try {
        const { id } = req.params;
        logger.info(`GET /usuarios/${id}/puntos`);
        
        const [puntos] = await pool.query(
          `SELECT puntos_totales, nivel, nivel_actual FROM user_puntos WHERE user_id = ?`,
          [id]
        );
        
        if (puntos.length === 0) {
          return res.json({ success: true, puntos: 0, nivel: 'Bronce', nivel_actual: 1 });
        }
        
        res.json({ success: true, puntos: puntos[0].puntos_totales, nivel: puntos[0].nivel, nivel_actual: puntos[0].nivel_actual });
      } catch (error) {
        handleError(error, 'GET puntos usuario', res);
      }
    }
  );

  // GET /config-puntos - Obtener configuración de puntos
  router.get('/config-puntos',
    createLimiter(5, 100),
    async (req, res) => {
      try {
        logger.info('GET /config-puntos');
        
        const [config] = await pool.query(`SELECT * FROM config_puntos LIMIT 1`);
        
        res.json({
          success: true,
          config: config[0] || { tasa_conversion: 10, valor_punto: 0.005, umbral_minimo: 0.99, puntos_fijos: 5, redondeo: 'floor' }
        });
      } catch (error) {
        handleError(error, 'GET config-puntos', res);
      }
    }
  );

  // Servir archivos PDF estáticos
  router.use('/facturas_pdf', express.static(pdfDir));

  router.initSocket = initSocket;
  return router;
};