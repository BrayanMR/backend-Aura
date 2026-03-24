const express = require('express');
const router  = express.Router();
const { getRTDB } = require('../config/firebase');

// ── Leer nodo ──────────────────────────────────────────────────────────────────
// GET /api/rtdb/*path   ej: /api/rtdb/usuarios/abc123
router.get('/*', async (req, res) => {
  try {
    const path = '/' + req.params[0];
    const snapshot = await getRTDB().ref(path).once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'Nodo no encontrado' });
    res.json(snapshot.val());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Escribir / sobreescribir nodo ──────────────────────────────────────────────
// PUT /api/rtdb/*path
// Body: { ...datos }
router.put('/*', async (req, res) => {
  try {
    const path = '/' + req.params[0];
    await getRTDB().ref(path).set(req.body);
    res.json({ written: true, path });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Actualizar campos de un nodo ───────────────────────────────────────────────
// PATCH /api/rtdb/*path
// Body: { ...camposAActualizar }
router.patch('/*', async (req, res) => {
  try {
    const path = '/' + req.params[0];
    await getRTDB().ref(path).update(req.body);
    res.json({ updated: true, path });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Agregar elemento a lista (push) ───────────────────────────────────────────
// POST /api/rtdb/*path
// Body: { ...datos }
router.post('/*', async (req, res) => {
  try {
    const path = '/' + req.params[0];
    const ref = await getRTDB().ref(path).push(req.body);
    res.status(201).json({ key: ref.key });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Eliminar nodo ──────────────────────────────────────────────────────────────
// DELETE /api/rtdb/*path
router.delete('/*', async (req, res) => {
  try {
    const path = '/' + req.params[0];
    await getRTDB().ref(path).remove();
    res.json({ deleted: true, path });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
