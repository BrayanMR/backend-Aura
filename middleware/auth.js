
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación: verifica JWT tokens
 * Usa: router.get('/privado', authMiddleware, (req, res) => { ... })
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader
      .replace(/^[Bb]earer\s+/, '')
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim();

    if (!token) {
      console.error('[AUTH][ERROR] Authorization header presente pero token vacío:', authHeader);
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('[AUTH][ERROR] Token malformado:', token);
      console.error('[AUTH][ERROR] Authorization header original:', authHeader);
      return res.status(401).json({ error: 'Token inválido o malformado' });
    }

    const secret = process.env.JWT_SECRET || 'mi_clave_secreta';
    
    // Verificar JWT
    const decoded = jwt.verify(token, secret);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      ...decoded,
    };
    next();
  } catch (err) {
    console.error('[AUTH][ERROR]', err.message);
    return res.status(401).json({ 
      error: 'Token inválido o expirado',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
