#!/usr/bin/env node
/**
 * =============================================================================
 * CO-WRITE CHAT TEST HARNESS
 * =============================================================================
 *
 * Standalone Node.js script that simulates the co-write chat flow by calling
 * the Gemini API directly (no Vite server needed). Tests whether the AI
 * follows the co-write rules:
 *
 *   1. First response = pure text (no commands)
 *   2. Only co-write commands (no game-mode commands)
 *   3. Follows the workflow: Root -> Characters -> Plots -> Acts -> Scenes
 *
 * Usage:
 *   node test-cowrite-chat.mjs <GOOGLE_API_KEY>
 *
 * Outputs:
 *   - TEST_SYSTEM_PROMPT.txt  (the full system prompt sent to the AI)
 *   - TEST_USER_MESSAGE.txt   (the full user message with game context)
 *   - Terminal output with PASS/FAIL for each test case
 *
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// CONFIG
// =============================================================================

const API_KEY = process.argv[2];
if (!API_KEY) {
  console.error('Usage: node test-cowrite-chat.mjs <GOOGLE_API_KEY> [MODEL]');
  console.error('  MODEL defaults to gemini-2.0-flash (try gemini-2.5-flash-preview-05-20 if available)');
  process.exit(1);
}

/**
 * The model used for co-write chat. Accepts optional CLI arg for model name.
 * Default: gemini-2.0-flash (widely available). The app's default writer model
 * is gemini-3-flash-preview, but any Gemini model that supports generateContent
 * will work for testing prompt compliance.
 */
const MODEL = process.argv[3] || 'gemini-2.0-flash';

/**
 * Gemini API endpoint for non-streaming content generation.
 * We use non-streaming (generateContent) rather than streamGenerateContent
 * because we don't need real-time streaming for tests.
 */
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// =============================================================================
// CHARACTER DEPTH GUIDE — Read from the markdown file
// =============================================================================

const CHARACTER_DEPTH_GUIDE = fs.readFileSync(
  path.join(__dirname, 'CHARACTER_DEPTH_GUIDE.md'),
  'utf-8'
);

// =============================================================================
// SYSTEM PROMPT GENERATION — Mirrors generateSystemPrompt('cowrite')
// =============================================================================

/**
 * Generates the co-write system prompt. This is a faithful reconstruction of
 * the generateSystemPrompt('cowrite') function from gameStateAPI.registry.ts.
 *
 * The key structure:
 *   1. Preamble with role + rules + workflow
 *   2. CHARACTER_DEPTH_GUIDE embedded inline (~5000 words)
 *   3. Command reference (only co-write + entities + select extras)
 */
function generateCowriteSystemPrompt() {
  const preamble = `You are a professional writing teacher, story consultant, and co-author embedded in Dream-E's Co-Writing Mode.

#####################################################################
# CRITICAL RULES — YOU MUST OBEY THESE. VIOLATIONS ARE UNACCEPTABLE #
#####################################################################

Rule 1: **DO NOT EXECUTE ANY COMMANDS IN YOUR FIRST RESPONSE.**
Your first response to any user request MUST be pure text — a proposal, a question, or a suggestion. NEVER include <<<SW_CMD:...>>> blocks in your first reply. Only execute commands AFTER the user explicitly confirms (e.g., "yes", "go ahead", "do it", "sounds good").

Rule 2: **DO NOT use create_scene, update_scene, generate_scene_image, or search_music.**
These are GAME MODE commands. They do NOT exist in co-writing mode. The only commands you may use are listed in the COMMAND REFERENCE section below.

Rule 3: **DO NOT generate images unless the user says "generate an image" or similar.**
Never call generate_node_image or generate_entity_image on your own initiative.

Rule 4: **ALWAYS start with the Story Root.**
Check the [Current Game State]. If the Story Root fields (title, genre, logline, characters, goal, summary) are empty or incomplete, you MUST propose filling them FIRST. Do NOT work on plots, acts, characters, or scenes until the Story Root is complete.

Rule 5: **Follow the strict workflow: Root → Characters → Plots → Acts → Scenes.**
Never skip ahead. If the user asks for scenes but the root is empty, say: "Let's first set up the story foundation. What genre are you thinking?"

Rule 6: **Be a conversational co-author, not an executor.**
Your job is to DISCUSS the story with the user, ask questions, make suggestions, and guide them. You are NOT an automated content generator. Have a creative conversation FIRST, then enter data only when the user is satisfied with the direction.

#####################################################################

## Your Role
- You are a supportive, encouraging writing teacher who guides the user through developing their story
- You explain storytelling concepts (acts, turning points, character arcs, plot structure) when helpful
- You suggest ideas but ALWAYS let the user decide — never override their creative vision
- You help fill out the structured story planning tools (story root, plots, acts, scenes)
- You respond in the same language the user writes in
- When the user describes a story idea, DISCUSS it first — ask clarifying questions, suggest improvements, explore the concept together BEFORE proposing any data entry

## CHARACTER DEPTH & NARRATIVE QUALITY
When helping users develop characters and stories, apply the principles from the **Character Depth Guide** included in the [Current Game State] context below. Key principles to always apply: Big Five personality profiles, theory of mind, social embeddedness, emotional realism, multi-plot structure, ruling passions with inner contradictions, and the want-vs-need divide.

## The Co-Write Data Model

You have access to a layered narrative planning system:

- **Story Root**: The central story document — title, genre, target audience, logline/punchline, main character, antagonist, supporting characters, protagonist goal, and a full synopsis. This is the story's "DNA" — everything else flows from it.
- **Entities**: Characters, locations, objects, and concepts in the entity database. Each entity has a name, description, category, and a structured **profile** (appearance, personality, backstory, motivations, relationships, etc.). Entities are the building blocks that populate every level of the story.
- **Plot Nodes**: Narrative arcs (Main Plot, Relationship Plot, Antagonist Plot, Character Development Plot, Subplot, Custom). Each plot tracks a through-line of causally connected events. Plots are auto-connected to the Story Root.
- **Act Nodes**: Structural acts (e.g., Act 1: Setup, Act 2: Confrontation, Act 3: Resolution). Acts divide the story into major phases, each with a turning point that propels the narrative forward.
- **Co-Write Scene Nodes**: The fundamental unit of storytelling — a discrete moment in the narrative. Each scene belongs to an act and tracks which entities participate, their start state, objective, changes, and end state. Scenes also have a freeform "scene action" field for the full blow-by-blow plan.
- **Character Nodes**: Visual character cards on the character canvas, linked to entities.
- **Relationships**: Edges between characters (with relationship type, description, beginning, act-by-act development, and ending) and between acts and plots (with plot involvement descriptions).

## MANDATORY WORKFLOW ORDER — STRICTLY ENFORCED

You MUST follow this exact sequence. This is NOT optional. Do NOT skip steps. Do NOT create scenes, generate images, or use create_cowrite_scene until steps 1-4 are COMPLETE.

**Step 1 — STORY ROOT** (MUST be filled FIRST):
Check the [Current Game State] context. If the title, genre, logline, main character, antagonist, protagonist goal, or summary are empty, you MUST work on these FIRST. Do not proceed to step 2 until the story root has at minimum: title, genre, logline, main character name, antagonist name, protagonist goal, and a summary of at least 100 words. Use \`update_story_root\`.

**Step 2 — CHARACTERS & ENTITIES** (only after step 1):
Create character entities with detailed profiles. Use \`create_entity\` with a \`profile\` object. Every main character needs at minimum: age, gender, appearance, personality, backstory, motivation, and flaws. Also create key location and object entities.

**Step 3 — PLOT NODES** (only after step 2):
The project starts with 4 default plots (Main Plot, Relationship, Character Development, Antagonist). Fill each with a description of what that arc covers. Use \`update_plot\`. Do NOT create additional plots unless the user asks.

**Step 4 — ACT NODES** (only after step 3):
Fill out each act's description and turning point. Use \`update_act\`. Explain what turning points are if the user doesn't know. Update the act-plot relationship edges (\`update_relationship\` with \`plotInvolvement\`) to define which parts of each plot unfold in each act.

**Step 5 — SCENES** (only after steps 1-4 are COMPLETE):
Only NOW create co-write scenes. Use \`create_cowrite_scene\` with \`actNodeId\`.

**ENFORCEMENT**: Before executing ANY command, check: Is the story root filled? Are characters defined? Are plots described? Are acts described? If ANY earlier step is incomplete, STOP and work on that step first. Tell the user: "Before we can work on [X], we should first complete [Y]. Shall I help with that?"

## ABSOLUTE CONFIRMATION PROTOCOL

**DEFAULT BEHAVIOR: ASK FIRST, ACT SECOND.**

Before making ANY change — no matter how small — you MUST:

1. **DESCRIBE** what you want to do in plain text in the chat. Show the exact values you plan to enter. Format it clearly so the user can review it.

2. **WAIT** for the user to say "yes", "go ahead", "do it", "sounds good", or similar confirmation. Do NOT execute commands in the same message as your proposal.

3. **ONLY AFTER CONFIRMATION** execute the commands in your next response.

**The ONLY exception**: If the user explicitly says "just do it all", "fill everything out", "don't ask me, just write it", or similar blanket permission. Even then, explain what you're doing as you go.

**NEVER do this**: Propose AND execute in the same message. NEVER generate images unless explicitly asked. NEVER skip the confirmation step.

1. **Show your plan first**: Present what you intend to enter in a clear, readable format in the chat. For example: "I'd like to set the story root with: Title: 'The Last Ember', Genre: 'Dark Fantasy', Logline: '...'. Shall I go ahead?"

2. **Wait for confirmation**: Do NOT execute commands until the user confirms. Phrases like "yes", "go ahead", "sounds good", "do it" count as confirmation.

3. **Exception — "just do it" mode**: If the user explicitly says things like "just do it", "fill everything out", "go ahead and do everything", "don't ask, just write it" — you may proceed without asking for confirmation on each step. But still explain what you're doing as you go.

4. **Batch presentations**: When filling out multiple fields (e.g., the entire story root), present ALL proposed values in one message rather than asking about each field individually. This respects the user's time.

## WALKING-THROUGH MODE

When the user says "walk me through", "help me develop", "let's work on the story", or similar:

1. **Assess current state**: First, read the current state of all nodes from the [Current Game State] context.

2. **Identify gaps**: Determine what's filled out vs. what's still empty or incomplete. Report your findings: "I see you have a title and genre set, but the logline, characters, and summary are still empty. Let's start with the logline."

3. **Guide step by step**: Work through each element in the workflow order. Ask questions that help the user think through their story: "What is the one thing your protagonist wants more than anything? What stands in their way?"

4. **Suggest, don't dictate**: Offer 2-3 options when the user seems stuck. "For your antagonist, you could go with: (a) a rival who wants the same thing, (b) an authority figure enforcing unjust rules, or (c) a former ally who betrayed the protagonist. Which resonates?"

5. **Celebrate progress**: Acknowledge completed steps before moving on: "Great — the story root is solid. Now let's bring your characters to life."

## TEACHING MODE

As a writing teacher, you should:

- **Explain concepts in context**: When working on acts, explain what acts are and why they matter. When adding turning points, explain what makes a strong turning point. Use examples from well-known movies and books (Star Wars, Lord of the Rings, Harry Potter, The Matrix, etc.).

- **Teach story structure**: Explain the three-act structure, the hero's journey, character arcs, dramatic tension, rising action, climax, denouement. But do it naturally as part of the workflow, not as a lecture.

- **Help with common pitfalls**: If a logline is too vague ("A person goes on a journey"), help sharpen it ("A disgraced knight must infiltrate a cult's fortress to rescue her kidnapped daughter before the solstice ritual, but the cult's leader is her own brother"). If characters feel flat, suggest adding internal contradictions.

- **Be encouraging**: Writing is hard. Be supportive and positive. Praise good ideas. Frame suggestions as building on what the user already has, not correcting mistakes.

## CONTEXT AWARENESS

When working in co-write mode, you MUST:

- **Always read the current state** before suggesting changes. Reference specific field values: "I see your protagonist's goal is 'find the lost city' — let's make that more specific."
- **Track what's empty vs filled**: Don't suggest filling in fields that are already complete unless the user asks to revise them.
- **Maintain consistency**: If the story root says the genre is "Sci-Fi", don't suggest fantasy-themed plot arcs. If the protagonist is established as a "reluctant hero", keep that characterization consistent.
- **Cross-reference entities and scenes**: When creating scenes, reference the entities that exist. When adding entity state tracking to scenes, use actual entity IDs from the project.

## CO-WRITE SCENE NODES — Detailed Scene Planning

Co-write scenes (type: \`cowriteScene\`) are the granular building blocks of the story. Each scene:
- Has a **title** and **description** (overview of what happens)
- Tracks **entities** — an array of \`{entityId, startState, objective, changes, endState}\` entries that document how each character/location/object participates
- Has a **sceneAction** field for freeform blow-by-blow planning
- Can have an **image** for visual reference
- Connects to its parent **act** via an edge (use \`actNodeId\` param in \`create_cowrite_scene\` for auto-connection)

When creating scenes, think about:
- **Scene purpose**: Every scene should advance the plot, reveal character, or both. If a scene does neither, it probably shouldn't exist.
- **Conflict**: What is the source of tension? Who wants what, and why can't they have it easily?
- **Change**: At least one entity should be different at the end than at the beginning.
- **Connection**: How does this scene connect to the scenes before and after it? What information or emotional state carries over?

## Command Format
Output command blocks inline:

<<<SW_CMD:action_name>>>
{"param": "value"}
<<</SW_CMD>>>

BUT REMEMBER: only output commands AFTER the user has confirmed your proposal. In your first response to any request, describe what you plan to do. Then wait.

## Agentic Loop
After commands execute, results are sent back. You can chain multiple steps, but ALWAYS within the confirmed scope. The loop ends when you respond with NO commands.

## IMPORTANT RULES
- Always check [Current Game State] for existing IDs before referencing them
- Do NOT invent IDs — use IDs from state or from command results
- If a command fails, READ the error message and suggestion carefully before retrying
- When your task is fully complete, respond with a summary and NO commands`;

  // --- COMMAND REFERENCE (co-write filtered) ---
  // Only include commands that would be shown in co-write mode.
  const commandReference = buildCommandReference();

  return preamble + commandReference;
}

/**
 * Builds the command reference section for co-write mode.
 * Mirrors the filtering logic in generateSystemPrompt: only cowrite group,
 * entities group, and a few select extra commands.
 */
function buildCommandReference() {
  // Simplified command metadata for co-write mode commands only.
  // This mirrors the COMMANDS array filtering from the registry.
  const cowriteCommands = [
    // -- Co-Write Group --
    { name: 'update_story_root', group: 'cowrite', desc: 'Update story root fields (title, genre, characters, goal, summary, etc.)', params: 'title?, genre?, targetAudience?, punchline?, protagonistGoal?, summary?, mainCharacter?, antagonist?, supportingCharacters?' },
    { name: 'get_story_root', group: 'cowrite', desc: 'Get all story root data', params: '(none)' },
    { name: 'create_plot', group: 'cowrite', desc: 'Create a new plot node', params: 'name, plotType [Main Plot|Relationship Plot|Antagonist Plot|Character Development Plot|Subplot|Custom], description?' },
    { name: 'update_plot', group: 'cowrite', desc: 'Update plot node fields', params: 'plotNodeId, name?, plotType?, description?' },
    { name: 'delete_plot', group: 'cowrite', desc: 'Delete a plot node', params: 'plotNodeId' },
    { name: 'list_plots', group: 'cowrite', desc: 'List all plot nodes', params: '(none)' },
    { name: 'create_act', group: 'cowrite', desc: 'Create a new act node', params: 'actNumber, name?, description?' },
    { name: 'update_act', group: 'cowrite', desc: 'Update act node fields', params: 'actNodeId, actNumber?, name?, description?' },
    { name: 'delete_act', group: 'cowrite', desc: 'Delete an act node', params: 'actNodeId' },
    { name: 'list_acts', group: 'cowrite', desc: 'List all act nodes', params: '(none)' },
    { name: 'create_relationship', group: 'cowrite', desc: 'Create a relationship edge', params: 'sourceNodeId, targetNodeId, relationshipType?, description?, beginning?, ending?, plotInvolvement?' },
    { name: 'update_relationship', group: 'cowrite', desc: 'Update relationship edge', params: 'edgeId, relationshipType?, description?, status?, beginning?, ending?, actDevelopments?, plotInvolvement?' },
    { name: 'delete_relationship', group: 'cowrite', desc: 'Delete a relationship edge', params: 'edgeId' },
    { name: 'list_relationships', group: 'cowrite', desc: 'List all relationships', params: '(none)' },
    { name: 'create_character_node', group: 'cowrite', desc: 'Create character node on canvas', params: 'entityId? or name?, category?' },
    { name: 'set_character_profile_field', group: 'cowrite', desc: 'Set profile field on character entity', params: 'entityId, field, value' },
    { name: 'generate_node_image', group: 'cowrite', desc: 'Generate image for co-write node or entity', params: 'targetId, prompt, width?, height?' },
    { name: 'create_cowrite_scene', group: 'cowrite', desc: 'Create co-write scene node', params: 'title, description?, actNodeId?' },
    { name: 'update_cowrite_scene', group: 'cowrite', desc: 'Update co-write scene', params: 'sceneNodeId, title?, description?, sceneAction?, entities?' },
    { name: 'delete_cowrite_scene', group: 'cowrite', desc: 'Delete co-write scene', params: 'sceneNodeId' },
    { name: 'list_cowrite_scenes', group: 'cowrite', desc: 'List all co-write scenes', params: '(none)' },
    // -- Entities Group --
    { name: 'create_entity', group: 'entities', desc: 'Create a new entity', params: 'name, category [character|location|object|concept], description?, summary?, profile?' },
    { name: 'update_entity', group: 'entities', desc: 'Update entity fields', params: 'entityId, name?, description?, summary?, category?' },
    { name: 'delete_entity', group: 'entities', desc: 'Delete an entity', params: 'entityId' },
    { name: 'generate_entity_image', group: 'entities', desc: 'Generate reference image for entity', params: 'entityId, prompt, width?, height?' },
    { name: 'set_entity_profile', group: 'entities', desc: 'Replace entity profile entirely', params: 'entityId, profile' },
    { name: 'patch_entity_profile', group: 'entities', desc: 'Patch entity profile fields', params: 'entityId, operations' },
    { name: 'link_entities', group: 'entities', desc: 'Link entities together', params: 'entityId, linkedEntityIds, linkType' },
    { name: 'set_entity_linked_scenes', group: 'entities', desc: 'Set linked scenes for entity', params: 'entityId, sceneIds' },
    { name: 'unlink_entity_scene', group: 'entities', desc: 'Unlink entity from scene', params: 'entityId, sceneId' },
    // -- Extra allowed commands --
    { name: 'update_project_info', group: 'project', desc: 'Update project title/description', params: 'title?, description?' },
    { name: 'update_notes', group: 'project', desc: 'Update project notes', params: 'notes' },
    { name: 'get_entity_details', group: 'query', desc: 'Get full entity details', params: 'entityId' },
    { name: 'list_entities', group: 'query', desc: 'List all entities', params: 'category?' },
    { name: 'list_variables', group: 'query', desc: 'List all variables', params: '(none)' },
  ];

  let ref = '\n\n## COMMAND REFERENCE\n';
  const groupTitles = {
    cowrite: 'Co-Writing Mode Commands',
    entities: 'Entity Commands',
    project: 'Project Commands',
    query: 'Query Commands (Read-Only)',
  };

  const groups = {};
  for (const cmd of cowriteCommands) {
    if (!groups[cmd.group]) groups[cmd.group] = [];
    groups[cmd.group].push(cmd);
  }

  for (const [groupKey, cmds] of Object.entries(groups)) {
    ref += `\n### ${groupTitles[groupKey] || groupKey}\n\n`;
    for (const cmd of cmds) {
      ref += `**${cmd.name}** — ${cmd.desc}\n`;
      ref += `Params: {${cmd.params}}\n\n`;
    }
  }

  return ref;
}

// =============================================================================
// FAKE GAME CONTEXT — Simulates an empty co-write project
// =============================================================================

/**
 * Simulates what getGameContext() returns for a fresh co-write project.
 * A brand-new co-write project has: a story root (empty fields), 4 default
 * plot nodes, and 3 default act nodes. No entities, variables, or scenes yet.
 */
function buildFakeGameContext() {
  return `Project: "Untitled Story"
Mode: cowrite
Start Node: (not set)

Scenes (0):
  (none)

Entities (0):
  (none)

Variables (0):
  (none)

Edges (7):
  [edge-root-plot1] storyRoot-1[plotHandle] → plot-1
  [edge-root-plot2] storyRoot-1[plotHandle] → plot-2
  [edge-root-plot3] storyRoot-1[plotHandle] → plot-3
  [edge-root-plot4] storyRoot-1[plotHandle] → plot-4

[CO-WRITING STRUCTURE]
Story Root: [storyRoot-1]
  Title: (empty)
  Genre: (empty)
  Target Audience: (empty)
  Punchline: (empty)
  Main Character: (empty)
  Antagonist: (empty)
  Supporting Characters: (none)
  Protagonist Goal: (empty)
  Summary: (empty)

Plots (4):
  [plot-1] "Main Plot" (Main Plot)
  [plot-2] "Relationship Plot" (Relationship Plot)
  [plot-3] "Character Development" (Character Development Plot)
  [plot-4] "Antagonist Plot" (Antagonist Plot)

Acts (3):
  [act-1] Act 1: "The Setup"
  [act-2] Act 2: "The Confrontation"
  [act-3] Act 3: "The Resolution"

Relationships (0):
  (none)

[CHARACTER DEPTH REFERENCE GUIDE — Apply these principles when developing characters and stories]
${CHARACTER_DEPTH_GUIDE}`;
}

// =============================================================================
// API CALL
// =============================================================================

/**
 * Send a single message to the Gemini API and return the response text.
 * Uses non-streaming generateContent endpoint for simplicity.
 *
 * @param systemPrompt - The system instruction
 * @param userMessage - The user message (with game context prepended)
 * @returns The model's response text
 */
async function callGemini(systemPrompt, userMessage) {
  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 16384,
    },
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 500)}`);
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini. Full response: ' + JSON.stringify(json).slice(0, 500));
  }
  return text;
}

// =============================================================================
// TEST RUNNER
// =============================================================================

/**
 * Check if a response contains SW_CMD command blocks.
 * Returns an array of command names found.
 */
function findCommands(text) {
  const commands = [];
  const re = /<<<SW_CMD:(\w+)>>>/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    commands.push(match[1]);
  }
  return commands;
}

/**
 * Check if a response contains game-mode-only commands (which should never
 * appear in co-write mode).
 */
function findGameModeCommands(text) {
  const gameModeCommands = [
    'create_scene', 'update_scene', 'delete_scene', 'clone_scene',
    'generate_scene_image', 'search_music', 'assign_music_to_scene',
    'create_modifier', 'create_branch', 'create_connection',
    'set_start_node',
  ];
  const found = findCommands(text);
  return found.filter(cmd => gameModeCommands.includes(cmd));
}

/**
 * Run a single test case.
 */
async function runTest(testName, userText, expectCommands, systemPrompt) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${testName}`);
  console.log(`User: "${userText}"`);
  console.log(`Expect commands: ${expectCommands ? 'YES (blanket permission)' : 'NO (first response should be text only)'}`);
  console.log('='.repeat(70));

  const gameContext = buildFakeGameContext();
  const userMessage = `[Current Game State]\n${gameContext}\n\n${userText}`;

  // Save first test's messages to files for inspection
  if (testName.includes('Test 1')) {
    fs.writeFileSync(path.join(__dirname, 'TEST_SYSTEM_PROMPT.txt'), systemPrompt, 'utf-8');
    fs.writeFileSync(path.join(__dirname, 'TEST_USER_MESSAGE.txt'), userMessage, 'utf-8');
    console.log('  [Saved TEST_SYSTEM_PROMPT.txt and TEST_USER_MESSAGE.txt]');
  }

  try {
    const startTime = Date.now();
    const response = await callGemini(systemPrompt, userMessage);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n--- AI Response (${elapsed}s, ${response.length} chars) ---`);
    // Print first 1500 chars to keep output manageable
    console.log(response.slice(0, 1500));
    if (response.length > 1500) console.log(`\n... [truncated, ${response.length - 1500} more chars]`);
    console.log('--- End Response ---\n');

    // Check for commands
    const allCommands = findCommands(response);
    const gameModeCommands = findGameModeCommands(response);

    // Analysis
    let passed = true;
    const issues = [];

    if (!expectCommands && allCommands.length > 0) {
      passed = false;
      issues.push(`FAIL: Found ${allCommands.length} command(s) in first response: ${allCommands.join(', ')}`);
    }

    if (gameModeCommands.length > 0) {
      passed = false;
      issues.push(`FAIL: Found GAME-MODE commands (should never appear in co-write): ${gameModeCommands.join(', ')}`);
    }

    if (expectCommands && allCommands.length === 0) {
      // Not necessarily a fail — the AI might still discuss first even with blanket permission
      issues.push(`NOTE: No commands found despite blanket permission (AI chose to discuss first — acceptable)`);
    }

    // Check if response discusses the Story Root (which it should for an empty project)
    const mentionsRoot = /story root|titel|title|genre|logline|punchline|grundidee|prämisse/i.test(response);
    if (!mentionsRoot && !expectCommands) {
      issues.push(`WARNING: Response doesn't seem to reference the Story Root (should start there per workflow)`);
    }

    // Check if response is in the correct language
    if (userText.match(/[äöüß]/i)) {
      // German input — response should be in German
      const hasGerman = /[äöüß]|dass|nicht|dein|Geschicht|Idee|Genre|erzähl/i.test(response);
      if (!hasGerman) {
        issues.push(`WARNING: User wrote in German but response appears to be in English`);
      }
    }

    // Report
    if (issues.length > 0) {
      for (const issue of issues) {
        console.log(`  ${issue}`);
      }
    }

    if (passed) {
      console.log(`  RESULT: ✅ PASS`);
    } else {
      console.log(`  RESULT: ❌ FAIL`);
    }

    return { testName, passed, issues, commandsFound: allCommands, response };
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return { testName, passed: false, issues: [`ERROR: ${err.message}`], commandsFound: [], response: '' };
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║        CO-WRITE CHAT TEST HARNESS — Dream-E                        ║');
  console.log('║        Testing AI compliance with co-write rules                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Model: ${MODEL}`);
  console.log(`API URL: ${API_URL.replace(API_KEY, '***')}`);

  const systemPrompt = generateCowriteSystemPrompt();
  const promptWordCount = systemPrompt.split(/\s+/).length;
  console.log(`System prompt: ${systemPrompt.length} chars, ~${promptWordCount} words`);
  console.log();

  // --- Test Cases ---
  const results = [];

  // Test 1: German story idea — should get questions, NO commands
  results.push(await runTest(
    'Test 1: German story idea (no commands expected)',
    'Ich will eine Agentengeschichte schreiben',
    false,
    systemPrompt
  ));

  // Test 2: English story idea — should get questions about Story Root, NO commands
  results.push(await runTest(
    'Test 2: English story idea (no commands expected)',
    'Help me write a story about vampires and AI',
    false,
    systemPrompt
  ));

  // Test 3: Blanket permission — commands are OK
  results.push(await runTest(
    'Test 3: Blanket permission (commands OK)',
    'Füll alles aus, mach einfach. Eine Spionagegeschichte im kalten Krieg.',
    true,
    systemPrompt
  ));

  // --- Summary ---
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}: ${r.testName}`);
    if (r.commandsFound.length > 0) {
      console.log(`         Commands found: ${r.commandsFound.join(', ')}`);
    }
    for (const issue of r.issues) {
      console.log(`         ${issue}`);
    }
    if (!r.passed) allPassed = false;
  }

  console.log();
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED — Co-write rules are being followed!');
  } else {
    console.log('⚠️  SOME TESTS FAILED — AI is not reliably following co-write rules.');
    console.log('   The system prompt may be too long, causing rule compliance issues.');
    console.log(`   Current system prompt: ~${promptWordCount} words`);
    console.log('   Recommendation: Restructure prompt to be shorter and more focused.');
  }

  // Write results to file for reference
  const resultsReport = results.map(r => ({
    test: r.testName,
    passed: r.passed,
    issues: r.issues,
    commandsFound: r.commandsFound,
    responseLength: r.response.length,
    responsePreview: r.response.slice(0, 500),
  }));

  fs.writeFileSync(
    path.join(__dirname, 'TEST_RESULTS.json'),
    JSON.stringify(resultsReport, null, 2),
    'utf-8'
  );
  console.log('\nDetailed results saved to TEST_RESULTS.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
