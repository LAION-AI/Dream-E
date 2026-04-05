/**
 * =============================================================================
 * VITE CONFIGURATION FILE
 * =============================================================================
 *
 * Configures Vite and includes the Dream-E API Bridge plugin.
 *
 * The API Bridge provides server-side middleware for:
 *   - Image generation (BFL FLUX 2, Google Gemini, OpenAI-compatible)
 *   - Text-to-Speech (Gemini TTS)
 *   - Open World scene generation (Gemini / OpenAI-compatible LLM)
 *   - In-app chat with agentic game state commands
 *   - RPG music search proxy
 *
 * All AI features use direct API calls — no external CLI tools required.
 * Users configure their own API keys in the AI Settings panel.
 *
 * =============================================================================
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

// createRequire is needed because vite.config.ts runs in ESM context,
// but the server/*.cjs modules use CommonJS require(). The CJS modules
// in turn require Express, bcryptjs, etc. which are also CJS.
const require = createRequire(import.meta.url);

// =============================================================================
// AGENT SESSION STATE (lives as long as the dev server)
// =============================================================================

/** Separate session ID for Open World mode (kept for potential future use) */
let openWorldSessionId: string | null = null;

/** Server-side chat message history for the direct-API chat endpoint */
let chatHistory: { role: string; content: string }[] = [];

/** Server-side chat message history for the Storyteller chat endpoint */
let storytellerChatHistory: Array<{ role: string; content: string }> = [];

// =============================================================================
// VITE CONFIG
// =============================================================================

export default defineConfig({
  plugins: [
    {
      name: 'dream-e-agent-bridge',
      configureServer(server) {
        // =============================================================
        // MOUNT SERVER-SIDE API (auth, projects, assets)
        // =============================================================
        // The server app handles user auth, project persistence (SQLite),
        // and binary asset storage at /api/v2/.
        //
        // IMPORTANT: We intercept /api/v2 requests in the main middleware
        // handler below (not via server.middlewares.use) because Vite's
        // connect-based middleware system can interfere with Express sub-apps.
        // The Express app is used as a handler via app(req, res).
        // =============================================================
        // Mount the Express server app for /api/v2/* routes.
        // This is registered as a single middleware handler that checks the URL
        // and delegates to Express. It's placed INSIDE the same middleware.use
        // callback as the rest of the API handlers so it has the same priority.
        let serverApp: any = null;
        try {
          const { createServerApp } = require('./server/index.cjs');
          serverApp = createServerApp();
          console.log('[VITE] Dream-E server API ready at /api/v2');
        } catch (err: any) {
          console.error('[VITE] Failed to create server API:', err.message);
        }

        server.middlewares.use((req, res, next) => {
          const url = req.url || '';

          // ============================================================
          // /api/v2/* — Route to the Express server app (auth, projects, assets)
          // ============================================================
          // This MUST be first — before any other URL checks — so that
          // /api/v2/auth/register etc. are handled by Express, not by
          // the existing /api/* handlers or Vite's SPA fallback.
          if ((url.startsWith('/api/v2/') || url === '/api/v2') && serverApp) {
            const strippedUrl = url.replace(/^\/api\/v2/, '') || '/';
            console.log(`[VITE] Routing ${url} → Express (stripped: ${strippedUrl})`);
            req.url = strippedUrl;
            serverApp(req, res);
            return;
          }

          // ============================================================
          // GET /api/bunny-image — Serve the generated bunny JPG as base64 data URL
          // (One-time use for injecting the scene)
          // ============================================================
          if (url === '/api/bunny-image' && req.method === 'GET') {
            const imgPath = path.resolve(__dirname, 'bunny_image.jpg');
            try {
              const imgBuffer = fs.readFileSync(imgPath);
              const base64 = imgBuffer.toString('base64');
              const dataUrl = `data:image/jpeg;base64,${base64}`;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ dataUrl }));
            } catch {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'bunny_image.jpg not found' }));
            }
            return;
          }

          // ============================================================
          // POST /api/generate-image — Generate image via BFL Flux API
          // ============================================================
          if (url === '/api/generate-image' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const {
                  prompt, width = 1280, height = 720,
                  // Image gen settings from the client (useImageGenStore)
                  provider = 'bfl',
                  apiKey = '',
                  model = 'flux-pro-1.1',
                  endpoint = 'https://api.bfl.ai/v1',
                  googleApiKey = '',
                  geminiImageModel = 'gemini-3.1-flash-image-preview',
                  // Optional array of reference images (base64 data URLs).
                  // Gemini: sent as inlineData parts.
                  // BFL FLUX 2: sent as input_image, input_image_2, ... input_image_8.
                  // BFL FLUX 1.x: sent as image_prompt (single image only).
                  referenceImages = [] as string[],
                } = JSON.parse(body);

                // Resolve the API key: client setting > env var > legacy hardcoded
                const resolvedKey = apiKey
                  || process.env.BFL_API_KEY
                  || 'bfl_sqPDOPTsO2nGKXyG2lUjEm2SBQ5iWhN1';

                if (provider === 'gemini') {
                  // ─── Google Gemini Image Generation ────────────────────────
                  const gKey = googleApiKey || process.env.GOOGLE_API_KEY || '';
                  if (!gKey) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Google API key not configured. Set it in AI Settings.' }));
                    return;
                  }

                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiImageModel}:generateContent?key=${gKey}`;

                  // Build multimodal parts: reference images first, then text prompt.
                  // Reference images give Gemini visual context for character/location consistency.
                  const contentParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];

                  // Add reference images (entity portraits, location art, etc.)
                  let refImagesIncluded = 0;
                  let refImagesSkipped = 0;
                  for (const refImg of (referenceImages as string[])) {
                    if (!refImg || !refImg.startsWith('data:')) {
                      if (refImg) {
                        console.warn(`[generate-image] Skipping non-data-URL reference image: ${refImg.slice(0, 60)}...`);
                        refImagesSkipped++;
                      }
                      continue;
                    }
                    const match = refImg.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                      contentParts.push({
                        inlineData: { mimeType: match[1], data: match[2] },
                      });
                      refImagesIncluded++;
                    } else {
                      console.warn(`[generate-image] Could not parse data URL: ${refImg.slice(0, 60)}...`);
                      refImagesSkipped++;
                    }
                  }

                  console.log(`[generate-image] Gemini ref images: ${refImagesIncluded} included, ${refImagesSkipped} skipped (received ${(referenceImages as string[]).length} total)`);

                  // Add the text prompt last (after all reference images).
                  // When reference images are present, explicitly instruct the model
                  // to use them for visual consistency (character appearance, style).
                  contentParts.push({
                    text: refImagesIncluded > 0
                      ? `IMPORTANT: The ${refImagesIncluded} reference image(s) above show the exact appearance of characters/locations in this story. You MUST closely match their physical features, clothing, hair color, facial structure, and overall style in the generated image. Generate a new scene image: ${prompt}`
                      : `Generate an image: ${prompt}`,
                  });

                  // Determine aspect ratio and image size tier from requested dimensions.
                  // width/height come from client (1280x720 for scenes, 512x512 for entities).
                  const isSquare = Math.abs(width - height) < 64;
                  const aspectRatio = isSquare ? '1:1' : (width > height ? '16:9' : '9:16');
                  // Use '1K' for small images (entity portraits), '2K' for scene backgrounds
                  const imageSize = (width <= 768 && height <= 768) ? '1K' : '2K';

                  console.log(`[generate-image] Gemini config: aspectRatio=${aspectRatio}, imageSize=${imageSize} (requested ${width}x${height})`);

                  const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{ parts: contentParts }],
                      generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                        imageConfig: {
                          aspectRatio,
                          imageSize,
                        },
                      },
                    }),
                  });

                  if (!geminiRes.ok) {
                    const errText = await geminiRes.text();
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `Gemini API error: ${errText}` }));
                    return;
                  }

                  const geminiData = await geminiRes.json() as {
                    candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
                  };

                  // Find the image part in the response
                  const parts = geminiData.candidates?.[0]?.content?.parts || [];
                  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

                  if (!imagePart?.inlineData) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'No image returned from Gemini' }));
                    return;
                  }

                  const dataUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                  console.log(`[generate-image] Gemini done. Model: ${geminiImageModel}. Prompt: "${prompt.slice(0, 60)}..."`);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ dataUrl }));

                } else if (provider === 'openai-compatible') {
                  // ─── OpenAI-Compatible Flow ──────────────────────────────
                  // Single POST → response with b64_json or url
                  const apiUrl = `${endpoint.replace(/\/+$/, '')}/images/generations`;

                  // Build the request body. Most OpenAI-compatible APIs use
                  // the standard { model, prompt, size, n, response_format }
                  // shape. However, HyprLab's nano-banana / imagen models
                  // use a different parameter set: aspect_ratio, resolution,
                  // output_format, and image_input (for reference images).
                  // We detect these models and build the appropriate body.
                  const isNanoBananaModel = model.includes('nano-banana') || model.includes('imagen');

                  let imgBody: Record<string, unknown>;
                  if (isNanoBananaModel) {
                    // ─── HyprLab nano-banana / imagen format ────────────
                    // These models use aspect_ratio (e.g. "16:9") and
                    // resolution ("1K", "2K", "4K") instead of pixel size.
                    const isSquare = Math.abs(width - height) < 64;
                    const aspectRatio = isSquare ? '1:1' : (width > height ? '16:9' : '9:16');
                    const resolution = (width >= 2048 || height >= 2048) ? '4K'
                      : (width >= 1024 || height >= 1024) ? '2K' : '1K';

                    imgBody = {
                      model,
                      prompt,
                      aspect_ratio: aspectRatio,
                      resolution,
                      response_format: 'b64_json',
                      output_format: 'png',
                    };

                    // Add reference images via image_input if provided.
                    // nano-banana accepts a single string or array of up to 8.
                    const validRefs = (referenceImages as string[]).filter(
                      (r: string) => r && r.startsWith('data:')
                    );
                    if (validRefs.length > 0) {
                      imgBody.image_input = validRefs.length === 1
                        ? validRefs[0]   // single image as string
                        : validRefs.slice(0, 8);  // multiple images as array (max 8)
                      console.log(`[generate-image] nano-banana: added ${Math.min(validRefs.length, 8)} reference image(s) via image_input`);
                    }

                    console.log(`[generate-image] nano-banana request: model=${model}, aspect_ratio=${aspectRatio}, resolution=${resolution}`);
                  } else {
                    // ─── Standard OpenAI-compatible format ──────────────
                    imgBody = {
                      model,
                      prompt,
                      size: `${width}x${height}`,
                      n: 1,
                      response_format: 'b64_json',
                    };
                  }

                  const genRes = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${resolvedKey}`,
                    },
                    body: JSON.stringify(imgBody),
                  });

                  if (!genRes.ok) {
                    const errText = await genRes.text();
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `Image API error: ${errText}` }));
                    return;
                  }

                  const genData = await genRes.json() as {
                    data?: { b64_json?: string; url?: string }[];
                  };

                  const item = genData.data?.[0];
                  let dataUrl: string;

                  if (item?.b64_json) {
                    dataUrl = `data:image/png;base64,${item.b64_json}`;
                  } else if (item?.url) {
                    // Download the URL and convert to data URL
                    const imgRes = await fetch(item.url);
                    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                    const ct = imgRes.headers.get('content-type') || 'image/png';
                    dataUrl = `data:${ct};base64,${imgBuf.toString('base64')}`;
                  } else {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'No image data in response' }));
                    return;
                  }

                  console.log(`[generate-image] OpenAI-compat done. Prompt: "${prompt.slice(0, 60)}..."`);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ dataUrl }));

                } else {
                  // ─── BFL Flow (async polling) ────────────────────────────
                  // Step 1: Submit generation request
                  const submitUrl = `${endpoint.replace(/\/+$/, '')}/${model}`;

                  // Ultra models use aspect_ratio string, standard models use width/height.
                  const isUltra = model.includes('ultra');
                  let bflBody: Record<string, unknown>;
                  if (isUltra) {
                    const bflIsSquare = Math.abs(width - height) < 64;
                    bflBody = {
                      prompt,
                      aspect_ratio: bflIsSquare ? '1:1' : (width > height ? '16:9' : '9:16'),
                    };
                  } else {
                    // Ensure dimensions are multiples of 32 (BFL requirement)
                    const w = Math.round(width / 32) * 32;
                    const h = Math.round(height / 32) * 32;
                    bflBody = { prompt, width: w, height: h };
                  }

                  // ─── Add reference images to BFL request ─────────────────
                  // FLUX 2 models (flux-2-*): input_image, input_image_2, ... input_image_8
                  // FLUX 1.x models (flux-pro-1.1, flux-pro-1.1-ultra): image_prompt (single)
                  const validRefs = (referenceImages as string[]).filter(
                    (r: string) => r && r.startsWith('data:')
                  );
                  const skippedBflRefs = (referenceImages as string[]).length - validRefs.length;
                  if (skippedBflRefs > 0) {
                    console.warn(`[generate-image] BFL: ${skippedBflRefs} reference image(s) skipped (not data: URLs)`);
                  }
                  if (validRefs.length > 0) {
                    const isFlux2 = model.startsWith('flux-2');
                    if (isFlux2) {
                      // FLUX 2: supports up to 8 reference images
                      // input_image, input_image_2, input_image_3, ... input_image_8
                      const maxRefs = Math.min(validRefs.length, 8);
                      for (let i = 0; i < maxRefs; i++) {
                        const key = i === 0 ? 'input_image' : `input_image_${i + 1}`;
                        bflBody[key] = validRefs[i]; // base64 data URL
                      }
                      console.log(`[generate-image] BFL FLUX 2: added ${maxRefs} reference image(s) as input_image params`);
                    } else {
                      // FLUX 1.x: supports single image_prompt only
                      bflBody['image_prompt'] = validRefs[0]; // base64 data URL
                      console.log(`[generate-image] BFL FLUX 1.x: added 1 reference image as image_prompt`);
                    }
                  }

                  console.log(`[generate-image] BFL request: model=${model}, body=`, JSON.stringify(bflBody).slice(0, 200));

                  const submitRes = await fetch(submitUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Key': resolvedKey,
                    },
                    body: JSON.stringify(bflBody),
                  });

                  if (!submitRes.ok) {
                    const errText = await submitRes.text();
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: `BFL API error: ${errText}` }));
                    return;
                  }

                  const { polling_url } = await submitRes.json() as { polling_url: string };

                  // Step 2: Poll until image is ready (max ~120 seconds)
                  const maxPolls = 60;
                  let pollCount = 0;
                  let imageUrl: string | null = null;

                  while (pollCount < maxPolls) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    pollCount++;

                    const pollRes = await fetch(polling_url);
                    const pollData = await pollRes.json() as {
                      status: string;
                      result?: { sample?: string };
                    };

                    if (pollData.status === 'Ready') {
                      imageUrl = pollData.result?.sample || null;
                      break;
                    } else if (pollData.status === 'Error' || pollData.status === 'Request Moderated') {
                      res.statusCode = 500;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: `Image generation failed: ${pollData.status}` }));
                      return;
                    }
                  }

                  if (!imageUrl) {
                    res.statusCode = 504;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Image generation timed out' }));
                    return;
                  }

                  // Step 3: Download and convert to base64 data URL
                  const imgRes = await fetch(imageUrl);
                  const imgArrayBuf = await imgRes.arrayBuffer();
                  const imgBuffer = Buffer.from(imgArrayBuf);
                  const base64 = imgBuffer.toString('base64');
                  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                  const dataUrl = `data:${contentType};base64,${base64}`;

                  console.log(`[generate-image] BFL done. Model: ${model}. Prompt: "${prompt.slice(0, 60)}..." Size: ${imgBuffer.length} bytes`);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ dataUrl }));
                }
              } catch (err: unknown) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                const msg = err instanceof Error ? err.message : 'Unknown error';
                res.end(JSON.stringify({ error: msg }));
              }
            });
            return;
          }

          // ============================================================
          // POST /api/transcribe-audio — ASR via Gemini multimodal
          // ============================================================
          if (url === '/api/transcribe-audio' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const {
                  audioData,   // base64-encoded audio data (no data URL prefix)
                  mimeType = 'audio/webm',
                  googleApiKey: gKey = '',
                  hyprLabApiKey: hKey = '',
                  model = 'gemini-2.5-flash-lite',
                } = JSON.parse(body);

                // Try Google key first, fall back to HyprLab key
                const apiKey = gKey || hKey || process.env.GOOGLE_API_KEY || '';
                if (!apiKey) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'No API key configured for ASR. Set a Google or HyprLab API key in AI Settings.' }));
                  return;
                }

                if (!audioData) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'No audio data provided' }));
                  return;
                }

                // Log audio details for debugging
                const audioBytes = Buffer.from(audioData, 'base64').length;
                console.log(`[transcribe-audio] Received ${(audioBytes / 1024).toFixed(1)}KB audio, mimeType=${mimeType}, model=${model}`);

                if (audioBytes < 100) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Audio data too small — recording may have failed' }));
                  return;
                }

                // Call Gemini multimodal with audio for transcription.
                // Use HyprLab's endpoint if only HyprLab key is available.
                const baseUrl = (!gKey && hKey)
                  ? 'https://api.hyprlab.io'
                  : 'https://generativelanguage.googleapis.com';
                const geminiUrl = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const requestBody = {
                  contents: [{
                    role: 'user',
                    parts: [
                      {
                        inlineData: {
                          mimeType,
                          data: audioData,
                        },
                      },
                      {
                        text: 'Transcribe exactly what is spoken in this audio recording. Output ONLY the transcribed text with no commentary, labels, or formatting. If no speech is audible, output: [no speech detected]',
                      },
                    ],
                  }],
                  generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 2048,
                  },
                };

                console.log(`[transcribe-audio] Sending ${(JSON.stringify(requestBody).length / 1024).toFixed(0)}KB request to ${model}`);

                const geminiRes = await fetch(geminiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(requestBody),
                });

                if (!geminiRes.ok) {
                  const errText = await geminiRes.text();
                  console.error(`[transcribe-audio] Gemini API error (${geminiRes.status}):`, errText.slice(0, 500));
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `Gemini ASR error (${geminiRes.status}): ${errText.slice(0, 300)}` }));
                  return;
                }

                const geminiData = await geminiRes.json() as {
                  candidates?: { content?: { parts?: { text?: string }[] } }[];
                };

                console.log(`[transcribe-audio] Raw response:`, JSON.stringify(geminiData).slice(0, 500));

                const transcript = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                console.log(`[transcribe-audio] Model: ${model}, Transcript: "${transcript.slice(0, 200)}"`);

                // Handle "no speech" sentinel
                const cleaned = transcript.trim();
                if (cleaned === '[no speech detected]' || cleaned === '') {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ transcript: '', noSpeech: true }));
                  return;
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ transcript: cleaned }));
              } catch (err: unknown) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                const msg = err instanceof Error ? err.message : 'Unknown error';
                res.end(JSON.stringify({ error: msg }));
              }
            });
            return;
          }

          // ============================================================
          // POST /api/generate-tts — Gemini Text-to-Speech
          // ============================================================
          if (url === '/api/generate-tts' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const {
                  text,
                  googleApiKey: gKey = '',
                  hyprLabApiKey: hKey = '',
                  model: ttsModel = 'gemini-2.5-flash-preview-tts',
                  voice = 'Zephyr',
                  instruction = 'Read aloud in a very natural fluid audiobook narrator style, very genuine:',
                } = JSON.parse(body);

                // Determine which API to use. If a Google API key is available,
                // call Google's generativelanguage endpoint directly. If only a
                // HyprLab key is available, use HyprLab's Gemini-compatible
                // endpoint (identical request format, different base URL).
                const apiKey = gKey || hKey || process.env.GOOGLE_API_KEY || '';
                if (!apiKey) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'API key not configured. Set Google API Key or provider key in AI Settings.' }));
                  return;
                }

                if (!text || text.trim().length === 0) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'No text provided for TTS' }));
                  return;
                }

                // Use HyprLab's endpoint when only the HyprLab key is available;
                // otherwise use Google's direct endpoint. The request body format
                // is identical (Gemini generateContent format).
                const baseUrl = (!gKey && hKey)
                  ? 'https://api.hyprlab.io'
                  : 'https://generativelanguage.googleapis.com';

                const ttsUrl = `${baseUrl}/v1beta/models/${ttsModel}:generateContent?key=${apiKey}`;

                const ttsRes = await fetch(ttsUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{
                      role: 'user',
                      parts: [{
                        text: `${instruction}\n${text}`,
                      }],
                    }],
                    generationConfig: {
                      responseModalities: ['audio'],
                      temperature: 1,
                      speech_config: {
                        voice_config: {
                          prebuilt_voice_config: {
                            voice_name: voice,
                          },
                        },
                      },
                    },
                  }),
                });

                if (!ttsRes.ok) {
                  const errText = await ttsRes.text();
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: `Gemini TTS error: ${errText}` }));
                  return;
                }

                const ttsData = await ttsRes.json() as {
                  candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
                };

                const parts = ttsData.candidates?.[0]?.content?.parts || [];
                const audioPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));

                if (!audioPart?.inlineData) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'No audio returned from Gemini TTS' }));
                  return;
                }

                // Gemini returns audio/L16 (raw PCM 24kHz 16-bit mono).
                // Browsers/Howler.js can't play raw PCM — wrap it in a WAV header.
                const rawMime = audioPart.inlineData.mimeType || '';
                const rawB64 = audioPart.inlineData.data;

                let finalDataUrl: string;
                if (rawMime.includes('L16') || rawMime.includes('pcm')) {
                  // Parse sample rate from mime (e.g. "audio/L16;codec=pcm;rate=24000")
                  const rateMatch = rawMime.match(/rate=(\d+)/);
                  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
                  const pcmBuf = Buffer.from(rawB64, 'base64');
                  const numChannels = 1;
                  const bitsPerSample = 16;
                  const blockAlign = numChannels * (bitsPerSample / 8);
                  const byteRate = sampleRate * blockAlign;
                  const dataSize = pcmBuf.length;

                  // Build 44-byte WAV header
                  const header = Buffer.alloc(44);
                  header.write('RIFF', 0);
                  header.writeUInt32LE(36 + dataSize, 4);
                  header.write('WAVE', 8);
                  header.write('fmt ', 12);
                  header.writeUInt32LE(16, 16);        // fmt chunk size
                  header.writeUInt16LE(1, 20);          // PCM format
                  header.writeUInt16LE(numChannels, 22);
                  header.writeUInt32LE(sampleRate, 24);
                  header.writeUInt32LE(byteRate, 28);
                  header.writeUInt16LE(blockAlign, 32);
                  header.writeUInt16LE(bitsPerSample, 34);
                  header.write('data', 36);
                  header.writeUInt32LE(dataSize, 40);

                  const wavBuf = Buffer.concat([header, pcmBuf]);
                  finalDataUrl = `data:audio/wav;base64,${wavBuf.toString('base64')}`;
                  console.log(`[generate-tts] Converted L16 PCM → WAV (${sampleRate}Hz, ${(pcmBuf.length/2/sampleRate).toFixed(1)}s)`);
                } else {
                  // Already a browser-playable format (wav, mp3, ogg, etc.)
                  finalDataUrl = `data:${rawMime};base64,${rawB64}`;
                }

                console.log(`[generate-tts] Done. Model: ${ttsModel}, Voice: ${voice}, Text: "${text.slice(0, 60)}..."`);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ dataUrl: finalDataUrl }));
              } catch (err: unknown) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                const msg = err instanceof Error ? err.message : 'Unknown error';
                res.end(JSON.stringify({ error: msg }));
              }
            });
            return;
          }

          // ============================================================
          // POST /api/chat-reset — Reset the chat conversation
          // ============================================================
          if (url === '/api/chat-reset' && req.method === 'POST') {
            chatHistory = [];
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          // ============================================================
          // POST /api/chat — Send a message to the agent
          // ============================================================
          if (url === '/api/chat' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const { message, systemPrompt, provider, model, apiKey, endpoint } = JSON.parse(body);

                // SSE headers
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');

                if (!apiKey) {
                  res.write(`data: ${JSON.stringify({ type: 'error', error: 'No API key configured for the chat writer. Set it in AI Settings.' })}\n\n`);
                  res.end();
                  return;
                }

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

                if (provider === 'gemini') {
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

                  const contents = chatHistory.filter(msg => msg.role !== 'system').map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                  }));

                  const geminiBody = {
                    system_instruction: {
                      parts: [{ text: chatHistory.find(msg => msg.role === 'system')?.content || '' }]
                    },
                    contents,
                    generationConfig: {
                      temperature: 0.7,
                      maxOutputTokens: 16384,
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
                    let errMsg = `Gemini API error ${geminiRes.status}`;
                    try {
                      const errJson = JSON.parse(errText);
                      errMsg = errJson.error?.message || errMsg;
                    } catch { errMsg += ': ' + errText.slice(0, 200); }
                    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
                    res.end();
                    return;
                  }

                  const reader = geminiRes.body as any;
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
                      } catch {
                        // skip malformed JSON chunks
                      }
                    }
                  }
                } else {
                  // OpenAI-compatible
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

                  const reader = oaiRes.body as any;
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
                      } catch {
                        // skip malformed JSON chunks
                      }
                    }
                  }
                }

                if (!aborted) {
                  chatHistory.push({ role: 'assistant', content: assistantResponse });
                  if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                  }
                }
              } catch (err: unknown) {
                if (!res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })}\n\n`);
                  res.end();
                }
              }
            });
            return;
          }

          // ============================================================
          // POST /api/open-world-reset — Reset the open-world session
          // ============================================================
          // No longer needed (stateless API calls) but kept for compat
          if (url === '/api/open-world-reset' && req.method === 'POST') {
            openWorldSessionId = null;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          // ============================================================
          // POST /api/open-world — Generate open-world scene content
          // ============================================================
          // Calls Gemini AI Studio or OpenAI-compatible API directly.
          // Streams tokens back as SSE events.
          //
          // Request body:
          //   { systemPrompt, userMessage, provider, model, apiKey, endpoint? }
          //
          // SSE events:
          //   data: { type: "text", text: "..." }
          //   data: { type: "done" }
          //   data: { type: "error", error: "..." }
          // ============================================================
          if (url === '/api/open-world' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const {
                  systemPrompt, userMessage, provider, model, apiKey, endpoint,
                  // Entity reference images for Gemini multimodal — each entry has
                  // { entityId, entityName, base64 } where base64 is a data: URL
                  entityRefImages = [] as Array<{ entityId: string; entityName: string; base64: string }>,
                  // User-uploaded images attached to the player's action input.
                  // Each entry has { base64, label } where base64 is a data: URL.
                  userUploadedImages = [] as Array<{ base64: string; label: string }>,
                } = JSON.parse(body);

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');

                if (!apiKey) {
                  res.write(`data: ${JSON.stringify({ type: 'error', error: 'No API key configured for the story writer. Set it in AI Settings.' })}\n\n`);
                  res.end();
                  return;
                }

                let aborted = false;
                const abortController = new AbortController();
                res.on('close', () => {
                  aborted = true;
                  abortController.abort();
                });

                // ── Structured JSON schema for scene generation output ──
                // Forces the model to produce valid JSON with required fields.
                // This eliminates parsing failures and ensures choices/imagePrompt are always present.
                const owResponseSchema = {
                  type: 'OBJECT',
                  properties: {
                    // ── Flow analysis fields (filled BEFORE writing the scene) ──
                    relevantEntityTraits: { type: 'STRING', description: 'Before writing the scene, reflect here: which characters, entities, and locations will be highly influential for this scene? What specific properties, character traits, preferences, or existing state change history (like magical effects or relationships) from their profiles must be taken into account for their actions and appearance in this scene?' },
                    playerGoalHypothesis: { type: 'STRING', description: 'One compressed sentence: what does the PLAYER (not the character) want to experience? Action, puzzles, social drama, atmosphere, plot density? What topics and tone?' },
                    sceneIntentHypothesis: { type: 'STRING', description: 'One compressed sentence: what is the player trying to achieve or experience with THIS specific action/prompt? What direction are they pushing the story?' },
                    lastSatisfactionEstimate: { type: 'STRING', description: 'One sentence: approximately how many scenes ago did the player last get what they wanted — a moment of success, fun, or the type of experience they seek? Reference the scene if possible.' },
                    engagementStrategy: { type: 'STRING', description: 'One sentence decision: should this scene SATISFY the player (give them what they want) or CHALLENGE them (introduce complication/conflict/uncertainty that requires active decision-making)? Never make it impossible, just require engagement.' },
                    narrativeTensionAnalysis: { type: 'STRING', description: 'Analyze the tension arc: how many scenes since last conflict/surprise/setback? If 2+, MUST introduce tension. If recent, may offer respite. Describe what tension element you will introduce and why.' },
                    plannedStateChanges: { type: 'STRING', description: 'One detailed sentence: which specific entities (characters, locations, objects) should change state, and how, to realize the engagement strategy? Changes must be plausible, emotionally intelligent, not cliche. EVERY entity mentioned here MUST get a corresponding entityUpdates entry with profilePatch.' },
                    characterMindStates: {
                      type: 'OBJECT',
                      description: 'Theory-of-mind for ALL characters present. Keys = entity IDs. Values = objects with: feeling (current emotion, 1 sentence), thinkingSituation (assessment of current situation, 1-3 sentences), thinkingOthers (thoughts about other characters present, 1-3 sentences), theoryOfMind (what they believe others think about them, 1-2 sentences). Use Big Five profiles and Character Depth Guide.'
                    },
                    // ── Scene content (written AFTER the analysis above) ──
                    sceneText: { type: 'STRING', description: 'The narrative continuation (100-300 words). Screenplay-inspired style. Driven by the analysis above.' },
                    speakerName: { type: 'STRING', description: 'Name of the narrator or main speaking character' },
                    choices: {
                      type: 'ARRAY',
                      items: { type: 'STRING' },
                      description: 'EXACTLY 3 meaningful player choices that advance the story. Always 3, never more, never fewer.',
                    },
                    imagePrompt: { type: 'STRING', description: 'Detailed image generation prompt including art style, characters by appearance, environment, lighting, mood. Include entity IDs in brackets for characters/locations present.' },
                    reuseImage: { type: 'BOOLEAN', description: 'true ONLY if visual setting is identical to previous scene' },
                    musicQuery: { type: 'STRING', description: 'BM25 search keywords (3-8 words) for background music. ALWAYS provide this — it is used to search a local RPG music database and auto-assign fitting background music to the scene. Describe the mood, atmosphere, and setting (e.g. "mysterious dark forest night ambient", "epic battle orchestral drums", "peaceful village morning cheerful").' },
                    sceneSummary: { type: 'STRING', description: '1-3 sentence summary of key events, decisions, state changes, who was present.' },
                    presentEntityIds: {
                      type: 'ARRAY',
                      items: { type: 'STRING' },
                      description: 'IDs of all entities present/relevant in this scene (e.g. entity_abc123)',
                    },
                    entityUpdates: { type: 'OBJECT', description: 'REQUIRED when entities change state. Keys are entity IDs, values are objects with: stateNote (string — what changed and why), profilePatch (object — permanent profile updates), and stateChanges (array of strings — list of specific changes, e.g. "Bob changed his hair to pink", "Bob broke up with Alice", to be logged in history protocol).' },
                    variableChanges: { type: 'OBJECT', description: 'Variable name-value pairs to update existing variables' },
                    // ── Initiative A: OW Entity/Variable/Media expansion ──
                    newEntities: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          category: { type: 'STRING', description: 'One of: character, location, object, concept' },
                          name: { type: 'STRING', description: 'Display name for the entity' },
                          description: { type: 'STRING', description: 'Detailed description' },
                          summary: { type: 'STRING', description: 'Brief 1-2 sentence summary' },
                          profile: { type: 'OBJECT', description: 'Structured profile data (appearance, personality, etc.)' },
                        },
                        required: ['category', 'name', 'description'],
                      },
                      description: 'New entities to create when introducing NEW characters, locations, objects, or concepts not yet in the entity list. Only for genuinely new introductions.',
                    },
                    removeEntities: {
                      type: 'ARRAY',
                      items: { type: 'STRING' },
                      description: 'Entity IDs to permanently remove (e.g. character dies permanently, location destroyed). Use sparingly — only for irreversible story events.',
                    },
                    entityLinks: {
                      type: 'ARRAY',
                      items: { type: 'STRING' },
                      description: 'Additional entity IDs to explicitly link to this scene (beyond presentEntityIds). Use when entities are referenced but not physically present.',
                    },
                    newVariables: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          name: { type: 'STRING', description: 'Variable name (e.g. "reputation_score")' },
                          type: { type: 'STRING', description: 'One of: string, number, boolean' },
                          defaultValue: { type: 'STRING', description: 'Initial value as string' },
                          description: { type: 'STRING', description: 'What this variable tracks' },
                        },
                        required: ['name', 'type'],
                      },
                      description: 'New tracking variables to create. Only when a genuinely new game mechanic or stat needs tracking that no existing variable covers.',
                    },
                    generateEntityImages: {
                      type: 'OBJECT',
                      description: 'Request image generation for entities. Keys are entity IDs, values are image generation prompts. Use for newly created entities or entities that lack reference images.',
                    },
                    generateVoiceover: {
                      type: 'BOOLEAN',
                      description: 'Set true to auto-generate TTS voiceover for this scene. Default false.',
                    },
                    curiosityFacts: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          title: { type: 'STRING', description: 'Engaging title' },
                          fact: { type: 'STRING', description: 'Real-world educational fact (2-4 sentences)' },
                          category: { type: 'STRING', description: 'history, science, culture, psychology, nature, technology' },
                        },
                        required: ['title', 'fact', 'category'],
                      },
                      description: 'Array with exactly 1 real-world educational fun fact related to scene content. NOT fiction — genuine knowledge about the real world topics touched by the scene. Always exactly one item.',
                    },
                    floatingGoals: {
                      type: 'ARRAY',
                      items: { type: 'STRING' },
                      description: 'Array of 2-5 active plot threads / unresolved hooks / opportunities. Carry forward from previous scenes, add new ones, remove resolved ones. Each is one sentence.',
                    },
                    assignUploadedImages: {
                      type: 'OBJECT',
                      description: 'When the player uploads reference images, assign them to entities. Keys are entity IDs, values are 0-based indices of the uploaded images. Only use when the player explicitly attaches images and asks to use them for specific entities.',
                    },
                  },
                  required: ['playerGoalHypothesis', 'sceneIntentHypothesis', 'lastSatisfactionEstimate', 'engagementStrategy', 'narrativeTensionAnalysis', 'plannedStateChanges', 'characterMindStates', 'sceneText', 'speakerName', 'choices', 'imagePrompt', 'reuseImage', 'musicQuery', 'sceneSummary', 'presentEntityIds', 'floatingGoals', 'curiosityFacts'],
                };

                if (provider === 'gemini') {
                  // ── GEMINI AI STUDIO STREAMING ──────────────────────
                  // Uses structured JSON output via responseMimeType + responseSchema
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

                  // Build user message parts: entity reference images first (so the
                  // LLM "sees" the characters), then the text context last.
                  const userParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

                  // Add entity reference images as inline data
                  if (entityRefImages.length > 0) {
                    console.log(`[OW-API] Adding ${entityRefImages.length} entity reference images to Gemini writer context`);
                    for (const ref of entityRefImages) {
                      if (!ref.base64 || !ref.base64.startsWith('data:')) continue;
                      const match = ref.base64.match(/^data:([^;]+);base64,(.+)$/);
                      if (match) {
                        // Add a text label before each image so the LLM knows which entity it depicts
                        userParts.push({ text: `[Reference image for entity "${ref.entityName}" (${ref.entityId})]` });
                        userParts.push({
                          inlineData: { mimeType: match[1], data: match[2] },
                        });
                      }
                    }
                    // Add separator between images and main context
                    userParts.push({ text: '\n--- END OF ENTITY REFERENCE IMAGES ---\n\nNow here is the story context and player action:\n' });
                  }

                  // Add user-uploaded images as inline data (from the player's image upload)
                  if (userUploadedImages.length > 0) {
                    console.log(`[OW-API] Adding ${userUploadedImages.length} user-uploaded images to Gemini writer context`);
                    for (let i = 0; i < userUploadedImages.length; i++) {
                      const img = userUploadedImages[i];
                      if (!img.base64 || !img.base64.startsWith('data:')) continue;
                      const match = img.base64.match(/^data:([^;]+);base64,(.+)$/);
                      if (match) {
                        userParts.push({ text: `[User uploaded image #${i}: "${img.label}"]` });
                        userParts.push({
                          inlineData: { mimeType: match[1], data: match[2] },
                        });
                      }
                    }
                    userParts.push({ text: '\n--- END OF USER UPLOADED IMAGES ---\n' });
                  }

                  // Add the main user message text
                  userParts.push({ text: userMessage });

                  const geminiBody = {
                    system_instruction: {
                      parts: [{ text: systemPrompt }],
                    },
                    contents: [
                      {
                        role: 'user',
                        parts: userParts,
                      },
                    ],
                    generationConfig: {
                      temperature: 1.0,
                      maxOutputTokens: 16384,
                      responseMimeType: 'application/json',
                      responseSchema: owResponseSchema,
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
                    let errMsg = `Gemini API error ${geminiRes.status}`;
                    try {
                      const errJson = JSON.parse(errText);
                      errMsg = errJson.error?.message || errMsg;
                    } catch { errMsg += ': ' + errText.slice(0, 200); }
                    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
                    res.end();
                    return;
                  }

                  // Parse Gemini SSE stream
                  const reader = geminiRes.body as any;
                  let buf = '';

                  // Node.js fetch returns a ReadableStream — consume with async iteration
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
                          res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
                        }
                      } catch {
                        // skip malformed JSON chunks
                      }
                    }
                  }

                  if (!aborted && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                  }

                } else {
                  // ── OPENAI-COMPATIBLE STREAMING ─────────────────────
                  const baseUrl = (endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
                  const chatUrl = `${baseUrl}/chat/completions`;

                  const oaiBody: Record<string, unknown> = {
                    model,
                    stream: true,
                    temperature: 1.0,
                    max_tokens: 16384,
                    response_format: { type: 'json_object' },
                    messages: [
                      { role: 'system', content: systemPrompt + '\n\nYou MUST respond with a valid JSON object.' },
                      { role: 'user', content: userMessage },
                    ],
                  };

                  const oaiRes = await fetch(chatUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(oaiBody),
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

                  // Parse OpenAI SSE stream
                  const reader = oaiRes.body as any;
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
                        const delta = parsed?.choices?.[0]?.delta?.content;
                        if (delta && !aborted) {
                          res.write(`data: ${JSON.stringify({ type: 'text', text: delta })}\n\n`);
                        }
                      } catch {
                        // skip
                      }
                    }
                  }

                  if (!aborted && !res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                  }
                }
              } catch (err: unknown) {
                if (!res.writableEnded) {
                  const msg = err instanceof Error ? err.message : 'Unknown error';
                  if (msg.includes('abort') || msg.includes('AbortError')) {
                    // Client disconnected — no need to write error
                    if (!res.writableEnded) res.end();
                    return;
                  }
                  res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
                  res.end();
                }
              }
            });
            return;
          }

          // ============================================================
          // PROJECT BACKUP ENDPOINTS
          // ============================================================
          // Server-side file backup system: writes project JSON to disk
          // so that projects survive browser cache clears, IndexedDB
          // eviction, or switching browsers. The backup directory lives
          // alongside the app code for easy discovery.
          // ============================================================

          /** Configurable backup directory — all project backups go here */
          const BACKUP_DIR = path.resolve(__dirname, 'backups');

          // ─── POST /api/backup-project ─────────────────────────────
          // Receives a full Project JSON body and writes it to
          // backups/{projectId}.json, overwriting any existing backup
          // for that project ID. Called fire-and-forget after each
          // IndexedDB save so the user always has a filesystem copy.
          if (url === '/api/backup-project' && req.method === 'POST') {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
            req.on('end', () => {
              try {
                const bodyStr = Buffer.concat(chunks).toString('utf-8');
                const project = JSON.parse(bodyStr);

                if (!project || !project.id) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Invalid project: missing id' }));
                  return;
                }

                // Ensure backup directory exists (no-op if already there)
                fs.mkdirSync(BACKUP_DIR, { recursive: true });

                // Write the project JSON to disk. Using writeFileSync here
                // because we want to guarantee the write completes before
                // responding — the caller is fire-and-forget so this won't
                // block the UI, but we need the file to be intact.
                const filePath = path.join(BACKUP_DIR, `${project.id}.json`);
                fs.writeFileSync(filePath, bodyStr, 'utf-8');

                const sizeMB = (Buffer.byteLength(bodyStr, 'utf-8') / (1024 * 1024)).toFixed(1);
                console.log(`[backup] Saved ${project.id} (${sizeMB} MB) → ${filePath}`);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, size: Buffer.byteLength(bodyStr, 'utf-8') }));
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                console.error('[backup] Failed to save backup:', msg);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: msg }));
              }
            });
            return;
          }

          // ─── GET /api/list-backups ────────────────────────────────
          // Returns a JSON array of available backup summaries:
          //   [{ id, title, updatedAt, fileSize }]
          // Reads each .json file, parses only the minimum fields
          // needed for the dashboard recovery banner. File stat size
          // gives an indication of project complexity.
          if (url === '/api/list-backups' && req.method === 'GET') {
            try {
              // If backup directory doesn't exist yet, there are no backups
              if (!fs.existsSync(BACKUP_DIR)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([]));
                return;
              }

              const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
              const backups: { id: string; title: string; updatedAt: number; fileSize: number }[] = [];

              for (const file of files) {
                try {
                  const filePath = path.join(BACKUP_DIR, file);
                  const stat = fs.statSync(filePath);
                  const content = fs.readFileSync(filePath, 'utf-8');

                  // Parse full JSON to extract summary fields. For very
                  // large projects this is not ideal, but list-backups is
                  // only called once on dashboard load when 0 projects exist,
                  // and it runs server-side so it won't affect browser memory.
                  const project = JSON.parse(content);

                  backups.push({
                    id: project.id || file.replace('.json', ''),
                    title: project.info?.title || 'Untitled',
                    updatedAt: project.info?.updatedAt || stat.mtimeMs,
                    fileSize: stat.size,
                  });
                } catch (fileErr) {
                  // Skip corrupted backup files — don't let one bad file
                  // prevent listing the rest
                  console.warn(`[backup] Skipping unreadable backup: ${file}`, fileErr);
                }
              }

              // Sort by updatedAt descending (newest first)
              backups.sort((a, b) => b.updatedAt - a.updatedAt);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(backups));
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              console.error('[backup] Failed to list backups:', msg);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: msg }));
            }
            return;
          }

          // ─── GET /api/restore-backup/:id ──────────────────────────
          // Returns the full project JSON for a given backup ID.
          // The client will import this into IndexedDB to restore
          // the project.
          if (url.startsWith('/api/restore-backup/') && req.method === 'GET') {
            try {
              const backupId = url.replace('/api/restore-backup/', '').split('?')[0];

              if (!backupId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing backup ID' }));
                return;
              }

              const filePath = path.join(BACKUP_DIR, `${backupId}.json`);

              if (!fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Backup not found: ${backupId}` }));
                return;
              }

              const content = fs.readFileSync(filePath, 'utf-8');
              console.log(`[backup] Restoring backup: ${backupId} (${(Buffer.byteLength(content, 'utf-8') / (1024 * 1024)).toFixed(1)} MB)`);

              res.setHeader('Content-Type', 'application/json');
              res.end(content);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              console.error('[backup] Failed to restore backup:', msg);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: msg }));
            }
            return;
          }

          // ─── DELETE /api/backup-project/:id ───────────────────────
          // Deletes a backup file from disk. Used when a project is
          // permanently deleted and the user no longer wants the backup.
          if (url.startsWith('/api/backup-project/') && req.method === 'DELETE') {
            try {
              const backupId = url.replace('/api/backup-project/', '').split('?')[0];

              if (!backupId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing backup ID' }));
                return;
              }

              const filePath = path.join(BACKUP_DIR, `${backupId}.json`);

              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[backup] Deleted backup: ${backupId}`);
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              console.error('[backup] Failed to delete backup:', msg);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: msg }));
            }
            return;
          }

          // ============================================================
          // POST /api/storyteller-chat-reset — Reset the Storyteller chat
          // ============================================================
          if (url === '/api/storyteller-chat-reset' && req.method === 'POST') {
            storytellerChatHistory = [];
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          // ============================================================
          // POST /api/storyteller-chat — Send a message to the Storyteller
          // ============================================================
          // Same streaming pattern as /api/chat but uses storytellerChatHistory
          // instead of chatHistory. The Storyteller is an in-game creative
          // companion that discusses the story with the player.
          if (url === '/api/storyteller-chat' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                const { message, systemPrompt, provider, model, apiKey, endpoint, gameContext } = JSON.parse(body);

                // SSE headers
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');

                if (!apiKey) {
                  res.write(`data: ${JSON.stringify({ type: 'error', error: 'No API key configured for the Storyteller chat. Set it in AI Settings.' })}\n\n`);
                  res.end();
                  return;
                }

                if (storytellerChatHistory.length === 0 && systemPrompt) {
                  storytellerChatHistory.push({ role: 'system', content: systemPrompt });
                }

                // Include full game context with the user message so the
                // Storyteller knows the complete story, characters, and state.
                const enrichedMessage = gameContext
                  ? `[Current Game State]\n${gameContext}\n\n---\nPlayer: ${message}`
                  : message;

                storytellerChatHistory.push({ role: 'user', content: enrichedMessage });

                let aborted = false;
                const abortController = new AbortController();
                res.on('close', () => {
                  aborted = true;
                  abortController.abort();
                });

                let assistantResponse = '';

                if (provider === 'gemini') {
                  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

                  const contents = storytellerChatHistory.filter(msg => msg.role !== 'system').map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                  }));

                  const geminiBody = {
                    system_instruction: {
                      parts: [{ text: storytellerChatHistory.find(msg => msg.role === 'system')?.content || '' }]
                    },
                    contents,
                    generationConfig: {
                      temperature: 0.7,
                      maxOutputTokens: 16384,
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
                    let errMsg = `Gemini API error ${geminiRes.status}`;
                    try {
                      const errJson = JSON.parse(errText);
                      errMsg = errJson.error?.message || errMsg;
                    } catch { errMsg += ': ' + errText.slice(0, 200); }
                    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
                    res.end();
                    return;
                  }

                  const reader = geminiRes.body as any;
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
                      } catch {
                        // skip malformed JSON chunks
                      }
                    }
                  }
                } else {
                  // OpenAI-compatible
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
                      messages: storytellerChatHistory,
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

                  const reader = oaiRes.body as any;
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
                      } catch {
                        // skip malformed JSON chunks
                      }
                    }
                  }
                }

                if (!aborted) {
                  storytellerChatHistory.push({ role: 'assistant', content: assistantResponse });
                  if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
                    res.end();
                  }
                }
              } catch (err: unknown) {
                if (!res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })}\n\n`);
                  res.end();
                }
              }
            });
            return;
          }

          // ============================================================
          // /api/music/* — Proxy to BM25 RPG Music Search Server
          // ============================================================
          // The BM25 server runs on port 7862. We proxy requests so the
          // browser doesn't need to know about the separate server.
          if (url.startsWith('/api/music/')) {
            const musicPath = url.replace('/api/music/', '/api/');
            const targetUrl = `http://127.0.0.1:7862${musicPath}`;

            const proxyToMusic = async (reqBody?: string) => {
              try {
                const opts: RequestInit = reqBody
                  ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }
                  : { method: 'GET' };
                const resp = await fetch(targetUrl, opts);
                res.statusCode = resp.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(await resp.text());
              } catch {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'RPG Music server not reachable. Start it with: python rpg-music-server/bm25_server.py',
                }));
              }
            };

            if (req.method === 'GET') {
              proxyToMusic();
              return;
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
              req.on('end', () => { proxyToMusic(body); });
              return;
            }
          }

          next();
        });
      },
    },
    react(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@types': path.resolve(__dirname, './src/types'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@db': path.resolve(__dirname, './src/db'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@themes': path.resolve(__dirname, './src/themes'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },

  server: {
    port: 5173,
    // CRITICAL: strictPort prevents Vite from silently incrementing to 5174, 5175, etc.
    // when 5173 is occupied. Without this, a port change moves the app to a different
    // browser origin, making IndexedDB data (all saved projects) invisible because
    // IndexedDB is scoped per origin (protocol + hostname + port).
    strictPort: true,
    // NOTE: `open: true` was removed intentionally. On Windows, Vite uses the system
    // default browser, which may differ from the browser where the user's IndexedDB
    // data lives (e.g., user works in Chrome but Windows default is Edge). Opening
    // the wrong browser after a server restart shows an empty project list — making
    // it look like all data was lost. Users should bookmark http://localhost:5173
    // and open it in their preferred browser manually.
    cors: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-xyflow': ['@xyflow/react'],
          'vendor-state': ['zustand', 'dexie', 'immer'],
          'vendor-utils': ['howler', 'jszip', 'file-saver'],
        },
      },
    },
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@xyflow/react',
      'zustand',
      'dexie',
      'howler',
    ],
  },
});
