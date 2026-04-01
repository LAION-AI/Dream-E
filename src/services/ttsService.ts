/**
 * =============================================================================
 * TTS SERVICE — Chunked Pseudo-Streaming Text-to-Speech
 * =============================================================================
 *
 * Splits text into sentence-based chunks of increasing size, sends them all
 * in parallel to the Gemini TTS API, and plays them back seamlessly as they
 * arrive. Once all chunks are done, concatenates into a single audio data URL
 * for permanent storage on the scene node.
 *
 * Chunk strategy:
 *   Chunk 1: ~100 chars (small, arrives fast for low latency)
 *   Chunk 2: ~200 chars
 *   Chunk 3+: ~400 chars each
 *
 * =============================================================================
 */

import { Howl } from 'howler';
import { useImageGenStore } from '@/stores/useImageGenStore';
import { registerBlob } from '@/utils/blobCache';

// =============================================================================
// TYPES
// =============================================================================

export interface TTSChunkResult {
  index: number;
  dataUrl: string;
  mimeType: string;
  base64: string;
}

export interface TTSStreamHandle {
  /** Cancel all pending requests and stop playback */
  cancel: () => void;
  /** Promise that resolves with the final concatenated audio data URL, or null if cancelled */
  finalAudio: Promise<string | null>;
}

// =============================================================================
// SENTENCE SPLITTING
// =============================================================================

/**
 * Split text into sentences using punctuation rules.
 * Handles: . ! ? followed by whitespace or end of string.
 * Also splits on double newlines (paragraph breaks).
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space/newline, or on paragraph breaks
  const parts = text.split(/(?<=[.!?])\s+|(?:\n\s*\n)/);
  return parts.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Merge sentences into chunks with increasing minimum sizes.
 * Chunk 1: >= 100 chars, Chunk 2: >= 200 chars, Chunk 3+: >= 400 chars.
 */
function buildChunks(text: string): string[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [text];

  const thresholds = [100, 200, 400]; // min chars per chunk (repeats last for subsequent)
  const chunks: string[] = [];
  let current = '';
  let chunkIndex = 0;

  for (const sentence of sentences) {
    current += (current ? ' ' : '') + sentence;
    const threshold = thresholds[Math.min(chunkIndex, thresholds.length - 1)];
    if (current.length >= threshold) {
      chunks.push(current);
      current = '';
      chunkIndex++;
    }
  }

  // Remaining text — append to last chunk if short, or create new chunk
  if (current.trim()) {
    if (chunks.length > 0 && current.length < 50) {
      chunks[chunks.length - 1] += ' ' + current;
    } else {
      chunks.push(current);
    }
  }

  return chunks.length > 0 ? chunks : [text];
}

// =============================================================================
// TTS API CALL
// =============================================================================

async function generateChunkTTS(
  text: string,
  index: number,
  signal: AbortSignal
): Promise<TTSChunkResult> {
  const settings = useImageGenStore.getState();

  // Determine which API key(s) to send to the server.
  // The server endpoint will decide whether to call Google directly or use
  // HyprLab's Gemini-compatible endpoint based on which keys are available.
  const googleKey = settings.googleApiKey || '';
  const hyprLabKey = settings.apiKey || '';

  if (!googleKey && !hyprLabKey) {
    throw new Error('An API key is required for TTS — set Google API Key or provider key in AI Settings');
  }

  const res = await fetch('/api/generate-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      googleApiKey: googleKey,
      hyprLabApiKey: hyprLabKey,
      model: settings.tts.model,
      voice: settings.tts.voice,
      instruction: settings.tts.instruction,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `TTS chunk ${index} failed`);
  }

  const data = await res.json();
  if (!data.dataUrl) throw new Error(`TTS chunk ${index}: no audio returned`);

  // Extract mime and base64 from data URL
  const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match?.[1] || 'audio/wav';
  const base64 = match?.[2] || '';

  return { index, dataUrl: data.dataUrl, mimeType, base64 };
}

// =============================================================================
// AUDIO CONCATENATION
// =============================================================================

/**
 * Concatenate multiple audio data URLs into one by decoding to PCM,
 * joining the buffers, and re-encoding. Falls back to the first chunk
 * if AudioContext is unavailable.
 */
async function concatenateAudio(chunks: TTSChunkResult[]): Promise<string> {
  if (chunks.length === 1) return chunks[0].dataUrl;

  try {
    const audioCtx = new AudioContext();
    const buffers: AudioBuffer[] = [];

    for (const chunk of chunks) {
      const binaryStr = atob(chunk.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
      buffers.push(audioBuffer);
    }

    // Calculate total length
    const sampleRate = buffers[0].sampleRate;
    const numChannels = buffers[0].numberOfChannels;
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);

    // Create merged buffer
    const merged = audioCtx.createBuffer(numChannels, totalLength, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = merged.getChannelData(ch);
      let offset = 0;
      for (const buf of buffers) {
        channelData.set(buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1)), offset);
        offset += buf.length;
      }
    }

    // Encode as WAV — return a blob URL instead of base64 data URL.
    // MEMORY OPTIMIZATION: Previously we btoa-encoded the entire WAV buffer,
    // creating a multi-MB base64 string on the V8 heap. Now we keep the binary
    // data in native blob storage (outside V8 heap). The blobCache's
    // registerBlob() ensures rehydrateForSave() can convert it back to base64
    // when saving to IndexedDB.
    const wavBlob = audioBufferToWav(merged);
    const blobUrl = URL.createObjectURL(wavBlob);
    registerBlob(blobUrl, wavBlob);
    audioCtx.close();

    return blobUrl;
  } catch (err) {
    console.warn('[TTS] Audio concat failed, using first chunk:', err);
    return chunks[0].dataUrl;
  }
}

/** Encode an AudioBuffer as a WAV Blob */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave channels into 16-bit PCM
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// =============================================================================
// MAIN STREAMING TTS FUNCTION
// =============================================================================

/**
 * Generate TTS for the given text with chunked pseudo-streaming.
 *
 * @param text         Full text to convert to speech
 * @param onChunkReady Called when each chunk's audio is ready (for sequential playback)
 * @param onAllDone    Called when all chunks are done and concatenated
 * @returns A handle with cancel() and finalAudio promise
 */
export function streamTTS(
  text: string,
  onChunkReady: (chunk: TTSChunkResult) => void,
  onAllDone: (finalDataUrl: string) => void,
): TTSStreamHandle {
  const abortController = new AbortController();
  let cancelled = false;

  const finalAudio = (async (): Promise<string | null> => {
    try {
      const chunks = buildChunks(text);
      console.log(`[TTS] Split into ${chunks.length} chunks:`, chunks.map(c => c.length + ' chars'));

      // Fire all chunk requests in parallel
      const promises = chunks.map((chunkText, i) =>
        generateChunkTTS(chunkText, i, abortController.signal)
      );

      // Deliver chunks IN ORDER as they arrive — don't wait for all to finish.
      // Each chunk resolves independently; we track which index to deliver next
      // and flush any buffered later chunks once earlier ones arrive.
      const results: (TTSChunkResult | null)[] = new Array(chunks.length).fill(null);
      let nextToDeliver = 0;

      const deliverReady = () => {
        while (nextToDeliver < results.length && results[nextToDeliver] !== null) {
          if (cancelled) return;
          onChunkReady(results[nextToDeliver]!);
          nextToDeliver++;
        }
      };

      // Attach .then to each promise to store result and try delivering
      const wrappers = promises.map((p, i) =>
        p.then((result) => {
          results[i] = result;
          deliverReady();
        }).catch((err) => {
          console.error(`[TTS] Chunk ${i} failed:`, err);
          // Mark as a sentinel so we don't block delivery of later chunks
          results[i] = { index: i, dataUrl: '', mimeType: '', base64: '' } as TTSChunkResult;
          deliverReady();
        })
      );

      // Wait for all to complete (they're already delivering as they arrive)
      await Promise.all(wrappers);
      if (cancelled) return null;

      // Filter out failed chunks (empty dataUrl) for concatenation
      const validResults = results.filter((r): r is TTSChunkResult => r !== null && r.dataUrl !== '');
      if (validResults.length === 0) return null;

      // Concatenate all chunks into final audio
      const finalUrl = await concatenateAudio(validResults);
      if (!cancelled) onAllDone(finalUrl);
      return finalUrl;
    } catch (err) {
      if (!cancelled) console.error('[TTS] Stream failed:', err);
      return null;
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
      abortController.abort();
    },
    finalAudio,
  };
}

// =============================================================================
// SEQUENTIAL PLAYBACK HELPER
// =============================================================================

/**
 * Plays TTS chunks sequentially using Howler. Call playNext() for each chunk
 * as it arrives. Each chunk starts playing as soon as the previous finishes.
 */
export class TTSPlayer {
  private queue: string[] = [];
  private currentHowl: Howl | null = null;
  private playing = false;
  private volume: number;
  private cancelled = false;

  constructor(volume: number = 1.0) {
    this.volume = volume;
  }

  /** Enqueue a chunk's data URL for playback. Starts immediately if nothing is playing. */
  enqueue(dataUrl: string) {
    if (this.cancelled) return;
    this.queue.push(dataUrl);
    if (!this.playing) this.playNext();
  }

  private playNext() {
    if (this.cancelled || this.queue.length === 0) {
      this.playing = false;
      return;
    }

    this.playing = true;
    const url = this.queue.shift()!;

    this.currentHowl = new Howl({
      src: [url],
      format: ['wav', 'mp3', 'ogg'],
      volume: this.volume,
      onend: () => {
        // MEMORY FIX: Explicitly unload the finished Howl instance to release
        // its decoded audio buffer from Howler's internal cache. Without this,
        // each played chunk retains ~2-5 MB of decoded PCM data in Web Audio
        // buffers until the page is unloaded or stop() is called.
        if (this.currentHowl) {
          this.currentHowl.unload();
        }
        this.currentHowl = null;
        this.playNext();
      },
      onloaderror: (_id: number, err: unknown) => {
        console.error('[TTSPlayer] Load error:', err);
        if (this.currentHowl) {
          this.currentHowl.unload();
        }
        this.currentHowl = null;
        this.playNext(); // skip to next chunk
      },
    });

    this.currentHowl.play();
  }

  /** Stop playback and clear the queue */
  stop() {
    this.cancelled = true;
    this.queue = [];
    if (this.currentHowl) {
      this.currentHowl.stop();
      this.currentHowl.unload();
      this.currentHowl = null;
    }
    this.playing = false;
  }

  /** Update volume on the currently playing howl */
  setVolume(vol: number) {
    this.volume = vol;
    if (this.currentHowl) this.currentHowl.volume(vol);
  }
}
