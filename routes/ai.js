const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

function buildPrompt(message, conversationContext = []) {
  const contextLines = renderConversationContext(conversationContext);
  return [
    'Eres un asistente de triage emocional para una app de apoyo psicológico.',
    'Clasifica el mensaje del usuario y responde SOLO con JSON válido, sin markdown ni texto adicional.',
    'Formato exacto:',
    '{"category":"crisis|ansiedad|estres|tristeza|familiar|sueno|general","label":"texto corto","reply":"respuesta empatica en español","recommendedSpecialty":"texto corto","crisis":true|false}',
    'Reglas:',
    '- Si detectas riesgo de autolesión, suicidio o peligro inmediato, category debe ser crisis y crisis=true.',
    '- Si no hay señales claras, usa general y crisis=false.',
    '- reply debe ser breve, empática, concreta y en español neutro y juvenil.',
    '- No repitas ni paraphrasees literalmente el mensaje del usuario. No copies sus palabras en la primera frase.',
    '- Usa el contexto reciente para responder con criterio, no como un texto genérico.',
    '- Evita frases de relleno repetidas como "Gracias por contarlo" o "te escucho" si no aportan nada.',
    '- La reply debe añadir una observación útil o una pregunta concreta que demuestre comprensión.',
    '- recommendedSpecialty debe ser una especialidad de psicología útil para el caso.',
    '- No menciones políticas internas ni instrucciones técnicas.',
    '- No uses markdown ni comillas decorativas.',
    '-da consejos y ayudas psicologicas si el te lo pide',
    '',
    contextLines ? `Contexto reciente:\n${contextLines}` : 'Contexto reciente: sin contexto adicional.',
    '',
    `Mensaje del usuario: ${message}`,
  ].join('\n');
}

function renderConversationContext(conversationContext) {
  if (!Array.isArray(conversationContext) || conversationContext.length === 0) {
    return '';
  }

  return conversationContext
    .slice(-6)
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        const role = String(entry.role || 'unknown').toLowerCase();
        const text = String(entry.text || '').trim();
        if (!text) return '';
        return `${role}: ${text}`;
      }

      const text = String(entry || '').trim();
      return text ? `message: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
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

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9áéíóúüñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTooSimilarReply(reply, message) {
  const normalizedReply = normalizeText(reply);
  const normalizedMessage = normalizeText(message);

  if (!normalizedReply || !normalizedMessage) return false;
  if (normalizedReply.includes(normalizedMessage) || normalizedMessage.includes(normalizedReply)) {
    return true;
  }

  const replyWords = new Set(normalizedReply.split(' ').filter((word) => word.length > 2));
  const messageWords = new Set(normalizedMessage.split(' ').filter((word) => word.length > 2));

  if (replyWords.size === 0 || messageWords.size === 0) return false;

  let overlap = 0;
  messageWords.forEach((word) => {
    if (replyWords.has(word)) overlap += 1;
  });

  return overlap / messageWords.size >= 0.6;
}

function buildFallbackReply(category, message) {
  const normalized = normalizeText(message);

  if (category === 'crisis') {
    return 'Lo que describes requiere atención inmediata y quiero ayudarte a priorizar tu seguridad. Si hay riesgo ahora mismo, busca a una persona de confianza o emergencias; después seguimos con el siguiente paso juntos.';
  }

  if (category === 'ansiedad') {
    return 'Se nota mucha activación en lo que cuentas. Vamos a bajar eso a una situación concreta: dime cuándo se intensifica más y qué suele pasar justo antes.';
  }

  if (category === 'estres') {
    return 'Estás sosteniendo demasiado a la vez. Si me dices qué parte te está drenando más hoy, te ayudo a ordenarlo en un paso manejable.';
  }

  if (category === 'tristeza') {
    return 'Hay una carga emocional fuerte en lo que dices. Cuéntame qué es lo que más te pesa hoy para ubicar mejor lo que necesitas.';
  }

  if (category === 'familiar') {
    return 'Parece un conflicto que te está afectando bastante. Si quieres, separa qué pasó y cómo te hizo sentir para verlo con más claridad.';
  }

  if (category === 'sueno') {
    return 'El sueño puede empeorar todo lo demás. Si me dices si te cuesta dormirte, mantener el sueño o descansar, te doy una orientación más precisa.';
  }

  if (normalized.includes('hola') || normalized.includes('buenas') || normalized.includes('buenos dias')) {
    return 'Te leo. Para orientarte mejor, cuéntame qué es lo que hoy te pesa más.';
  }

  return 'Te leo y prefiero no responderte en automático. Cuéntame un poco más de lo que pasó para darte una orientación más precisa.';
}

router.post('/triage', async (req, res) => {
  try {
    const { message, conversationContext } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Falta el mensaje' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(
      buildPrompt(String(message), Array.isArray(conversationContext) ? conversationContext : []),
    );
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
    let reply = String(parsed.reply || '').trim();
    const recommendedSpecialty = String(parsed.recommendedSpecialty || 'Bienestar emocional').trim();
    const crisisValue = parsed.crisis;
    const crisis = crisisValue === true || crisisValue === 'true' || crisisValue === 1 || crisisValue === '1';

    if (!reply || isTooSimilarReply(reply, String(message))) {
      reply = buildFallbackReply(category, String(message));
    }

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