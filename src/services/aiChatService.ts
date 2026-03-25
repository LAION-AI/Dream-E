/**
 * =============================================================================
 * AI CHAT SERVICE — Agentic Loop Bridge
 * =============================================================================
 *
 * Implements a multi-turn agentic loop between the browser chat UI and
 * the AI writer API (Gemini or OpenAI-compatible, configured in AI Settings).
 *
 * KEY ARCHITECTURE:
 *   1. User sends a message
 *   2. Agent responds with text + <<<SW_CMD>>> command blocks
 *   3. Commands are executed and RESULTS ARE SENT BACK to the agent
 *   4. Agent reviews results, can retry failures or issue more commands
 *   5. Loop continues until agent responds with no commands (task complete)
 *      or MAX_ITERATIONS is reached
 *
 * This allows the agent to:
 *   - Chain multi-step workflows (create scene → generate image → connect)
 *   - Detect and recover from failures (image gen blocked → adjust prompt)
 *   - Build complete story trees autonomously
 *
 * =============================================================================
 */

import { executeCommand } from './gameStateAPI';
import { generateSystemPrompt } from './gameStateAPI.registry';
import { getGameContext } from './gameStateAPI.context';
import { useImageGenStore } from '@/stores/useImageGenStore';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of agent loop iterations per user message.
 * Prevents runaway loops. The agent can issue commands across up to this many
 * turns before being forced to stop. 10 iterations = up to ~50+ commands,
 * which is enough to build a substantial story tree in one go.
 */
const MAX_ITERATIONS = 10;

// =============================================================================
// FIRST-MESSAGE TRACKING
// =============================================================================

/** Call this when the user clears chat — resets both local and server-side state */
export function resetAgentContext() {
  fetch('/api/chat-reset', { method: 'POST' }).catch(() => {});
}

// =============================================================================
// MESSAGE BUILDERS
// =============================================================================

/**
 * Build the FIRST message in a loop iteration (user's actual message).
 * Includes fresh game state.
 */
function buildUserMessage(userText: string): string {
  let msg = '[Current Game State]\n' + getGameContext() + '\n\n';
  msg += userText;
  return msg;
}

/**
 * Build a FOLLOW-UP message that feeds command results back to the agent.
 * This is the core of the agentic loop — the agent sees what happened and
 * decides whether to continue, retry, or wrap up.
 */
function buildResultsMessage(
  results: { name: string; result: string }[],
  iteration: number,
  maxIterations: number
): string {
  // Commands whose groups return data the agent needs to see (query results,
  // search results, listings). For these we include the full JSON payload.
  const DATA_COMMANDS = new Set([
    'get_scene_details', 'get_entity_details', 'list_scenes', 'list_entities',
    'list_variables', 'search_music', 'get_music_track', 'list_music_genres',
    'get_story_root', 'list_plots', 'list_acts', 'list_relationships',
    'list_cowrite_scenes',
  ]);

  let msg = '[Command Execution Results]\n';
  for (const r of results) {
    const parsed = JSON.parse(r.result);
    const status = parsed.success ? 'OK' : 'FAILED';
    msg += `  ${r.name}: ${status}`;
    if (!parsed.success) {
      msg += ` — ${parsed.error}`;
      if (parsed.suggestion) msg += ` (Suggestion: ${parsed.suggestion})`;
    } else if (DATA_COMMANDS.has(r.name)) {
      // Include the result data so the agent can see query/search results
      const { success, ...data } = parsed;
      msg += ` — ${JSON.stringify(data)}`;
    }
    msg += '\n';
  }

  msg += '\n[Updated Game State]\n' + getGameContext() + '\n\n';

  msg += `Iteration ${iteration}/${maxIterations}. `;
  msg += 'Review the results above. ';
  msg += 'If any commands FAILED, adjust your approach and retry with corrected parameters. ';
  msg += 'If more steps are needed to complete the user\'s request (e.g. connecting scenes, generating images, adding choices), continue with more commands. ';
  msg += 'If the task is fully complete, respond with a summary for the user (no commands).';

  return msg;
}

// =============================================================================
// COMMAND PARSER
// =============================================================================

function parseCommands(
  text: string
): { cleanText: string; commands: { action: string; params: Record<string, unknown> }[] } {
  const commands: { action: string; params: Record<string, unknown> }[] = [];
  const cleanText = text
    .replace(
      /<<<SW_CMD:(\w+)>>>([\s\S]*?)<<<\/SW_CMD>>>/g,
      (_match, action: string, json: string) => {
        try {
          commands.push({ action, params: JSON.parse(json.trim()) });
        } catch {
          return _match;
        }
        return '';
      }
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { cleanText, commands };
}

// =============================================================================
// SSE STREAM READER
// =============================================================================

/**
 * Send a single message to the agent and stream back the response.
 * Returns the full accumulated text. Calls onTextDelta for each chunk.
 * Throws on network/stream errors.
 */
async function streamOneMessage(
  message: string,
  signal: AbortSignal,
  onTextDelta: (text: string) => void
): Promise<string> {
  const settings = useImageGenStore.getState();
  const writer = settings.writer;

  // Resolve API key: for gemini provider, use shared googleApiKey if writer.apiKey is empty
  const apiKey = writer.provider === 'gemini'
    ? (writer.apiKey || settings.googleApiKey)
    : writer.apiKey;

  const systemPrompt = generateSystemPrompt();

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      systemPrompt,
      provider: writer.provider,
      model: writer.model,
      apiKey,
      endpoint: writer.endpoint,
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
        continue; // skip malformed SSE lines
      }
      if (parsed.type === 'text') {
        fullText += parsed.text;
        onTextDelta(parsed.text);
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
// PUBLIC API — Agentic Loop
// =============================================================================

/**
 * Send a chat message and run the full agentic loop.
 *
 * The agent can autonomously chain multiple steps:
 *   create scenes → generate images → connect nodes → set start node → etc.
 *
 * After each agent response, commands are executed and results are sent back.
 * The loop ends when:
 *   - Agent responds with no commands (task is done)
 *   - MAX_ITERATIONS is reached (safety limit)
 *   - An unrecoverable error occurs
 *   - The user cancels (abort controller)
 *
 * Callbacks fire continuously throughout the loop:
 *   onTextDelta     — streaming text from each iteration
 *   onToolCallStart — each command about to execute
 *   onToolResult    — each command's result (success/failure)
 *   onComplete      — loop finished, final text + all tool calls
 *   onError         — unrecoverable error
 */
export function sendChatMessage(
  userText: string,
  onTextDelta: (text: string) => void,
  onToolCallStart: (toolName: string) => void,
  onComplete: (fullText: string, toolCalls: { name: string; result: string }[]) => void,
  onError: (error: string) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const allToolCalls: { name: string; result: string }[] = [];
      let allCleanText = '';
      let nextMessage = buildUserMessage(userText);

      for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        // ── Step 1: Stream agent response ──────────────────────────
        const fullText = await streamOneMessage(
          nextMessage,
          controller.signal,
          onTextDelta
        );

        // ── Step 2: Parse commands from response ───────────────────
        const { cleanText, commands } = parseCommands(fullText);

        // Accumulate clean text across iterations (for final onComplete)
        if (cleanText) {
          if (allCleanText) allCleanText += '\n\n';
          allCleanText += cleanText;
        }

        // ── Step 3: No commands → agent is done ────────────────────
        if (commands.length === 0) {
          onComplete(allCleanText, allToolCalls);
          return;
        }

        // ── Step 4: Execute commands and collect results ────────────
        const iterationResults: { name: string; result: string }[] = [];
        for (const cmd of commands) {
          onToolCallStart(cmd.action);
          const result = await executeCommand(cmd.action, cmd.params);
          iterationResults.push({ name: result.name, result: result.result });
          allToolCalls.push({ name: result.name, result: result.result });
        }

        // ── Step 5: Show execution summary in the chat stream ──────
        // Emit a visual separator so the user sees what happened
        const summaryLines: string[] = [];
        let hasFailures = false;
        for (const r of iterationResults) {
          const parsed = JSON.parse(r.result);
          if (parsed.success) {
            summaryLines.push(`  ✓ ${r.name}`);
          } else {
            summaryLines.push(`  ✗ ${r.name}: ${parsed.error}`);
            hasFailures = true;
          }
        }
        const separator = `\n\n---\n*Executed ${iterationResults.length} command${iterationResults.length > 1 ? 's' : ''}${hasFailures ? ' (some failed — retrying)' : ''}:*\n${summaryLines.join('\n')}\n\n`;
        onTextDelta(separator);
        allCleanText += separator;

        // ── Step 6: Check if this is the last allowed iteration ────
        if (iteration === MAX_ITERATIONS) {
          onTextDelta('\n\n*[Reached maximum iterations — stopping autonomous loop]*\n');
          onComplete(allCleanText, allToolCalls);
          return;
        }

        // ── Step 7: Send results back to agent for next iteration ──
        nextMessage = buildResultsMessage(iterationResults, iteration, MAX_ITERATIONS);
      }

      // Shouldn't reach here, but just in case
      onComplete(allCleanText, allToolCalls);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onError(err instanceof Error ? err.message : 'Unknown error');
    }
  })();

  return () => controller.abort();
}
