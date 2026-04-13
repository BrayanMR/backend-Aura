const express        = require('express');
const router         = express.Router();
const { getFirestore } = require('../config/firebase');
const authMiddleware = require('../middleware/auth');

// Todas las rutas requieren token válido
router.use(authMiddleware);

// ── Obtener chats de un usuario ────────────────────────────────────────────────
// GET /api/chats?documento=12345
router.get('/', async (req, res) => {
  try {
    const { documento } = req.query;
    if (!documento) return res.status(400).json({ error: 'Falta el parámetro ?documento=' });

    const db = getFirestore();
    // Buscar chats donde el usuario es paciente o psicólogo
    const [comoUsuario, comoPsicologo] = await Promise.all([
      db.collection('Chats').where('Documento_usuario', '==', documento).get(),
      db.collection('Chats').where('Documento_psicologo', '==', documento).get(),
    ]);

    const chats = new Map();
    comoUsuario.docs.forEach(doc  => chats.set(doc.id, { id: doc.id, ...doc.data() }));
    comoPsicologo.docs.forEach(doc => chats.set(doc.id, { id: doc.id, ...doc.data() }));

    res.json([...chats.values()]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Obtener un chat específico ─────────────────────────────────────────────────
// GET /api/chats/:chatId
router.get('/:chatId', async (req, res) => {
  try {
    const doc = await getFirestore().collection('Chats').doc(req.params.chatId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Chat no encontrado' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Crear un chat entre usuario y psicólogo ────────────────────────────────────
// POST /api/chats
// Body: { Documento_usuario, Documento_psicologo }
router.post('/', async (req, res) => {
  try {
    const { Documento_usuario, Documento_psicologo } = req.body;
    if (!Documento_usuario || !Documento_psicologo) {
      return res.status(400).json({ error: 'Se requieren Documento_usuario y Documento_psicologo' });
    }

    const db = getFirestore();

    // Evitar chats duplicados entre los mismos dos participantes
    const existe = await db.collection('Chats')
      .where('Documento_usuario', '==', Documento_usuario)
      .where('Documento_psicologo', '==', Documento_psicologo)
      .limit(1)
      .get();

    if (!existe.empty) {
      return res.status(409).json({ error: 'Ya existe un chat entre estos participantes', id: existe.docs[0].id });
    }

    const nombrePsicologo = req.body.nombre_psicologo ?? req.body.nombrePsicologo ?? '';
    const nombreUsuario = req.body.nombre_usuario ?? req.body.nombreUsuario ?? '';

    const ref = await db.collection('Chats').add({
      Documento_usuario,
      Documento_psicologo,
      Fecha_inicio: new Date().toISOString(),
      Mensaje: '',
      nombre_psicologo: nombrePsicologo,
      nombre_usuario: nombreUsuario,
    });

    res.status(201).json({ id: ref.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Enviar mensaje (actualizar último mensaje del chat) ────────────────────────
// PATCH /api/chats/:chatId/mensaje
// Body: { Mensaje } or { mensaje } or { texto, autor, autorUid, fecha }
router.patch('/:chatId/mensaje', async (req, res) => {
  try {
    const db = getFirestore();
    const chatRef = db.collection('Chats').doc(req.params.chatId);
    const chatSnap = await chatRef.get();

    if (!chatSnap.exists) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const body = req.body || {};
    const texto = String(body.Mensaje ?? body.mensaje ?? body.texto ?? '').trim();
    if (!texto) {
      return res.status(400).json({ error: 'Falta el campo Mensaje' });
    }

    const autor = String(body.autor ?? '').trim();
    const autorUid = String(body.autorUid ?? body.autor_uid ?? req.user?.uid ?? '').trim();
    const fecha = String(body.fecha ?? body.createdAt ?? new Date().toISOString());

    const nuevoMensaje = {
      texto,
      autor,
      autorUid,
      fecha,
    };

    const currentData = chatSnap.data() || {};
    const mensajesActuales = Array.isArray(currentData.Mensajes) ? currentData.Mensajes : [];

    const last = mensajesActuales.length > 0 ? mensajesActuales[mensajesActuales.length - 1] : null;
    if (last && typeof last === 'object') {
      const lastText = String(last.texto ?? last.Mensaje ?? '').trim().toLowerCase();
      const lastUid = String(last.autorUid ?? '').trim();
      const lastRole = String(last.autor ?? '').trim();
      const lastDateRaw = String(last.fecha ?? last.timestamp ?? last.Fecha ?? '').trim();
      const lastDate = lastDateRaw ? new Date(lastDateRaw) : null;
      const currentDate = fecha ? new Date(fecha) : new Date();

      const sameText = lastText === texto.toLowerCase();
      const sameAuthor =
        (autorUid && lastUid && autorUid === lastUid) ||
        (!autorUid && !lastUid && autor && lastRole && autor === lastRole);
      const closeInTime =
        lastDate instanceof Date && !Number.isNaN(lastDate.getTime())
          ? Math.abs(currentDate.getTime() - lastDate.getTime()) <= 10000
          : false;

      if (sameText && sameAuthor && closeInTime) {
        return res.json({
          updated: true,
          id: chatRef.id,
          Mensaje: texto,
          Mensajes: mensajesActuales,
          deduped: true,
        });
      }
    }

    const mensajesActualizados = [...mensajesActuales, nuevoMensaje];

    await chatRef.update({
      Mensajes: mensajesActualizados,
      Mensaje: texto,
      UltimoAutorUid: autorUid || currentData.UltimoAutorUid || '',
      updatedAt: new Date().toISOString(),
    });

    res.json({
      updated: true,
      id: chatRef.id,
      Mensaje: texto,
      Mensajes: mensajesActualizados,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Eliminar un chat ───────────────────────────────────────────────────────────
// DELETE /api/chats/:chatId
router.delete('/:chatId', async (req, res) => {
  try {
    await getFirestore().collection('Chats').doc(req.params.chatId).delete();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
