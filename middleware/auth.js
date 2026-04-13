
const jwt = require('jsonwebtoken');

/**
 * * Uso: agrega este middleware en las rutas que requieran autenticación
 *   router.get('/privado', authMiddleware, (req, res) => { ... })
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mi_clave_secreta');
    req.user = decoded; // uid, email, etc. disponibles en los controladores
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = authMiddleware;
