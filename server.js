require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const { initializeFirebase } = require('./config/firebase');
const { initializeSupabase } = require('./config/supabase');

// Rutas
const authRoutes      = require('./routes/auth');
const firestoreRoutes = require('./routes/firestore');
const rtdbRoutes      = require('./routes/rtdb');
const storageRoutes   = require('./routes/storage');
const messagingRoutes = require('./routes/messaging');
const chatsRoutes     = require('./routes/chats');
const forosRoutes     = require('./routes/foros');

// ── Inicializar Firebase ───────────────────────────────────────────────────────
initializeFirebase();
initializeSupabase();

// ── Crear app Express ──────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ───────────────────────────────────────────────────────
app.use(cors());                        // Permite peticiones desde Flutter
app.use(express.json());                // Parsear JSON en el body
app.use(express.urlencoded({ extended: true }));

// ── Ruta de salud ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Rutas de la API ────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/firestore', firestoreRoutes);
app.use('/api/rtdb',      rtdbRoutes);
app.use('/api/storage',   storageRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/chats',     chatsRoutes);
app.use('/api/foros',     forosRoutes);

// ── Manejador de errores global ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Iniciar servidor ───────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor AurApp corriendo en http://localhost:${PORT}`);
    console.log('📋 Rutas disponibles:');
    console.log(`   GET  http://localhost:${PORT}/health`);
    console.log(`   POST http://localhost:${PORT}/api/auth/register`);
    console.log(`   POST http://localhost:${PORT}/api/auth/verify-token`);
    console.log(`   GET  http://localhost:${PORT}/api/firestore/:collection`);
    console.log(`   GET  http://localhost:${PORT}/api/rtdb/*path`);
    console.log(`   POST http://localhost:${PORT}/api/storage/upload`);
    console.log(`   POST http://localhost:${PORT}/api/messaging/send`);
  });
}

module.exports = app;
