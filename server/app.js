require('dotenv').config();

// ============================================
// ✅ CONFIGURAR ZONA HORARIA DE ECUADOR
// ============================================
process.env.TZ = 'America/Guayaquil';

const express = require("express");
const http = require('http');
const socketIo = require('socket.io');
const cors = require("cors");
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const pool = require("./database");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ✅ CONFIGURAR TRUST PROXY PARA NGINX (CORREGIDO)
// ============================================
// Específico: Solo hay 1 proxy (Nginx) entre el cliente y el servidor
app.set('trust proxy', 1);

// ============================================
// VERIFICACIÓN DE VARIABLES DE ENTORNO
// ============================================
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET no está configurado en las variables de entorno');
  throw new Error('JWT_SECRET no está configurado');
}

if (!process.env.FRONTEND_URL) {
  logger.warn('FRONTEND_URL no configurado, usando http://localhost:5173 por defecto');
}

// ============================================
// MIDDLEWARES GLOBALES DE SEGURIDAD
// ============================================

// Helmet para headers de seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
  frameguard: false // ✅ Esto desactiva X-Frame-Options
}));

// Compresión gzip
app.use(compression());

// ============================================
// ✅ RATE LIMITING CORREGIDO
// ============================================

// Rate limiting global - CORREGIDO
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500, // 500 requests por ventana
  message: { success: false, message: 'Demasiadas solicitudes, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false // ✅ Desactiva validación estricta de headers (X-Forwarded-For)
});
app.use(globalLimiter);

// Rate limiting más estricto para login/registro - CORREGIDO
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Demasiados intentos, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false // ✅ Desactiva validación estricta de headers (X-Forwarded-For)
});

// ============================================
// CORS CONFIGURADO PARA MÚLTIPLES ORÍGENES
// ============================================

// Lista de orígenes permitidos
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://192.168.100.13:8080',
  process.env.FRONTEND_URL
].filter(Boolean);

// Función para verificar origen permitido
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  return allowedOrigins.indexOf(origin) !== -1;
};

// CORS para Express
app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como Postman o pruebas)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar si el origen está en la lista blanca
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      // En desarrollo, permitir todos los orígenes (solo para pruebas)
      if (process.env.NODE_ENV !== 'production') {
        logger.warn(`⚠️ CORS: Origen permitido en desarrollo: ${origin}`);
        callback(null, true);
      } else {
        logger.warn(`🚫 CORS bloqueado para: ${origin}`);
        callback(new Error('Origen no permitido por CORS'));
      }
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir carpetas estáticas
app.use('/img-premios', express.static(path.join(__dirname, 'img-premios')));
app.use('/facturas_pdf', express.static(path.join(__dirname, 'facturas_pdf')));
app.use('/img-emprendimientos', express.static(path.join(__dirname, 'img-emprendimientos')));
app.use('/img-usuarios', express.static(path.join(__dirname,'img-usuarios')))

// ============================================
// FUNCIÓN AUXILIAR PARA LIMPIAR TOKEN
// ============================================
const cleanToken = (token) => {
  if (!token) return null;
  // Eliminar comillas simples, dobles y espacios en blanco
  return token.replace(/^["']|["']$/g, '').trim();
};

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Token no proporcionado');
    return res.status(401).json({ success: false, message: 'Token no proporcionado' });
  }

  // ✅ LIMPIAR EL TOKEN (eliminar comillas y espacios)
  token = cleanToken(token);

  // Validación adicional: verificar que el token tenga formato JWT (3 partes)
  if (token.split('.').length !== 3) {
    logger.warn(`Token con formato inválido: ${token.substring(0, 30)}...`);
    return res.status(403).json({ success: false, message: 'Token malformado o inválido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn(`Token inválido: ${err.message}`);
      // ✅ Mejorar mensaje de error según el tipo de error
      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ success: false, message: 'Token malformado o inválido' });
      }
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ success: false, message: 'Token expirado, inicia sesión nuevamente' });
      }
      return res.status(403).json({ success: false, message: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

// Middleware de autorización por roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.warn('Usuario no autenticado');
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    
    if (!roles.includes(req.user.rol)) {
      logger.warn(`Acceso denegado: ${req.user.rol} intentó acceder a ${req.path}`);
      return res.status(403).json({ success: false, message: 'Permisos insuficientes. Se requiere rol: ' + roles.join(' o ') });
    }
    next();
  };
};

// ============================================
// SOCKET.IO CON AUTENTICACIÓN OPCIONAL
// ============================================
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      
      if (isOriginAllowed(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Origen no permitido'));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware de autenticación para Socket.io (AHORA OPCIONAL - permite anónimos)
io.use((socket, next) => {
  let token = socket.handshake.auth.token;
  
  // Si no hay token o es string vacío, permitir conexión como anónimo
  if (!token || token === '') {
    logger.info(`Socket ${socket.id} conectado como ANÓNIMO`);
    socket.isAnonymous = true;
    return next(); // ✅ Permitir conexión anónima sin warning
  }
  
  // Extraer token si viene con formato "Bearer xxxxx"
  if (token.startsWith('Bearer ')) {
    token = token.slice(7);
  }
  
  // ✅ LIMPIAR EL TOKEN (eliminar comillas y espacios)
  token = cleanToken(token);

  // Validación adicional: verificar que el token tenga formato JWT (3 partes)
  if (token.split('.').length !== 3) {
    logger.warn(`Socket ${socket.id} - Token con formato inválido, conectando como anónimo`);
    socket.isAnonymous = true;
    return next(); // Permitir conexión como anónimo en lugar de rechazar
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn(`Socket ${socket.id} - Token inválido: ${err.message}, conectando como anónimo`);
      socket.isAnonymous = true;
      return next(); // ✅ Permitir conexión como anónimo
    }
    socket.user = user;
    socket.isAnonymous = false;
    logger.info(`Socket ${socket.id} autenticado como: ${user.usuario} (${user.rol})`);
    next();
  });
});

app.set('io', io);

// ============================================
// IMPORTAR RUTAS
// ============================================
const registerRoutes = require("./endpoint/registro")(pool,io);
const usuarioRoutes = require("./endpoint/user/obtenerInfo")(pool, io);
const googleRoutes = require('./endpoint/google')(pool);
const logingoogleRoutes = require('./endpoint/loginGoogle')(pool);
const adminRegistro = require('./endpoint/admin/admin_registro')(pool,io);
const adminEmprendimientos = require('./endpoint/admin/admin_emprendimientos')(pool);
const adminConfigPuntos = require('./endpoint/admin/admin_config_puntos')(pool,io);
const adminPromociones = require('./endpoint/admin/admin_promociones')(pool,io);
const adminPremios = require('./endpoint/admin/admin_premios')(pool, io);
const adminSumaPuntos = require('./endpoint/admin/admin_suma_puntos')(pool,io);
const adminNotificaciones = require('./endpoint/admin/admin_notificaciones')(pool,io);
const colabInventario = require('./endpoint/colab/colab_inventario')(pool,io);
const colabObtenerEmpren = require('./endpoint/colab/colab_obtener_emprendi')(pool,io);
const colabFactu = require('./endpoint/colab/colab_factu')(pool,io);
const colabPuntos = require('./endpoint/colab/colab_puntos')(pool,io);
const colabInicio = require('./endpoint/colab/colab_inicio')(pool,io);
const userPremios = require('./endpoint/user/user_Premios')(pool, io);  
const principalPagina = require('./endpoint/principal/principal')(pool, io);
const recuperacionPagina = require('./endpoint/principal/recuperacion')(pool);

// ============================================
// CONEXIONES SOCKET.IO
// ============================================
io.on('connection', (socket) => {
  const userInfo = socket.isAnonymous ? 'ANÓNIMO' : (socket.user?.usuario || 'desconocido');
  logger.info(`✅ Cliente conectado: ${socket.id} - Usuario: ${userInfo}`);
  
  // Unir al usuario a su sala personal basada en su ID (solo si está autenticado)
  if (socket.user && socket.user.id) {
    socket.join(`user_${socket.user.id}`);
    logger.info(`Socket ${socket.id} unido a sala personal: user_${socket.user.id}`);
  }
  
  socket.on('join_room', (room) => {
    socket.join(room);
    logger.info(`Socket ${socket.id} unido a sala: ${room}`);
  });
  
  socket.on('leave_room', (room) => {
    socket.leave(room);
    logger.info(`Socket ${socket.id} salió de sala: ${room}`);
  });

  socket.on('nueva_alerta', (data) => {
    logger.info(`📢 Nueva alerta: ${data.emprendimientoId}`);
    io.to(`emprendimiento_${data.emprendimientoId}`).emit('nueva_alerta', data.alerta);
  });

  socket.on('alerta_leida', (data) => {
    logger.info(`✓ Alerta marcada como leída: ${data.alertaId}`);
    io.to(`emprendimiento_${data.emprendimientoId}`).emit('alerta_actualizada', data);
  });

  socket.on('todas_alertas_leidas', (data) => {
    logger.info(`✓ Todas las alertas marcadas como leídas para emprendimiento ${data.emprendimientoId}`);
    io.to(`emprendimiento_${data.emprendimientoId}`).emit('alertas_actualizadas');
  });

  socket.on('actualizar_emprendimiento', (data) => {
    logger.info(`🏪 Emprendimiento actualizado: ${data.emprendimientoId}`);
    io.to(`emprendimiento_${data.emprendimientoId}`).emit('emprendimiento_actualizado', data.data);
  });
  
  socket.on('disconnect', () => {
    logger.info(`❌ Cliente desconectado: ${socket.id}`);
  });
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
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};

// ============================================
// ENDPOINTS PÚBLICOS - CON /api
// ============================================

// Endpoint raíz
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

// Health check
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "OK",
      server: "running",
      database: "connected",
      socketio: io ? "active" : "inactive",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check falló:', error);
    res.status(500).json({
      status: "ERROR",
      server: "running",
      database: "disconnected",
      socketio: io ? "active" : "inactive",
      error: error.message
    });
  }
});

// ✅ CAMBIADO: Login endpoint con /api
app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { usuario, contra } = req.body;

    if (!usuario || !contra) {
      return res.status(400).json({
        success: false,
        message: "Usuario y contraseña son requeridos"
      });
    }

    const [rows] = await pool.query(
      "SELECT id, email, usuario, rol, contra, activo FROM user WHERE usuario = ? OR email = ?",
      [usuario, usuario]
    );

    if (rows.length === 0) {
      logger.warn(`Intento de login fallido - Usuario no encontrado: ${usuario}`);
      return res.status(401).json({
        success: false,
        message: "Usuario o contraseña incorrectos"
      });
    }

    const user = rows[0];

    if (user.activo === 0) {
      logger.warn(`Intento de login - Cuenta desactivada: ${user.id}`);
      return res.status(403).json({
        success: false,
        message: "Cuenta desactivada. Contacta al administrador."
      });
    }

    let passwordMatch = false;

    if (user.contra && user.contra.startsWith('$2b$')) {
      passwordMatch = await bcrypt.compare(contra, user.contra);
    } else if (user.contra) {
      passwordMatch = (contra === user.contra);
      
      if (passwordMatch) {
        const hashedPassword = await bcrypt.hash(contra, 10);
        await pool.query("UPDATE user SET contra = ? WHERE id = ?", [hashedPassword, user.id]);
        logger.info(`Contraseña migrada a hash para usuario ${user.id}`);
      }
    }

    if (!passwordMatch) {
      logger.warn(`Intento de login fallido - Contraseña incorrecta: ${user.id}`);
      return res.status(401).json({
        success: false,
        message: "Usuario o contraseña incorrectos"
      });
    }

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await pool.query("UPDATE user SET ultimo_acceso = NOW() WHERE id = ?", [user.id]);

    // Eliminar contraseña antes de enviar
    delete user.contra;

    logger.info(`✅ Login exitoso: ${user.usuario} (ID: ${user.id}) Rol: ${user.rol}`);

    res.json({
      success: true,
      token,
      message: "Login exitoso",
      user: {
        id: user.id,
        email: user.email,
        usuario: user.usuario,
        rol: user.rol,
        activo: user.activo
      }
    });

  } catch (error) {
    handleError(error, 'POST /api/login', res);
  }
});

// ✅ CAMBIADO: Logout endpoint con /api
app.post("/api/logout", (req, res) => {
  res.json({ success: true, message: "Sesión cerrada exitosamente" });
});

// ============================================
// MONTAR RUTAS
// ============================================

// RUTAS PÚBLICAS (sin autenticación)
// ✅ CAMBIADO: Register con /api
app.use('/api/register', registerRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/login-google', logingoogleRoutes);
app.use('/api/config-puntos', adminConfigPuntos); // Pública - para obtener configuración

// ✅ NUEVAS RUTAS PÚBLICAS PARA LA PÁGINA PRINCIPAL
app.get('/api/principalP', principalPagina.getRanking);
app.get('/api/emprendimientos/public', principalPagina.getEmprendimientosPublic);
app.get('/api/premios/public', principalPagina.getPremiosPublic);

// ✅ RUTAS DE RECUPERACIÓN DE CONTRASEÑA (PÚBLICAS - SIN AUTENTICACIÓN)
app.post('/api/forgot-password', authLimiter, recuperacionPagina.forgotPassword);
app.post('/api/reset-password/:token', recuperacionPagina.resetPassword);

// RUTAS PROTEGIDAS - REQUIEREN AUTENTICACIÓN
app.use('/api', authenticateToken, usuarioRoutes);

// RUTAS DE ADMINISTRADOR - Solo usuarios con rol 'admin'
app.use('/api/admin-registro', authenticateToken, authorize('admin'), adminRegistro);
app.use('/api/emprendimientos', authenticateToken, authorize('admin'), adminEmprendimientos);
app.use('/api/promociones', authenticateToken, authorize('admin'), adminPromociones);
app.use('/api/premios', authenticateToken, authorize('admin'), adminPremios);
app.use('/api/suma-puntos', authenticateToken, authorize('admin'), adminSumaPuntos);
app.use('/api/notificaciones', authenticateToken, authorize('admin'), adminNotificaciones);

// RUTAS DE COLABORADOR - Solo usuarios con rol 'colab' o 'admin'
app.use('/api/factu', authenticateToken, authorize('colab', 'admin'), colabFactu);
app.use('/api/inventario', authenticateToken, authorize('colab', 'admin'), colabInventario);
app.use('/api/colab/emprendimiento', authenticateToken, authorize('colab', 'admin'), colabObtenerEmpren);
app.use('/api/colab/puntos', authenticateToken, authorize('colab', 'admin'), colabPuntos);
app.use('/api/colab', authenticateToken, authorize('colab', 'admin'), colabInicio);

// RUTAS DE USUARIO NORMAL - Cualquier usuario autenticado
app.use('/api/prem', authenticateToken, userPremios);

// ============================================
// ENDPOINT PARA VERIFICAR TOKEN (Útil para debug)
// ============================================
app.get('/api/verify-token', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    message: 'Token válido'
  });
});

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  logger.error(`Error no manejado:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method
  });
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
server.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📡 WebSocket disponible en ws://localhost:${PORT}`);
  console.log(`🔒 Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕐 Zona horaria: ${new Date().toString().match(/\(([^)]+)\)/)?.[1] || 'America/Guayaquil'}`);
  console.log(`\n📋 Endpoints disponibles:`);
  console.log(`   POST   /api/login                - Login de usuarios ✅`);
  console.log(`   POST   /api/logout               - Cerrar sesión ✅`);
  console.log(`   POST   /api/register             - Registro de usuarios ✅`);
  console.log(`   POST   /api/forgot-password      - Solicitar recuperación de contraseña`);
  console.log(`   POST   /api/reset-password/:token - Resetear contraseña`);
  console.log(`   GET    /api/config-puntos        - Obtener configuración (público)`);
  console.log(`   GET    /api/verify-token         - Verificar token (requiere auth)`);
  console.log(`   GET    /api/principalP           - Obtener ranking (público)`);
  console.log(`   GET    /api/emprendimientos/public - Obtener emprendimientos (público)`);
  console.log(`   GET    /api/premios/public       - Obtener premios (público)`);
  console.log(`\n👑 Rutas de Administrador (requieren rol 'admin'):`);
  console.log(`   /api/admin-registro/*`);
  console.log(`   /api/emprendimientos/*`);
  console.log(`   /api/promociones/*`);
  console.log(`   /api/premios/*`);
  console.log(`   /api/suma-puntos/*`);
  console.log(`   /api/notificaciones/*`);
  console.log(`\n👷 Rutas de Colaborador (requieren rol 'colab' o 'admin'):`);
  console.log(`   /api/factu/*`);
  console.log(`   /api/inventario/*`);
  console.log(`   /api/colab/*`);
  console.log(`\n👤 Rutas de Usuario (requieren autenticación):`);
  console.log(`   /api/prem/*`);
  console.log(`   /api/*`);
});