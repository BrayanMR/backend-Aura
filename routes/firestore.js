const express = require('express');
const router  = express.Router();
const { getFirestore } = require('../config/firebase');

// ── Obtener colección ──────────────────────────────────────────────────────────
// GET /api/firestore/:collection
router.get('/:collection', async (req, res) => {
  try {
    const snapshot = await getFirestore().collection(req.params.collection).get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Obtener documento ──────────────────────────────────────────────────────────
// GET /api/firestore/:collection/:docId
router.get('/:collection/:docId', async (req, res) => {
  try {
    const doc = await getFirestore().collection(req.params.collection).doc(req.params.docId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Documento no encontrado' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Crear documento (auto-id) ──────────────────────────────────────────────────
// POST /api/firestore/:collection
// Body: { ...campos }
router.post('/:collection', async (req, res) => {
  try {
    const ref = await getFirestore().collection(req.params.collection).add({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ id: ref.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Crear/Sobreescribir documento con ID específico ────────────────────────────
// PUT /api/firestore/:collection/:docId
// Body: { ...campos }
router.put('/:collection/:docId', async (req, res) => {
  try {
    await getFirestore().collection(req.params.collection).doc(req.params.docId).set({
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    res.json({ id: req.params.docId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Actualizar campos de un documento ─────────────────────────────────────────
// PATCH /api/firestore/:collection/:docId
// Body: { ...camposAActualizar }
router.patch('/:collection/:docId', async (req, res) => {
  try {
    await getFirestore().collection(req.params.collection).doc(req.params.docId).update({
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Eliminar documento ─────────────────────────────────────────────────────────
// DELETE /api/firestore/:collection/:docId
router.delete('/:collection/:docId', async (req, res) => {
  try {
    await getFirestore().collection(req.params.collection).doc(req.params.docId).delete();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Consulta con filtro ────────────────────────────────────────────────────────
// POST /api/firestore/:collection/query
// Body: { field, operator, value }   operator: '==', '>', '<', etc.
router.post('/:collection/query', async (req, res) => {
  try {
    const { field, operator, value } = req.body;
    const snapshot = await getFirestore()
      .collection(req.params.collection)
      .where(field, operator, value)
      .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
