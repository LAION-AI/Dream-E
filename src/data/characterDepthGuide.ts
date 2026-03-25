/**
 * =============================================================================
 * CHARACTER DEPTH GUIDE — Loaded into AI system prompts
 * =============================================================================
 *
 * This module reads the CHARACTER_DEPTH_GUIDE.md at build time and exports it
 * as a string constant. It's injected into:
 * 1. The Open World writer's system prompt (DEFAULT_WRITER_SYSTEM_PROMPT)
 * 2. The co-write chat agent's system prompt (generateSystemPrompt)
 *
 * The guide teaches the AI to write psychologically realistic characters with
 * Big Five personality profiles, theory of mind, social embeddedness, emotional
 * realism, and multi-plot narrative structure.
 *
 * WHY A SEPARATE MODULE:
 * The guide is ~5000 words / ~35KB. Keeping it in a separate file:
 * - Makes it easy to edit without touching system prompt code
 * - Allows the same content to be shared between OW and co-write agents
 * - Keeps the prompt code readable
 * =============================================================================
 */

// The guide is imported as a raw string at build time via Vite's ?raw suffix.
// This avoids duplicating 5000 words of text in the TypeScript source.
import guideText from '../../CHARACTER_DEPTH_GUIDE.md?raw';

export const CHARACTER_DEPTH_GUIDE = guideText;
