const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const SYSTEM_PROMPT = `Eres Aura, un asistente de apoyo emocional avanzado y con Inteligencia Artificial para una aplicación móvil de salud mental. Tu objetivo es proporcionar acompañamiento empático, contención y orientación psicológica básica de manera cálida, humana e inteligente.

Reglas clave para tu comportamiento y tono:
1. TONO HUMANO Y CÁLIDO: Habla con cercanía y empatía, como un amigo comprensivo o un psicólogo clínico en su primera sesión de contención. Evita a toda costa sonar robótico, clínico en exceso, dar respuestas de plantilla o usar frases repetitivas.
2. PERSONALIZACIÓN NATURAL: Si conoces el nombre del usuario (por ejemplo, a través de la memoria persistente), inclúyelo en tus respuestas de forma natural y espontánea (ej: "Entiendo, Brayan..." o "Siento mucho que pases por eso, Ana..."). No abuses del nombre, úsalo donde sume calidez.
3. SEGUIMIENTO ACTIVO: Analiza el contexto de los últimos mensajes. Si el usuario te responde sobre algo que le sugeriste o te da continuidad, no ignores lo que te ha dicho. Haz preguntas de seguimiento suaves y lógicas, y ofrece pequeños pasos prácticos aplicables a su vida diaria.
4. DETECCION DE CRISIS: Si detectas que el usuario menciona ideas de suicidio, autolesión, abuso físico, violencia familiar inmediata o peligro inminente, debes clasificar la conversación como crisis ("crisis": true, "category": "crisis"). Responde con extrema compasión y seriedad, priorizando siempre su integridad y guiándolo directamente a buscar ayuda de emergencia o de personas de confianza en su entorno.

MEMORIA PERSISTENTE:
- Se te proporcionará una lista de hechos estables sobre el usuario (nombre, profesión, hobbies, situación familiar, relaciones, preocupaciones crónicas, fobias, etc.) recopilados en conversaciones anteriores.
- Si en el mensaje actual el usuario comparte un nuevo dato personal estable e importante (ej. "tengo insomnio los domingos", "estudio programación en el SENA", "discutí con mi novio"), debes integrarlo a la memoria.
- Devuelve la memoria completa y actualizada en formato de lista de hechos cortos, cada uno en una línea separada por salto de línea (\\n) (ej. "Nombre: Brayan\\nProfesión: Programador SENA\\nSufre de insomnio los domingos").
- Mantén la memoria en tercera persona. Elimina información redundante u obsoleta si entra en contradicción con hechos nuevos. Si no hay memoria relevante previa ni nueva, mantén el campo vacío o como estaba.

RAZONAMIENTO INTERNO (Chain of Thought):
- Debes incluir tu razonamiento clínico e interno en el campo "reasoning". Aquí analizarás qué emoción está sintiendo el usuario, si hay algún patrón recurrente, qué hechos nuevos has aprendido para actualizar la memoria y por qué decides dar la respuesta empática que has redactado. Esto te obliga a pensar antes de responder.

FORMATO DE SALIDA:
Debes responder ÚNICAMENTE con un objeto JSON válido que cumpla con la estructura de abajo. No incluyas bloques de código markdown (\`\`\`json) ni texto adicional fuera del JSON.

Esquema JSON esperado:
{
  "reasoning": "Razonamiento paso a paso sobre el estado del usuario, la evolución de la conversación, los datos estables aprendidos y la estrategia de contención empleada.",
  "category": "crisis|ansiedad|estres|tristeza|familiar|sueno|general",
  "label": "breve etiqueta de dos o tres palabras en minúsculas sobre el tema tratado (ej: 'ansiedad por examen', 'pelea con hermano', 'tristeza por ruptura')",
  "reply": "Tu respuesta empática, natural y personalizada en español.",
  "recommendedSpecialty": "Especialidad sugerida (ej: 'Psicoterapia Cognitivo-Conductual', 'Terapia Dialéctica Conductual', 'Terapia de Pareja y Familia')",
  "crisis": true|false,
  "memory": "Texto con la memoria persistente de hechos actualizada, separada por saltos de línea \\n.",
  "emotions": {
    "primary": "alegria|tristeza|ira|miedo|ansiedad|culpa|vergüenza|soledad|esperanza|frustracion|confianza|desesperanza|neutral",
    "intensity": 0.1,
    "secondary": "emocion o null"
  },
  "therapies": [
    {
      "name": "CBT|DBT|EMDR|ACT|MBCT|Gestalt|Humanista|etc",
      "description": "Breve explicación en español de por qué es adecuada esta terapia para el caso particular",
      "suitability": 0.8
    }
  ],
  "metrics": {
    "confidence": 0.95,
    "sentimentScore": -0.8
  }
}`;

function buildUserPrompt(message, conversationContext = [], conversationMemory = '') {
  const contextLines = renderConversationContext(conversationContext);
  const parts = [];
  
  if (conversationMemory) {
    parts.push(`[MEMORIA PERSISTENTE ACTUAL]\n${conversationMemory}`);
  } else {
    parts.push('[MEMORIA PERSISTENTE ACTUAL]\nVacía.');
  }
  
  if (contextLines) {
    parts.push(`[CONTEXTO DE LA CONVERSACIÓN RECIENTE]\n${contextLines}`);
  } else {
    parts.push('[CONTEXTO DE LA CONVERSACIÓN RECIENTE]\nSin contexto previo.');
  }
  
  parts.push(`[MENSAJE ACTUAL DEL USUARIO]\n${message}`);
  
  parts.push(`Por favor, analiza el mensaje actual del usuario considerando la memoria y el contexto reciente. Responde ÚNICAMENTE en el formato JSON estructurado solicitado, asegurándote de actualizar la memoria de forma adecuada y escribir un razonamiento profundo en el campo 'reasoning'.`);
  
  return parts.join('\n\n');
}

function renderConversationContext(conversationContext) {
  if (!Array.isArray(conversationContext) || conversationContext.length === 0) {
    return '';
  }

  return conversationContext
    .slice(-8)
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        const role = String(entry.role || entry.autor || 'unknown').toLowerCase();
        const text = String(entry.text || entry.texto || '').trim();
        if (!text) return '';
        return `${role === 'assistant' || role === 'ia' ? 'asistente' : 'usuario'}: ${text}`;
      }

      const text = String(entry || '').trim();
      return text ? `mensaje: ${text}` : '';
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

function isMemoryRecallIntent(message) {
  const normalized = normalizeText(message);
  return (
    normalized.includes('te acuerdas') ||
    normalized.includes('recuerdas') ||
    normalized.includes('recordas') ||
    normalized.includes('hablabamos') ||
    normalized.includes('hablamos') ||
    normalized.includes('del tema') ||
    normalized.includes('lo que te dije')
  );
}

function hasUsableContext(conversationContext = [], conversationMemory = '') {
  const memory = String(conversationMemory || '').trim();
  if (memory.length >= 12) return true;
  if (!Array.isArray(conversationContext)) return false;

  return conversationContext.some((entry) => {
    if (!entry) return false;
    const text = String(entry.text || entry.texto || '').trim();
    const role = String(entry.role || entry.autor || '').toLowerCase();
    if (role && role !== 'user' && role !== 'usuario') return false;
    return text.length >= 8;
  });
}

function isGenericReplyText(reply) {
  const normalized = normalizeText(reply);
  if (!normalized) return true;
  const genericPatterns = [
    'te leo',
    'cuentame un poco mas',
    'cuentame que te trae por aca',
    'te respondo con algo mas util',
    'paso a paso',
  ];
  return genericPatterns.some((pattern) => normalized.includes(pattern));
}

function isSummaryIntent(message) {
  const normalized = normalizeText(message);
  return (
    normalized.includes('resumen') ||
    normalized.includes('resumir') ||
    normalized.includes('resumeme') ||
    normalized.includes('hazme un resumen') ||
    normalized.includes('resume lo que') ||
    normalized.includes('que te conte') ||
    normalized.includes('que te dije')
  );
}

function isOutOfScopeIntent(message) {
  const normalized = normalizeText(message);
  const psychSignals = [
    'emocion', 'emocional', 'sentir', 'siento', 'ansiedad', 'estres', 'triste', 'deprim', 'llorar',
    'familia', 'padre', 'madre', 'mama', 'papa', 'pareja', 'hijo', 'hija', 'hermano', 'hermana',
    'trauma', 'traumas', 'abuso', 'violencia', 'crisis', 'suicid', 'dormir', 'sueno', 'sueño',
    'nombre', 'llamo', 'soy', 'me llamo', 'como me llamo', 'recorda', 'recuerda', 'quien soy'
  ];
  const offTopicSignals = [
    'jugar', 'juego', 'juega', 'free fire', 'free firee', 'freefire', 'colombia juega', 'que dia juega',
    'partido', 'futbol', 'baloncesto', 'tenis', 'formula 1', 'clima', 'temperatura', 'noticias',
    'politica', 'politico', 'musica', 'cancion', 'pelicula', 'serie', 'videojuego', 'gaming',
    'codigo', 'programar', 'matematic', 'tarea', 'examen', 'escuela', 'colegio', 'trabajo'
  ];

  if (psychSignals.some((signal) => normalized.includes(signal))) {
    return false;
  }

  return offTopicSignals.some((signal) => normalized.includes(signal));
}

function buildOutOfScopeReply() {
  return pickVariant([
    'Oye, solo estoy para ayudarte con temas psicológicos, traumas y temas familiares. Si quieres, cuéntame cómo te sientes o qué te preocupa y ahí sí te acompaño.',
    'Ese tema se sale de mi enfoque. Yo te apoyo en temas psicológicos, traumas y familia. Si quieres, dime cómo te estás sintiendo y lo vemos juntos.',
    'No soy para deportes o temas generales; estoy para acompañarte en lo emocional, traumas y familia. Si quieres, seguimos por ahí.',
  ], 'out_of_scope');
}

function pickVariant(options, seed = '') {
  if (!Array.isArray(options) || options.length === 0) return '';
  const normalizedSeed = normalizeText(seed);
  const hash = Array.from(normalizedSeed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return options[hash % options.length];
}

function summarizeRecentUserContext(conversationContext = []) {
  if (!Array.isArray(conversationContext)) return '';

  const userMessages = conversationContext
    .filter((entry) => {
      if (!entry) return false;
      const role = String(entry.role || entry.autor || '').toLowerCase();
      return role === 'user' || role === 'usuario';
    })
    .map((entry) => String(entry.text || entry.texto || '').trim())
    .filter(Boolean);

  const filteredMessages = userMessages.filter((msg) => !isSummaryIntent(msg));

  if (filteredMessages.length === 0) return '';

  return filteredMessages
    .slice(-2)
    .map((msg) => msg.length > 100 ? `${msg.slice(0, 100)}...` : msg)
    .join(' | ');
}

function buildSummaryReply(conversationContext = [], conversationMemory = '') {
  const memoryLines = String(conversationMemory || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith('perfil:'));

  const hasUsefulMemory = memoryLines.some((line) => !line.toLowerCase().startsWith('ultimo tema:'));
  const cleanMemoryLines = hasUsefulMemory
    ? memoryLines.filter((line) => !line.toLowerCase().startsWith('ultimo tema:'))
    : memoryLines;

  const memorySummary = cleanMemoryLines.slice(0, 3).join('; ');
  const contextSummary = summarizeRecentUserContext(conversationContext);
  const combined = `${memorySummary.toLowerCase()} ${contextSummary.toLowerCase()}`;
  const hasFamilyContext =
    combined.includes('familiar') ||
    combined.includes('mama') ||
    combined.includes('papá') ||
    combined.includes('papa') ||
    combined.includes('casa');
  const hasViolenceContext =
    combined.includes('violencia') ||
    combined.includes('maltrato') ||
    combined.includes('golpe') ||
    combined.includes('agred');
  const hasNightContext = combined.includes('noche');
  const intro = (hasFamilyContext || hasViolenceContext)
    ? 'Sí, me acuerdo. Sé que este tema te duele.'
    : 'Sí, me acuerdo de lo que venimos hablando.';

  if (!memorySummary && !contextSummary) {
    return 'Puedo resumirte mejor si me dices de cuál parte quieres el resumen: lo familiar, cómo te has sentido, o lo último que hablamos.';
  }

  if (memorySummary && contextSummary) {
    const followUp = hasNightContext
      ? 'Si quieres, retomemos desde esa noche: ¿qué fue lo más difícil para ti en ese momento?'
      : 'Si quieres, retomemos por la parte que más te pesa ahora para ayudarte con algo concreto.';
    return `${intro} En resumen, me contaste: ${memorySummary}. Lo último que mencionaste fue: ${contextSummary}. ${followUp}`;
  }

  const base = memorySummary || contextSummary;
  return `${intro} En resumen, me contaste: ${base}. Si quieres, lo bajamos a un siguiente paso concreto para hoy.`;
}

function buildFallbackReply(category, message, conversationContext = [], conversationMemory = '') {
  const normalized = normalizeText(message);
  if (isOutOfScopeIntent(message)) {
    return buildOutOfScopeReply();
  }

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

  if (isSummaryIntent(message)) {
    return buildSummaryReply(conversationContext, conversationMemory);
  }

  if (isMemoryRecallIntent(message) && hasUsableContext(conversationContext, conversationMemory)) {
    return 'Sí, me acuerdo de lo que veníamos hablando. Si quieres, retomemos desde lo último que te estaba pesando para ayudarte con algo concreto ahora mismo.';
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
    if (hasUsableContext(conversationContext, conversationMemory)) {
      return 'Hola. Te sigo el hilo; si quieres retomamos lo último que venías trabajando y vemos qué cambió hoy.';
    }
    return 'Cuéntame qué te trae por acá hoy y voy contigo paso a paso. :)';
  }

  if (normalized.includes('mi papa') || normalized.includes('mi papá') || normalized.includes('mi mama') || normalized.includes('mi mamá') || normalized.includes('mis papás') || normalized.includes('mis papas')) {
    if (hasViolenceInHome) {
      return 'Lo que cuentas es serio. Si ahora mismo hay golpes o riesgo en casa, busca a un adulto de confianza, sal a un lugar seguro si puedes y pide ayuda de inmediato. ¿Tu mamá está a salvo ahora mismo?';
    }

    return 'Lo que pasa en tu casa suena duro. Si quieres, dime qué ocurrió primero y qué es lo que más te pesa ahora para ayudarte a ordenar el siguiente paso.';
  }

  return pickVariant([
    'Te leo. Cuéntame un poco más de lo que pasó y te respondo con algo más útil y directo.',
    'Estoy contigo. Si me das un poco más de contexto, te respondo de forma más concreta.',
    'Gracias por abrir el tema. Cuéntame un poco más para ayudarte con algo realmente útil.',
  ], `${category}|${message}`);
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
  const startTime = Date.now();
  const { message, conversationContext, conversationMemory } = req.body;
  const incomingMemory = String(conversationMemory || '').trim();

  try {
    const authHeader = req.headers.authorization || 'none';
    console.log('[AI-TRIAGE] Request received:', {
      authStartsWithBearer: String(authHeader).startsWith('Bearer '),
      messageLength: String(message || '').length,
      contextSize: Array.isArray(conversationContext) ? conversationContext.length : 0,
      memorySize: incomingMemory.length,
    });

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Falta el mensaje' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('[AI-TRIAGE] Warning: GROQ_API_KEY is not configured in environment.');
      return res.status(500).json({ error: 'GROQ_API_KEY no está configurada en el servidor' });
    }

    if (isOutOfScopeIntent(message)) {
      const processingTime = Date.now() - startTime;
      return res.json({
        category: 'general',
        label: 'fuera de alcance',
        reply: buildOutOfScopeReply(),
        recommendedSpecialty: 'Bienestar emocional',
        crisis: false,
        memory: incomingMemory,
        emotions: {
          primary: 'neutral',
          intensity: 0.3,
          secondary: null
        },
        therapies: [],
        metrics: {
          confidence: 0.9,
          processingTime,
          sentimentScore: 0.0
        },
        raw: { fallback: true, reason: 'Tema fuera de alcance' },
        isFallback: true
      });
    }

    // Inicializar cliente de OpenAI apuntando a Groq
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const userPrompt = buildUserPrompt(
      String(message),
      Array.isArray(conversationContext) ? conversationContext : [],
      incomingMemory
    );

    const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    console.log(`[AI-TRIAGE] Querying model: ${modelName}`);

    const chatCompletion = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1024
    });

    const text = chatCompletion.choices[0].message.content;
    console.log('[AI-TRIAGE] Received response text length:', text.length);

    let parsed;
    try {
      parsed = safeParseJson(text);
    } catch (parseError) {
      console.error('[AI-TRIAGE] Error parsing JSON from Groq response:', parseError);
      parsed = null;
    }

    const processingTime = Date.now() - startTime;

    if (!parsed || typeof parsed !== 'object') {
      console.warn('[AI-TRIAGE] Falling back to local deterministic output due to invalid JSON from LLM.');
      const localCategory = detectLocalCategory(message);
      return res.json({
        category: localCategory,
        label: localCategory === 'general' ? 'orientación general' : localCategory,
        reply: buildFallbackReply(
          localCategory,
          String(message),
          Array.isArray(conversationContext) ? conversationContext : [],
          incomingMemory,
        ),
        recommendedSpecialty: localCategory === 'crisis' ? 'Crisis y contención' : 'Bienestar emocional',
        crisis: localCategory === 'crisis',
        memory: incomingMemory,
        emotions: {
          primary: localCategory === 'crisis' ? 'miedo' : 'neutral',
          intensity: localCategory === 'crisis' ? 0.8 : 0.3,
          secondary: null
        },
        therapies: localCategory === 'crisis' ? 
          [{ name: 'DBT', description: 'Terapia Dialéctica Conductual para manejo de crisis', suitability: 0.8 }] : 
          [{ name: 'CBT', description: 'Terapia Cognitivo-Conductual para bienestar general', suitability: 0.6 }],
        metrics: {
          confidence: 0.5,
          processingTime,
          sentimentScore: localCategory === 'crisis' ? -0.7 : 0.0
        },
        raw: { fallback: true, reason: 'Groq no devolvió JSON válido' },
        isFallback: true
      });
    }

    const category = String(parsed.category || 'general').trim();
    const label = String(parsed.label || 'orientación general').trim();
    let reply = String(parsed.reply || '').trim();
    const recommendedSpecialty = String(parsed.recommendedSpecialty || 'Bienestar emocional').trim();
    const memory = String(parsed.memory || incomingMemory).trim();
    const crisisValue = parsed.crisis;
    const crisis = crisisValue === true || crisisValue === 'true' || crisisValue === 1 || crisisValue === '1';
    const summaryIntent = isSummaryIntent(String(message));

    // Validar emociones
    const emotions = parsed.emotions || {};
    const emotionsResult = {
      primary: String(emotions.primary || 'neutral').trim(),
      intensity: Math.max(0.1, Math.min(1.0, parseFloat(emotions.intensity) || 0.5)),
      secondary: emotions.secondary ? String(emotions.secondary).trim() : null
    };

    // Validar terapias recomendadas
    const therapies = Array.isArray(parsed.therapies) ? parsed.therapies.slice(0, 3).map(therapy => ({
      name: String(therapy.name || 'CBT').trim(),
      description: String(therapy.description || 'Terapia recomendada').trim(),
      suitability: Math.max(0.1, Math.min(1.0, parseFloat(therapy.suitability) || 0.5))
    })) : [{ name: 'CBT', description: 'Terapia Cognitivo-Conductual', suitability: 0.6 }];

    // Validar métricas de efectividad
    const metrics = parsed.metrics || {};
    const metricsResult = {
      confidence: Math.max(0.1, Math.min(1.0, parseFloat(metrics.confidence) || 0.7)),
      processingTime,
      sentimentScore: Math.max(-1.0, Math.min(1.0, parseFloat(metrics.sentimentScore) || 0.0))
    };

    if (summaryIntent) {
      reply = buildSummaryReply(
        Array.isArray(conversationContext) ? conversationContext : [],
        incomingMemory,
      );
    }

    if (!reply || isTooSimilarReply(reply, String(message)) || isGenericReplyText(reply)) {
      reply = buildFallbackReply(
        category,
        String(message),
        Array.isArray(conversationContext) ? conversationContext : [],
        incomingMemory,
      );
    }

    return res.json({
      category,
      label,
      reply,
      recommendedSpecialty,
      crisis,
      memory,
      emotions: emotionsResult,
      therapies,
      metrics: metricsResult,
      raw: parsed,
      isFallback: false
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMsg = error && error.message ? error.message : String(error);
    console.error('[AI-TRIAGE] Error in /triage handler:', errorMsg);
    if (error && error.stack) console.error(error.stack);

    const localCategory = detectLocalCategory(message);
    return res.json({
      category: localCategory,
      label: 'error de backend',
      reply: buildFallbackReply(
        localCategory,
        String(message),
        Array.isArray(conversationContext) ? conversationContext : [],
        incomingMemory,
      ),
      recommendedSpecialty: 'Bienestar emocional',
      crisis: localCategory === 'crisis',
      memory: incomingMemory,
      emotions: {
        primary: 'neutral',
        intensity: 0.3,
        secondary: null
      },
      therapies: [],
      metrics: {
        confidence: 0.0,
        processingTime,
        sentimentScore: 0.0
      },
      raw: { error: true, details: errorMsg },
      isFallback: true
    });
  }
});

// Listar modelos disponibles de Groq
router.get('/list-groq-models', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY no está configurada' });
    }
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const models = await client.models.list();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

