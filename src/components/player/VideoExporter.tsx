/**
 * =============================================================================
 * VIDEO EXPORTER — Generate a WebM video from co-write project nodes
 * =============================================================================
 *
 * Creates a video by walking through all co-write nodes in the same traversal
 * order as PhotoStoryPlayer, rendering each node's image on a canvas and
 * playing its voiceover audio (or using a default 5-second hold).
 *
 * TECHNICAL APPROACH:
 * - Canvas API for rendering frames (each node's image scaled to fill)
 * - MediaRecorder API for capturing the canvas stream as WebM video
 * - AudioContext + MediaStreamDestination for mixing voiceover audio into
 *   the video's audio track
 * - Combined MediaStream (canvas video + audio destination) fed to recorder
 *
 * WHY WebM, NOT MP4:
 * Browser-native MediaRecorder supports WebM (VP9+Opus) out of the box.
 * True MP4 (H.264+AAC) encoding would require ffmpeg.wasm (~25 MB WASM
 * binary), which is heavy for an optional export feature. WebM plays in
 * all modern browsers, VLC, and can be converted to MP4 offline.
 *
 * =============================================================================
 */

import React, { useState, useCallback, useRef } from 'react';
import { Film, X, Download, Play } from 'lucide-react';
import { useProjectStore } from '@/stores/useProjectStore';
import { getBlobUrl } from '@/utils/blobCache';
import type {
  Project,
  StoryNode,
  StoryRootNodeData,
  PlotNodeData,
  ActNodeData,
  CoWriteSceneData,
  ShotNodeData,
} from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface VideoExporterProps {
  /** Whether the export modal is visible */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

type ExportState =
  | { phase: 'idle' }
  | { phase: 'exporting'; current: number; total: number; nodeName: string }
  | { phase: 'done'; blobUrl: string; size: number }
  | { phase: 'error'; message: string };

type Resolution = { width: number; height: number; label: string };

const RESOLUTIONS: Resolution[] = [
  { width: 1920, height: 1080, label: '1080p (1920x1080)' },
  { width: 1280, height: 720, label: '720p (1280x720)' },
];

// =============================================================================
// TRAVERSAL ORDER — same logic as PhotoStoryPlayer
// =============================================================================

/**
 * Build the traversal order for video export. Mirrors PhotoStoryPlayer's
 * buildPhotoStoryOrder exactly so the video matches the slideshow.
 */
function buildVideoOrder(project: Project): StoryNode[] {
  const nodes = project.nodes;
  const edges = project.edges;

  const root = nodes.filter(n => n.type === 'storyRoot');
  const plots = nodes
    .filter(n => n.type === 'plot')
    .sort((a, b) => a.position.x - b.position.x);
  const acts = nodes
    .filter(n => n.type === 'act')
    .sort((a, b) => a.position.x - b.position.x);
  const scenes = nodes.filter(n => n.type === 'cowriteScene');
  const shots = nodes.filter(n => n.type === 'shot');

  const ordered: StoryNode[] = [];
  const connectedSceneIds = new Set<string>();
  const connectedShotIds = new Set<string>();

  const appendChildShots = (parentId: string) => {
    const parentEdges = edges.filter(e => e.source === parentId);
    const childShotIds = new Set(parentEdges.map(e => e.target));
    const childShots = shots
      .filter(s => childShotIds.has(s.id))
      .sort((a, b) => a.position.x - b.position.x);
    for (const shot of childShots) {
      ordered.push(shot);
      connectedShotIds.add(shot.id);
    }
  };

  for (const act of acts) {
    ordered.push(act);
    const actEdges = edges.filter(e => e.source === act.id);
    const actSceneIds = new Set(actEdges.map(e => e.target));
    const actScenes = scenes
      .filter(s => actSceneIds.has(s.id))
      .sort((a, b) => a.position.x - b.position.x);
    for (const scene of actScenes) {
      ordered.push(scene);
      connectedSceneIds.add(scene.id);
      appendChildShots(scene.id);
    }
    appendChildShots(act.id);
  }

  const orphanScenes = scenes
    .filter(s => !connectedSceneIds.has(s.id))
    .sort((a, b) => a.position.x - b.position.x);
  for (const scene of orphanScenes) {
    ordered.push(scene);
    appendChildShots(scene.id);
  }

  const orphanShots = shots
    .filter(s => !connectedShotIds.has(s.id))
    .sort((a, b) => a.position.x - b.position.x);

  return [...root, ...plots, ...ordered, ...orphanShots];
}

// =============================================================================
// NODE HELPERS
// =============================================================================

/** Extract the image URL from any co-write node type */
function getNodeImage(node: StoryNode): string | undefined {
  const d = node.data as any;
  // Scene nodes use backgroundImage; co-write nodes use image
  return d.image || d.backgroundImage;
}

/** Extract the voiceover URL from any co-write node type */
function getNodeVoiceover(node: StoryNode): string | undefined {
  return (node.data as any).voiceoverAudio;
}

/** Get a display title for the node */
function getNodeTitle(node: StoryNode): string {
  const d = node.data as any;
  return d.title || d.name || node.label || 'Untitled';
}

/**
 * Load an image URL (blob URL or data URL) into an HTMLImageElement.
 * Returns null if loading fails (e.g., missing image).
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Resolve blob URLs through the cache
    img.src = getBlobUrl(url);
  });
}

/**
 * Decode an audio data URL or blob URL into an AudioBuffer.
 * Returns null if decoding fails.
 */
async function decodeAudio(
  url: string,
  audioCtx: AudioContext
): Promise<AudioBuffer | null> {
  try {
    const resolvedUrl = getBlobUrl(url);
    const res = await fetch(resolvedUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Draw an image on a canvas, scaled to cover the full dimensions (like
 * CSS object-fit: cover). If no image is provided, draws a gradient
 * placeholder with the node title.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  img: HTMLImageElement | null,
  title: string,
  typeBadge: string
) {
  if (img) {
    // Cover-fit: scale and center-crop
    const scale = Math.max(width / img.width, height / img.height);
    const sw = width / scale;
    const sh = height / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  } else {
    // Gradient placeholder
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Semi-transparent overlay at the bottom for text
  const overlayH = height * 0.2;
  const overlayGrad = ctx.createLinearGradient(0, height - overlayH, 0, height);
  overlayGrad.addColorStop(0, 'rgba(0,0,0,0)');
  overlayGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(0, height - overlayH, width, overlayH);

  // Type badge
  ctx.font = `bold ${Math.round(height * 0.02)}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(typeBadge.toUpperCase(), width * 0.05, height - overlayH * 0.55);

  // Title
  ctx.font = `bold ${Math.round(height * 0.04)}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, width * 0.05, height - overlayH * 0.2);
}

/** Get the type badge string for a node */
function getTypeBadge(node: StoryNode): string {
  switch (node.type) {
    case 'storyRoot': return 'Story Root';
    case 'plot': return `Plot: ${(node.data as PlotNodeData).plotType || 'Arc'}`;
    case 'act': return `Act ${(node.data as ActNodeData).actNumber || '?'}`;
    case 'cowriteScene': return 'Scene';
    case 'shot': return 'Shot';
    default: return node.type;
  }
}

// =============================================================================
// EXPORT LOGIC
// =============================================================================

/**
 * Run the video export. Creates a WebM file from all traversal nodes.
 *
 * For each node:
 * 1. Render the node's image (or gradient placeholder) on the canvas
 * 2. If the node has a voiceover, play it through the AudioContext destination
 *    and hold the frame for the audio duration
 * 3. If no voiceover, hold the frame for a default 5 seconds
 * 4. Move to the next node
 *
 * @returns Blob URL of the finished .webm file
 */
async function runExport(
  project: Project,
  resolution: Resolution,
  onProgress: (current: number, total: number, name: string) => void,
  abortSignal: AbortSignal,
): Promise<{ blobUrl: string; size: number }> {
  const nodes = buildVideoOrder(project);
  if (nodes.length === 0) {
    throw new Error('No nodes to export. Add some content to the project first.');
  }

  const { width, height } = resolution;

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Create audio context and media stream destination
  const audioCtx = new AudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();

  // Capture the canvas as a video stream (30 fps)
  const canvasStream = canvas.captureStream(30);

  // Combine video + audio tracks into one MediaStream
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  // Determine supported mimeType
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000, // 5 Mbps for decent quality
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Start recording
  recorder.start(1000); // Request data every 1 second

  // Process each node sequentially
  for (let i = 0; i < nodes.length; i++) {
    if (abortSignal.aborted) break;

    const node = nodes[i];
    const title = getNodeTitle(node);
    const badge = getTypeBadge(node);
    onProgress(i + 1, nodes.length, title);

    // Load image (if any)
    const imgUrl = getNodeImage(node);
    const img = imgUrl ? await loadImage(imgUrl) : null;

    // Draw the frame
    drawFrame(ctx, width, height, img, title, badge);

    // Determine hold duration — use voiceover length or default 5s
    const voUrl = getNodeVoiceover(node);
    let holdMs = 5000;

    if (voUrl) {
      const audioBuf = await decodeAudio(voUrl, audioCtx);
      if (audioBuf) {
        holdMs = audioBuf.duration * 1000;
        // Play the audio through the destination so it gets recorded
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuf;
        source.connect(audioDest);
        source.start();
      }
    }

    // Hold the frame for the duration.
    // We need to keep "drawing" frames so the MediaRecorder captures them.
    // We re-draw at ~30fps to keep the stream alive.
    const startTime = performance.now();
    while (performance.now() - startTime < holdMs) {
      if (abortSignal.aborted) break;
      // Redraw the same frame to keep captureStream producing frames
      drawFrame(ctx, width, height, img, title, badge);
      // Wait one frame (~33ms for 30fps)
      await new Promise(r => setTimeout(r, 33));
    }
  }

  // Stop recording and wait for final data
  const finishPromise = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.stop();
  await finishPromise;

  // Close audio context
  audioCtx.close();

  // Create the final blob
  const blob = new Blob(chunks, { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, size: blob.size };
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * VideoExporter modal component. Shows resolution selector, start button,
 * progress indicator, and download link when export is complete.
 */
export default function VideoExporter({ isOpen, onClose }: VideoExporterProps) {
  const project = useProjectStore(s => s.currentProject);
  const [resolution, setResolution] = useState<Resolution>(RESOLUTIONS[0]);
  const [state, setState] = useState<ExportState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Start the export process. Creates an AbortController so the user
   * can cancel mid-export without leaving zombie MediaRecorder/AudioContext.
   */
  const handleStart = useCallback(async () => {
    if (!project) return;

    const abort = new AbortController();
    abortRef.current = abort;

    setState({ phase: 'exporting', current: 0, total: 0, nodeName: 'Preparing...' });

    try {
      const { blobUrl, size } = await runExport(
        project,
        resolution,
        (current, total, nodeName) => {
          setState({ phase: 'exporting', current, total, nodeName });
        },
        abort.signal,
      );

      if (abort.signal.aborted) {
        setState({ phase: 'idle' });
        URL.revokeObjectURL(blobUrl);
      } else {
        setState({ phase: 'done', blobUrl, size });
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Export failed',
        });
      }
    }
  }, [project, resolution]);

  /**
   * Cancel an in-progress export.
   */
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ phase: 'idle' });
  }, []);

  /**
   * Download the exported video file.
   */
  const handleDownload = useCallback(() => {
    if (state.phase !== 'done') return;
    const a = document.createElement('a');
    a.href = state.blobUrl;
    a.download = `${project?.info?.title || 'dream-e-export'}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [state, project]);

  /**
   * Clean up blob URL and reset state when closing.
   */
  const handleClose = useCallback(() => {
    handleCancel();
    if (state.phase === 'done') {
      URL.revokeObjectURL(state.blobUrl);
    }
    setState({ phase: 'idle' });
    onClose();
  }, [state, onClose, handleCancel]);

  if (!isOpen) return null;

  // Count total exportable nodes for the UI
  const nodeCount = project ? buildVideoOrder(project).length : 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-editor-surface border border-editor-border rounded-2xl shadow-2xl w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-editor-border">
          <div className="flex items-center gap-2">
            <Film size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold text-white">Make Video</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Resolution selector */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">
              Resolution
            </label>
            <select
              value={`${resolution.width}x${resolution.height}`}
              onChange={(e) => {
                const r = RESOLUTIONS.find(
                  r => `${r.width}x${r.height}` === e.target.value
                );
                if (r) setResolution(r);
              }}
              className="w-full px-3 py-2 bg-editor-bg border border-editor-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              disabled={state.phase === 'exporting'}
            >
              {RESOLUTIONS.map(r => (
                <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Node count info */}
          <p className="text-sm text-gray-400">
            {nodeCount} node{nodeCount !== 1 ? 's' : ''} will be included in the video.
            Each node is shown for the duration of its voiceover, or 5 seconds if no voiceover.
          </p>

          {/* Format info */}
          <p className="text-xs text-gray-500">
            Output format: WebM (VP9+Opus). Plays in all modern browsers and VLC.
          </p>

          {/* Progress indicator */}
          {state.phase === 'exporting' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300">
                  Node {state.current} of {state.total}
                </span>
                <span className="text-gray-400 truncate max-w-[200px]">
                  {state.nodeName}
                </span>
              </div>
              <div className="w-full h-2 bg-editor-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{
                    width: state.total > 0
                      ? `${(state.current / state.total) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Done state */}
          {state.phase === 'done' && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
              <p className="text-sm text-green-300 font-medium">
                Export complete!
              </p>
              <p className="text-xs text-green-400/70">
                File size: {(state.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          )}

          {/* Error state */}
          {state.phase === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">
                {state.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-editor-border">
          {state.phase === 'idle' || state.phase === 'error' ? (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={nodeCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} />
                Start Export
              </button>
            </>
          ) : state.phase === 'exporting' ? (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              Cancel Export
            </button>
          ) : state.phase === 'done' ? (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
              >
                <Download size={16} />
                Download .webm
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
