/**
 * =============================================================================
 * PHOTO STORY PLAYER — Slideshow-style walkthrough of co-write canvas nodes
 * =============================================================================
 *
 * Walks through all nodes in breadth-first order (root -> plots -> acts ->
 * scenes), displaying images and narrating text content via TTS.
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Progress: "Node 3 of 12"                               [X] Close     │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                        │
 * │              ┌──────────────────────────┐                              │
 * │              │                          │                              │
 * │              │      Node Image          │                              │
 * │              │      (or gradient)       │                              │
 * │              │                          │                              │
 * │              └──────────────────────────┘                              │
 * │                                                                        │
 * │              Title + Type Badge                                        │
 * │              ─────────────────                                         │
 * │              Scrollable text content                                   │
 * │              (label: value pairs)                                      │
 * │                                                                        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │   [← Previous]     [🔊 TTS On/Off]    [Pause/Play]     [Next →]      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * =============================================================================
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Play,
  Pause,
} from 'lucide-react';

import { useProjectStore } from '@stores/useProjectStore';
import { useImageGenStore } from '@stores/useImageGenStore';
import { streamTTS, TTSPlayer, type TTSStreamHandle } from '@/services/ttsService';
import * as projectsDB from '@/db/projectsDB';
import { getBlobUrl } from '@/utils/blobCache';
import type {
  Project,
  StoryNode,
  StoryEdge,
  StoryRootNodeData,
  PlotNodeData,
  ActNodeData,
  CoWriteSceneData,
} from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** A single text section displayed for a node (label + text). */
interface TextSection {
  label: string;
  text: string;
}

/** The display-ready content for one node in the traversal order. */
interface NodeDisplayContent {
  /** Node ID — used for startNode matching */
  nodeId: string;
  /** Human-readable title */
  title: string;
  /** Type badge text (e.g. "Story Root", "Plot", "Act 1", "Scene") */
  typeBadge: string;
  /** Optional image URL (could be blob URL or data URL) */
  image?: string;
  /** Labelled text sections to display and narrate */
  textSections: TextSection[];
  /** Badge color class for the type indicator */
  badgeColor: string;
}

// =============================================================================
// TRAVERSAL ORDER — breadth-first (root → plots → acts → scenes)
// =============================================================================

/**
 * Build the Photo Story traversal order from a co-write project.
 *
 * WHY THIS ORDER:
 * The co-write canvas is structured hierarchically: one Story Root at the
 * center, connected to Plot nodes, which connect to Act nodes, which connect
 * to CoWrite Scene nodes. A breadth-first walk gives a natural top-down
 * reading order — overview first (root/plots), then structure (acts), then
 * detail (scenes).
 *
 * Nodes at each level are sorted left-to-right by their x position on the
 * canvas, which matches the spatial order the author laid them out in.
 * Scenes are additionally grouped by their parent act so that acts and their
 * scenes stay together in the presentation.
 */
function buildPhotoStoryOrder(project: Project): StoryNode[] {
  const nodes = project.nodes;
  const edges = project.edges;

  // 1. Story Root (should be exactly one)
  const root = nodes.filter(n => n.type === 'storyRoot');

  // 2. Plot nodes sorted by x position (left to right)
  const plots = nodes
    .filter(n => n.type === 'plot')
    .sort((a, b) => a.position.x - b.position.x);

  // 3. Act nodes sorted by x position
  const acts = nodes
    .filter(n => n.type === 'act')
    .sort((a, b) => a.position.x - b.position.x);

  // 4. CoWrite scenes: group by parent act (via edges), sort within each group.
  //    We interleave acts with their scenes: Act1 -> Act1Scenes -> Act2 -> Act2Scenes...
  const scenes = nodes.filter(n => n.type === 'cowriteScene');
  const orderedActsAndScenes: StoryNode[] = [];
  const connectedSceneIds = new Set<string>();

  for (const act of acts) {
    orderedActsAndScenes.push(act);

    // Find scenes connected FROM this act (act -> scene edges)
    const actEdges = edges.filter(e => e.source === act.id);
    const actSceneIds = new Set(actEdges.map(e => e.target));
    const actScenes = scenes
      .filter(s => actSceneIds.has(s.id))
      .sort((a, b) => a.position.x - b.position.x);

    for (const scene of actScenes) {
      orderedActsAndScenes.push(scene);
      connectedSceneIds.add(scene.id);
    }
  }

  // 5. Orphan scenes not connected to any act (append at end)
  const orphanScenes = scenes
    .filter(s => !connectedSceneIds.has(s.id))
    .sort((a, b) => a.position.x - b.position.x);

  return [...root, ...plots, ...orderedActsAndScenes, ...orphanScenes];
}

// =============================================================================
// NODE CONTENT RENDERER — extract display-ready content from each node type
// =============================================================================

/**
 * Transform a raw StoryNode into display-ready content for the Photo Story
 * player. Each node type has different fields that need to be presented in
 * a specific way.
 */
function getNodeDisplayContent(node: StoryNode): NodeDisplayContent {
  const base = { nodeId: node.id };

  switch (node.type) {
    case 'storyRoot': {
      const d = node.data as StoryRootNodeData;
      const sections: TextSection[] = [];

      if (d.genre) sections.push({ label: 'Genre', text: d.genre });
      if (d.targetAudience) sections.push({ label: 'Target Audience', text: d.targetAudience });
      if (d.punchline) sections.push({ label: 'Logline', text: d.punchline });
      if (d.mainCharacter?.name) {
        sections.push({
          label: 'Main Character',
          text: `${d.mainCharacter.name}${d.mainCharacter.role ? ` (${d.mainCharacter.role})` : ''}`,
        });
      }
      if (d.antagonist?.name) {
        sections.push({
          label: 'Antagonist',
          text: `${d.antagonist.name}${d.antagonist.role ? ` (${d.antagonist.role})` : ''}`,
        });
      }
      if (d.supportingCharacters?.length) {
        sections.push({
          label: 'Supporting Characters',
          text: d.supportingCharacters
            .map(c => `${c.name} (${c.archetype || c.customArchetype || 'unknown'})`)
            .join(', '),
        });
      }
      if (d.protagonistGoal) sections.push({ label: 'Protagonist Goal', text: d.protagonistGoal });
      if (d.summary) sections.push({ label: 'Summary', text: d.summary });

      return {
        ...base,
        title: d.title || 'Story Root',
        typeBadge: 'Story Root',
        image: d.image,
        textSections: sections,
        badgeColor: 'bg-purple-600',
      };
    }

    case 'plot': {
      const d = node.data as PlotNodeData;
      const sections: TextSection[] = [];
      if (d.plotType) sections.push({ label: 'Plot Type', text: d.customPlotType || d.plotType });
      if (d.description) sections.push({ label: 'Description', text: d.description });

      return {
        ...base,
        title: d.name || node.label || 'Plot',
        typeBadge: `Plot: ${d.customPlotType || d.plotType || 'Narrative Arc'}`,
        image: d.image,
        textSections: sections,
        badgeColor: 'bg-amber-600',
      };
    }

    case 'act': {
      const d = node.data as ActNodeData;
      const sections: TextSection[] = [];
      if (d.description) sections.push({ label: 'Description', text: d.description });
      if (d.turningPoint) sections.push({ label: 'Turning Point', text: d.turningPoint });

      return {
        ...base,
        title: d.name || node.label || `Act ${d.actNumber}`,
        typeBadge: `Act ${d.actNumber}`,
        image: d.image,
        textSections: sections,
        badgeColor: 'bg-sky-600',
      };
    }

    case 'cowriteScene': {
      const d = node.data as CoWriteSceneData;
      const sections: TextSection[] = [];
      if (d.description) sections.push({ label: 'Description', text: d.description });
      if (d.entities?.length) {
        for (const ent of d.entities) {
          sections.push({
            label: `Entity State`,
            text: [
              ent.startState && `Start: ${ent.startState}`,
              ent.objective && `Objective: ${ent.objective}`,
              ent.changes && `Changes: ${ent.changes}`,
              ent.endState && `End: ${ent.endState}`,
            ]
              .filter(Boolean)
              .join(' | '),
          });
        }
      }
      if (d.sceneAction) sections.push({ label: 'Scene Action', text: d.sceneAction });

      return {
        ...base,
        title: d.title || node.label || 'Scene',
        typeBadge: 'Scene',
        image: d.image,
        textSections: sections,
        badgeColor: 'bg-blue-600',
      };
    }

    default:
      return {
        ...base,
        title: node.label || 'Node',
        typeBadge: node.type,
        image: undefined,
        textSections: [],
        badgeColor: 'bg-gray-600',
      };
  }
}

/**
 * Build a plain-text narration string from a NodeDisplayContent.
 * This is what gets sent to TTS — a natural reading of the node's content.
 */
function buildNarrationText(content: NodeDisplayContent): string {
  const parts: string[] = [];

  // Title and type
  parts.push(`${content.typeBadge}: ${content.title}.`);

  // Each text section as "Label: text"
  for (const section of content.textSections) {
    parts.push(`${section.label}. ${section.text}.`);
  }

  return parts.join(' ');
}

// =============================================================================
// PHOTO STORY PLAYER COMPONENT
// =============================================================================

export default function PhotoStoryPlayer() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const startNodeParam = searchParams.get('startNode');

  // ── State ──────────────────────────────────────────────────────────────
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Ordered list of display-ready node content for the slideshow */
  const [nodeOrder, setNodeOrder] = useState<NodeDisplayContent[]>([]);
  /** Current index into nodeOrder */
  const [currentIndex, setCurrentIndex] = useState(0);

  /** Whether TTS narration is enabled (mirrors AI settings) */
  const [ttsEnabled, setTtsEnabled] = useState(false);
  /** Whether TTS is currently speaking */
  const [ttsPlaying, setTtsPlaying] = useState(false);
  /** Whether we're paused (waiting for user to resume) */
  const [ttsPaused, setTtsPaused] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const ttsPlayerRef = useRef<TTSPlayer | null>(null);
  const ttsHandleRef = useRef<TTSStreamHandle | null>(null);
  /** Track the index that TTS was last started for, to avoid re-triggering */
  const ttsStartedForIndexRef = useRef<number>(-1);
  /** Ref for the scrollable text container to auto-scroll to top on slide change */
  const textContainerRef = useRef<HTMLDivElement>(null);

  // ── Load project ─────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!projectId) {
        setError('No project ID provided');
        setIsLoading(false);
        return;
      }

      try {
        // Try to reuse the project from the project store (coming from editor)
        const projStore = useProjectStore.getState();
        let proj: Project | null = null;

        if (projStore.currentProject && projStore.currentProject.id === projectId) {
          proj = projStore.currentProject;
        } else {
          proj = await projectsDB.getProject(projectId);
        }

        if (!proj) {
          setError('Project not found');
          setIsLoading(false);
          return;
        }

        setProject(proj);

        // Build traversal order
        const orderedNodes = buildPhotoStoryOrder(proj);
        const displayNodes = orderedNodes.map(getNodeDisplayContent);
        setNodeOrder(displayNodes);

        // If a startNode param was provided, find its index
        if (startNodeParam && displayNodes.length > 0) {
          const startIdx = displayNodes.findIndex(n => n.nodeId === startNodeParam);
          if (startIdx >= 0) {
            setCurrentIndex(startIdx);
          }
        }

        // Check if TTS is enabled in AI settings
        const ttsSettings = useImageGenStore.getState().tts;
        const googleKey = useImageGenStore.getState().googleApiKey;
        setTtsEnabled(ttsSettings.enabled && !!googleKey);

        setIsLoading(false);
      } catch (err) {
        console.error('[PhotoStory] Failed to load project:', err);
        setError('Failed to load project');
        setIsLoading(false);
      }
    }

    load();

    // Cleanup TTS on unmount
    return () => {
      stopTTS();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── Current node content ─────────────────────────────────────────────
  const currentNode = nodeOrder[currentIndex] ?? null;
  const totalNodes = nodeOrder.length;

  // Resolve the image through blobCache for consistent display
  const resolvedImage = useMemo(() => {
    if (!currentNode?.image) return undefined;
    return getBlobUrl(currentNode.image);
  }, [currentNode?.image]);

  // ── TTS helpers ──────────────────────────────────────────────────────

  /** Stop any in-progress TTS playback and cancel pending requests. */
  const stopTTS = useCallback(() => {
    if (ttsHandleRef.current) {
      ttsHandleRef.current.cancel();
      ttsHandleRef.current = null;
    }
    if (ttsPlayerRef.current) {
      ttsPlayerRef.current.stop();
      ttsPlayerRef.current = null;
    }
    setTtsPlaying(false);
    setTtsPaused(false);
  }, []);

  /**
   * Start TTS narration for the given node content.
   * Creates a new TTSPlayer and streams chunks into it.
   */
  const startTTS = useCallback(
    (content: NodeDisplayContent) => {
      // Don't re-trigger if already playing this index
      stopTTS();

      const text = buildNarrationText(content);
      if (!text.trim()) return;

      const player = new TTSPlayer(1.0);
      ttsPlayerRef.current = player;

      setTtsPlaying(true);
      setTtsPaused(false);

      const handle = streamTTS(
        text,
        (chunk) => {
          // Each chunk arrives — enqueue for sequential playback
          if (chunk.dataUrl) {
            player.enqueue(chunk.dataUrl);
          }
        },
        (_finalUrl) => {
          // All chunks done — TTS playback will finish when the last chunk plays out.
          // We don't auto-advance; user clicks Next.
          setTtsPlaying(false);
        },
      );

      ttsHandleRef.current = handle;
    },
    [stopTTS],
  );

  // ── Auto-trigger TTS when slide changes ────────────────────────────
  useEffect(() => {
    if (!ttsEnabled || !currentNode) return;
    if (ttsStartedForIndexRef.current === currentIndex) return;

    ttsStartedForIndexRef.current = currentIndex;
    startTTS(currentNode);

    return () => {
      // If the effect re-runs (index changes), stop previous TTS
      stopTTS();
    };
  }, [currentIndex, currentNode, ttsEnabled, startTTS, stopTTS]);

  // ── Scroll text to top when slide changes ──────────────────────────
  useEffect(() => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  // ── Navigation ─────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (currentIndex < totalNodes - 1) {
      stopTTS();
      ttsStartedForIndexRef.current = -1; // Reset so TTS triggers for new slide
      setCurrentIndex(i => i + 1);
    }
  }, [currentIndex, totalNodes, stopTTS]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      stopTTS();
      ttsStartedForIndexRef.current = -1;
      setCurrentIndex(i => i - 1);
    }
  }, [currentIndex, stopTTS]);

  const handleClose = useCallback(() => {
    stopTTS();
    // Navigate back to the co-write editor
    if (projectId) {
      navigate(`/cowrite/edit/${projectId}`);
    } else {
      navigate(-1);
    }
  }, [navigate, projectId, stopTTS]);

  const toggleTTS = useCallback(() => {
    if (ttsEnabled) {
      // Turning off — stop current playback
      stopTTS();
      setTtsEnabled(false);
      ttsStartedForIndexRef.current = currentIndex; // Prevent re-trigger
    } else {
      // Turning on — check if API key is available, then start
      const ttsSettings = useImageGenStore.getState().tts;
      const googleKey = useImageGenStore.getState().googleApiKey;
      if (ttsSettings.enabled && googleKey) {
        setTtsEnabled(true);
        ttsStartedForIndexRef.current = -1; // Allow TTS to trigger
      } else {
        // Can't enable — no API key or TTS disabled in settings
        console.warn('[PhotoStory] TTS not available: check AI Settings');
      }
    }
  }, [ttsEnabled, stopTTS, currentIndex]);

  // ── Keyboard navigation ────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, handleClose]);

  // ── Render ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0a14] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-editor-border border-t-editor-accent rounded-full animate-spin" />
          <p className="text-editor-muted text-sm">Loading Photo Story...</p>
        </div>
      </div>
    );
  }

  if (error || !currentNode) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0a14] flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-red-400 mb-4">
            {error || 'No nodes to display'}
          </h1>
          <p className="text-editor-muted mb-6">
            {error
              ? 'Could not load the project for Photo Story playback.'
              : 'This project has no co-write nodes (root, plots, acts, or scenes).'}
          </p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-editor-accent text-white rounded-lg hover:bg-editor-accent/80 transition-colors"
          >
            Return to Editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a14] flex flex-col overflow-hidden select-none">
      {/* ══════════════════════════════════════════════════════════════════
          TOP BAR — Progress indicator + Close button
          ══════════════════════════════════════════════════════════════════ */}
      <header className="flex items-center justify-between px-6 py-3 bg-black/40 border-b border-white/10 shrink-0">
        <span className="text-white/60 text-sm font-medium tracking-wide">
          Node {currentIndex + 1} of {totalNodes}
        </span>

        {/* Progress bar */}
        <div className="flex-1 mx-8 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-editor-accent rounded-full transition-all duration-300 ease-out"
            style={{ width: `${((currentIndex + 1) / totalNodes) * 100}%` }}
          />
        </div>

        <button
          onClick={handleClose}
          className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Close (Esc)"
        >
          <X size={20} />
        </button>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT — Image + Title + Text
          ══════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col items-center justify-start overflow-hidden px-4 py-6">
        {/* Image or gradient placeholder */}
        <div className="w-full max-w-3xl aspect-video rounded-xl overflow-hidden shadow-2xl mb-6 shrink-0">
          {resolvedImage ? (
            <img
              src={resolvedImage}
              alt={currentNode.title}
              className="w-full h-full object-cover transition-opacity duration-500"
              loading="eager"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background:
                  'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 70%, #1a1a2e 100%)',
              }}
            />
          )}
        </div>

        {/* Title + Type badge */}
        <div className="flex items-center gap-3 mb-4 max-w-3xl w-full">
          <span
            className={`${currentNode.badgeColor} text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider shrink-0`}
          >
            {currentNode.typeBadge}
          </span>
          <h1 className="text-2xl md:text-3xl font-bold text-white truncate">
            {currentNode.title}
          </h1>
        </div>

        {/* Scrollable text content */}
        <div
          ref={textContainerRef}
          className="w-full max-w-3xl flex-1 overflow-y-auto pr-2 min-h-0"
          style={{
            /* Custom scrollbar for dark theme */
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.2) transparent',
          }}
        >
          {currentNode.textSections.length > 0 ? (
            <div className="space-y-4">
              {currentNode.textSections.map((section, i) => (
                <div key={i}>
                  <span className="text-editor-accent text-sm font-semibold uppercase tracking-wide">
                    {section.label}
                  </span>
                  <p className="text-white/90 text-base leading-relaxed mt-1 whitespace-pre-wrap">
                    {section.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 italic text-center mt-8">
              No text content for this node.
            </p>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════════════
          BOTTOM BAR — Navigation + TTS controls
          ══════════════════════════════════════════════════════════════════ */}
      <footer className="flex items-center justify-between px-6 py-4 bg-black/40 border-t border-white/10 shrink-0">
        {/* Previous button */}
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18} />
          Previous
        </button>

        {/* Center — TTS toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTTS}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              ttsEnabled
                ? 'bg-editor-accent/20 text-editor-accent hover:bg-editor-accent/30'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title={ttsEnabled ? 'Disable narration' : 'Enable narration'}
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            {ttsEnabled ? 'Narration On' : 'Narration Off'}
          </button>

          {ttsPlaying && (
            <span className="text-xs text-editor-accent animate-pulse">
              Speaking...
            </span>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={goNext}
          disabled={currentIndex >= totalNodes - 1}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight size={18} />
        </button>
      </footer>
    </div>
  );
}
