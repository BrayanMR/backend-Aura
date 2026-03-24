const { getAuth } = require('../config/firebase');

/**
 * * Uso: agrega este middleware en las rutas que requieran autenticación
 *   router.get('/privado', authMiddleware, (req, res) => { ... })
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    req.user = decoded; // uid, email, etc. disponibles en los controladores
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = authMiddleware;
