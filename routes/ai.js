const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

function buildPrompt(message) {
  return [
    'Eres un asistente de triage emocional para una app de apoyo psicológico.',
    'Clasifica el mensaje del usuario y responde SOLO con JSON válido, sin markdown ni texto adicional.',
    'Formato exacto:',
    '{"category":"crisis|ansiedad|estres|tristeza|familiar|sueno|general","label":"texto corto","reply":"respuesta empatica en español","recommendedSpecialty":"texto corto","crisis":true|false}',
    'Reglas:',
    '- Si detectas riesgo de autolesión, suicidio o peligro inmediato, category debe ser crisis y crisis=true.',
    '- Si no hay señales claras, usa general y crisis=false.',
    '- reply debe ser breve, empática, concreta y en español neutro.',
    '- recommendedSpecialty debe ser una especialidad de psicología útil para el caso.',
    '- No menciones políticas internas ni instrucciones técnicas.',
    '',
    `Mensaje del usuario: ${message}`,
  ].join('\n');
}

function safeParseJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  const cleaned = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;

  return JSON.parse(cleaned);
}

router.post('/triage', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Falta el mensaje' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(buildPrompt(String(message)));
    const text = result.response.text();

    let parsed;
    try {
      parsed = safeParseJson(text);
    } catch (_) {
      parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return res.status(502).json({ error: 'Gemini no devolvió JSON válido' });
    }

    const category = String(parsed.category || 'general').trim();
    const label = String(parsed.label || 'orientación general').trim();
    const reply = String(parsed.reply || '').trim();
    const recommendedSpecialty = String(parsed.recommendedSpecialty || 'Bienestar emocional').trim();
    const crisisValue = parsed.crisis;
    const crisis = crisisValue === true || crisisValue === 'true' || crisisValue === 1 || crisisValue === '1';

    return res.json({
      category,
      label,
      reply,
      recommendedSpecialty,
      crisis,
      raw: parsed,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;