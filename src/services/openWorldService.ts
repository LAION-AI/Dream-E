/**
 * =============================================================================
 * OPEN WORLD SERVICE — AI Scene Generation for Open World Mode
 * =============================================================================
 *
 * Handles the full pipeline for open-world scene generation:
 *   1. Build context from game state (via openWorldContext)
 *   2. Stream the AI response (scene text appears in real-time)
 *   3. Parse structured metadata (choices, image prompt, variable changes)
 *   4. Generate scene image (with retry on failure)
 *   5. Create new scene node in the game state
 *
 * Status updates are emitted throughout for the StatusBox UI.
 *
 * =============================================================================
 */

import { buildOpenWorldContext } from './openWorldContext';
import { useImageGenStore } from '@/stores/useImageGenStore';
import { blobUrlToBase64, registerBlob } from '@/utils/blobCache';
import type { Project, Entity } from '@/types';
import type { GameSession } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type OpenWorldStatus =
  | { phase: 'building_context'; detail: string }
  | { phase: 'generating_text'; detail: string }
  | { phase: 'parsing_response'; detail: string }
  | { phase: 'generating_entity_images'; detail: string }
  | { phase: 'generating_image'; detail: string; attempt?: number }
  | { phase: 'searching_music'; detail: string }
  | { phase: 'creating_scene'; detail: string }
  | { phase: 'ready'; detail: string }
  | { phase: 'error'; detail: string };

export interface EntityUpdate {
  stateNote?: string;
  profilePatch?: Record<string, unknown>;
  stateChanges?: string[];
}

export interface OpenWorldResult {
  sceneText: string;
  speakerName?: string;
  choices: string[];
  imageDataUrl?: string;
  variableChanges?: Record<string, unknown>;
  /** The exact text of the player's action that triggered this scene */
  playerAction?: string;
  /** IDs of entities present/relevant in this scene */
  presentEntityIds?: string[];
  /** New entities created by the AI in this scene */
  newEntities?: Array<{ category: string, name: string, description: string, summary?: string, profile?: Record<string, unknown> }>;
  /** Entity IDs to remove permanently */
  removeEntities?: string[];
  /** Entity IDs to link to the new scene */
  entityLinks?: string[];
  /** New tracking variables to create */
  newVariables?: Array<{ name: string, type: string, defaultValue: any, description?: string }>;
  /** Image generation prompts for entities */
  generateEntityImages?: Record<string, string>;
  /** Should generate voiceover for this scene */
  generateVoiceover?: boolean;
  /** Per-entity state updates (state notes + profile patches) */
  entityUpdates?: Record<string, EntityUpdate>;
  sceneSummary?: string;
  /** Background music data URL from BM25 search */
  musicDataUrl?: string;
  /** Metadata about the assigned music track */
  musicMetadata?: { row_id: number; title: string; duration?: number };
  /** The complete raw JSON response from the AI model, stored for debugging/reference */
  rawAiResponse?: string;
  /** The full constructed context (user message) that was sent to the AI for this scene.
   *  Stored so the user can inspect what the LM saw when it wrote the scene. */
  constructedContext?: string;
  /** The system prompt that was sent to the AI for this scene */
  constructedSystemPrompt?: string;
  /** Array of 2-5 active plot threads / unresolved hooks / opportunities */
  floatingGoals?: string[];
  /** When user uploads images, maps entity IDs to 0-based image indices for assignment */
  assignUploadedImages?: Record<string, number>;
  /** Theory-of-mind for all characters present — keys are entity IDs */
  characterMindStates?: Record<string, { feeling: string; thinkingSituation: string; thinkingOthers: string; theoryOfMind: string }>;
  /** Array of 2-4 real-world educational fun facts related to scene content */
  curiosityFacts?: Array<{ title: string; fact: string; category: string }>;
}

interface OWMetadata {
  speakerName?: string;
  choices?: string[];
  imagePrompt?: string;
  reuseImage?: boolean;
  variableChanges?: Record<string, unknown>;
  presentEntityIds?: string[];
  newEntities?: Array<{ category: string, name: string, description: string, summary?: string, profile?: Record<string, unknown> }>;
  removeEntities?: string[];
  entityLinks?: string[];
  newVariables?: Array<{ name: string, type: string, defaultValue: any, description?: string }>;
  generateEntityImages?: Record<string, string>;
  generateVoiceover?: boolean;
  entityUpdates?: Record<string, EntityUpdate>;
  sceneSummary?: string;
  /** Search query for BM25 background music. Only set when mood/location changes. */
  musicQuery?: string;
  /** Narrative tension analysis — reflects on recent tension arc */
  narrativeTensionAnalysis?: string;
  /** Array of 2-5 active plot threads / unresolved hooks / opportunities */
  floatingGoals?: string[];
  /** When user uploads images, maps entity IDs to 0-based image indices for assignment */
  assignUploadedImages?: Record<string, number>;
  /** Theory-of-mind for all characters present — keys are entity IDs */
  characterMindStates?: Record<string, { feeling: string; thinkingSituation: string; thinkingOthers: string; theoryOfMind: string }>;
  /** Array of 2-4 real-world educational fun facts related to scene content */
  curiosityFacts?: Array<{ title: string; fact: string; category: string }>;
}

// =============================================================================
// RESPONSE PARSER
// =============================================================================

/**
 * Attempt to fix common JSON issues that LLMs produce:
 * - Trailing commas before } or ]
 * - Single-line // comments
 */
function sanitizeJSON(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\s*\/\/.*$/gm, '');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

/**
 * Fallback: extract individual fields via regex when JSON.parse fails.
 */
function extractFieldsFallback(raw: string): OWMetadata & { sceneText?: string } {
  const meta: OWMetadata & { sceneText?: string } = {};

  const extractStr = (field: string) => {
    const m = raw.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's'));
    return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : undefined;
  };

  meta.sceneText = extractStr('sceneText');
  meta.speakerName = extractStr('speakerName');
  meta.imagePrompt = extractStr('imagePrompt');
  meta.sceneSummary = extractStr('sceneSummary');
  meta.musicQuery = extractStr('musicQuery');

  const reuse = raw.match(/"reuseImage"\s*:\s*(true|false)/);
  if (reuse) meta.reuseImage = reuse[1] === 'true';

  const genVO = raw.match(/"generateVoiceover"\s*:\s*(true|false)/);
  if (genVO) meta.generateVoiceover = genVO[1] === 'true';

  const choicesMatch = raw.match(/"choices"\s*:\s*\[([\s\S]*?)\]/);
  if (choicesMatch) {
    const items = choicesMatch[1].match(/"([^"]+)"/g);
    if (items) meta.choices = items.map(s => s.replace(/^"|"$/g, ''));
  }

  const entityIds = raw.match(/"presentEntityIds"\s*:\s*\[([\s\S]*?)\]/);
  if (entityIds) {
    const ids = entityIds[1].match(/"([^"]+)"/g);
    if (ids) meta.presentEntityIds = ids.map(s => s.replace(/^"|"$/g, ''));
  }

  console.log('[OpenWorld] Fallback field extraction recovered:', Object.keys(meta).filter(k => (meta as any)[k] !== undefined).join(', '));
  return meta;
}

/**
 * Parse the AI response. The response is now structured JSON (enforced by
 * Gemini responseSchema or OpenAI response_format). Falls back to legacy
 * marker-based parsing for compatibility.
 *
 * The JSON contains sceneText directly as a field — no [SCENE_TEXT] markers needed.
 */
function parseOpenWorldResponse(
  fullText: string
): { sceneText: string; metadata: OWMetadata } {
  let trimmed = fullText.trim();

  // Strip markdown code fences if the model wrapped JSON in ```json ... ```
  // (common with Claude via HyprLab which doesn't enforce responseMimeType)
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // ── Primary path: parse as JSON (structured output) ───────────────
  // The model should return a JSON object with sceneText + metadata fields.
  let parsed: any = null;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try sanitizing first
    try {
      parsed = JSON.parse(sanitizeJSON(trimmed));
      console.log('[OpenWorld] Sanitized JSON parse succeeded');
    } catch {
      console.warn('[OpenWorld] JSON parse failed, trying legacy format...');
    }
  }

  if (parsed && typeof parsed === 'object' && parsed.sceneText) {
    // Successfully parsed structured JSON output.
    // Strip entity ID brackets (e.g. [entity_abc123]) from the display text.
    // The LLM uses these internally to reference entities in imagePrompt, but
    // they should not appear in the narrative text shown to the player.
    const sceneText = (parsed.sceneText as string).replace(/\s*\[entity_[^\]]+\]/g, '');
    const metadata: OWMetadata = {
      speakerName: parsed.speakerName,
      choices: parsed.choices,
      imagePrompt: parsed.imagePrompt,
      reuseImage: parsed.reuseImage,
      variableChanges: parsed.variableChanges,
      presentEntityIds: parsed.presentEntityIds,
      newEntities: parsed.newEntities,
      removeEntities: parsed.removeEntities,
      entityLinks: parsed.entityLinks,
      newVariables: parsed.newVariables,
      generateEntityImages: parsed.generateEntityImages,
      generateVoiceover: parsed.generateVoiceover,
      entityUpdates: parsed.entityUpdates,
      sceneSummary: parsed.sceneSummary,
      musicQuery: parsed.musicQuery,
      narrativeTensionAnalysis: parsed.narrativeTensionAnalysis,
      floatingGoals: parsed.floatingGoals,
      assignUploadedImages: parsed.assignUploadedImages,
      characterMindStates: parsed.characterMindStates,
      curiosityFacts: parsed.curiosityFacts,
    };
    console.log('[OpenWorld] Parsed structured JSON output successfully');
    return { sceneText, metadata };
  }

  // ── Legacy fallback: [SCENE_TEXT] + <<<OW_META>>> markers ─────────
  let sceneText = '';
  const textMatch = trimmed.match(/\[SCENE_TEXT\]([\s\S]*?)\[\/SCENE_TEXT\]/);
  if (textMatch) {
    sceneText = textMatch[1].trim();
  } else {
    const metaIdx = trimmed.indexOf('<<<OW_META>>>');
    sceneText = metaIdx >= 0 ? trimmed.slice(0, metaIdx).trim() : trimmed;
  }

  let metadata: OWMetadata = {};
  const metaMatch = trimmed.match(/<<<OW_META>>>([\s\S]*?)<<<\/OW_META>>>/);
  if (metaMatch) {
    try {
      metadata = JSON.parse(sanitizeJSON(metaMatch[1].trim()));
    } catch {
      metadata = extractFieldsFallback(metaMatch[1]);
    }
  } else if (!parsed) {
    // Last resort: regex extraction from the raw text
    const fb = extractFieldsFallback(trimmed);
    if (fb.sceneText) sceneText = fb.sceneText;
    metadata = fb;
  }

  // Strip entity ID brackets from legacy-parsed text too
  sceneText = sceneText.replace(/\s*\[entity_[^\]]+\]/g, '');

  return { sceneText, metadata };
}

// =============================================================================
// IMAGE GENERATION (with retry)
// =============================================================================

const MAX_IMAGE_RETRIES = 3;

async function generateImage(
  prompt: string,
  onStatus: (status: OpenWorldStatus) => void,
  referenceImages: string[] = []
): Promise<string | undefined> {
  const settings = useImageGenStore.getState();

  // Append user's default image style to the prompt (from AI Settings)
  const styleTag = settings.defaultImageStyle?.trim();
  const fullPrompt = styleTag ? `${prompt}. Style: ${styleTag}` : prompt;

  // Check that we have at least one configured provider
  const hasApiKey = settings.provider === 'gemini'
    ? !!settings.googleApiKey
    : !!settings.apiKey;
  if (!hasApiKey) {
    console.warn('[OpenWorld] No API key configured for image provider:', settings.provider);
    onStatus({ phase: 'error', detail: `No API key set for ${settings.provider}. Configure in AI Settings.` });
    return undefined;
  }

  const genStart = Date.now();

  for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {
    const attemptStart = Date.now();
    onStatus({
      phase: 'generating_image',
      detail: attempt === 1
        ? `Generating scene image (${settings.provider}, ${settings.model || 'default'})...`
        : `Retry ${attempt}/${MAX_IMAGE_RETRIES} (${settings.provider})...`,
      attempt,
    });

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: attempt === 1 ? fullPrompt : simplifyPrompt(fullPrompt, attempt),
          width: 1280,
          height: 720,
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          endpoint: settings.endpoint,
          googleApiKey: settings.googleApiKey,
          geminiImageModel: settings.geminiImageModel,
          // Pass reference images to ALL providers:
          // - Gemini: sent as inlineData parts
          // - BFL FLUX 2: sent as input_image, input_image_2, ... input_image_8
          // - BFL FLUX 1.x: sent as image_prompt (single image only)
          referenceImages,
        }),
      });

      const attemptElapsed = ((Date.now() - attemptStart) / 1000).toFixed(1);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        const errMsg = errData.error || `HTTP ${res.status}`;

        // If API key is missing/invalid, don't retry
        if (errMsg.includes('key') || errMsg.includes('auth') || errMsg.includes('401') || errMsg.includes('403')) {
          onStatus({ phase: 'error', detail: `Image API auth error: ${errMsg}` });
          return undefined;
        }

        console.warn(`[OpenWorld] Image gen attempt ${attempt}/${MAX_IMAGE_RETRIES} failed (${attemptElapsed}s):`, errMsg);
        onStatus({
          phase: 'generating_image',
          detail: `Attempt ${attempt} failed (${attemptElapsed}s): ${errMsg.slice(0, 60)}. ${attempt < MAX_IMAGE_RETRIES ? 'Retrying...' : 'Giving up.'}`,
          attempt,
        });

        // Wait before retry (exponential backoff: 1s, 2s, 4s)
        if (attempt < MAX_IMAGE_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
        continue;
      }

      const data = await res.json();
      if (data.dataUrl) {
        const totalElapsed = ((Date.now() - genStart) / 1000).toFixed(1);
        console.log(`[OpenWorld] Image generated on attempt ${attempt} in ${totalElapsed}s (${settings.provider}, ${referenceImages.length} ref images sent)`);
        onStatus({
          phase: 'generating_image',
          detail: `Scene image ready (${totalElapsed}s${attempt > 1 ? `, attempt ${attempt}` : ''})`,
          attempt,
        });
        return data.dataUrl;
      }

      console.warn(`[OpenWorld] Image gen attempt ${attempt}: response OK but no dataUrl (${attemptElapsed}s)`);
    } catch (err) {
      const attemptElapsed = ((Date.now() - attemptStart) / 1000).toFixed(1);
      const errMsg = err instanceof Error ? err.message : 'Network error';
      console.warn(`[OpenWorld] Image gen attempt ${attempt}/${MAX_IMAGE_RETRIES} error (${attemptElapsed}s):`, errMsg);
      onStatus({
        phase: 'generating_image',
        detail: `Attempt ${attempt} failed (${attemptElapsed}s): ${errMsg.slice(0, 60)}. ${attempt < MAX_IMAGE_RETRIES ? 'Retrying...' : 'Giving up.'}`,
        attempt,
      });

      // Wait before retry
      if (attempt < MAX_IMAGE_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  const totalElapsed = ((Date.now() - genStart) / 1000).toFixed(1);
  onStatus({ phase: 'error', detail: `Image generation failed after ${MAX_IMAGE_RETRIES} attempts (${totalElapsed}s, continuing without image)` });
  return undefined;
}

/**
 * Simplify the image prompt on retry to avoid content filter issues.
 * Each attempt removes more potentially problematic details.
 */
function simplifyPrompt(original: string, attempt: number): string {
  let simplified = original;
  if (attempt >= 2) {
    // Remove mentions of violence, weapons, blood
    simplified = simplified.replace(/\b(blood|weapon|sword|gun|wound|dead|dying|kill)\b/gi, '');
    simplified = simplified.replace(/\b(violent|gore|graphic|disturbing)\b/gi, '');
  }
  if (attempt >= 3) {
    // Further simplify — keep only setting and mood
    const sentences = simplified.split(/[.!?]+/).filter((s) => s.trim());
    simplified = sentences.slice(0, 2).join('. ') + '. Fantasy illustration, detailed, atmospheric.';
  }
  return simplified.trim();
}

// =============================================================================
// MUSIC SEARCH + ASSIGNMENT
// =============================================================================

const MUSIC_API_BASE = '/api/music';

/**
 * Search the BM25 music database for a track matching the query,
 * download the audio, and return it as a data URL with metadata.
 */
async function searchAndAssignMusic(
  query: string,
  onStatus: (status: OpenWorldStatus) => void
): Promise<{ dataUrl: string; metadata: { row_id: number; title: string; duration?: number } } | undefined> {
  const musicFnStart = Date.now();
  onStatus({ phase: 'searching_music', detail: `Searching music: "${query}"...` });

  try {
    // Step 1: Search the BM25 server
    const searchRes = await fetch(`${MUSIC_API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        search_field: 'situations',
        top_k: 3,
        singing_filter: 'no_singing',
      }),
    });

    if (!searchRes.ok) {
      console.warn('[OpenWorld] Music search HTTP error:', searchRes.status);
      return undefined;
    }

    const searchData = await searchRes.json();
    if (!searchData.results || searchData.results.length === 0) {
      console.log('[OpenWorld] No music results for query:', query);
      return undefined;
    }

    // Pick the top result
    const topResult = searchData.results[0];
    const rowId = topResult.row_id as number;

    onStatus({ phase: 'searching_music', detail: `Found: "${topResult.title}" — downloading...` });

    // Step 2: Get track metadata (includes audio URL)
    const trackRes = await fetch(`${MUSIC_API_BASE}/track/${rowId}`);
    if (!trackRes.ok) {
      console.warn('[OpenWorld] Track metadata fetch failed:', trackRes.status);
      return undefined;
    }
    const trackMeta = await trackRes.json();
    const audioUrl = trackMeta.audio_url as string;
    if (!audioUrl) {
      console.warn('[OpenWorld] Track has no audio URL');
      return undefined;
    }

    // Step 3: Download audio and create a blob URL directly.
    // MEMORY OPTIMIZATION: Previously we converted the entire audio file to
    // a base64 data URL string, causing a ~3x V8 heap spike (N bytes file →
    // ~3.3N bytes of temporary strings during conversion). Now we keep the
    // binary data in native blob storage (outside V8 heap) by creating a
    // blob URL directly. The blobCache's registerBlob() ensures that
    // rehydrateForSave() can convert it back to base64 when saving to IndexedDB.
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn('[OpenWorld] Audio download failed:', audioRes.status);
      return undefined;
    }

    const blob = await audioRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    // Register in blobCache so rehydrateForSave can convert back to base64 for persistence
    registerBlob(blobUrl, blob);

    const musicFnMs = Date.now() - musicFnStart;
    console.log(`[OpenWorld] Music ready in ${musicFnMs}ms: "${trackMeta.title}" (${Math.round(blob.size / 1024)}KB) — stored as blob URL`);
    onStatus({ phase: 'searching_music', detail: `Music ready: "${trackMeta.title}" (${musicFnMs}ms)` });

    return {
      dataUrl: blobUrl,
      metadata: {
        row_id: rowId,
        title: trackMeta.title as string,
        duration: trackMeta.duration as number | undefined,
      },
    };
  } catch (err) {
    console.warn('[OpenWorld] Music search/download error:', err);
    return undefined;
  }
}

// =============================================================================
// STREAMING AI CALL
// =============================================================================

/**
 * Send the context to the open-world endpoint and stream back the response.
 * Now sends separate systemPrompt + userMessage along with writer provider config.
 * Optionally includes entity reference images for Gemini multimodal context.
 */
async function streamOpenWorldResponse(
  systemPrompt: string,
  userMessage: string,
  signal: AbortSignal,
  onTextDelta: (text: string) => void,
  entityRefImages: Array<{ entityId: string; entityName: string; base64: string }> = [],
  userUploadedImages: Array<{ base64: string; label: string }> = []
): Promise<string> {
  const settings = useImageGenStore.getState();
  const writer = settings.writer;

  // Resolve API key: for gemini provider, use shared googleApiKey if writer.apiKey is empty
  const apiKey = writer.provider === 'gemini'
    ? (writer.apiKey || settings.googleApiKey)
    : writer.apiKey;

  const res = await fetch('/api/open-world', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      userMessage,
      provider: writer.provider,
      model: writer.model,
      apiKey,
      endpoint: writer.endpoint,
      // Entity reference images for Gemini multimodal — allows the writing
      // LLM to SEE what characters/locations look like when generating
      // scene descriptions and imagePrompts for visual consistency.
      entityRefImages: writer.provider === 'gemini' ? entityRefImages : [],
      // User-uploaded images attached to the player's action input.
      // These are passed as multimodal parts so the AI can see them and
      // potentially assign them to entities via assignUploadedImages.
      userUploadedImages: writer.provider === 'gemini' ? userUploadedImages : [],
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
    throw new Error(err.error || `Server error ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (parsed.type === 'text') {
        fullText += parsed.text;
        // With structured JSON output, we don't stream text to the UI.
        // The full JSON is parsed after completion.
        // For legacy marker format, we could stream, but it's simpler
        // and avoids the "text in old scene" bug to just accumulate.
      } else if (parsed.type === 'error') {
        throw new Error(parsed.error);
      } else if (parsed.type === 'done') {
        return fullText;
      }
    }
  }

  return fullText;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate a new open-world scene based on the player's free-form action.
 *
 * Returns an abort function. Results and status updates are delivered via callbacks.
 */
export function generateOpenWorldScene(
  project: Project,
  session: GameSession,
  userAction: string,
  onStatus: (status: OpenWorldStatus) => void,
  onTextDelta: (text: string) => void,
  onComplete: (result: OpenWorldResult) => void,
  onError: (error: string) => void,
  onImageReady?: (imageDataUrl: string) => void,
  onMusicReady?: (musicDataUrl: string, metadata: { row_id: number; title: string; duration?: number }) => void,
  currentSceneImage?: string,
  onEntityImageReady?: (entityId: string, imageDataUrl: string) => void,
  /** User-uploaded images attached to the player's action (for reference image assignment) */
  userUploadedImages?: Array<{ base64: string; label: string }>
): () => void {
  const controller = new AbortController();

  (async () => {
    const pipelineStart = Date.now();

    try {
      // ── Step 1: Build context ────────────────────────────────────
      const contextStart = Date.now();
      onStatus({ phase: 'building_context', detail: 'Gathering story context...' });

      let context = buildOpenWorldContext(project, session, userAction);
      const contextMs = Date.now() - contextStart;
      console.log(
        `[OpenWorld] Context built in ${contextMs}ms: ~${context.estimatedTokens} tokens (${context.userMessage.length} chars), ` +
        `${context.fullProfileEntityIds.length} full profiles, ` +
        `path: ${context.pathStats.full} full + ${context.pathStats.summarized} summarized scenes`
      );
      onStatus({
        phase: 'building_context',
        detail: `Context built (${contextMs}ms, ~${context.estimatedTokens} tokens, ${context.fullProfileEntityIds.length} profiles)`,
      });

      // ── Step 1.5: SKIPPED — portrait generation moved to post-text phase ──
      // Previously, ALL missing entity portraits were generated here BEFORE text
      // generation, which added 40-80s of latency before the user saw any text.
      // Now portraits are generated AFTER text generation in parallel with the
      // scene background image (Step 4.5 in the post-text pipeline). The writer
      // LLM still sees "[⚠ NO REFERENCE IMAGE]" warnings and includes entities
      // in generateEntityImages accordingly, so no portraits are lost — they're
      // just generated later, in parallel with other work.
      console.log(`[OpenWorld] Step 1.5: SKIPPED pre-scene portrait generation (deferred to post-text phase for faster text delivery)`);

      // ── Step 1b: Collect entity reference images for writing LLM ──
      // When the writer is Gemini, sending entity reference images as inline
      // data gives the LLM visual context about what characters/locations look
      // like, enabling it to write more visually consistent scene descriptions
      // and better imagePrompts. For non-Gemini writers, images are skipped
      // (OpenAI text-only models can't process inline images this way).
      const writerSettings = useImageGenStore.getState().writer;
      let writerRefImages: Array<{ entityId: string; entityName: string; base64: string }> = [];

      if (writerSettings.provider === 'gemini') {
        const entities = project.entities || [];
        // Collect reference images from entities that are likely relevant:
        // - All entities linked to the current scene
        // - Limit to first 5 to avoid bloating the context
        const currentNode = project.nodes.find(n => n.id === session.currentNodeId);
        const nodeData = currentNode?.data as Record<string, unknown> | undefined;
        const linkedIds = new Set<string>([
          ...((nodeData?.linkedCharacters as string[]) || []),
          ...((nodeData?.linkedLocations as string[]) || []),
          ...((nodeData?.linkedObjects as string[]) || []),
          ...((nodeData?.linkedConcepts as string[]) || []),
        ]);

        for (const entity of entities) {
          if (!entity.referenceImage) continue;
          // Prioritize entities linked to current scene, then include others up to limit
          if (!linkedIds.has(entity.id) && writerRefImages.length >= 5) continue;

          let base64 = '';
          if (entity.referenceImage.startsWith('data:')) {
            base64 = entity.referenceImage;
          } else if (entity.referenceImage.startsWith('blob:')) {
            const resolved = await blobUrlToBase64(entity.referenceImage);
            if (resolved) base64 = resolved;
          }

          if (base64) {
            writerRefImages.push({
              entityId: entity.id,
              entityName: entity.name,
              base64,
            });
          }
        }

        if (writerRefImages.length > 0) {
          console.log(`[OpenWorld] Sending ${writerRefImages.length} entity reference images to writing LLM: ${writerRefImages.map(r => r.entityName).join(', ')}`);
        } else {
          console.log('[OpenWorld] No entity reference images available for writing LLM (entities may lack referenceImage)');
        }
      }

      // ── Step 2: Stream AI response ───────────────────────────────
      const writerModel = writerSettings.model || 'unknown';
      const textStart = Date.now();
      onStatus({ phase: 'generating_text', detail: `Writing the next scene (${writerModel})...` });

      const fullText = await streamOpenWorldResponse(
        context.systemPrompt,
        context.userMessage,
        controller.signal,
        onTextDelta,
        writerRefImages,
        userUploadedImages || []
      );

      const textMs = Date.now() - textStart;
      onStatus({ phase: 'generating_text', detail: `Scene text generated (${(textMs / 1000).toFixed(1)}s, ${Math.round(fullText.length / 1024)}KB)` });
      console.log(`[OpenWorld] Step 2: Text generated in ${(textMs / 1000).toFixed(1)}s (${fullText.length} chars)`);

      // ── Step 3: Parse response ───────────────────────────────────
      const parseStart = Date.now();
      onStatus({ phase: 'parsing_response', detail: 'Processing scene data...' });

      const { sceneText, metadata } = parseOpenWorldResponse(fullText);
      const parseMs = Date.now() - parseStart;

      onStatus({
        phase: 'parsing_response',
        detail: `Parsed (${parseMs}ms) — ${metadata.choices?.length || 0} choices, ${metadata.presentEntityIds?.length || 0} entities`,
      });
      console.log(`[OpenWorld] Step 3: Parsed in ${parseMs}ms — ${metadata.choices?.length || 0} choices, ${metadata.presentEntityIds?.length || 0} entities`);

      if (!sceneText) {
        throw new Error('AI did not generate scene text');
      }

      // ── Step 4: Handle image reuse vs generation ─────────────────
      // Only reuse if AI EXPLICITLY set reuseImage=true AND there IS a current image.
      // If reuseImage is undefined/missing (e.g., JSON parse failed), default to generating.
      const shouldReuseImage = metadata.reuseImage === true && !!currentSceneImage;

      if (shouldReuseImage) {
        console.log('[OpenWorld] Reusing current scene image (AI set reuseImage=true)');
      }

      // Build the image prompt — use AI's prompt, or construct a fallback from scene text.
      // This ensures we ALWAYS attempt image generation unless explicitly reusing.
      let imagePrompt = metadata.imagePrompt;
      if (!imagePrompt && !shouldReuseImage) {
        // Construct a fallback image prompt from the scene text + entity descriptions
        const entityNames = (metadata.presentEntityIds || [])
          .map(eid => {
            const e = project.entities?.find(ent => ent.id === eid);
            return e ? `${e.name} (${e.category})` : null;
          })
          .filter(Boolean)
          .join(', ');

        imagePrompt = `Scene illustration: ${sceneText.slice(0, 300)}. ` +
          (entityNames ? `Characters/elements present: ${entityNames}. ` : '') +
          'Detailed fantasy illustration, atmospheric lighting, cinematic composition.';
        console.log('[OpenWorld] Using fallback image prompt (AI did not provide imagePrompt)');
      }

      // ── Validate and enforce exactly 3 choices ──────────────────
      let choices = metadata.choices || [];
      if (choices.length < 3) {
        console.warn(`[OpenWorld] Only ${choices.length} choices returned, padding to 3`);
        const fallbackChoices = ['Look around carefully', 'Continue forward', 'Consider your options'];
        while (choices.length < 3) {
          choices.push(fallbackChoices[choices.length] || `Option ${choices.length + 1}`);
        }
      }
      if (choices.length > 3) {
        console.warn(`[OpenWorld] ${choices.length} choices returned, capping to 3`);
        choices = choices.slice(0, 3);
      }

      // ── Assert presentEntityIds ─────────────────────────────────
      if (!metadata.presentEntityIds || metadata.presentEntityIds.length === 0) {
        console.warn('[OpenWorld] No presentEntityIds returned by model — entity linking may be incomplete');
      } else {
        console.log(`[OpenWorld] Present entities: ${metadata.presentEntityIds.join(', ')}`);
      }

      // Deliver text result IMMEDIATELY — don't wait for image or music.
      const textReadyMs = Date.now() - pipelineStart;
      onStatus({
        phase: 'ready',
        detail: shouldReuseImage
          ? `Scene ready (reusing image, ${(textReadyMs / 1000).toFixed(1)}s)`
          : `Scene text ready (${(textReadyMs / 1000).toFixed(1)}s) — generating image...`,
      });

      onComplete({
        sceneText,
        speakerName: metadata.speakerName || 'Narrator',
        choices,
        imageDataUrl: shouldReuseImage ? currentSceneImage : undefined,
        variableChanges: metadata.variableChanges,
        presentEntityIds: metadata.presentEntityIds,
        newEntities: metadata.newEntities,
        removeEntities: metadata.removeEntities,
        entityLinks: metadata.entityLinks,
        newVariables: metadata.newVariables,
        generateEntityImages: metadata.generateEntityImages,
        generateVoiceover: metadata.generateVoiceover,
        entityUpdates: metadata.entityUpdates,
        sceneSummary: metadata.sceneSummary,
        rawAiResponse: fullText,
        playerAction: userAction,
        constructedContext: context.userMessage,
        constructedSystemPrompt: context.systemPrompt,
        floatingGoals: metadata.floatingGoals,
        assignUploadedImages: metadata.assignUploadedImages,
        characterMindStates: metadata.characterMindStates,
        curiosityFacts: metadata.curiosityFacts,
      });

      // ── Step 4.5: Generate missing entity reference images ──────
      // Before generating the scene image, check if any entities in this scene
      // lack reference images. If so, generate 512x512 portraits first and
      // report progress in the StatusBox. This ensures visual consistency
      // because the scene image generator receives these portraits as reference.
      //
      // Newly generated entity images are stored in newlyGeneratedRefImages
      // so Step 5 can include them when building the scene image's reference set.
      const newlyGeneratedRefImages = new Map<string, string>(); // entityId → base64

      if (!shouldReuseImage && onEntityImageReady) {
        const imgSettings = useImageGenStore.getState();
        const hasImgKey = imgSettings.provider === 'gemini'
          ? !!imgSettings.googleApiKey
          : !!imgSettings.apiKey;

        if (hasImgKey) {
          // Collect all entity IDs that should be in this scene
          const allSceneEntityIds = new Set<string>([
            ...(metadata.presentEntityIds || []),
            ...(metadata.entityLinks || []),
          ]);

          // Find entities that lack reference images
          const entitiesMissingImages: Array<{ id: string; entity: Entity; prompt: string }> = [];

          for (const eid of allSceneEntityIds) {
            const entity = project.entities?.find(e => e.id === eid);
            if (!entity) continue;
            if (entity.referenceImage) continue; // already has one

            // Use the AI's prompt from generateEntityImages if provided,
            // otherwise build one from the entity's profile
            let prompt = metadata.generateEntityImages?.[eid];
            if (!prompt) {
              const profile = entity.profile || {};
              const appearance = [
                profile.appearance, profile.hair, profile.build, profile.clothing,
                profile.age, profile.race, profile.species,
              ].filter(Boolean).join(', ');

              if (entity.category === 'character') {
                prompt = `Portrait of ${entity.name}. ${appearance || entity.description}. Detailed character portrait, centered composition, 512x512 pixels. Focus on this specific character.`;
              } else if (entity.category === 'location') {
                prompt = `${entity.name}. ${entity.description}. Establishing shot, detailed environment, wide angle, 512x512 pixels.`;
              } else if (entity.category === 'object') {
                prompt = `${entity.name}. ${entity.description}. Detailed close-up of this object, centered composition, 512x512 pixels.`;
              } else {
                prompt = `Visual representation of "${entity.name}". ${entity.description}. Abstract or symbolic illustration, 512x512 pixels.`;
              }
            }

            entitiesMissingImages.push({ id: eid, entity, prompt });
          }

          if (entitiesMissingImages.length > 0) {
            const step45Start = Date.now();
            console.log(`[OpenWorld] Step 4.5: ${entitiesMissingImages.length} entities missing reference images: ${entitiesMissingImages.map(e => e.entity.name).join(', ')}`);

            // Get the current scene image as a style reference for Gemini
            let styleRefBase64: string | null = null;
            if (currentSceneImage && imgSettings.provider === 'gemini') {
              if (currentSceneImage.startsWith('data:')) {
                styleRefBase64 = currentSceneImage;
              } else if (currentSceneImage.startsWith('blob:')) {
                styleRefBase64 = await blobUrlToBase64(currentSceneImage);
              }
            }

            // Generate ALL entity portraits in parallel (previously sequential).
            // Same optimization as Step 1.5 — reduces wall time from N*15s to ~15s.
            onStatus({
              phase: 'generating_entity_images',
              detail: `Generating ${entitiesMissingImages.length} portrait(s) in parallel...`,
            });

            const portraitPromises45 = entitiesMissingImages.map(async ({ id, entity, prompt }) => {
              if (controller.signal.aborted) return null;

              const startTime = Date.now();

              try {
                const styleTag = imgSettings.defaultImageStyle?.trim();
                const fullPrompt = styleTag ? `${prompt}. Style: ${styleTag}` : prompt;

                const refImgsForPortrait: string[] = [];
                if (styleRefBase64) refImgsForPortrait.push(styleRefBase64);

                const res = await fetch('/api/generate-image', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    prompt: fullPrompt,
                    width: 512,
                    height: 512,
                    provider: imgSettings.provider,
                    apiKey: imgSettings.apiKey,
                    model: imgSettings.model,
                    endpoint: imgSettings.endpoint,
                    googleApiKey: imgSettings.googleApiKey,
                    geminiImageModel: imgSettings.geminiImageModel,
                    referenceImages: refImgsForPortrait,
                  }),
                });

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                if (res.ok) {
                  const data = await res.json();
                  const imageDataUrl = data.dataUrl || data.imageUrl;
                  if (imageDataUrl) {
                    onStatus({
                      phase: 'generating_entity_images',
                      detail: `Portrait ready: ${entity.name} (${elapsed}s)`,
                    });
                    console.log(`[OpenWorld] Step 4.5: Generated reference image for ${entity.name} [${id}] in ${elapsed}s`);
                    return { id, imageDataUrl, entity };
                  }
                }

                const errText = await res.text().catch(() => 'unknown');
                console.error(`[OpenWorld] Step 4.5: Failed to generate ref image for ${entity.name} (HTTP ${res.status}, ${elapsed}s):`, errText);
                onStatus({
                  phase: 'generating_entity_images',
                  detail: `Failed: ${entity.name} (${elapsed}s): ${errText.slice(0, 80)}`,
                });
                return null;
              } catch (err) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[OpenWorld] Step 4.5: Error generating ref image for ${entity.name} (${elapsed}s):`, errMsg);
                onStatus({
                  phase: 'generating_entity_images',
                  detail: `Error: ${entity.name} (${elapsed}s): ${errMsg.slice(0, 60)}`,
                });
                return null;
              }
            });

            const results45 = await Promise.allSettled(portraitPromises45);

            // Process successful results — update entities and track for Step 5
            let successCount45 = 0;
            for (const result of results45) {
              if (result.status === 'fulfilled' && result.value) {
                const { id, imageDataUrl } = result.value;
                onEntityImageReady(id, imageDataUrl);
                newlyGeneratedRefImages.set(id, imageDataUrl);
                successCount45++;
              }
            }

            const step45Ms = Date.now() - step45Start;
            onStatus({
              phase: 'generating_entity_images',
              detail: `Portraits: ${successCount45}/${entitiesMissingImages.length} generated (${(step45Ms / 1000).toFixed(1)}s)`,
            });
            console.log(`[OpenWorld] Step 4.5: ${successCount45}/${entitiesMissingImages.length} portraits in ${(step45Ms / 1000).toFixed(1)}s (parallel)`);
          }
        }
      }

      // ── Step 5: Generate image in background (non-blocking) ──────
      // Always generate unless AI explicitly set reuseImage=true with a valid current image
      if (!shouldReuseImage && imagePrompt) {
        // Collect entity reference images for Gemini visual consistency.
        // Use BOTH the current scene's linked entities AND the new scene's presentEntityIds
        // to maximize visual consistency across scene transitions.
        //
        // IMPORTANT: After memory optimization, entity.referenceImage may be a blob URL
        // instead of a base64 data URL. The image generation API requires base64 data URLs,
        // so we must resolve blob URLs back to base64 before sending.
        const rawRefImages: string[] = [];
        const seenIds = new Set<string>();

        // From the current scene's linked entities
        const currentNode = project.nodes.find(n => n.id === session.currentNodeId);
        const nodeData = currentNode?.data as Record<string, unknown> | undefined;
        const currentLinkedIds = [
          ...((nodeData?.linkedCharacters as string[]) || []),
          ...((nodeData?.linkedLocations as string[]) || []),
          ...((nodeData?.linkedObjects as string[]) || []),
          ...((nodeData?.linkedConcepts as string[]) || []),
        ];
        for (const eid of currentLinkedIds) {
          if (seenIds.has(eid)) continue;
          seenIds.add(eid);
          const entity = project.entities?.find(e => e.id === eid);
          // Check newly generated images first, then existing ones
          if (newlyGeneratedRefImages.has(eid)) {
            rawRefImages.push(newlyGeneratedRefImages.get(eid)!);
          } else if (entity?.referenceImage) {
            rawRefImages.push(entity.referenceImage);
          }
        }

        // Also from the NEW scene's presentEntityIds (the AI told us who's in the next scene)
        if (metadata.presentEntityIds) {
          for (const eid of metadata.presentEntityIds) {
            if (seenIds.has(eid)) continue;
            seenIds.add(eid);
            const entity = project.entities?.find(e => e.id === eid);
            if (newlyGeneratedRefImages.has(eid)) {
              rawRefImages.push(newlyGeneratedRefImages.get(eid)!);
            } else if (entity?.referenceImage) {
              rawRefImages.push(entity.referenceImage);
            }
          }
        }

        // ── Resolve blob URLs to base64 data URLs ─────────────────
        // After asset offloading, referenceImage fields hold blob URLs (~50 bytes)
        // instead of base64 data URLs. The image gen API needs actual base64 data.
        //
        // ROBUSTNESS: If blobUrlToBase64 fails (blob GC'd by browser), we retry
        // once after a short delay — the browser may need time to recover the blob
        // from its internal storage.
        const refImages: string[] = [];
        for (const img of rawRefImages) {
          if (img.startsWith('data:')) {
            // Already a base64 data URL — use directly
            refImages.push(img);
          } else if (img.startsWith('blob:')) {
            // Blob URL — convert back to base64 from the cached Blob
            let base64 = await blobUrlToBase64(img);
            if (!base64) {
              // Retry once after 100ms — blob may be recoverable
              await new Promise(r => setTimeout(r, 100));
              base64 = await blobUrlToBase64(img);
            }
            if (base64) {
              refImages.push(base64);
            } else {
              console.warn(`[OpenWorld] REF IMAGE LOST: blob URL could not be resolved after retry: ${img.slice(0, 60)}`);
            }
          }
          // Other URLs (http/https) are ignored — API needs base64
        }

        // ── Detailed diagnostic logging for every attempt ─────
        // Always log entity-by-entity status so we can see exactly what's happening
        console.group('[OpenWorld] Reference Image Diagnostics');
        console.log(`Entities checked: ${seenIds.size}`);
        for (const eid of seenIds) {
          const entity = project.entities?.find(e => e.id === eid);
          if (entity) {
            const refImg = entity.referenceImage;
            const status = !refImg ? 'NO IMAGE'
              : refImg === '' ? 'EMPTY STRING'
              : refImg.startsWith('data:') ? `BASE64 (${Math.round(refImg.length / 1024)}KB)`
              : refImg.startsWith('blob:') ? `BLOB URL`
              : `OTHER: ${refImg.slice(0, 30)}`;
            console.log(`  ${entity.name} [${eid.slice(0, 12)}...]: ${status}`);
          }
        }
        console.log(`Raw ref images collected: ${rawRefImages.length}`);
        console.log(`Successfully resolved to base64: ${refImages.length}`);
        if (refImages.length > 0) {
          const totalKB = refImages.reduce((sum, img) => sum + Math.round(img.length / 1024), 0);
          console.log(`Total ref image payload: ${totalKB}KB (${refImages.length} images)`);
        }
        if (rawRefImages.length > refImages.length) {
          console.warn(`DROPPED ${rawRefImages.length - refImages.length} reference images (blob→base64 conversion failed)`);
        }
        console.groupEnd();

        const imgStart = Date.now();
        const imgSettings = useImageGenStore.getState();
        onStatus({
          phase: 'generating_image',
          detail: `Generating scene image (${imgSettings.provider}, ${imgSettings.model || 'default'})...`,
        });

        generateImage(imagePrompt, onStatus, refImages).then((url) => {
          const imgMs = Date.now() - imgStart;
          if (url && onImageReady) {
            const totalMs = Date.now() - pipelineStart;
            onStatus({
              phase: 'ready',
              detail: `Scene complete (image: ${(imgMs / 1000).toFixed(1)}s, total: ${(totalMs / 1000).toFixed(1)}s)`,
            });
            console.log(`[OpenWorld] Step 5: Scene image generated in ${(imgMs / 1000).toFixed(1)}s`);
            onImageReady(url);
          } else {
            console.log(`[OpenWorld] Step 5: Scene image generation failed after ${(imgMs / 1000).toFixed(1)}s`);
          }
        }).catch((err) => {
          const imgMs = Date.now() - imgStart;
          console.warn(`[OpenWorld] Background image gen failed after ${(imgMs / 1000).toFixed(1)}s:`, err);
        });
      }

      // ── Step 6: Search and assign music in background ─────────────
      // Only search when the AI provides a musicQuery (mood/location changed)
      if (metadata.musicQuery) {
        const musicStart = Date.now();
        searchAndAssignMusic(metadata.musicQuery, onStatus).then((result) => {
          const musicMs = Date.now() - musicStart;
          if (result && onMusicReady) {
            onStatus({ phase: 'searching_music', detail: `Music found: "${result.metadata.title}" (${musicMs}ms)` });
            console.log(`[OpenWorld] Step 6: Music found in ${musicMs}ms: "${result.metadata.title}"`);
            onMusicReady(result.dataUrl, result.metadata);
          } else {
            console.log(`[OpenWorld] Step 6: No music match (${musicMs}ms)`);
          }
        }).catch((err) => {
          const musicMs = Date.now() - musicStart;
          console.warn(`[OpenWorld] Background music search failed after ${musicMs}ms:`, err);
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onStatus({ phase: 'error', detail: msg });
      onError(msg);
    }
  })();

  return () => controller.abort();
}
