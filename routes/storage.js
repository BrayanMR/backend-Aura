const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { getSupabase, getStorageBucket } = require('../config/supabase');

// Multer: almacena en memoria para subir directo a Supabase Storage
const upload = multer({ storage: multer.memoryStorage() });

// ── Subir archivo ──────────────────────────────────────────────────────────────
// POST /api/storage/upload
// Form-data: { file (archivo), destination (ruta en bucket, ej: "fotos/perfil.jpg") }
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se proporcionó archivo' });

    const supabase = getSupabase();
    const bucket = getStorageBucket();
    const destination = (req.body.destination || `uploads/${Date.now()}_${req.file.originalname}`).replace(/^\/+/, '');

    const { error: uploadError } = await supabase.storage.from(bucket).upload(destination, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message });
    }

    const { data: signedData, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(destination, 60 * 60 * 24 * 365);

    if (signedError) {
      return res.status(500).json({ error: signedError.message });
    }

    res.status(201).json({
      url: signedData.signedUrl,
      path: destination,
      bucket,
    });
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

    const supabase = getSupabase();
    const bucket = getStorageBucket();
    const expiresIn = Number(req.query.expiresIn || 3600);

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ url: data.signedUrl, path: filePath, bucket, expiresIn });
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

    const supabase = getSupabase();
    const bucket = getStorageBucket();

    const { error } = await supabase.storage.from(bucket).remove([filePath]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ deleted: true, path: filePath, bucket });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
