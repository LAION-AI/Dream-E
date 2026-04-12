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
  Settings,
} from 'lucide-react';
import { Howl } from 'howler';

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
  ShotNodeData,
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
  /** Pre-existing voiceover audio URL (blob URL or data URL) if already generated */
  voiceoverAudio?: string;
  /** Background music URL (blob URL or data URL) if assigned to this node */
  backgroundMusic?: string;
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
  //    Shot nodes are nested under their parent (scene or act) and sorted left-to-right.
  const scenes = nodes.filter(n => n.type === 'cowriteScene');
  const shots = nodes.filter(n => n.type === 'shot');
  const orderedActsAndScenes: StoryNode[] = [];
  const connectedSceneIds = new Set<string>();
  const connectedShotIds = new Set<string>();

  /**
   * Helper: find and append shot nodes that are children of a given parent node.
   * Shots connected from the parent via edges are sorted left-to-right.
   */
  const appendChildShots = (parentId: string) => {
    const parentEdges = edges.filter(e => e.source === parentId);
    const childShotIds = new Set(parentEdges.map(e => e.target));
    const childShots = shots
      .filter(s => childShotIds.has(s.id))
      .sort((a, b) => a.position.x - b.position.x);
    for (const shot of childShots) {
      orderedActsAndScenes.push(shot);
      connectedShotIds.add(shot.id);
    }
  };

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
      // Append shots that are children of this scene
      appendChildShots(scene.id);
    }

    // Also append shots directly connected to the act (not via a scene)
    appendChildShots(act.id);
  }

  // 5. Orphan scenes not connected to any act (append at end)
  const orphanScenes = scenes
    .filter(s => !connectedSceneIds.has(s.id))
    .sort((a, b) => a.position.x - b.position.x);

  for (const scene of orphanScenes) {
    orderedActsAndScenes.push(scene);
    appendChildShots(scene.id);
  }

  // 6. Orphan shots not connected to any parent
  const orphanShots = shots
    .filter(s => !connectedShotIds.has(s.id))
    .sort((a, b) => a.position.x - b.position.x);

  return [...root, ...plots, ...orderedActsAndScenes, ...orphanShots];
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
        voiceoverAudio: d.voiceoverAudio,
        backgroundMusic: (d as any).backgroundMusic,
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
        voiceoverAudio: d.voiceoverAudio,
        backgroundMusic: (d as any).backgroundMusic,
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
        voiceoverAudio: d.voiceoverAudio,
        backgroundMusic: (d as any).backgroundMusic,
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
        voiceoverAudio: d.voiceoverAudio,
        backgroundMusic: d.backgroundMusic,
      };
    }

    case 'shot': {
      const d = node.data as ShotNodeData;
      const sections: TextSection[] = [];
      if (d.description) sections.push({ label: 'Description', text: d.description });

      return {
        ...base,
        title: d.title || node.label || 'Shot',
        typeBadge: 'Shot',
        image: d.image,
        textSections: sections,
        badgeColor: 'bg-rose-600',
        voiceoverAudio: d.voiceoverAudio,
        backgroundMusic: d.backgroundMusic,
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
 * Build a natural, fluid narration string from a NodeDisplayContent.
 * This is sent to TTS — it should sound like a narrator reading aloud,
 * NOT like a form being read ("Genre. Drama. Target Audience. Adults.").
 *
 * Instead of "Label: value", uses natural connector sentences:
 *   "The genre is drama." / "The story follows Jack, who must..."
 */
function buildNarrationText(content: NodeDisplayContent): string {
  const parts: string[] = [];

  // Natural intro based on node type
  if (content.typeBadge.startsWith('Story Root')) {
    parts.push(`${content.title}.`);
  } else if (content.typeBadge.startsWith('Plot')) {
    parts.push(`${content.typeBadge}. ${content.title}.`);
  } else if (content.typeBadge.startsWith('Act')) {
    parts.push(`${content.typeBadge}. ${content.title}.`);
  } else if (content.typeBadge === 'Scene') {
    parts.push(`Scene. ${content.title}.`);
  } else if (content.typeBadge === 'Shot') {
    parts.push(`Shot. ${content.title}.`);
  } else {
    parts.push(`${content.title}.`);
  }

  // Convert label+text pairs into natural sentences
  for (const section of content.textSections) {
    const label = section.label;
    const text = section.text;
    if (!text) continue;

    // Map labels to natural spoken connectors
    switch (label) {
      // Story Root fields
      case 'Genre':
        parts.push(`The genre is ${text}.`);
        break;
      case 'Target Audience':
        parts.push(`The target audience is ${text}.`);
        break;
      case 'Logline':
        parts.push(`The logline of the story is: ${text}`);
        break;
      case 'Main Character':
        parts.push(`The main character is ${text}.`);
        break;
      case 'Antagonist':
        parts.push(`The antagonist is ${text}.`);
        break;
      case 'Supporting Characters':
        parts.push(`The supporting characters are ${text}.`);
        break;
      case 'Protagonist Goal':
        parts.push(`The protagonist's goal is: ${text}`);
        break;
      case 'Summary':
        parts.push(`Here is the story summary. ${text}`);
        break;

      // Plot fields
      case 'Plot Type':
        parts.push(`This is a ${text} arc.`);
        break;

      // Act fields
      case 'Turning Point':
        parts.push(`The turning point of this act is: ${text}`);
        break;

      // Scene fields
      case 'Scene Action':
        parts.push(`Here is what happens. ${text}`);
        break;
      case 'Entity State':
        // Skip entity states in TTS — too technical
        break;

      // Default: use "Description" naturally, everything else with a gentle intro
      case 'Description':
        parts.push(text);
        break;
      default:
        parts.push(text);
        break;
    }
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

  /** Music volume (0..1) for background music Howl instances */
  const [musicVolume, setMusicVolume] = useState(0.5);
  /** TTS/narration volume (0..1), applied to TTSPlayer instances */
  const [ttsVolume, setTtsVolume] = useState(1.0);
  /** Whether the audio settings popover is visible */
  const [showSettings, setShowSettings] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const ttsPlayerRef = useRef<TTSPlayer | null>(null);
  const ttsHandleRef = useRef<TTSStreamHandle | null>(null);
  /** Track the index that TTS was last started for, to avoid re-triggering */
  const ttsStartedForIndexRef = useRef<number>(-1);
  /** Ref for the scrollable text container to auto-scroll to top on slide change */
  const textContainerRef = useRef<HTMLDivElement>(null);
  /** Howl instance for background music — persists across slides until the music URL changes */
  const musicHowlRef = useRef<Howl | null>(null);
  /** Track the current music source URL so we don't restart the same track on every slide */
  const currentMusicSrcRef = useRef<string | null>(null);
  /** Ref for the settings popover container (for click-outside dismissal) */
  const settingsRef = useRef<HTMLDivElement>(null);

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

        // Check if TTS is enabled in AI settings.
        // Try Google API key first, fall back to the main provider API key (e.g. HyprLab).
        // TTS calls Google's Gemini TTS API, so the key must be a valid Google key.
        const ttsSettings = useImageGenStore.getState().tts;
        const googleKey = useImageGenStore.getState().googleApiKey;
        const fallbackKey = useImageGenStore.getState().apiKey;
        const effectiveKey = googleKey || fallbackKey;

        if (ttsSettings.enabled && !effectiveKey) {
          console.warn('[PhotoStory] TTS requires a Google API key — set it in AI Settings. Narration disabled.');
          setTtsEnabled(false);
        } else {
          setTtsEnabled(ttsSettings.enabled && !!effectiveKey);
        }

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
   *
   * FIX 3: If the node already has saved voiceoverAudio, play that directly
   * instead of regenerating via the TTS API. This avoids unnecessary API calls
   * and provides instant playback for previously narrated nodes.
   *
   * FIX 2: When new TTS audio is generated, save it back to the node's data
   * so subsequent plays reuse the cached audio.
   */
  const startTTS = useCallback(
    (content: NodeDisplayContent) => {
      // Don't re-trigger if already playing this index
      stopTTS();

      console.log('[PhotoStory] Starting TTS for node:', content.title, '| text length:', buildNarrationText(content).length);

      // FIX 3: Check if the node already has saved voiceover audio.
      // If so, play that directly — no need to call the TTS API again.
      if (content.voiceoverAudio) {
        console.log('[PhotoStory] Playing existing voiceover audio for:', content.title);
        const player = new TTSPlayer(ttsVolume);
        ttsPlayerRef.current = player;
        setTtsPlaying(true);
        setTtsPaused(false);

        // Resolve through blobCache in case it's a data URL that was converted to blob URL
        const resolvedUrl = getBlobUrl(content.voiceoverAudio);
        player.enqueue(resolvedUrl);
        // TTSPlayer's onend callback will fire when playback finishes,
        // but we need to detect that to update ttsPlaying state.
        // Since we're using a single enqueue, we poll for completion.
        const checkDone = setInterval(() => {
          // TTSPlayer sets playing=false internally when queue is empty and current is done
          // We check by seeing if the player ref is still valid
          if (!ttsPlayerRef.current || !(ttsPlayerRef.current as any).playing) {
            setTtsPlaying(false);
            clearInterval(checkDone);
          }
        }, 500);
        return;
      }

      const text = buildNarrationText(content);
      if (!text.trim()) return;

      const player = new TTSPlayer(ttsVolume);
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
        (finalUrl) => {
          // All chunks done — TTS playback will finish when the last chunk plays out.
          // We don't auto-advance; user clicks Next.
          setTtsPlaying(false);

          // FIX 2: Save the generated TTS audio back to the node so it doesn't
          // need to be regenerated next time. We find the project node by ID and
          // update its data with the final concatenated audio URL.
          if (finalUrl && content.nodeId) {
            try {
              const store = useProjectStore.getState();
              const proj = store.currentProject;
              if (proj) {
                const node = proj.nodes.find(n => n.id === content.nodeId);
                if (node) {
                  console.log('[PhotoStory] Saving TTS audio to node:', content.nodeId);
                  store.updateNode(content.nodeId, {
                    data: { ...(node.data as any), voiceoverAudio: finalUrl },
                  } as any);

                  // Also update our local nodeOrder so re-playing this slide
                  // uses the cached audio without needing a state refresh
                  content.voiceoverAudio = finalUrl;
                }
              }
            } catch (err) {
              console.warn('[PhotoStory] Failed to save TTS audio to node:', err);
            }
          }
        },
      );

      ttsHandleRef.current = handle;
    },
    [stopTTS, ttsVolume],
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

  // ── Background music playback ─────────────────────────────────────
  // When the slide changes, check if the current node has backgroundMusic.
  // If the music URL is different from what's currently playing, crossfade
  // to the new track. If no music is set on this node, let the previous
  // music continue (don't stop it) — this matches the "musicKeepPlaying"
  // behavior from the adventure engine.
  useEffect(() => {
    const node = nodeOrder[currentIndex];
    if (!node) return;
    const musicUrl = node.backgroundMusic;

    if (musicUrl) {
      const resolvedUrl = getBlobUrl(musicUrl);

      // Only change music if it's a different track than what's currently playing
      if (currentMusicSrcRef.current !== resolvedUrl) {
        // Stop and unload the previous music Howl to free memory
        if (musicHowlRef.current) {
          musicHowlRef.current.stop();
          musicHowlRef.current.unload();
        }

        const howl = new Howl({
          src: [resolvedUrl],
          loop: true,
          volume: musicVolume,
          html5: true, // Use HTML5 Audio to avoid decoding the entire file into memory
        });
        howl.play();
        musicHowlRef.current = howl;
        currentMusicSrcRef.current = resolvedUrl;
      }
    }
    // If no music on this node, let previous music keep playing (don't stop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, nodeOrder]);

  // ── Update music volume when slider changes ───────────────────────
  useEffect(() => {
    if (musicHowlRef.current) {
      musicHowlRef.current.volume(musicVolume);
    }
  }, [musicVolume]);

  // ── Update TTS volume when slider changes ─────────────────────────
  useEffect(() => {
    if (ttsPlayerRef.current) {
      ttsPlayerRef.current.setVolume(ttsVolume);
    }
  }, [ttsVolume]);

  // ── Cleanup music on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (musicHowlRef.current) {
        musicHowlRef.current.stop();
        musicHowlRef.current.unload();
        musicHowlRef.current = null;
      }
    };
  }, []);

  // ── Click outside to close settings popover ───────────────────────
  useEffect(() => {
    if (!showSettings) return;

    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }

    // Delay the listener attachment so the button click that opened the
    // popover doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

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
      // Turning on — check if API key is available, then start.
      // Try Google key first, fall back to main provider key.
      const ttsSettings = useImageGenStore.getState().tts;
      const googleKey = useImageGenStore.getState().googleApiKey;
      const fallbackKey = useImageGenStore.getState().apiKey;
      const effectiveKey = googleKey || fallbackKey;

      if (ttsSettings.enabled && effectiveKey) {
        setTtsEnabled(true);
        ttsStartedForIndexRef.current = -1; // Allow TTS to trigger
      } else {
        // Can't enable — no API key or TTS disabled in settings
        console.warn('[PhotoStory] TTS not available: Google API key required — set it in AI Settings');
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
          BOTTOM BAR — Navigation + TTS controls + Settings
          ══════════════════════════════════════════════════════════════════ */}
      <footer className="relative flex items-center justify-between px-6 py-4 bg-black/40 border-t border-white/10 shrink-0">
        {/* Previous button */}
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18} />
          Previous
        </button>

        {/* Center — TTS toggle + Settings gear */}
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

          {/* Audio Settings gear button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings
                ? 'bg-editor-accent/20 text-editor-accent'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Audio Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Audio Settings popover — positioned above the footer bar */}
        {showSettings && (
          <div
            ref={settingsRef}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#1a1d2e] border border-[#2d3148] rounded-xl p-4 shadow-2xl w-72 z-50"
          >
            <h3 className="text-sm font-semibold text-white mb-3">Audio Settings</h3>

            {/* TTS / Narration Volume */}
            <div className="mb-3">
              <label className="text-xs text-[#8b8fa4] flex justify-between">
                <span>Narration Volume</span>
                <span>{Math.round(ttsVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={ttsVolume}
                onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
                className="w-full mt-1 accent-[#6366f1]"
              />
            </div>

            {/* Background Music Volume */}
            <div>
              <label className="text-xs text-[#8b8fa4] flex justify-between">
                <span>Music Volume</span>
                <span>{Math.round(musicVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVolume}
                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                className="w-full mt-1 accent-[#6366f1]"
              />
            </div>
          </div>
        )}

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
