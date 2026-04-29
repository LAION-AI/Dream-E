# Co-Writing Lifecycle — Implementation Plan

This document is the actionable implementation plan for adding the lifecycle assertion system described in `CO_WRITING_LIFECYCLE.md` to Dream-E's co-writing mode.

**Scope**: Co-write mode only. Game mode must NOT be affected. No existing functionality removed — only added or transformed.

---

## Part A: Procedural Checks (Code-Based Assertions)

Automated checks that inspect project state and inject results into the agent's context. These live in a new module.

### A.1 — New File: `src/services/lifecycleChecks.ts`

**Purpose**: Pure-function module that receives the current `Project` object and returns a structured assertion report. No side effects, no store mutation.

**Core data structures**:

```
AssertionResult {
  id: string;
  description: string;
  passed: boolean;
  severity: 'hard' | 'soft';
  suggestion?: string;
}

PhaseReport {
  phase: string;
  assertions: AssertionResult[];
  passCount: number;
  failCount: number;
}

LifecycleReport {
  currentPhase: string;
  reports: PhaseReport[];
  formattedContext: string;  // the text block injected into agent context
}
```

**Phase detection logic** — determine which phase the project is in by examining what exists:

| Detected Phase | Condition |
|---|---|
| Phase 1 (Story Root) | No plots with descriptions, or story root fields incomplete |
| Phase 2 (Plots) | Story root substantially filled, plots exist but no acts with descriptions |
| Phase 3 (Acts/Episodes) | Plots filled, acts exist but no cowrite scenes with descriptions |
| Phase 4 (Scenes) | Acts filled, cowrite scenes exist |
| Phase 5 (Shots) | Scenes filled, shots exist |

Detection looks at the *deepest populated level*, not strict gating — so a project that jumped ahead still gets relevant checks.

**Assertion functions** (one per gate/checkpoint):

#### A.1.1 `checkStoryRootAssertions(project)` — Pre-Plot Gate

| # | Assertion | Severity | What to Check |
|---|---|---|---|
| 1 | Title is non-empty | hard | `storyRootData.title` |
| 2 | Genre is non-empty | hard | `storyRootData.genre` |
| 3 | Target audience is non-empty | soft | `storyRootData.targetAudience` |
| 4 | Punchline is non-empty | soft | `storyRootData.punchline` |
| 5 | Main character has name + role | hard | `storyRootData.mainCharacter.name/role` |
| 6 | Antagonist has name + role | hard | `storyRootData.antagonist.name/role` |
| 7 | At least 1 supporting character | soft | `storyRootData.supportingCharacters.length >= 1` |
| 8 | Protagonist goal is non-empty | hard | `storyRootData.protagonistGoal` |
| 9 | Summary is at least 100 words | soft | Word count of `storyRootData.summary` |
| 10 | Story Root has image | soft | `storyRootData.image` truthy |
| 11 | Protagonist entity exists in world DB | hard | Case-insensitive name match in `project.entities` |
| 12 | Protagonist entity has complete profile | soft | Check mandatory character profile fields (see A.2) |
| 13 | Protagonist entity has reference image | soft | `entity.referenceImage` truthy |
| 14–16 | Same checks for antagonist | hard/soft | Same pattern |
| 17 | Supporting characters exist as entities | soft | Name match for each |
| 18 | At least 1 location entity exists | soft | Any entity with `category === 'location'` |
| 19 | Story Root entityStateChanges has protagonist entry | soft | Key match by entity ID |
| 20 | Story Root entityStateChanges has antagonist entry | soft | Key match by entity ID |
| 21 | All entityStateChanges keys are valid entity IDs | hard | Every key exists in `project.entities` |

#### A.1.2 `checkPlotAssertions(project)` — Pre-Act Gate

| # | Assertion | Severity |
|---|---|---|
| 1 | Every plot has `name` and `plotType` | hard |
| 2 | Every plot description is at least 100 words | soft |
| 3 | Every plot has `image` | soft |
| 4 | Every plot has `entityStateChanges` with at least 1 entry | soft |
| 5 | All entity IDs in plot `entityStateChanges` exist | hard |
| 6 | All referenced entities have complete profiles | soft |
| 7 | All referenced entities have reference images | soft |

#### A.1.3 `checkActAssertions(project, actNodeId?)` — Intra-Act

When `actNodeId` is provided, checks one act; otherwise checks all.

| # | Assertion | Severity |
|---|---|---|
| 1 | Act has `name`, `description`, `turningPoint` | hard |
| 2 | Act description is at least 100 words | soft |
| 3 | Act `turningPoint` is non-empty | soft |
| 4 | Act has `image` | soft |
| 5 | Act has relationship edges to ALL defined plots | soft |
| 6 | Each act-plot relationship has `plotInvolvement` text | soft |
| 7 | Act `entityStateChanges` has at least 1 entry | soft |
| 8 | All entity IDs in act `entityStateChanges` exist and have profiles | hard (ID validity) / soft (profile) |
| 9 | All referenced entities have reference images | soft |

#### A.1.4 `checkSceneAssertions(project, sceneNodeId?)` — Scene-Level

| # | Assertion | Severity |
|---|---|---|
| 1 | Scene has `title` and `description` | hard |
| 2 | Scene has at least 1 entity participation entry | soft |
| 3 | Scene is connected to parent act via edge | hard |
| 4 | Scene is connected to at least 1 plot via relationship edge | hard |
| 5 | All entity IDs in `entities` array exist | hard |
| 6 | All referenced entities have complete profiles | soft |
| 7 | All referenced entities have reference images | soft |
| 8 | `entityStateChanges` covers entities in the `entities` array | soft |

#### A.1.5 `checkActCompletionAssertions(project, actNodeId)` — After All Scenes in an Act

| # | Assertion | Severity |
|---|---|---|
| 1 | All scenes under this act have title + description | soft |
| 2 | Every scene connected to parent act | hard |
| 3 | Every scene connected to at least 1 plot | hard |
| 4 | No plot active in act-plot `plotInvolvement` is unrepresented in scenes | soft |

#### A.1.6 `checkEntityProfileCompleteness(entity)` — Reusable Helper

Returns list of missing mandatory fields for an entity based on its `category`. Uses the `REQUIRED_PROFILE_FIELDS` constants (see A.2).

#### A.1.7 `formatLifecycleContext(report)` — Output Formatter

Generates the text block injected into the agent context:

```
[LIFECYCLE CHECK — Phase: Plot Definition]
Status: 14 of 18 assertions passed
Missing:
  ✗ Plot "Antagonist Arc" has no image — Suggestion: Generate an image for this plot
  ✗ Entity "Lady Vex" missing profile fields: ocean_profile, arc — Suggestion: Use set_entity_profile
  ✗ Plot "Relationship" entityStateChanges empty — Suggestion: Add entity state changes
  ✗ Entity "The Citadel" has no reference image — Suggestion: Generate with generate_entity_image
```

**Cap at ~50 lines maximum.** Only show failures in detail; successes as a count.

**Files to create**: `src/services/lifecycleChecks.ts`
**Risk**: Low — pure functions, no side effects
**Dependencies**: None
**Estimated size**: ~400–500 lines

---

### A.2 — Required Profile Field Constants

Add to `lifecycleChecks.ts`:

```typescript
const REQUIRED_PROFILE_FIELDS: Record<string, string[]> = {
  character: [
    'summary', 'age', 'gender', 'ethnicity', 'appearance', 'personality',
    'ocean_profile', 'ruling_passion', 'contradiction', 'want_vs_need',
    'defining_fear', 'backstory', 'motivation', 'flaws', 'coping_strategy',
    'arc', 'visual_style_notes'
  ],
  location: [
    'summary', 'atmosphere', 'features', 'significance', 'visual_style',
    'connected_locations', 'inhabitants', 'history', 'current_state'
  ],
  object: [
    'summary', 'appearance', 'properties', 'history', 'significance',
    'current_owner', 'current_location', 'visual_style'
  ],
  concept: [
    'summary', 'rules', 'implications', 'examples', 'related_concepts',
    'visual_representation'
  ],
};
```

Groups/factions use `concept` category with `type: 'group'` in their profile — no new category needed, avoiding a data migration.

---

### A.3 — Integration: Inject Lifecycle Checks into Agent Context

**File**: `src/services/aiChatService.ts`
**Function**: `buildUserMessage()` (currently at line ~60)
**Change**: ~10 lines added

```typescript
function buildUserMessage(userText: string): string {
  let msg = '[Current Game State]\n' + getGameContext() + '\n\n';

  // NEW: For co-write projects, run lifecycle assertions
  const project = useProjectStore.getState().currentProject;
  if (project?.mode === 'cowrite') {
    const report = runLifecycleChecks(project);
    if (report.formattedContext) {
      msg += report.formattedContext + '\n\n';
    }
  }

  msg += userText;
  return msg;
}
```

**Risk**: Medium — increases context size by ~50–100 lines. Must keep output concise (only failures shown).
**Dependencies**: A.1 must be done first.

---

## Part B: System Prompt Additions

These go into the co-write preamble in `gameStateAPI.registry.ts` (the `isCowrite ? ...` branch). Game mode prompt is NOT touched.

### B.1 — Lifecycle Phase Awareness Section

**Insert after**: MANDATORY WORKFLOW ORDER section (~line 1127)
**Content**: ~200 words

Instructs the agent to:
1. Read `[LIFECYCLE CHECK]` blocks in every message
2. Treat `hard` failures as blockers — notify user before proceeding
3. Treat `soft` failures as suggestions — raise but allow override
4. When user says "let's work on plots/acts/scenes", check gate assertions first
5. Track skipped assertions and re-raise at next checkpoint
6. Never silently skip a failing hard assertion

### B.2 — Mandatory Entity Profile Fields Section

**Insert after**: Existing entity profile documentation (~line 1424)
**Content**: ~150 words

Makes the mandatory profile fields per category explicit in the prompt, matching Lifecycle Section 2. Currently the prompt only has "recommended" fields — this makes them required.

Also documents that Groups/Factions use `concept` category with `type: 'group'` in profile.

### B.3 — Image Generation Protocol

**Insert into or replace**: Existing image generation sections
**Content**: ~150 words

Adds the explicit pre-generation checklist from Lifecycle Section 8.1:
1. Identify all entities visible in the image
2. Assert each entity exists, has profile, has reference image
3. If reference image missing → generate it first
4. Build prompt using entity profile fields (`appearance`, `visual_style_notes`, etc.)
5. Never generate a node image depicting an entity whose reference image doesn't exist yet

### B.4 — Entity State Change Quality Standard

**Insert after**: CHARACTER ARC & DETAIL DEPTH section (~line 1367)
**Content**: ~100 words

Reinforces that entity state change entries must:
- Address at least 2 of 6 dimensions (insight, belief, strategy, emotion, relationship, physical)
- Be emotionally intelligent, precise, and free of purple prose
- Never use vague filler

### B.5 — Scene-to-Plot Connection Enforcement

**Modify**: Already partially present. Add brief reinforcement that `[LIFECYCLE CHECK]` will flag scenes missing plot connections.
**Content**: ~30 words

---

**Total prompt additions**: ~630 words across B.1–B.5
**Files**: `src/services/gameStateAPI.registry.ts` (co-write preamble only)
**Risk**: Low — text-only additions to prompt string
**Dependencies**: None (can be done in parallel with Part A)

---

## Part C: API Changes

### C.1 — New Command: `get_lifecycle_status`

Allows the agent to explicitly request a lifecycle report on demand.

**Registry** (`gameStateAPI.registry.ts`):
```typescript
{
  name: 'get_lifecycle_status',
  group: 'cowrite',
  description: 'Run lifecycle assertions and return status report for the current project phase',
  params: [
    { name: 'phase', type: 'string', required: false,
      description: 'Phase to check',
      validValues: ['story_root', 'plots', 'acts', 'scenes', 'shots', 'all'] },
    { name: 'targetNodeId', type: 'string', required: false,
      description: 'Specific node to check (for act/scene-level assertions)' },
  ],
  returns: '{phase, passed, failed, assertions[]}',
}
```

**Handler** (`gameStateAPI.ts`): Calls `runLifecycleChecks()` from `lifecycleChecks.ts`. ~40–60 lines.

**DATA_COMMANDS** (`aiChatService.ts`): Add `'get_lifecycle_status'` to the set so full JSON results are sent back to the agent.

**Risk**: Low — follows existing command patterns
**Dependencies**: A.1 must be done first

### C.2 — No Other API Changes Needed

- `create_entity` already accepts `profile` — no change needed
- Scene-to-plot connections already use `create_relationship` — no new command needed
- Entity state changes already have `update_plot`, `update_act`, etc. — no new commands

---

## Part D: Data Model Changes

### D.1 — No New Fields Needed

The lifecycle spec references "important entities lists" at Story Root, Plot, and Act levels. These can be **derived procedurally** from existing data:

| Level | "Important entities" derived from |
|---|---|
| Story Root | `entityStateChanges` keys + entities matching character names |
| Plot | `entityStateChanges` keys |
| Act | `entityStateChanges` keys |
| Scene | `entities[]` array |

No new `importantEntities: string[]` field needed on any node type.

### D.2 — Groups/Factions

Stored as `concept` category entities with `type: 'group'` in their profile. No new entity category needed, avoiding a data migration. System prompt (B.2) documents this convention.

---

## Implementation Sequence

```
Step 1: Create lifecycleChecks.ts (A.1, A.2)
  - Pure functions, testable in isolation
  - ~400-500 lines
  - No dependencies

Step 2: Add system prompt sections (B.1–B.5)
  - Text additions to co-write preamble
  - Can be done in PARALLEL with Step 1
  - ~630 words of prompt text

Step 3: Integrate into aiChatService.ts (A.3)
  - ~10 lines in buildUserMessage()
  - Depends on Step 1

Step 4: Add get_lifecycle_status command (C.1)
  - Registry entry + handler + DATA_COMMANDS entry
  - Depends on Step 1

Step 5: Build and test
  - Verify lifecycle checks fire correctly at each phase
  - Verify agent receives and acts on [LIFECYCLE CHECK] block
  - Verify game mode is completely unaffected
```

---

## Risk Assessment

| Item | Risk | Reason |
|---|---|---|
| `lifecycleChecks.ts` (A.1) | Low | Pure functions, no side effects, no UI changes |
| Context injection (A.3) | Medium | Increases LLM context size; must be kept concise |
| System prompt additions (B.*) | Low | Text-only changes to co-write prompt string |
| `get_lifecycle_status` (C.1) | Low | Standard command following existing patterns |
| Game mode isolation | Low | All changes gated behind `project.mode === 'cowrite'` |
| Data model changes (D.*) | N/A | None required |

---

## Game Mode Safety

Every change is gated:

- **`lifecycleChecks.ts`**: Only called from `buildUserMessage()` when `project.mode === 'cowrite'`
- **System prompt additions**: Only in the `isCowrite` branch of `generateSystemPrompt()`
- **`get_lifecycle_status` command**: In the `cowrite` group, filtered out for game mode by existing `COWRITE_GROUPS` filter
- **Game mode will see zero changes** from this implementation

---

## Files Summary

| File | Action | Lines Changed |
|---|---|---|
| `src/services/lifecycleChecks.ts` | **CREATE** | ~400–500 (new file) |
| `src/services/aiChatService.ts` | MODIFY | ~10 lines in `buildUserMessage()` |
| `src/services/gameStateAPI.registry.ts` | MODIFY | ~630 words added to co-write preamble + registry entry |
| `src/services/gameStateAPI.ts` | MODIFY | ~40–60 lines (handler for `get_lifecycle_status`) |
