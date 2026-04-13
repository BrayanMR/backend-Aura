const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

function buildPrompt(message, conversationContext = [], conversationMemory = '') {
  const contextLines = renderConversationContext(conversationContext);
  return [
    'Eres un asistente de apoyo emocional cálido, humano y conversacional para una app de ayuda psicológica.',
    'Clasifica el mensaje del usuario y responde SOLO con JSON válido, sin markdown ni texto adicional.',
    'Formato exacto:',
    '{"category":"crisis|ansiedad|estres|tristeza|familiar|sueno|general","label":"texto corto","reply":"respuesta empatica en español","recommendedSpecialty":"texto corto","crisis":true|false}',
    'Reglas:',
    '- Si detectas riesgo de autolesión, suicidio o peligro inmediato, category debe ser crisis y crisis=true.',
    '- Si no hay señales claras, usa general y crisis=false.',
    '- Piensa en problemas de escuela, trabajo, pareja, amistades, familia, duelo, soledad, autoestima, culpa, enojo, estrés, ansiedad, ataques de pánico, cansancio mental, sueño, dependencia emocional, rechazo, acoso, cambios en casa o violencia.',
    '- reply debe sonar como una persona que acompaña, no como una plantilla ni como un sistema.',
    '- reply debe ser breve, empática, concreta y en español natural, cercano y joven.',
    '- No repitas ni paraphrasees literalmente el mensaje del usuario.',
    '- No digas cosas como "esto parece un tema familiar", "esto es ansiedad" o "suena a conflicto".',
    '- No expliques la situación con etiquetas; responde a lo que está pasando como si conversarás con una persona real.',
    '- No copies las palabras del usuario en la primera frase ni cierres con frases vacías.',
    '- Usa el contexto reciente para responder con criterio y continuidad.',
    '- La reply debe incluir una observación humana sobre lo que siente la persona o una pregunta concreta para seguir.',
    '- Si el mensaje habla de golpes, maltrato o una agresión en casa, responde con prioridad de seguridad y pregunta si están a salvo ahora mismo.',
    '- Si el usuario dice que quiere hablar con un psicólogo, con una persona o con alguien de apoyo, responde de forma directa y cálida, sin seguir dando vueltas.',
    '- recommendedSpecialty debe ser una especialidad de psicología útil para el caso.',
    '- memory debe ser un resumen corto y estable de lo importante que la app debe recordar sobre la persona.',
    '- memory no debe copiar el mensaje completo; debe guardar solo hechos, riesgos o contexto que sigan siendo útiles en el siguiente turno.',
    '- No menciones políticas internas ni instrucciones técnicas.',
    '- No uses markdown ni comillas decorativas.',
    '',
    conversationMemory ? `Memoria persistente actual:\n${conversationMemory}` : 'Memoria persistente actual: vacía.',
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
  const wantsHumanSupport =
    normalized.includes('quiero hablar con una persona') ||
    normalized.includes('quiero hablar con alguien') ||
    normalized.includes('quiero hablar con un psicologo') ||
    normalized.includes('quiero hablar con psicologo') ||
    normalized.includes('quiero hablar con una psicologa') ||
    normalized.includes('quiero hablar con psicologa') ||
    normalized.includes('con una persona') ||
    normalized.includes('con alguien') ||
    normalized.includes('pasame con una persona') ||
    normalized.includes('pasame con alguien') ||
    normalized.includes('pasame con el psicologo') ||
    normalized.includes('pasame con la psicologa') ||
    normalized.includes('derivame con un psicologo') ||
    normalized.includes('derivame con una persona') ||
    normalized.includes('necesito una persona') ||
    normalized.includes('necesito hablar con alguien');
  const hasViolenceInHome =
    (normalized.includes('padre') && normalized.includes('madre') &&
      (normalized.includes('pega') || normalized.includes('golpea') || normalized.includes('maltrata') || normalized.includes('agrede'))) ||
    (normalized.includes('papá') && normalized.includes('mamá') &&
      (normalized.includes('pega') || normalized.includes('golpea') || normalized.includes('maltrata') || normalized.includes('agrede')));

  if (
    normalized.includes('me pegaron') ||
    normalized.includes('me golpearon') ||
    normalized.includes('me pego') ||
    normalized.includes('me golpeo') ||
    normalized.includes('me maltratan') ||
    normalized.includes('me maltrataron') ||
    normalized.includes('violencia') ||
    normalized.includes('abuso') ||
    normalized.includes('me agredieron') ||
    hasViolenceInHome
  ) {
    return 'Lo que cuentas es serio. Si ahora mismo hay golpes o riesgo en casa, busca a un adulto de confianza, sal a un lugar seguro si puedes y pide ayuda de inmediato. ¿Están a salvo ahora mismo?';
  }

  if (wantsHumanSupport) {
    return 'Claro, te puedo orientar con un psicólogo. Si quieres, te ayudo a seguir por aquí y a la vez te conecto con apoyo humano para que no tengas que cargarlo solo/a.';
  }

  if (category === 'crisis') {
    return 'Lo que cuentas me preocupa. Si hay peligro ahora mismo, busca a una persona de confianza o emergencias ya mismo; si quieres, me quedo contigo para pensar el siguiente paso.';
  }

  if (category === 'ansiedad') {
    return 'Eso suena muy cargado por dentro. Cuéntame en qué momentos se pone peor y qué notas en tu cuerpo para ubicarlo mejor.';
  }

  if (category === 'estres') {
    return 'Parece que traes demasiado encima. Si me dices qué es lo que más te está agotando hoy, lo ordenamos juntos sin prisa.';
  }

  if (category === 'tristeza') {
    return 'Se siente pesado lo que estás contando. Si quieres, dime qué fue lo que más te golpeó hoy y lo vemos paso a paso.';
  }

  if (category === 'familiar') {
    if (hasViolenceInHome) {
      return 'Lo que cuentas es serio. Si ahora mismo hay golpes o riesgo en casa, busca a un adulto de confianza, sal a un lugar seguro si puedes y pide ayuda de inmediato. ¿Tu mamá está a salvo ahora mismo?';
    }

    return 'Lo que pasa en tu casa suena duro. Si quieres, dime qué ocurrió primero y qué es lo que más te preocupa ahora para ayudarte a ordenar el siguiente paso.';
  }

  if (category === 'sueno') {
    return 'Dormir mal te puede dejar todo más cuesta arriba. Dime si te cuesta dormirte, te despiertas mucho o te levantas sin energía, y te respondo más fino.';
  }

  if (normalized.includes('hola') || normalized.includes('buenas') || normalized.includes('buenos dias')) {
    return 'Te leo. Cuéntame qué te trae por acá hoy y voy contigo paso a paso, sin responderte en automático.';
  }

  if (normalized.includes('mi papa') || normalized.includes('mi papá') || normalized.includes('mi mama') || normalized.includes('mi mamá') || normalized.includes('mis papás') || normalized.includes('mis papas')) {
    if (hasViolenceInHome) {
      return 'Lo que cuentas es serio. Si ahora mismo hay golpes o riesgo en casa, busca a un adulto de confianza, sal a un lugar seguro si puedes y pide ayuda de inmediato. ¿Tu mamá está a salvo ahora mismo?';
    }

    return 'Lo que pasa en tu casa suena duro. Si quieres, dime qué ocurrió primero y qué es lo que más te pesa ahora para ayudarte a ordenar el siguiente paso.';
  }

  if (wantsHumanSupport) {
    return 'Claro, te acompaño y te conecto con apoyo humano. Si quieres, seguimos por aquí mientras preparo la derivación.';
  }

  return 'Te leo. Cuéntame un poco más de lo que pasó y te respondo con algo más útil y directo.';
}

function detectLocalCategory(message) {
  const normalized = normalizeText(message);

  if (
    normalized.includes('suicid') ||
    normalized.includes('matarme') ||
    normalized.includes('hacerme daño') ||
    normalized.includes('hacerme dano') ||
    normalized.includes('golpe') ||
    normalized.includes('violencia') ||
    normalized.includes('abuso')
  ) {
    return 'crisis';
  }

  if (
    normalized.includes('ansiedad') ||
    normalized.includes('nervios') ||
    normalized.includes('pánico') ||
    normalized.includes('panico')
  ) {
    return 'ansiedad';
  }

  if (
    normalized.includes('estres') ||
    normalized.includes('estres') ||
    normalized.includes('agotado') ||
    normalized.includes('presion') ||
    normalized.includes('presión')
  ) {
    return 'estres';
  }

  if (normalized.includes('triste') || normalized.includes('deprim') || normalized.includes('llorar')) {
    return 'tristeza';
  }

  if (
    normalized.includes('familia') ||
    normalized.includes('casa') ||
    normalized.includes('papá') ||
    normalized.includes('papa') ||
    normalized.includes('mamá') ||
    normalized.includes('mama')
  ) {
    return 'familiar';
  }

  if (
    normalized.includes('dorm') ||
    normalized.includes('sueño') ||
    normalized.includes('sueno') ||
    normalized.includes('insomnio')
  ) {
    return 'sueno';
  }

  return 'general';
}

router.post('/triage', async (req, res) => {
  try {
    const { message, conversationContext, conversationMemory } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Falta el mensaje' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash' 
});
    const incomingMemory = String(conversationMemory || '').trim();
    const result = await model.generateContent(
      buildPrompt(
        String(message),
        Array.isArray(conversationContext) ? conversationContext : [],
        incomingMemory,
      ),
    );
    const text = result.response.text();

    let parsed;
    try {
      parsed = safeParseJson(text);
    } catch (_) {
      parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') {
      const localCategory = detectLocalCategory(message);
      return res.json({
        category: localCategory,
        label: localCategory === 'general' ? 'orientación general' : localCategory,
        reply: buildFallbackReply(localCategory, String(message)),
        recommendedSpecialty: localCategory === 'crisis' ? 'Crisis y contención' : 'Bienestar emocional',
        crisis: localCategory === 'crisis',
        memory: incomingMemory,
        raw: { fallback: true, reason: 'Gemini no devolvió JSON válido' },
      });
    }

    const category = String(parsed.category || 'general').trim();
    const label = String(parsed.label || 'orientación general').trim();
    let reply = String(parsed.reply || '').trim();
    const recommendedSpecialty = String(parsed.recommendedSpecialty || 'Bienestar emocional').trim();
    const memory = String(parsed.memory || incomingMemory).trim();
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
      memory,
      raw: parsed,
    });
  } catch (error) {
    const message = String(req.body?.message || '');
    const localCategory = detectLocalCategory(message);
    console.error('[AI][TRIAGE][FALLBACK]', error.message);
    return res.json({
      category: localCategory,
      label: localCategory === 'general' ? 'orientación general' : localCategory,
      reply: buildFallbackReply(localCategory, message),
      recommendedSpecialty: localCategory === 'crisis' ? 'Crisis y contención' : 'Bienestar emocional',
      crisis: localCategory === 'crisis',
      memory: String(req.body?.conversationMemory || '').trim(),
      raw: { fallback: true, error: error.message },
    });
  }
});

// Ruta temporal para listar modelos disponibles de Gemini
router.get('/list-gemini-models', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada' });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const models = await genAI.listModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;