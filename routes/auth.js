const express = require('express');
const router  = express.Router();
const { getAuth } = require('../config/firebase');
const { getFirestore } = require('../config/firebase');
const authMiddleware = require('../middleware/auth');

// ── Crear usuario ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { email, password, displayName?, nombre?, apellido?, documento?, role? }
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, nombre, apellido, documento, role } = req.body;
    const user = await getAuth().createUser({ email, password, displayName });
    
    // Guardar información adicional en Firestore
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: displayName || user.displayName || '',
      nombre: nombre || '',
      apellido: apellido || '',
      documento: documento || '',
      role: role || 'usuario',
      activo: true,
      createdAt: new Date().toISOString(),
    };
    
    try {
      await getFirestore().collection('usuarios').doc(user.uid).set(userData);
    } catch (firestoreError) {
      // Si falla Firestore, eliminar el usuario de Auth (rollback)
      console.error('❌ Error guardando en Firestore, haciendo rollback:', firestoreError.message);
      await getAuth().deleteUser(user.uid);
      throw firestoreError;
    }
    
    res.status(201).json(userData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Obtener usuario por UID ────────────────────────────────────────────────────
// GET /api/auth/user/:uid
router.get('/user/:uid', async (req, res) => {
  try {
    const user = await getAuth().getUser(req.params.uid);
    res.json({ uid: user.uid, email: user.email, displayName: user.displayName, disabled: user.disabled });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// ── Actualizar usuario ─────────────────────────────────────────────────────────
// PUT /api/auth/user/:uid
// Body: { displayName?, email?, password?, disabled? }
router.put('/user/:uid', async (req, res) => {
  try {
    const updated = await getAuth().updateUser(req.params.uid, req.body);
    res.json({ uid: updated.uid, email: updated.email, displayName: updated.displayName });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Eliminar usuario ───────────────────────────────────────────────────────────
// DELETE /api/auth/user/:uid
router.delete('/user/:uid', async (req, res) => {
  try {
    await getAuth().deleteUser(req.params.uid);
    res.json({ message: `Usuario ${req.params.uid} eliminado` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Verificar ID Token ─────────────────────────────────────────────────────────
// POST /api/auth/verify-token
// Body: { idToken }
router.post('/verify-token', async (req, res) => {
  try {
    const { idToken } = req.body;
    const decoded = await getAuth().verifyIdToken(idToken);
    res.json({ uid: decoded.uid, email: decoded.email });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

// ── Obtener datos del usuario autenticado ─────────────────────────────────────────
// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'No autenticado' });

    const doc = await getFirestore().collection('usuarios').doc(uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ uid, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Crear Custom Token ─────────────────────────────────────────────────────────
// POST /api/auth/custom-token
// Body: { uid, claims? }
router.post('/custom-token', async (req, res) => {
  try {
    const { uid, claims } = req.body;
    const token = await getAuth().createCustomToken(uid, claims);
    res.json({ customToken: token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Login ──────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }

const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('📝 Login attempt:', email);
    
    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }
    
    const user = await getAuth().getUserByEmail(email.trim().toLowerCase());
    console.log('✅ Usuario encontrado:', user.uid);
    
    // Si hay contraseña, validarla con la API REST de Firebase
    if (password) {
      const firebaseKey = process.env.FIREBASE_WEB_API_KEY;
      console.log('🔑 Validando contraseña. API Key disponible:', !!firebaseKey);
      
      if (firebaseKey) {
        try {
          console.log('🌐 Llamando a Firebase REST API...');
          const response = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: email.trim().toLowerCase(),
                password: password,
                returnSecureToken: true,
              }),
            }
          );
          
          const data = await response.json();
          console.log('📨 Respuesta Firebase:', response.status, data.error?.message);
          
          if (!response.ok) {
            if (data.error?.message === 'INVALID_PASSWORD') {
              console.log('❌ Contraseña incorrecta');
              return res.status(401).json({ error: 'Contraseña incorrecta' });
            }
            console.log('❌ Error en Firebase:', data.error?.message);
            return res.status(401).json({ error: data.error?.message || 'Credenciales inválidas' });
          }
          console.log('✅ Contraseña válida');
        } catch (err) {
          console.error('⚠️ Error en fetch de contraseña:', err.message);
          return res.status(400).json({ error: 'Error validando contraseña' });
        }
      } else {
        console.warn('⚠️ FIREBASE_WEB_API_KEY no configurada');
      }
    }
    
    console.log('✅ Login exitoso');
    // Generar token JWT
    const token = jwt.sign(
      { uid: user.uid, email: user.email },
      process.env.JWT_SECRET || 'mi_clave_secreta', // Usa variable de entorno o valor por defecto
      { expiresIn: '7d' }
    );
    res.json({ token, uid: user.uid, email: user.email });
  } catch (error) {
    console.error('❌ Error en login:', error.message);
    if (error.code === 'auth/user-not-found') {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
