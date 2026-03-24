const express        = require('express');
const router         = express.Router();
const { getFirestore } = require('../config/firebase');
const authMiddleware = require('../middleware/auth');

// ── Listar todas las publicaciones (público) ───────────────────────────────────
// GET /api/foros
router.get('/', async (req, res) => {
  try {
    const snapshot = await getFirestore()
      .collection('Publicaciones')
      .orderBy('Fecha_publicacion', 'desc')
      .get();

    const publicaciones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(publicaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Obtener publicaciones de un psicólogo ─────────────────────────────────────
// GET /api/foros/psicologo/:documento
router.get('/psicologo/:documento', async (req, res) => {
  try {
    const snapshot = await getFirestore()
      .collection('Publicaciones')
      .where('Documento_psicologia', '==', req.params.documento)
      .get();

    const publicaciones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(publicaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Obtener una publicación ────────────────────────────────────────────────────
// GET /api/foros/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await getFirestore().collection('Publicaciones').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Crear publicación (solo psicólogos autenticados) ──────────────────────────
// POST /api/foros
// Header: Authorization: Bearer <idToken>
// Body: { Documento_psicologia, Nombre_psicologo, Contenido, Imagen_url? }
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { Documento_psicologia, Nombre_psicologo, Contenido, Imagen_url } = req.body;

    if (!Documento_psicologia || !Nombre_psicologo || !Contenido) {
      return res.status(400).json({ error: 'Se requieren Documento_psicologia, Nombre_psicologo y Contenido' });
    }

    const ref = await getFirestore().collection('Publicaciones').add({
      Documento_psicologia,
      Nombre_psicologo,
      Contenido,
      Imagen_url:        Imagen_url || null,
      Comentarios:       [],
      Fecha_publicacion: new Date().toISOString(),
    });

    res.status(201).json({ id: ref.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Agregar comentario a una publicación ──────────────────────────────────────
// POST /api/foros/:id/comentario
// Header: Authorization: Bearer <idToken>
// Body: { autor, texto }
router.post('/:id/comentario', authMiddleware, async (req, res) => {
  try {
    const { autor, texto } = req.body;
    if (!autor || !texto) return res.status(400).json({ error: 'Se requieren autor y texto' });

    const docRef = getFirestore().collection('Publicaciones').doc(req.params.id);
    const doc    = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Publicación no encontrada' });

    const comentarios = doc.data().Comentarios || [];
    comentarios.push({ autor, texto, fecha: new Date().toISOString() });

    await docRef.update({ Comentarios: comentarios });
    res.json({ updated: true, total_comentarios: comentarios.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Editar publicación (solo el autor) ────────────────────────────────────────
// PATCH /api/foros/:id
// Header: Authorization: Bearer <idToken>
// Body: { Contenido?, Imagen_url? }
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { Contenido, Imagen_url } = req.body;
    const updates = { updatedAt: new Date().toISOString() };
    if (Contenido)   updates.Contenido  = Contenido;
    if (Imagen_url)  updates.Imagen_url = Imagen_url;

    await getFirestore().collection('Publicaciones').doc(req.params.id).update(updates);
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Eliminar publicación ───────────────────────────────────────────────────────
// DELETE /api/foros/:id
// Header: Authorization: Bearer <idToken>
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await getFirestore().collection('Publicaciones').doc(req.params.id).delete();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
