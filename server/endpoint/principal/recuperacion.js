const logger = require("../../config/logger");
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

let pool;

// Configurar transporter de email (usa tus credenciales)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD
  }
});

// 1. Enviar enlace de recuperación
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  
  try {
    // Verificar si el email existe
    const [users] = await pool.query('SELECT id, email FROM user WHERE email = ?', [email]);
    
    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No existe una cuenta con este email' 
      });
    }
    
    // Generar token único
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hora
    
    // Guardar token en nueva tabla (crear previamente)
    await pool.query(
      'INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [users[0].id, token, expiresAt]
    );
    
    // Enviar email
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await transporter.sendMail({
      to: email,
      subject: 'Recuperación de contraseña',
      html: `<h3>Haz clic en el enlace para recuperar tu contraseña:</h3>
             <a href="${resetLink}">${resetLink}</a>
             <p>El enlace expira en 1 hora.</p>`
    });
    
    res.json({ success: true, message: 'Email enviado correctamente' });
    
  } catch (error) {
    logger.error('Error en forgotPassword:', error);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
};

// 2. Resetear contraseña
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  
  try {
    // Verificar token válido
    const [tokens] = await pool.query(
      'SELECT user_id FROM reset_tokens WHERE token = ? AND expires_at > NOW() AND used = 0',
      [token]
    );
    
    if (tokens.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token inválido o expirado' 
      });
    }
    
    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Actualizar contraseña
    await pool.query('UPDATE user SET contra = ? WHERE id = ?', 
      [hashedPassword, tokens[0].user_id]);
    
    // Marcar token como usado
    await pool.query('UPDATE reset_tokens SET used = 1 WHERE token = ?', [token]);
    
    res.json({ success: true, message: 'Contraseña actualizada' });
    
  } catch (error) {
    logger.error('Error en resetPassword:', error);
    res.status(500).json({ success: false, message: 'Error interno' });
  }
};

module.exports = (db) => {
  pool = db;
  return { forgotPassword, resetPassword };
};