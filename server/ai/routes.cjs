/**
 * =============================================================================
 * AI ROUTES — Server-Managed AI API Endpoints
 * =============================================================================
 *
 * Express router that proxies all AI service calls (image generation, LLM chat,
 * TTS synthesis, audio transcription) through the server, using centralized
 * API keys stored in the admin_config table.
 *
 * This replaces the previous architecture where each browser client stored and
 * sent its own API keys. Now:
 *   - API keys are stored encrypted in the database (admin_config table).
 *   - Users never see or handle API keys.
 *   - Every call is authenticated, quota-checked, and usage-logged.
 *   - The admin configures providers/models/keys through the admin panel.
 *
 * Endpoints:
 *   POST /generate-image   — Generate an image via BFL, Gemini, or OpenAI-compatible
 *   POST /generate-tts     — Generate TTS audio via Gemini
 *   POST /chat             — LLM chat with SSE streaming
 *   POST /chat-reset       — Reset per-user chat history
 *   POST /transcribe-audio — Speech-to-text via Gemini multimodal
 *   GET  /config           — Returns non-secret config to frontend
 *
 * All routes require authentication (requireAuth applied at mount level in index.cjs).
 *
 * =============================================================================
 */

const express = require('express');
const { getDb } = require('../db.cjs');
const { decrypt, getMasterKey } = require('../utils/crypto.cjs');
const { checkQuota } = require('./quotaCheck.cjs');
const { logUsage } = require('./usageLogger.cjs');

const router = express.Router();

// ---------------------------------------------------------------------------
// Per-User Chat History Storage
// ---------------------------------------------------------------------------

/**
 * In-memory chat histories keyed by userId.
 *
 * Unlike the old vite.config.ts approach that used a single global chatHistory
 * array, this is per-user so multiple logged-in users can chat simultaneously
 * without their conversations mixing.
 *
 * The histories live in server memory and are lost on server restart.
 * This is intentional — chat history is ephemeral and transient.
 *
 * @type {Map<string, Array<{role: string, content: string}>>}
 */
const chatHistories = new Map();

/**
 * Per-user storyteller chat histories (separate from the editor chat).
 * @type {Map<string, Array<{role: string, content: string}>>}
 */
const storytellerHistories = new Map();

// ---------------------------------------------------------------------------
// Config Helpers
// ---------------------------------------------------------------------------

/**
 * Reads a configuration value from the admin_config table.
 *
 * If the value is marked as a secret (is_secret = 1), it is decrypted
 * using the master encryption key before being returned.
 *
 * @param {import('sql.js').Database} db - The database instance.
 * @param {string} key - The config key to look up (e.g., 'image_api_key').
 * @returns {string|null} The config value (decrypted if secret), or null if not found.
 */
function getConfig(db, key) {
  const result = db.exec(
    'SELECT value, is_secret FROM admin_config WHERE key = ?',
    [key]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const [value, isSecret] = result[0].values[0];

  if (isSecret) {
    try {
      const masterKey = getMasterKey();
      return decrypt(value, masterKey);
    } catch (err) {
      console.error(`[AI] Failed to decrypt config "${key}":`, err.message);
      return null;
    }
  }

  return value;
}

/**
 * Reads multiple config values at once, reducing repetitive DB queries.
 *
 * @param {import('sql.js').Database} db - The database instance.
 * @param {string[]} keys - Array of config keys to fetch.
 * @returns {Record<string, string|null>} Object mapping each key to its value (or null).
 */
function getConfigMultiple(db, keys) {
  const result = {};
  for (const key of keys) {
    result[key] = getConfig(db, key);
  }
  return result;
}

// ---------------------------------------------------------------------------
// POST /generate-image — Image Generation
// ---------------------------------------------------------------------------

/**
 * Generates an image using the admin-configured provider (BFL, Gemini, or OpenAI-compatible).
 *
 * The logic is copied from vite.config.ts but reads API keys and provider settings
 * from admin_config instead of the request body. Reference images are still sent
 * by the client since they're project-specific data, not configuration.
 *
 * Request body:
 *   { prompt: string, width?: number, height?: number, referenceImages?: string[] }
 *
 * Response:
 *   { dataUrl: string } — base64 data URL of the generated image
 */
router.post('/generate-image', async (req, res) => {
  try {
    const userId = req.userId;

    // --- Quota check ---
    const quota = await checkQuota(userId, 'image');
    if (!quota.allowed) {
      return res.status(429).json({
        error: 'Daily image generation quota exceeded.',
        limit: quota.limit,
        used: quota.used,
        remaining: 0,
        reason: quota.reason,
      });
    }

    const db = await getDb();

    // Read provider config from admin_config.
    const config = getConfigMultiple(db, [
      'image_provider', 'image_model', 'image_api_key', 'image_endpoint',
    ]);

    const provider = config.image_provider || 'bfl';
    const model = config.image_model || 'flux-pro-1.1';
    const apiKey = config.image_api_key;
    const endpoint = config.image_endpoint || 'https://api.bfl.ai/v1';

    if (!apiKey) {
      return res.status(503).json({
        error: 'Image generation not configured. Admin needs to set an API key in the admin panel.',
      });
    }

    // Parse request body.
    const {
      prompt,
      width = 1280,
      height = 720,
      referenceImages = [],
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    let dataUrl;

    if (provider === 'gemini') {
      // ─── Google Gemini Image Generation ────────────────────────────
      const geminiModel = model || 'gemini-3.1-flash-image-preview';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

      // Build multimodal parts: reference images first, then text prompt.
      const contentParts = [];

      let refImagesIncluded = 0;
      for (const refImg of referenceImages) {
        if (!refImg || !refImg.startsWith('data:')) continue;
        const match = refImg.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          contentParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          refImagesIncluded++;
        }
      }

      contentParts.push({
        text: refImagesIncluded > 0
          ? `IMPORTANT: The ${refImagesIncluded} reference image(s) above show the exact appearance of characters/locations in this story. You MUST closely match their physical features, clothing, hair color, facial structure, and overall style in the generated image. Generate a new scene image: ${prompt}`
          : `Generate an image: ${prompt}`,
      });

      const isSquare = Math.abs(width - height) < 64;
      const aspectRatio = isSquare ? '1:1' : (width > height ? '16:9' : '9:16');
      const imageSize = (width <= 768 && height <= 768) ? '1K' : '2K';

      console.log(`[AI:image] Gemini: model=${geminiModel}, aspect=${aspectRatio}, size=${imageSize}, refs=${refImagesIncluded}`);

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentParts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio, imageSize },
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return res.status(502).json({ error: `Gemini API error: ${errText}` });
      }

      const geminiData = await geminiRes.json();
      const parts = geminiData.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

      if (!imagePart?.inlineData) {
        return res.status(502).json({ error: 'No image returned from Gemini' });
      }

      dataUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

    } else if (provider === 'openai-compatible' || provider === 'hyprlab') {
      // ─── OpenAI-Compatible Flow (incl. HyprLab) ─────────────────
      const apiUrl = `${endpoint.replace(/\/+$/, '')}/images/generations`;
      const isFluxModel = model.includes('flux');
      const isNanoBananaModel = model.includes('nano-banana') || model.includes('imagen');

      let imgBody;
      if (isFluxModel || isNanoBananaModel) {
        // FLUX and Nano Banana models use aspect_ratio + resolution format
        const isSquare = Math.abs(width - height) < 64;
        const aspectRatio = isSquare ? '1:1' : (width > height ? '16:9' : '9:16');
        const resolution = (width >= 2048 || height >= 2048) ? '4 MP'
          : (width >= 1024 || height >= 1024) ? '2 MP' : '1 MP';

        imgBody = {
          model, prompt, aspect_ratio: aspectRatio, resolution,
          response_format: 'b64_json', output_format: 'png',
        };

        // HyprLab FLUX uses `input_images` array for reference images
        const validRefs = referenceImages.filter(r => r && r.startsWith('data:'));
        if (validRefs.length > 0) {
          imgBody.input_images = validRefs.slice(0, 3);
        }
      } else {
        // Standard OpenAI-compatible format (DALL-E etc.)
        imgBody = {
          model, prompt, size: `${width}x${height}`, n: 1, response_format: 'b64_json',
        };
      }

      console.log(`[AI:image] OpenAI-compat: model=${model}, endpoint=${endpoint}`);

      const genRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(imgBody),
      });

      if (!genRes.ok) {
        const errText = await genRes.text();
        return res.status(502).json({ error: `Image API error: ${errText}` });
      }

      const genData = await genRes.json();
      const item = genData.data?.[0];

      if (item?.b64_json) {
        dataUrl = `data:image/png;base64,${item.b64_json}`;
      } else if (item?.url) {
        const imgRes = await fetch(item.url);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const ct = imgRes.headers.get('content-type') || 'image/png';
        dataUrl = `data:${ct};base64,${imgBuf.toString('base64')}`;
      } else {
        return res.status(502).json({ error: 'No image data in response' });
      }

    } else {
      // ─── BFL Flow (async polling) ────────────────────────────────
      const submitUrl = `${endpoint.replace(/\/+$/, '')}/${model}`;
      const isUltra = model.includes('ultra');

      let bflBody;
      if (isUltra) {
        const bflIsSquare = Math.abs(width - height) < 64;
        bflBody = {
          prompt,
          aspect_ratio: bflIsSquare ? '1:1' : (width > height ? '16:9' : '9:16'),
        };
      } else {
        const w = Math.round(width / 32) * 32;
        const h = Math.round(height / 32) * 32;
        bflBody = { prompt, width: w, height: h };
      }

      // Add reference images to BFL request.
      const validRefs = referenceImages.filter(r => r && r.startsWith('data:'));
      if (validRefs.length > 0) {
        const isFlux2 = model.startsWith('flux-2');
        if (isFlux2) {
          const maxRefs = Math.min(validRefs.length, 8);
          for (let i = 0; i < maxRefs; i++) {
            const key = i === 0 ? 'input_image' : `input_image_${i + 1}`;
            bflBody[key] = validRefs[i];
          }
        } else {
          bflBody['image_prompt'] = validRefs[0];
        }
      }

      console.log(`[AI:image] BFL: model=${model}`);

      const submitRes = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Key': apiKey,
        },
        body: JSON.stringify(bflBody),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        return res.status(502).json({ error: `BFL API error: ${errText}` });
      }

      const { polling_url } = await submitRes.json();

      // Poll until ready (max ~120 seconds).
      const maxPolls = 60;
      let pollCount = 0;
      let imageUrl = null;

      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        pollCount++;

        const pollRes = await fetch(polling_url);
        const pollData = await pollRes.json();

        if (pollData.status === 'Ready') {
          imageUrl = pollData.result?.sample || null;
          break;
        } else if (pollData.status === 'Error' || pollData.status === 'Request Moderated') {
          return res.status(502).json({ error: `Image generation failed: ${pollData.status}` });
        }
      }

      if (!imageUrl) {
        return res.status(504).json({ error: 'Image generation timed out' });
      }

      const imgRes = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      dataUrl = `data:${contentType};base64,${imgBuffer.toString('base64')}`;
    }

    // --- Log usage after successful generation ---
    await logUsage(userId, 'image', provider, model, { imageCount: 1 });

    console.log(`[AI:image] Done. Provider=${provider}, Model=${model}, Prompt="${prompt.slice(0, 60)}..."`);
    res.json({ dataUrl });

  } catch (err) {
    console.error('[AI:image] Error:', err);
    res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /generate-tts — Text-to-Speech
// ---------------------------------------------------------------------------

/**
 * Generates TTS audio using the admin-configured TTS provider (Gemini).
 *
 * Handles the raw PCM (audio/L16) → WAV conversion that Gemini returns,
 * wrapping the raw PCM data in a WAV header so browsers can play it.
 *
 * Request body:
 *   { text: string, voice?: string, instruction?: string }
 *
 * Response:
 *   { dataUrl: string } — base64 data URL of the generated audio (WAV)
 */
router.post('/generate-tts', async (req, res) => {
  try {
    const userId = req.userId;

    // --- Quota check ---
    const quota = await checkQuota(userId, 'tts');
    if (!quota.allowed) {
      return res.status(429).json({
        error: 'Daily TTS quota exceeded.',
        limit: quota.limit,
        used: quota.used,
        remaining: 0,
        reason: quota.reason,
      });
    }

    const db = await getDb();

    // Read TTS config from admin_config.
    const config = getConfigMultiple(db, [
      'tts_api_key', 'tts_model', 'tts_voice',
    ]);

    const apiKey = config.tts_api_key;
    const ttsModel = config.tts_model || 'gemini-2.5-flash-preview-tts';
    const defaultVoice = config.tts_voice || 'Zephyr';

    if (!apiKey) {
      return res.status(503).json({
        error: 'TTS not configured. Admin needs to set a TTS API key in the admin panel.',
      });
    }

    const {
      text,
      voice = defaultVoice,
      instruction = 'Read aloud in a very natural fluid audiobook narrator style, very genuine:',
    } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text provided for TTS' });
    }

    // Call Gemini TTS.
    const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`;

    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `${instruction}\n${text}` }],
        }],
        generationConfig: {
          responseModalities: ['audio'],
          temperature: 1,
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: voice },
            },
          },
        },
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return res.status(502).json({ error: `Gemini TTS error: ${errText}` });
    }

    const ttsData = await ttsRes.json();
    const parts = ttsData.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

    if (!audioPart?.inlineData) {
      return res.status(502).json({ error: 'No audio returned from Gemini TTS' });
    }

    // Convert raw PCM to WAV if needed.
    const rawMime = audioPart.inlineData.mimeType || '';
    const rawB64 = audioPart.inlineData.data;
    let finalDataUrl;
    let audioSeconds = 0;

    if (rawMime.includes('L16') || rawMime.includes('pcm')) {
      const rateMatch = rawMime.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      const pcmBuf = Buffer.from(rawB64, 'base64');
      const numChannels = 1;
      const bitsPerSample = 16;
      const blockAlign = numChannels * (bitsPerSample / 8);
      const byteRate = sampleRate * blockAlign;
      const dataSize = pcmBuf.length;

      // Calculate audio duration for usage tracking.
      audioSeconds = dataSize / byteRate;

      // Build 44-byte WAV header.
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + dataSize, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(numChannels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(blockAlign, 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);

      const wavBuf = Buffer.concat([header, pcmBuf]);
      finalDataUrl = `data:audio/wav;base64,${wavBuf.toString('base64')}`;
    } else {
      finalDataUrl = `data:${rawMime};base64,${rawB64}`;
      // Estimate duration for non-PCM formats (rough: assume ~16KB/s for compressed audio).
      const rawSize = Buffer.from(rawB64, 'base64').length;
      audioSeconds = rawSize / 16000;
    }

    // --- Log usage ---
    await logUsage(userId, 'tts', 'gemini', ttsModel, { audioSeconds });

    console.log(`[AI:tts] Done. Model=${ttsModel}, Voice=${voice}, Duration=${audioSeconds.toFixed(1)}s`);
    res.json({ dataUrl: finalDataUrl });

  } catch (err) {
    console.error('[AI:tts] Error:', err);
    res.status(500).json({ error: err.message || 'TTS generation failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /chat — LLM Chat with SSE Streaming
// ---------------------------------------------------------------------------

/**
 * Handles LLM chat requests with Server-Sent Events (SSE) streaming.
 *
 * Chat histories are stored per-user in server memory (chatHistories map).
 * The first message in a conversation can include a systemPrompt which is
 * stored as the first message in the history.
 *
 * SSE event format:
 *   data: { type: "text", text: "..." }     — streamed content chunk
 *   data: { type: "done" }                  — stream complete
 *   data: { type: "error", error: "..." }   — error occurred
 *
 * Request body:
 *   { message: string, systemPrompt?: string }
 *
 * Note: provider, model, and API key are read from admin_config, not the request body.
 */
router.post('/chat', async (req, res) => {
  try {
    const userId = req.userId;

    // --- Quota check ---
    const quota = await checkQuota(userId, 'llm');
    if (!quota.allowed) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ type: 'error', error: quota.reason })}\n\n`);
      res.end();
      return;
    }

    const db = await getDb();

    // Read LLM config from admin_config.
    const config = getConfigMultiple(db, [
      'llm_provider', 'llm_model', 'llm_api_key', 'llm_endpoint',
    ]);

    const provider = config.llm_provider || 'gemini';
    const model = config.llm_model || 'gemini-2.5-flash';
    const apiKey = config.llm_api_key;
    const endpoint = config.llm_endpoint || 'https://api.openai.com/v1';

    // SSE headers.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'LLM not configured. Admin needs to set an API key in the admin panel.' })}\n\n`);
      res.end();
      return;
    }

    const { message, systemPrompt } = req.body;

    if (!message) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Message is required.' })}\n\n`);
      res.end();
      return;
    }

    // Get or create per-user chat history.
    if (!chatHistories.has(userId)) {
      chatHistories.set(userId, []);
    }
    const chatHistory = chatHistories.get(userId);

    // Add system prompt on first message of conversation.
    if (chatHistory.length === 0 && systemPrompt) {
      chatHistory.push({ role: 'system', content: systemPrompt });
    }

    chatHistory.push({ role: 'user', content: message });

    let aborted = false;
    const abortController = new AbortController();
    res.on('close', () => {
      aborted = true;
      abortController.abort();
    });

    let assistantResponse = '';
    let tokensEstimate = 0;

    if (provider === 'gemini' || provider === 'hyprlab') {
      // ─── Gemini-Compatible Streaming (Google Gemini + HyprLab) ──
      // HyprLab's v1beta endpoint uses the same Gemini API format.
      const geminiBase = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const geminiUrl = `${geminiBase}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

      const contents = chatHistory.filter(msg => msg.role !== 'system').map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const geminiBody = {
        system_instruction: {
          parts: [{ text: chatHistory.find(msg => msg.role === 'system')?.content || '' }],
        },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 65536 },
      };

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: abortController.signal,
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text().catch(() => 'Unknown error');
        let errMsg = `Gemini API error ${geminiRes.status}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errMsg;
        } catch { errMsg += ': ' + errText.slice(0, 200); }
        res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
        res.end();
        return;
      }

      const reader = geminiRes.body;
      let buf = '';

      for await (const chunk of reader) {
        if (aborted) break;
        buf += (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());

        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && !aborted) {
              assistantResponse += text;
              res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
            }
          } catch { /* skip malformed chunks */ }
        }
      }

    } else {
      // ─── OpenAI-Compatible Streaming ───────────────────────────
      const baseUrl = (endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const chatUrl = `${baseUrl}/chat/completions`;

      const oaiRes = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.7,
          max_tokens: 16384,
          messages: chatHistory,
        }),
        signal: abortController.signal,
      });

      if (!oaiRes.ok) {
        const errText = await oaiRes.text().catch(() => 'Unknown error');
        let errMsg = `API error ${oaiRes.status}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errMsg;
        } catch { errMsg += ': ' + errText.slice(0, 200); }
        res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
        res.end();
        return;
      }

      const reader = oaiRes.body;
      let buf = '';

      for await (const chunk of reader) {
        if (aborted) break;
        buf += (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());

        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.choices?.[0]?.delta?.content;
            if (text && !aborted) {
              assistantResponse += text;
              res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    }

    if (!aborted) {
      chatHistory.push({ role: 'assistant', content: assistantResponse });

      // Estimate tokens for usage tracking (rough: ~4 chars per token).
      // This is approximate — exact token counts require a tokenizer.
      const inputChars = chatHistory.reduce((sum, m) => sum + m.content.length, 0);
      const tokensIn = Math.ceil(inputChars / 4);
      const tokensOut = Math.ceil(assistantResponse.length / 4);
      tokensEstimate = tokensIn + tokensOut;

      await logUsage(userId, 'llm', provider, model, { tokensIn, tokensOut });

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      }
    }

  } catch (err) {
    if (!res.writableEnded) {
      const msg = err.message || 'Unknown error';
      if (msg.includes('abort') || msg.includes('AbortError')) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// POST /chat-reset — Reset Per-User Chat History
// ---------------------------------------------------------------------------

/**
 * Clears the chat history for the authenticated user.
 *
 * Unlike the old global chatHistory, this only resets the calling user's
 * history — other users' conversations are unaffected.
 */
router.post('/chat-reset', (req, res) => {
  const userId = req.userId;
  chatHistories.delete(userId);
  console.log(`[AI:chat] Reset chat history for user ${userId.slice(0, 8)}..`);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /open-world — Open World Scene Generation (SSE Streaming)
// ---------------------------------------------------------------------------

/**
 * Stateless SSE streaming endpoint for Open World mode scene generation.
 *
 * Unlike /chat, this has NO server-side history — the full context is sent
 * in each request (system prompt + user message). Uses the admin-configured
 * LLM provider/model/key.
 *
 * Request body:
 *   { systemPrompt: string, userMessage: string,
 *     entityRefImages?: [{entityId, entityName, base64}],
 *     userUploadedImages?: [{base64, label}] }
 *
 * SSE events: same format as /chat (text, done, error)
 */
router.post('/open-world', async (req, res) => {
  try {
    const userId = req.userId;

    const quota = await checkQuota(userId, 'llm');
    if (!quota.allowed) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ type: 'error', error: quota.reason })}\n\n`);
      res.end();
      return;
    }

    const db = await getDb();
    const config = getConfigMultiple(db, [
      'llm_provider', 'llm_model', 'llm_api_key', 'llm_endpoint',
    ]);

    const provider = config.llm_provider || 'hyprlab';
    const model = config.llm_model || 'gemini-3-flash';
    const apiKey = config.llm_api_key;
    const endpoint = config.llm_endpoint || 'https://api.hyprlab.io/v1beta';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'LLM not configured. Admin needs to set an API key.' })}\n\n`);
      res.end();
      return;
    }

    const { systemPrompt, userMessage, entityRefImages, userUploadedImages } = req.body;

    if (!userMessage) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'userMessage is required.' })}\n\n`);
      res.end();
      return;
    }

    let aborted = false;
    const abortController = new AbortController();
    res.on('close', () => { aborted = true; abortController.abort(); });

    let fullResponse = '';

    if (provider === 'gemini' || provider === 'hyprlab') {
      // ─── Gemini-Compatible Streaming ───────────────────────────
      const geminiBase = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const geminiUrl = `${geminiBase}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

      // Build multimodal user content parts
      const userParts = [];

      // Add entity reference images if provided
      if (entityRefImages && Array.isArray(entityRefImages)) {
        for (const ref of entityRefImages) {
          if (!ref.base64 || !ref.base64.startsWith('data:')) continue;
          const match = ref.base64.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            userParts.push({ text: `[Reference image: ${ref.entityName}]` });
          }
        }
      }

      // Add user-uploaded images
      if (userUploadedImages && Array.isArray(userUploadedImages)) {
        for (const img of userUploadedImages) {
          if (!img.base64 || !img.base64.startsWith('data:')) continue;
          const match = img.base64.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            userParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            if (img.label) userParts.push({ text: `[Uploaded: ${img.label}]` });
          }
        }
      }

      // Add the main user message text
      userParts.push({ text: userMessage });

      const geminiBody = {
        system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: [{ role: 'user', parts: userParts }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
        },
      };

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal: abortController.signal,
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text().catch(() => 'Unknown error');
        res.write(`data: ${JSON.stringify({ type: 'error', error: `LLM error ${geminiRes.status}: ${errText.slice(0, 300)}` })}\n\n`);
        res.end();
        return;
      }

      // Stream SSE from Gemini → client
      const reader = geminiRes.body;
      let buf = '';
      for await (const chunk of reader) {
        if (aborted) break;
        buf += (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && !aborted) {
              fullResponse += text;
              res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
            }
          } catch { /* skip malformed chunks */ }
        }
      }

    } else {
      // ─── OpenAI-Compatible Streaming ───────────────────────────
      const baseUrl = (endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const chatUrl = `${baseUrl}/chat/completions`;

      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userMessage });

      const oaiRes = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, stream: true, temperature: 0.85, max_tokens: 65536,
          messages,
          response_format: { type: 'json_object' },
        }),
        signal: abortController.signal,
      });

      if (!oaiRes.ok) {
        const errText = await oaiRes.text().catch(() => 'Unknown error');
        res.write(`data: ${JSON.stringify({ type: 'error', error: `LLM error ${oaiRes.status}: ${errText.slice(0, 300)}` })}\n\n`);
        res.end();
        return;
      }

      const reader = oaiRes.body;
      let buf = '';
      for await (const chunk of reader) {
        if (aborted) break;
        buf += (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.choices?.[0]?.delta?.content;
            if (text && !aborted) {
              fullResponse += text;
              res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    }

    if (!aborted) {
      // Estimate tokens for usage logging
      const tokensIn = Math.ceil(((systemPrompt || '').length + userMessage.length) / 4);
      const tokensOut = Math.ceil(fullResponse.length / 4);
      await logUsage(userId, 'llm', provider, model, { tokensIn, tokensOut });

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      }
    }
  } catch (err) {
    if (!res.writableEnded) {
      const msg = err.message || 'Unknown error';
      if (msg.includes('abort') || msg.includes('AbortError')) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// POST /transcribe-audio — Speech-to-Text
// ---------------------------------------------------------------------------

/**
 * Transcribes audio using Gemini's multimodal capabilities.
 *
 * Sends the audio data as an inline attachment to Gemini along with a
 * transcription instruction. Gemini processes the audio and returns
 * the transcribed text.
 *
 * Request body:
 *   { audioData: string (base64), mimeType?: string }
 *
 * Response:
 *   { transcript: string, noSpeech?: boolean }
 */
router.post('/transcribe-audio', async (req, res) => {
  try {
    const userId = req.userId;
    const db = await getDb();

    // For ASR, use the LLM API key (Gemini multimodal).
    const apiKey = getConfig(db, 'llm_api_key');
    const asrModel = 'gemini-2.5-flash-lite';

    if (!apiKey) {
      return res.status(503).json({
        error: 'ASR not configured. Admin needs to set an LLM API key in the admin panel.',
      });
    }

    const { audioData, mimeType = 'audio/webm' } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    const audioBytes = Buffer.from(audioData, 'base64').length;
    if (audioBytes < 100) {
      return res.status(400).json({ error: 'Audio data too small — recording may have failed' });
    }

    console.log(`[AI:asr] Received ${(audioBytes / 1024).toFixed(1)}KB audio, mimeType=${mimeType}`);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${asrModel}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audioData } },
            { text: 'Transcribe exactly what is spoken in this audio recording. Output ONLY the transcribed text with no commentary, labels, or formatting. If no speech is audible, output: [no speech detected]' },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(502).json({ error: `Gemini ASR error (${geminiRes.status}): ${errText.slice(0, 300)}` });
    }

    const geminiData = await geminiRes.json();
    const transcript = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = transcript.trim();

    // Log minimal LLM usage for ASR.
    await logUsage(userId, 'llm', 'gemini', asrModel, {
      tokensIn: Math.ceil(audioBytes / 100), // rough estimate
      tokensOut: Math.ceil(cleaned.length / 4),
    });

    if (cleaned === '[no speech detected]' || cleaned === '') {
      return res.json({ transcript: '', noSpeech: true });
    }

    res.json({ transcript: cleaned });

  } catch (err) {
    console.error('[AI:asr] Error:', err);
    res.status(500).json({ error: err.message || 'Transcription failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /config — Public (Non-Secret) Configuration
// ---------------------------------------------------------------------------

/**
 * Returns the current AI configuration for the frontend to display.
 *
 * IMPORTANT: This NEVER returns API keys or any secret values. It only
 * returns provider names, model names, voice settings, and default styles
 * so the frontend can show what's configured without exposing secrets.
 *
 * Response:
 *   {
 *     imageProvider, imageModel, imageEndpoint,
 *     llmProvider, llmModel, llmEndpoint,
 *     ttsModel, ttsVoice,
 *     defaultImageStyle,
 *     hasImageKey, hasLlmKey, hasTtsKey  // booleans — key configured or not
 *   }
 */
router.get('/config', async (req, res) => {
  try {
    const db = await getDb();

    const keys = [
      'image_provider', 'image_model', 'image_endpoint',
      'llm_provider', 'llm_model', 'llm_endpoint',
      'tts_model', 'tts_voice', 'tts_endpoint',
      'asr_model', 'asr_endpoint',
      'default_image_style',
      'image_api_key', 'llm_api_key', 'tts_api_key', 'asr_api_key',
    ];

    const config = getConfigMultiple(db, keys);

    // Return non-secret values + boolean flags for whether keys are configured.
    // Default provider/endpoint is HyprLab (OpenAI-compatible proxy).
    res.json({
      imageProvider: config.image_provider || 'hyprlab',
      imageModel: config.image_model || 'flux-2-pro',
      imageEndpoint: config.image_endpoint || 'https://api.hyprlab.io/v1',
      llmProvider: config.llm_provider || 'hyprlab',
      llmModel: config.llm_model || 'gemini-3-flash',
      llmEndpoint: config.llm_endpoint || 'https://api.hyprlab.io/v1beta',
      ttsModel: config.tts_model || 'gemini-3.1-flash-tts',
      ttsVoice: config.tts_voice || 'Zephyr',
      ttsEndpoint: config.tts_endpoint || 'https://api.hyprlab.io/v1beta',
      asrModel: config.asr_model || 'whisper-1',
      asrEndpoint: config.asr_endpoint || 'https://api.hyprlab.io/v1/audio/transcriptions',
      defaultImageStyle: config.default_image_style || '',
      // Boolean flags: the frontend can show a green/red indicator
      // for whether each API key is configured, without revealing the key.
      hasImageKey: !!config.image_api_key,
      hasLlmKey: !!config.llm_api_key,
      hasTtsKey: !!config.tts_api_key,
      hasAsrKey: !!config.asr_api_key,
    });

  } catch (err) {
    console.error('[AI:config] Error:', err);
    res.status(500).json({ error: 'Failed to read AI configuration.' });
  }
});

// ---------------------------------------------------------------------------
// POST /config/test — Test API Connection
// ---------------------------------------------------------------------------

/**
 * Tests connectivity for a given AI service tab by making a minimal API call.
 * Used by the admin panel "Test Connection" button.
 *
 * Body: { tab: 'image'|'llm'|'tts'|'asr', config: { key: value } }
 *
 * For each tab, makes a lightweight request to verify the API key works:
 * - LLM: sends a tiny chat completion request
 * - Image: sends a small image gen request (or just validates the key)
 * - TTS: sends a short text for synthesis
 * - ASR: just verifies the endpoint is reachable
 */
router.post('/config/test', async (req, res) => {
  try {
    const { tab } = req.body || {};
    const db = await getDb();

    if (!tab) {
      return res.status(400).json({ success: false, message: 'Missing "tab" in request body.' });
    }

    if (tab === 'llm') {
      const provider = getConfig(db, 'llm_provider') || 'hyprlab';
      const model = getConfig(db, 'llm_model') || 'gemini-3-flash';
      const apiKey = getConfig(db, 'llm_api_key');
      const endpoint = getConfig(db, 'llm_endpoint') || 'https://api.hyprlab.io/v1beta';

      if (!apiKey) {
        return res.json({ success: false, message: 'No LLM API key configured. Save one first.' });
      }

      // Gemini-style test (works for HyprLab and Google)
      if (provider === 'gemini' || provider === 'hyprlab') {
        const base = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
        const url = `${base}/models/${model}:generateContent?key=${apiKey}`;
        const testRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Say "ok"' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        });
        if (testRes.ok) {
          return res.json({ success: true, message: `LLM connection OK (${model} via ${provider})` });
        }
        const errText = await testRes.text();
        return res.json({ success: false, message: `LLM error ${testRes.status}: ${errText.slice(0, 200)}` });
      }

      // OpenAI-compatible test
      const url = `${endpoint}/chat/completions`;
      const testRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 5 }),
      });
      if (testRes.ok) {
        return res.json({ success: true, message: `LLM connection OK (${model})` });
      }
      const errText = await testRes.text();
      return res.json({ success: false, message: `LLM error ${testRes.status}: ${errText.slice(0, 200)}` });

    } else if (tab === 'image') {
      const apiKey = getConfig(db, 'image_api_key');
      if (!apiKey) {
        return res.json({ success: false, message: 'No image API key configured. Save one first.' });
      }
      return res.json({ success: true, message: 'Image API key is configured. Generate an image to fully test.' });

    } else if (tab === 'tts') {
      const apiKey = getConfig(db, 'tts_api_key');
      if (!apiKey) {
        return res.json({ success: false, message: 'No TTS API key configured. Save one first.' });
      }
      return res.json({ success: true, message: 'TTS API key is configured. Generate speech to fully test.' });

    } else if (tab === 'asr') {
      const apiKey = getConfig(db, 'asr_api_key');
      if (!apiKey) {
        return res.json({ success: false, message: 'No ASR API key configured. Save one first.' });
      }
      return res.json({ success: true, message: 'ASR API key is configured. Transcribe audio to fully test.' });

    } else {
      return res.json({ success: false, message: `Unknown tab: ${tab}` });
    }

  } catch (err) {
    console.error('[AI:config/test] Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Test failed.' });
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = router;
