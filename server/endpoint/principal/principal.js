// principal.js - SIGUIENDO EL MISMO PATRÓN QUE TUS OTROS ENDPOINTS
const logger = require("../../config/logger");

let pool;
let io;

const emitRankingUpdate = async () => {
  if (!io) return;

  try {
    const query = `
      SELECT 
        u.id,
        u.usuario AS nombre,
        u.foto_url AS foto,
        up.puntos_totales AS puntos,
        up.nivel
      FROM user u
      INNER JOIN user_puntos up ON u.id = up.user_id
      WHERE u.rol = 'usuario' AND u.activo = 1
      ORDER BY up.puntos_totales DESC
    `;

    const [results] = await pool.query(query);

    const ranking = results.map((usuario, index) => {
      // ✅ ACEPTA TANTO URL COMPLETAS COMO RUTAS RELATIVAS
      const fotoValida = usuario.foto ? usuario.foto : null;
      
      return {
        posicion: index + 1,
        id: usuario.id,
        nombre: usuario.nombre,
        puntos: usuario.puntos,
        nivel: usuario.nivel,
        foto: fotoValida || '👤'
      };
    });

    io.emit('ranking-actualizado', {
      success: true,
      total: ranking.length,
      ranking
    });
    
    logger.debug(`Ranking actualizado: ${ranking.length} usuarios`);
  } catch (error) {
    logger.error('Error obteniendo ranking:', error);
  }
};

const initSocket = (ioInstance) => {
  io = ioInstance;
  
  // Nota: No aplicamos middleware de autenticación aquí para permitir conexiones anónimas
  // El middleware de autenticación global ya está en el archivo principal del servidor
  
  io.on('connection', (socket) => {
    // Verificar si el usuario está autenticado o es anónimo
    const isAuthenticated = socket.user && socket.user.id;
    const userInfo = isAuthenticated ? `${socket.user.usuario} (ID: ${socket.user.id})` : 'ANÓNIMO';
    
    logger.info(`Cliente conectado al ranking: ${socket.id} - Usuario: ${userInfo}`);
    
    // Enviar ranking inicial al conectar
    emitRankingUpdate();

    // Escuchar solicitud manual de ranking
    socket.on('solicitar-ranking', () => {
      logger.debug(`Solicitud manual de ranking de ${socket.id}`);
      emitRankingUpdate();
    });

    socket.on('disconnect', () => {
      logger.info(`Cliente ranking desconectado: ${socket.id}`);
    });
  });

  // Actualizar ranking automáticamente cada 30 segundos
  const rankingInterval = setInterval(() => {
    emitRankingUpdate();
  }, 30000);
  
  // Limpiar intervalo cuando se cierre el servidor
  if (process.env.NODE_ENV !== 'test') {
    process.on('SIGTERM', () => {
      clearInterval(rankingInterval);
    });
  }
};

const getRanking = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id,
        u.usuario AS nombre,
        u.foto_url AS foto,
        up.puntos_totales AS puntos,
        up.nivel
      FROM user u
      INNER JOIN user_puntos up ON u.id = up.user_id
      WHERE u.rol = 'usuario' AND u.activo = 1
      ORDER BY up.puntos_totales DESC
      LIMIT 50
    `;

    const [results] = await pool.query(query);

    const ranking = results.map((usuario, index) => {
      // ✅ ACEPTA TANTO URL COMPLETAS COMO RUTAS RELATIVAS
      const fotoValida = usuario.foto ? usuario.foto : null;
      
      return {
        posicion: index + 1,
        id: usuario.id,
        nombre: usuario.nombre,
        puntos: usuario.puntos,
        nivel: usuario.nivel,
        foto: fotoValida || '👤'
      };
    });

    res.json({
      success: true,
      total: ranking.length,
      ranking
    });

  } catch (error) {
    logger.error('Error en GET /ranking:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

// ✅ MÉTODO PÚBLICO PARA OBTENER EMPRENDIMIENTOS (CON IMAGEN, CIUDAD Y REDES SOCIALES)
const getEmprendimientosPublic = async (req, res) => {
  try {
    const query = `
      SELECT 
        id, 
        nombre, 
        categoria, 
        ubicacion AS direccion,
        ciudad,
        horario,
        logo_imagen,
        whatsapp,
        instagram,
        tiktok
      FROM emprendimientos 
      WHERE activo = 1
      ORDER BY nombre ASC
    `;
    const [results] = await pool.query(query);
    res.json({ 
      success: true, 
      emprendimientos: results 
    });
  } catch (error) {
    logger.error('Error obteniendo emprendimientos públicos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

// ✅ MÉTODO PÚBLICO PARA OBTENER PREMIOS (SOLO NO VENCIDOS Y CON STOCK > 0)
const getPremiosPublic = async (req, res) => {
  try {
    const query = `
      SELECT 
        id, 
        nombre AS titulo,
        categoria,
        descripcion,
        puntos,
        imagen,
        stock,
        vecesCanjeado,
        DATE_FORMAT(fechaRegistro, '%d/%m/%Y') AS fechaRegistro,
        DATE_FORMAT(fechaVencimiento, '%d/%m/%Y') AS fechaVencimiento
      FROM premios 
      WHERE disponible = 1 
        AND stock > 0
        AND (fechaVencimiento IS NULL OR fechaVencimiento >= CURDATE())
      ORDER BY puntos ASC
      LIMIT 4
    `;
    
    const [results] = await pool.query(query);
    
    console.log(`📦 Premios enviados (no vencidos, stock > 0): ${results.length} premios`);
    
    res.json({ 
      success: true, 
      premios: results 
    });
  } catch (error) {
    logger.error('Error obteniendo premios públicos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

// ✅ NUEVO MÉTODO PARA ACTUALIZAR STOCK DESPUÉS DE UN CANJE
const actualizarStockPremio = async (req, res) => {
  const { premioId, cantidad } = req.body;
  
  try {
    // Verificar stock disponible
    const [premio] = await pool.query(
      'SELECT stock, vecesCanjeado FROM premios WHERE id = ?',
      [premioId]
    );
    
    if (premio.length === 0) {
      return res.status(404).json({ success: false, message: 'Premio no encontrado' });
    }
    
    if (premio[0].stock < cantidad) {
      return res.status(400).json({ success: false, message: 'Stock insuficiente' });
    }
    
    // Actualizar stock y veces canjeado
    const [result] = await pool.query(
      'UPDATE premios SET stock = stock - ?, vecesCanjeado = vecesCanjeado + ? WHERE id = ?',
      [cantidad, cantidad, premioId]
    );
    
    // Emitir evento de stock actualizado via Socket.IO
    if (io) {
      io.emit('stock-actualizado', {
        success: true,
        premioId: premioId,
        nuevoStock: premio[0].stock - cantidad,
        vecesCanjeado: premio[0].vecesCanjeado + cantidad
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Stock actualizado correctamente',
      nuevoStock: premio[0].stock - cantidad
    });
  } catch (error) {
    logger.error('Error actualizando stock:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};


// ✅ SIGUIENDO EL MISMO PATRÓN QUE TUS OTROS ENDPOINTS
module.exports = (db, ioInstance) => {
  pool = db;
  initSocket(ioInstance);
  
  // Retornar un objeto con los métodos que necesitas
  return {
    getRanking,
    getEmprendimientosPublic,
    getPremiosPublic,
    actualizarStockPremio
  };
};