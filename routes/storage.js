const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const { getStorage } = require('../config/firebase');

// Multer: almacena en memoria para subir directo a Firebase Storage
const upload = multer({ storage: multer.memoryStorage() });

// ── Subir archivo ──────────────────────────────────────────────────────────────
// POST /api/storage/upload
// Form-data: { file (archivo), destination (ruta en bucket, ej: "fotos/perfil.jpg") }
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se proporcionó archivo' });

    const destination = req.body.destination || `uploads/${Date.now()}_${req.file.originalname}`;
    const fileRef     = getStorage().file(destination);

    await fileRef.save(req.file.buffer, {
      contentType: req.file.mimetype,
      metadata: { originalName: req.file.originalname },
    });

    // Obtener URL de descarga pública (expira en 1 año)
    const [url] = await fileRef.getSignedUrl({
      action:  'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ url, path: destination });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Obtener URL de descarga ────────────────────────────────────────────────────
// GET /api/storage/url?path=fotos/perfil.jpg
router.get('/url', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Falta el parámetro ?path=' });

    const [url] = await getStorage().file(filePath).getSignedUrl({
      action:  'read',
      expires: Date.now() + 60 * 60 * 1000, // URL válida por 1 hora
    });

    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Eliminar archivo ───────────────────────────────────────────────────────────
// DELETE /api/storage/file?path=fotos/perfil.jpg
router.delete('/file', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Falta el parámetro ?path=' });

    await getStorage().file(filePath).delete();
    res.json({ deleted: true, path: filePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
