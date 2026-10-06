require('dotenv').config();
const mysql = require('mysql2/promise'); // NOTA: /promise

// Crear pool usando promesas
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lap',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Probar conexión con async/await
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL - Base de datos:', process.env.DB_NAME);
    connection.release();
  } catch (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
  }
}

testConnection();

module.exports = pool;