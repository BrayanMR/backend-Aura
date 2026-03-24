const express = require('express');
const router  = express.Router();
const { getMessaging } = require('../config/firebase');

// ── Enviar notificación a un dispositivo ──────────────────────────────────────
// POST /api/messaging/send
// Body: { token, title, body, data? }
router.post('/send', async (req, res) => {
  try {
    const { token, title, body, data } = req.body;
    if (!token) return res.status(400).json({ error: 'Falta el token del dispositivo' });

    const message = {
      token,
      notification: { title, body },
      data: data || {},
    };

    const response = await getMessaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Enviar notificación a múltiples dispositivos ───────────────────────────────
// POST /api/messaging/send-multiple
// Body: { tokens: [...], title, body, data? }
router.post('/send-multiple', async (req, res) => {
  try {
    const { tokens, title, body, data } = req.body;
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: 'Falta el array de tokens' });
    }

    const message = {
      tokens,
      notification: { title, body },
      data: data || {},
    };

    const response = await getMessaging().sendEachForMulticast(message);
    res.json({
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses:    response.responses.map((r, i) => ({
        token:   tokens[i],
        success: r.success,
        error:   r.error ? r.error.message : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Suscribir tokens a un topic ────────────────────────────────────────────────
// POST /api/messaging/subscribe
// Body: { tokens: [...], topic }
router.post('/subscribe', async (req, res) => {
  try {
    const { tokens, topic } = req.body;
    const response = await getMessaging().subscribeToTopic(tokens, topic);
    res.json({ successCount: response.successCount, failureCount: response.failureCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Enviar notificación a un topic ─────────────────────────────────────────────
// POST /api/messaging/send-topic
// Body: { topic, title, body, data? }
router.post('/send-topic', async (req, res) => {
  try {
    const { topic, title, body, data } = req.body;
    const message = {
      topic,
      notification: { title, body },
      data: data || {},
    };
    const response = await getMessaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
