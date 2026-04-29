# Dream-E Co-Writing Lifecycle — Complete Specification

## 1. Overview

This document defines the complete lifecycle for authoring a story in Dream-E's co-writing mode. It covers every phase from initial Story Root creation through optional shot-level storyboarding, including:

- **Mandatory fields** at every level of the story hierarchy
- **Entity requirements** — what must exist in the world database before a node can be considered complete
- **Image generation protocol** — how to ensure visual consistency through reference images
- **Entity state changes** — tracking how characters, locations, objects, and groups evolve at every scope level
- **Procedural checks (assertions)** — automated reminders that fire when a prerequisite is missing or incomplete
- **Connections** — which nodes must be connected to which, and what data those edges carry
- **Quality standards** — what good writing looks like at each level

The hierarchy is strictly top-down:

```
Story Root → Plots → Acts/Episodes → Scenes → Shots (optional)
```

Each level must be substantially complete before proceeding to the next. The co-writing agent defaults to this lifecycle whenever the user has not given a different instruction, and suggests filling gaps before advancing.

---

## 2. Entity Types and Required Profiles

Every entity in the world database belongs to a category. Each category has mandatory profile fields that must be populated before the entity is considered "complete." The co-writing agent must check these fields and prompt for their creation if missing.

### 2.1 Characters

Characters are the most detail-intensive entity type. Every named character who participates meaningfully in the story must have a full profile.

**Mandatory profile fields:**

| Field | Description |
|---|---|
| `summary` | 2–4 sentence overview of who this person is |
| `age` | Age or age range |
| `gender` | Gender identity |
| `ethnicity` | Ethnic or cultural background |
| `appearance` | Physical description: height, build, hair, eyes, skin, distinguishing marks, typical clothing |
| `personality` | Behavioral tendencies, temperament, social style |
| `ocean_profile` | Big Five (OCEAN) personality scores or descriptions: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism |
| `ruling_passion` | The single dominant drive that shapes most of their decisions |
| `contradiction` | The internal inconsistency that makes them human — where their behavior contradicts their stated values |
| `want_vs_need` | What they consciously pursue (want) vs. what they actually need to grow |
| `defining_fear` | The deep fear that underlies their defensive behaviors |
| `backstory` | Key formative events before the story begins |
| `motivation` | What drives them in the current story |
| `flaws` | Character weaknesses, blind spots, destructive patterns |
| `coping_strategy` | How they deal with stress, conflict, and fear |
| `arc` | How they change over the course of the story (beginning state → end state) |
| `visual_style_notes` | Art direction notes for consistent image generation (color palette, lighting, mood) |
| `relationships` | Dictionary of entity ID → relationship description for key relationships |

**Reference image requirements:**
- **Framing**: Close-up portrait, upper body and face clearly visible
- **Character must fill the frame** — never small or distant
- **Prompt must include**: "portrait, upper body shot, face clearly visible"
- **Show the character in a context that reveals personality** — posture, expression, environment should suggest who they are
- **Consistency markers**: Use the `appearance` and `visual_style_notes` fields verbatim in the image prompt to maintain visual consistency across all images of this character

### 2.2 Locations

Every significant location where scenes take place must have a profile and reference image.

**Mandatory profile fields:**

| Field | Description |
|---|---|
| `summary` | 2–3 sentence overview of the location |
| `atmosphere` | Mood, lighting, sounds, smells, feeling of being there |
| `features` | Key physical features, landmarks, notable objects |
| `significance` | Why this location matters to the story — what happens here, what it symbolizes |
| `visual_style` | Art direction: color palette, architectural style, time of day, weather, lighting |
| `connected_locations` | How this location relates geographically to other important locations |
| `inhabitants` | Who lives or works here; what kind of people frequent it |
| `history` | Relevant backstory of the location |
| `current_state` | What condition the location is in at the start of the story |

**Reference image requirements:**
- **Framing**: Establishing shot — wide angle showing the full environment
- **Must convey atmosphere**: Lighting, weather, and mood should match the `atmosphere` field
- **Prompt must include**: Key architectural/natural features from `features`, lighting from `visual_style`
- **Time of day and weather** should match the story's primary use of this location

### 2.3 Objects

Important objects (weapons, artifacts, documents, vehicles, etc.) that play a role in the plot.

**Mandatory profile fields:**

| Field | Description |
|---|---|
| `summary` | What this object is and why it matters |
| `appearance` | Detailed physical description: size, shape, color, material, condition |
| `properties` | Special properties, capabilities, or functions |
| `history` | Origin, previous owners, how it came to be where it is |
| `significance` | Role in the story — why it matters to the plot |
| `current_owner` | Who possesses it at the start of the story |
| `current_location` | Where it is at the start of the story |
| `visual_style` | Art direction for consistent rendering |

**Reference image requirements:**
- **Framing**: Close-up, detailed view of the object
- **Prompt must include**: Material, condition, any inscriptions or markings
- **Scale reference**: Include something for scale if the object's size matters
- **Lighting**: Should reveal texture and detail (avoid silhouettes)

### 2.4 Groups / Factions

Organizations, companies, nations, factions, families, cults, guilds — any collective entity that acts as a unit in the story.

**Mandatory profile fields:**

| Field | Description |
|---|---|
| `summary` | What this group is, what it does, and its role in the story |
| `type` | Classification: company, faction, nation, family, guild, cult, military unit, etc. |
| `goals` | What the group is trying to achieve |
| `structure` | Leadership, hierarchy, decision-making process |
| `members` | Key members (reference entity IDs where possible) |
| `influence` | Sphere of power — geographic, political, economic, social |
| `relationships` | Alliances, rivalries, dependencies with other groups or characters |
| `resources` | What assets, weapons, knowledge, or leverage they possess |
| `culture` | Internal values, rituals, codes of conduct, beliefs |
| `weakness` | Vulnerabilities, internal tensions, blind spots |

**Reference image (recommended, not mandatory):**
- **Framing**: Either a group emblem/crest/logo OR a representative gathering/scene
- **If emblem**: Clean graphic design on dark/neutral background
- **If group scene**: Key members visible, environment reflecting the group's domain
- **Prompt must reflect**: The group's `type` and `culture`
- Having a reference image is encouraged — it helps the user visualize the faction and ensures visual consistency when the group appears in node images

### 2.5 Concepts

Abstract game mechanics, magic systems, technologies, social structures, philosophical ideas, or world rules that shape the story.

**Mandatory profile fields:**

| Field | Description |
|---|---|
| `summary` | Plain-language explanation of the concept |
| `rules` | How it works — mechanics, limitations, costs |
| `implications` | How it affects the world, society, and characters |
| `examples` | Concrete instances of the concept in action within the story |
| `related_concepts` | Other concepts this interacts with or depends on |
| `visual_representation` | How this concept manifests visually (for image generation) |

**Reference image (recommended, not mandatory):**
- **Framing**: Symbolic or illustrative — showing the concept in action
- **Prompt must include**: The `visual_representation` field description
- **Style should match**: The project's overall art direction
- Concepts are abstract, so not all concepts benefit from an image — but where the concept has a clear visual manifestation (e.g., a magic system, a technology), an image helps ground it for the user

---

## 3. Phase 1 — Story Root

The Story Root is the DNA of the entire story. Every other node derives from it. It must be thoroughly developed before any plot, act, or scene work begins.

### 3.1 Workflow

1. **Title, Genre, Target Audience** — Discuss with the user. The genre and audience shape every subsequent creative decision (vocabulary, themes, violence level, complexity).

2. **Punchline / Logline** — One sentence that captures the story's core hook. Must name the protagonist and the central conflict.

3. **Main Character & Antagonist** — Define name and role for both. These are the minimum structural characters.

4. **Supporting Characters** — Name and archetype for each. These populate the story's social world.

5. **Protagonist Goal** — The main character's concrete objective that drives the story's main arc. Must be specific, achievable, and have clear stakes for failure.

6. **Summary** — 100+ words (ideally 300–500). A complete synopsis from inciting incident through climax to resolution. Must include:
   - The inciting incident
   - All major plot points and turning points
   - Character arcs (how protagonist and antagonist change)
   - Key relationships and their evolution
   - The climax and resolution
   - The emotional and thematic takeaway

7. **Define Important Entities** — After the summary is approved, identify ALL entities that will be significant to the story:
   - Characters (protagonist, antagonist, supporting cast, minor but recurring characters)
   - Locations (every significant setting where scenes will take place)
   - Objects (any item that drives plot or has symbolic weight)
   - Groups/Factions (any organization, nation, family, or collective that acts as a story force)
   - Concepts (magic systems, technologies, social rules, etc.)

8. **Create Entities in World Database** — For each identified entity:
   - Create the entity with `create_entity` (name, category, description)
   - Set the full profile with `set_entity_profile` (all mandatory fields per category — see Section 2)
   - Generate reference image with `generate_entity_image` (following image protocol per category)

9. **Story Root Image** — Generate the story's cover/mood image:
   - The prompt must identify all entities visible in the image
   - Reference images for those entities must exist (assert this)
   - If any reference image is missing, generate it first

10. **Entity State Changes (Story Level)** — For each important entity, write a comprehensive multi-paragraph entry in the Story Root's `entityStateChanges` field describing the character's complete arc across the entire story:
    - Opening state (who they are at the beginning)
    - Every major internal shift
    - Closing state (who they have become)
    - For locations/objects: opening condition → all changes → final condition

11. **User Approval** — Present a summary of everything defined. Get explicit confirmation before proceeding to plots.

### 3.2 Mandatory Fields Checklist

| Field | Requirement |
|---|---|
| `title` | Non-empty string |
| `genre` | Non-empty string |
| `targetAudience` | Non-empty string |
| `punchline` | Non-empty string, one sentence |
| `mainCharacter.name` | Non-empty |
| `mainCharacter.role` | Non-empty |
| `antagonist.name` | Non-empty |
| `antagonist.role` | Non-empty |
| `supportingCharacters` | At least 1 entry with name + archetype |
| `protagonistGoal` | Non-empty, specific and concrete |
| `summary` | 100+ words (ideally 300–500) |
| `image` | Present (generated) |
| `entityStateChanges` | At least entries for protagonist, antagonist, and key supporting characters |

### 3.3 Pre-Plot Assertions (Gate: Story Root → Plots)

Before the agent proceeds to defining plots, the following must all pass. If any fail, the agent must notify the user and suggest completing the missing item first.

```
ASSERT: Story Root title is not empty
ASSERT: Story Root genre is not empty
ASSERT: Story Root target audience is not empty
ASSERT: Story Root punchline is not empty
ASSERT: Story Root main character has name and role
ASSERT: Story Root antagonist has name and role
ASSERT: Story Root has at least 1 supporting character
ASSERT: Story Root protagonist goal is not empty
ASSERT: Story Root summary is at least 100 words
ASSERT: Story Root has an image
ASSERT: Protagonist entity exists in world database
ASSERT: Protagonist entity has complete profile (all mandatory character fields)
ASSERT: Protagonist entity has reference image
ASSERT: Antagonist entity exists in world database
ASSERT: Antagonist entity has complete profile
ASSERT: Antagonist entity has reference image
ASSERT: All supporting characters exist in world database with profiles and images
ASSERT: At least 1 location entity exists with profile and image
ASSERT: Story Root entityStateChanges has entry for protagonist
ASSERT: Story Root entityStateChanges has entry for antagonist
ASSERT: All entityStateChanges entries reference valid entity IDs
ASSERT: User has approved the Story Root
```

---

## 4. Phase 2 — Plot Definition

Plots are the causal event chains that give the story its structure. Each plot tracks a distinct through-line.

### 4.1 Workflow

1. **Determine Number and Nature of Plots** — Before writing any plot details, first propose the full set of plots:
   - **Main Plot** (required) — the protagonist's primary journey
   - **Antagonist Plot** — the antagonist's parallel arc
   - **Relationship Plot** — the central interpersonal dynamic
   - **Character Development Plot** — internal growth arcs for key characters
   - **Subplots** — additional threads (societal issues, side character arcs, thematic explorations, mysteries, etc.)

   Present all proposed plots to the user as a list. Get confirmation on the set before filling out any individual plot.

2. **Fill Out Each Plot** — For each confirmed plot, in order:

   a. **Name and Type** — Set via `update_plot`

   b. **Description** — 100+ words (ideally 500–800 for rich plots) covering:
      - The full arc of this plot thread from first event to resolution
      - Key events and turning points within this thread
      - Which characters are involved and how
      - How this plot connects to and affects other plots
      - The emotional and thematic purpose of this plot

   c. **Identify Important Entities for This Plot** — List all entities (characters, locations, objects, groups) that are relevant to this specific plot arc. This list should be documented visibly so that entity state changes can be written for each.

   d. **Entity State Changes (Plot Level)** — For each important entity in this plot, write a detailed description of how that entity changes over the course of this entire plot arc:
      - Opening state at the start of this plot thread
      - Key turning points and shifts
      - Closing state at the end of this plot thread
      - For characters: belief changes, strategy shifts, emotional residue
      - For locations: physical changes, atmosphere shifts
      - For objects: ownership changes, condition changes, revelation of properties

   e. **Plot Image** — Generate an image representing the essence of this plot:
      - Identify entities visible in the image
      - Assert reference images exist for all visible entities
      - If any reference image is missing → generate it first
      - Write a vivid prompt using entity profiles for visual consistency

3. **Repeat** for every plot until all are complete.

### 4.2 Mandatory Fields per Plot

| Field | Requirement |
|---|---|
| `name` | Non-empty |
| `plotType` | One of: main, relationship, antagonist, character_development, subplot, custom |
| `description` | 100+ words (ideally 500–800 for rich plots) |
| `image` | Present (generated) |
| `entityStateChanges` | Entries for all entities identified as important to this plot |

### 4.3 Pre-Act Assertions (Gate: Plots → Acts/Episodes)

```
ASSERT: All planned plots have been created (count matches agreed number)
ASSERT: Every plot has a name and plotType
ASSERT: Every plot description is at least 100 words
ASSERT: Every plot has an image
ASSERT: Every plot has entityStateChanges with at least 1 entry
ASSERT: Every entity referenced in plot entityStateChanges exists in world database
ASSERT: Every entity referenced has a complete profile (mandatory fields for its category)
ASSERT: Every entity referenced has a reference image
ASSERT: All new entities introduced in plot descriptions have been created in world database
ASSERT: User has approved all plot definitions
```

---

## 5. Phase 3 — Act / Episode Structure

Acts (traditional screenplay/novel) or Episodes (TV series/web serial) divide the story into major structural units. Each has a distinct narrative function.

### 5.1 Workflow

1. **Determine Act/Episode Count and High-Level Plan** — Before creating any act nodes, propose the full structure:
   - For act structure: typically 3–5 acts (Setup, Rising Action, Midpoint, Climax, Resolution)
   - For episode structure: variable count, each with its own mini-arc and cliffhanger
   - For each proposed unit: one-sentence summary of what happens

   Present the full structure to the user. Get confirmation before creating nodes.

2. **Create All Act/Episode Nodes** — Create them all at once so the structure is visible on the canvas.

3. **Fill Out Each Act/Episode** — Process them in order (Act 1 first, then Act 2, etc.):

   a. **Name** — Descriptive title (e.g., "The Setup", "Betrayal", "The Reckoning")

   b. **Description** — Detailed account of what happens in this act. For acts: 100+ words (ideally 300–500). For episodes: 100+ words (ideally 400–600 for episodes) (since episodes are more self-contained). Must include:
      - Opening situation
      - Key events in sequence
      - Character decisions and their consequences
      - How this act connects to the previous and next act
      - The emotional trajectory of the act

   c. **Turning Point / Cliffhanger** — Set via the `turningPoint` field (NOT in description):
      - For acts: The pivotal event that closes this act and propels the story forward
      - For episodes: The cliffhanger — an unresolved question, revelation, or threat that makes the audience desperate for the next episode
      - Must be specific and dramatic, not vague

   d. **Define Act–Plot Connections** — For each plot, create a relationship edge from the act to the plot (or from the plot to the act) using `create_relationship` with `plotInvolvement` data:
      - What part of this plot unfolds during this act?
      - How does this act advance this plot thread?
      - Which characters carry this plot thread in this act?
      - Do all act-plot connections before moving to the next act.

   e. **Identify Important Entities for This Act** — List all entities relevant to this act: which characters are present, which locations are visited, which objects are used, which groups are active.

   f. **Entity State Changes (Act Level)** — For each important entity, describe the changes that occur during this specific act:
      - State at act opening (should connect to previous act's closing state)
      - Key changes during this act
      - State at act close
      - Emotional and psychological shifts for characters
      - Physical changes for locations and objects
      - Power/influence changes for groups

   g. **Act/Episode Image** — Generate an image:
      - Identify entities visible in the image
      - Assert reference images exist for all visible entities
      - Generate missing reference images first
      - Prompt must use entity profiles for visual consistency

4. **Before proceeding to the next act**: Run intra-act assertions (see below).

5. **Repeat** for all acts/episodes in order.

### 5.2 Mandatory Fields per Act/Episode

| Field | Requirement |
|---|---|
| `name` | Non-empty |
| `actNumber` | Integer, unique |
| `description` | 100+ words (ideally 300–500) (acts) or 100+ words (ideally 400–600 for episodes) (episodes) |
| `turningPoint` | Non-empty — turning point (acts) or cliffhanger (episodes). Written in the `turningPoint` field, NOT in `description`. |
| `image` | Present (generated) |
| `entityStateChanges` | Entries for all entities important to this act |
| Act–Plot edges | One relationship edge per plot, with `plotInvolvement` describing this act's role in that plot |

### 5.3 Intra-Act Assertions (After Completing Each Act)

Run these checks after completing act N, before starting act N+1:

```
ASSERT: Act N has name, description, turningPoint, and image
ASSERT: Act N description is at least 100 words
ASSERT: Act N turningPoint is not empty and is NOT duplicated in description
ASSERT: Act N has relationship edges to ALL defined plots
ASSERT: Each act-plot relationship has plotInvolvement text
ASSERT: Act N entityStateChanges covers all entities identified as important
ASSERT: For characters in entityStateChanges: opening state matches previous act's closing state
ASSERT: All entities referenced exist in world database with complete profiles
ASSERT: All entities referenced have reference images
ASSERT: Act N description is consistent with the Story Root summary
ASSERT: Act N turning point creates a clear narrative bridge to Act N+1
```

### 5.4 Pre-Scene Assertions (Gate: Acts → Scenes)

```
ASSERT: All planned acts/episodes have been created and filled out
ASSERT: Every act has description, turningPoint, image, and entityStateChanges
ASSERT: Every act has relationship edges to all plots with plotInvolvement
ASSERT: Entity state change arcs are consistent across acts (no contradictions, no gaps)
ASSERT: The sequence of turning points/cliffhangers creates a coherent escalation
ASSERT: User has approved the act/episode structure
```

---

## 6. Phase 4 — Scene Breakdown

Scenes are the fundamental narrative units. Each scene is a discrete moment with a specific setting, cast, purpose, and dramatic trajectory. When concatenated, the scenes of one act should read like a chapter of a novel.

### 6.1 Workflow

1. **Plan Scenes for One Act at a Time** — Do not jump ahead. Complete all scenes for Act 1 before starting Act 2 scenes.

2. **Determine Scene Count and Sequence** — For the current act, propose:
   - How many scenes
   - One-sentence summary for each
   - Which plot(s) each scene serves (every scene must serve at least one plot)
   - Which entities participate in each scene
   - The temporal and causal flow between scenes

   Present this plan to the user. Get confirmation.

3. **Create All Scene Nodes for This Act** — Create them and connect to the parent act with edges.

4. **Fill Out Each Scene** — Process them in chronological order:

   a. **Title** — Short, evocative scene title

   b. **Description / Scene Action** — The full narrative content. This is the prose that, when concatenated with other scenes in the act, reads like a chapter of a novel. Requirements:
      - **Narrative quality**: Must read as polished prose, not a summary or outline
      - **Sensory detail**: Sight, sound, smell, touch — ground the reader in the physical world
      - **Character interiority**: Show thoughts, feelings, and internal conflicts
      - **Dialogue**: Where appropriate, include or reference key dialogue
      - **Pacing**: Match the scene's dramatic function (slow for tension-building, fast for action)
      - **Transitions**: Opening connects smoothly to the previous scene's ending; closing sets up the next scene
      - **Length**: 100+ words for the scene action/description field, depending on scene complexity

   c. **Entity Participation** — Set the `entities` array: for each entity in this scene, define:
      - `entityId` — the entity's world database ID
      - `startState` — how they enter this scene
      - `objective` — what they want in this scene
      - `changes` — what happens to them
      - `endState` — how they leave this scene

   d. **Scene–Plot Connections** — Every scene MUST be connected to at least one plot. Create relationship edges between the scene and the plot(s) it advances. This prevents "orphan scenes" that feel disconnected from the narrative.

   e. **Entity State Changes (Scene Level)** — For each entity participating in this scene, write a specific and complete entry:
      - Exact change, its cause, and its emotional resonance
      - For characters: what they learn, what belief shifts, what strategy changes
      - Opening state should match previous scene's closing state for continuity
      - No vague filler like "she felt sad" — be precise about the nature and cause of every change

   f. **Scene Image** — Generate an image:
      - Identify all entities visible in the scene image
      - Assert reference images exist for all of them
      - Generate missing reference images first
      - Use entity profiles (especially `appearance` and `visual_style_notes` for characters, `atmosphere` and `visual_style` for locations) verbatim in the prompt for visual consistency

5. **After each scene**: Run scene-level assertions.
6. **After all scenes in the act**: Run act-completion assertions.

### 6.2 Mandatory Fields per Scene

| Field | Requirement |
|---|---|
| `title` | Non-empty |
| `description` | Detailed scene overview / action text (100+ words) |
| `sceneAction` | Blow-by-blow plan of the scene's dramatic beats |
| `entities` | At least 1 entity participation entry |
| `entityStateChanges` | Entries for all participating entities that change in this scene |
| `image` | Present (generated) |
| Scene–Act edge | Connected to parent act |
| Scene–Plot edge(s) | Connected to at least 1 plot |

### 6.3 Scene-Level Assertions (After Each Scene)

```
ASSERT: Scene has title, description, and at least 1 entity participation entry
ASSERT: Scene is connected to its parent act via an edge
ASSERT: Scene is connected to at least 1 plot via a relationship edge
ASSERT: All entity IDs in the entities array exist in the world database
ASSERT: All entities referenced have complete profiles
ASSERT: All entities referenced have reference images
ASSERT: entityStateChanges covers all entities in the entities array that change meaningfully
ASSERT: For characters: scene opening state matches previous scene's closing state
ASSERT: Scene content is consistent with parent act's description
ASSERT: Scene content advances at least one plot thread
ASSERT: Scene image was generated with reference images for all visible entities
```

### 6.4 Act-Completion Assertions (After All Scenes for One Act)

```
ASSERT: All planned scenes for this act have been created and filled out
ASSERT: Every scene is connected to the parent act
ASSERT: Every scene is connected to at least 1 plot
ASSERT: No plot that is marked as active in this act (via act-plot plotInvolvement) is unrepresented in scenes
ASSERT: The sequence of scenes covers the act's description — no major events in the act description are unrepresented
ASSERT: The act's turning point / cliffhanger is dramatized in the final scene(s)
ASSERT: Scene transitions are smooth — each scene's opening connects to the previous scene's closing
ASSERT: Entity state changes across all scenes are consistent and additive (no contradictions)
ASSERT: The combined entity state changes across all scenes match the act-level entityStateChanges
ASSERT: If concatenated, the scene texts read as a coherent chapter with no redundancy and no gaps
```

---

## 7. Phase 5 — Shot Storyboard (Optional)

Shots break scenes down into individual camera setups — the visual building blocks of a film, TV episode, or visual novel. This phase is only entered if the user chooses to create a visual storyboard.

### 7.1 Workflow

1. **User Decision** — After scene completion, ask whether the user wants shot-level breakdowns. Options:
   - **Novel mode**: Skip shots; concatenate scene texts for prose output
   - **Storyboard mode**: Break each scene into shots for visual storytelling

2. **Plan Shots for One Scene at a Time** — For each scene:
   - Determine the number of shots
   - Define each shot's visual composition (camera angle, framing, who/what is in frame)
   - Ensure every beat in the scene action is covered by at least one shot

3. **Fill Out Each Shot**:

   a. **Title** — Brief shot description (e.g., "Close-up: Sera draws her sword")

   b. **Description** — What the audience sees and hears in this shot:
      - Camera angle and framing
      - Character actions and expressions
      - Dialogue (if any)
      - Sound design
      - Duration estimate

   c. **Entity State Changes** — Only if meaningful changes occur within this single shot

   d. **Shot Image** — Generate using the same entity reference image protocol

4. **After all shots in a scene**: Verify completeness.

### 7.2 Shot-Level Assertions

```
ASSERT: Every beat in the parent scene's action is covered by at least one shot
ASSERT: Shot sequence is temporally plausible — no impossible jumps
ASSERT: All entities visible in shot images have reference images
ASSERT: Shot descriptions are consistent with the parent scene's content
ASSERT: No redundant shots (same content repeated without purpose)
ASSERT: Combined shots fully dramatize the parent scene
```

---

## 8. Image Generation Protocol

Image generation must follow a strict protocol to ensure visual consistency across all nodes.

### 8.1 Pre-Generation Checklist

Before generating ANY image (node image, entity image, or story image):

```
1. IDENTIFY all entities that will be visible in the image
2. For each visible entity:
   a. ASSERT: Entity exists in world database
   b. ASSERT: Entity has a complete profile (mandatory fields for its category)
   c. ASSERT: Entity has a reference image
   d. If reference image is MISSING:
      i.  ASSERT: Entity has a description/appearance field populated
      ii. If description is also missing → generate the description first
      iii. Generate entity reference image using the profile fields
      iv. Wait for image generation to complete before proceeding
3. BUILD the image prompt:
   a. Include the scene/node context (what is happening)
   b. For each visible character: include `appearance` and `visual_style_notes` from profile
      (hair color, eye color, build, clothing — verbatim from the profile)
   c. For each visible location: include `atmosphere`, `features`, and `visual_style` from profile
   d. For each visible object: include `appearance` from profile
   e. Include the project's `defaultImageStyle` setting
4. PASS entityIds PARAMETER: The `generate_node_image` command accepts an `entityIds`
   array — a list of entity IDs whose reference images will be attached as visual
   constraints. This is CRITICAL for character consistency (correct hair color,
   facial features, clothing, body type). Without entityIds, the image generator
   only has text to work from and WILL produce inconsistent characters.
5. GENERATE the image with entityIds attached — the API will automatically
   include the reference images for visual consistency.
```

**IMPORTANT**: The `entityIds` parameter is what prevents visual inconsistency bugs
(e.g., a blonde character rendered with black hair). The text prompt alone is not
sufficient — the reference images provide the ground truth for how characters look.

### 8.2 Entity Reference Image Triggers

Entity reference images should be generated at these lifecycle points:

| Trigger Point | What Happens |
|---|---|
| Entity creation (Phase 1) | Generate immediately after profile is complete |
| First mention in a plot | If somehow missed, generate before plot image |
| First mention in an act/episode | If still missing, generate before act image |
| First appearance in a scene | Last chance — must exist before scene image |
| Any image generation that includes this entity | Assert reference image exists; generate if missing |

### 8.3 Image Prompt Structure by Node Type

| Node Type | Framing | Content |
|---|---|---|
| Story Root | Cinematic wide shot | The world and central conflict — mood-setting |
| Plot | Thematic composition | The essence of this plot thread — key characters in a moment that captures the plot's nature |
| Act / Episode | Key dramatic moment | The most important visual from this act's turning point or climax |
| Scene | The scene's setting and action | Characters in the location, performing the scene's central action |
| Shot | Specific camera angle | Exactly what the camera sees for this shot |
| Character entity | Portrait | Upper body, face clearly visible, personality conveyed through expression and posture |
| Location entity | Establishing shot | Wide angle, full environment, atmosphere conveyed through lighting and weather |
| Object entity | Close-up | Detailed view showing texture, scale, condition |
| Group entity | Emblem or gathering | Either a symbol/crest or key members assembled |

---

## 9. Entity State Changes Protocol

Entity state changes are the system's mechanism for tracking how every entity evolves across the story. They must be populated at every level of the hierarchy.

### 9.1 Scope and Detail Scaling

| Node Level | Scope | Expected Detail |
|---|---|---|
| **Story Root** | Entire story arc | **Comprehensive, multi-paragraph.** Every major internal shift across the whole narrative. Opening state, all turning points, closing state. For protagonist: 300+ words. |
| **Plot** | One plot arc | **Full arc depth.** Opening state for this thread, turning points within this thread, closing state. How does this plot specifically change this entity? 200–400 words per entity. |
| **Act / Episode** | One structural unit | **Act-open to act-close.** What happened, why it matters internally, what it costs or yields emotionally. 100–300 words per entity. |
| **Scene** | One discrete moment | **Specific and precise.** The exact change, its cause, and its emotional resonance. No vague filler. 50–150 words per entity. |
| **Shot** | One visual beat | **Only if meaningful.** Brief note on micro-changes (expression shifts, realizations). 1–2 sentences if applicable. |

### 9.2 Consistency Rules

- **Temporal continuity**: An entity's opening state at Act N must match its closing state at Act N−1.
- **Scene-to-scene continuity**: Same rule applies within an act across scenes.
- **Upward aggregation**: The sum of all scene-level changes in an act should match the act-level entity state changes.
- **Downward consistency**: A plot-level state change arc should be traceable through the acts and scenes that belong to that plot.
- **No orphan changes**: Every change recorded at the act/scene level should be motivated by events described in that node's description.

### 9.3 Character Development Requirements

At every level, character state changes must address (where applicable):

- **Insight gained**: What they now understand about themselves, others, or the world
- **Belief revision**: Which conviction, prejudice, or assumption shifted
- **Strategy shift**: How they now approach problems differently
- **Emotional residue**: The lasting feeling this interval leaves (shame, relief, resolve, grief)
- **Relationship changes**: How bonds with other characters evolved
- **Physical/medical changes**: Injuries, healing, appearance changes

### 9.4 Procedural Check: State Change Completeness

After writing entityStateChanges for any node:

```
ASSERT: Every entity identified as "important" for this node has an entry
ASSERT: No entry is empty or contains only a single vague sentence
ASSERT: Character entries address at least 2 of the 6 development dimensions above
ASSERT: Entity IDs in the dict are valid (exist in world database)
ASSERT: Opening states are consistent with the previous node's closing states
```

---

## 10. Procedural Check System

The procedural check system is the automated guardian of story quality. It fires at phase transitions and within phases to catch missing data, inconsistencies, and gaps.

### 10.1 When Checks Fire

| Trigger | What is Checked |
|---|---|
| **User says "let's work on plots"** | Pre-Plot assertions (Section 3.3) |
| **User says "let's work on acts"** | Pre-Act assertions (Section 4.3) |
| **User says "let's work on scenes"** | Pre-Scene assertions (Section 5.4) |
| **Before generating any image** | Image pre-generation checklist (Section 8.1) |
| **After completing each act** | Intra-Act assertions (Section 5.3) |
| **After completing each scene** | Scene-level assertions (Section 6.3) |
| **After all scenes in an act** | Act-completion assertions (Section 6.4) |
| **Before advancing to next act** | Previous act intra-act assertions |
| **User requests entity state changes** | State change completeness check (Section 9.4) |

### 10.2 How the Agent Should Respond to Failed Assertions

When an assertion fails:

1. **Notify clearly**: "Before we continue with [next step], I notice that [specific item] is missing/incomplete."

2. **Suggest the fix**: "I'd suggest we [specific action] first. Here's what I'd propose: [details]."

3. **Allow override**: "If you'd prefer to skip this for now and come back to it later, just say so."

4. **Track skipped items**: If the user overrides, the agent should remember the skip and re-raise it at the next natural checkpoint.

The agent should NEVER silently skip a failed assertion. The user must always be informed.

### 10.3 Assertion Categories

**Hard assertions** (should not be skipped without good reason):
- Entity referenced in commands must exist in world database
- Entity IDs in entityStateChanges must be valid
- Every scene must connect to at least one plot
- Every act must have act-plot connections
- turningPoint content must be in the turningPoint field, not in description
- Reference images must exist before generating node images that include that entity

**Soft assertions** (recommended but user can override):
- Minimum word counts for descriptions
- All mandatory profile fields populated
- Entity state changes for every identified important entity
- Story Root approval before proceeding to plots

### 10.4 Context Injection Format

When a procedural check detects missing items, it should inject a concise notification into the agent's context. Format:

```
[LIFECYCLE CHECK — Phase: {phase_name}]
Status: {N} of {M} assertions passed
Missing:
  ✗ {assertion_description} — Suggestion: {what_to_do}
  ✗ {assertion_description} — Suggestion: {what_to_do}
Passed:
  ✓ {assertion_description}
  ✓ {assertion_description}
```

---

## 11. Connection Requirements

### 11.1 Required Edges

| Edge Type | Source | Target | Data |
|---|---|---|---|
| Story Root → Plot | storyRoot | plot | (auto-created) |
| Act → Plot | act | plot | `plotInvolvement`: text describing what part of this plot unfolds in this act |
| Act → Scene | act | cowriteScene | (parent-child structure) |
| Scene → Shot | cowriteScene | shot | (parent-child structure) |
| Scene → Plot | cowriteScene | plot | Relationship showing which plot(s) this scene serves |
| Character → Character | character | character | `relationshipType`, `description`, `beginning`, `development`, `ending` |

### 11.2 Connection Assertions

```
ASSERT: Every plot is connected to the Story Root
ASSERT: Every act has at least one act-plot connection per active plot
ASSERT: Every act-plot connection has non-empty plotInvolvement
ASSERT: Every scene is connected to its parent act
ASSERT: Every scene is connected to at least 1 plot
ASSERT: Every shot (if used) is connected to its parent scene
ASSERT: No scene exists without a plot connection (no orphan scenes)
ASSERT: No plot is left without representation in at least one act
```

---

## 12. Quality Standards

### 12.1 Writing Quality Assertions

These are evaluated by the co-writing agent using its own judgment, not by mechanical field checks:

**For scene text (the prose that forms the "novel"):**
- Reads as polished, publishable prose — not a summary or outline
- Shows rather than tells (actions, dialogue, sensory details instead of abstract statements)
- Character voices are distinct (dialogue patterns, vocabulary, sentence rhythm differ between characters)
- Pacing matches the dramatic function (slow build for tension, fast cuts for action)
- Internal monologue is used sparingly and effectively
- Transitions between scenes are smooth — each scene's opening connects to the previous scene's closing without redundant recap
- No "telling the reader what to feel" — emotional impact comes from the events themselves
- Appropriate vocabulary and complexity for the target audience

**For concatenated scenes (the "chapter"):**
- The combined text of all scenes in one act should read as a coherent chapter
- No redundant information between scenes
- Escalating tension toward the act's turning point
- Clear beginning, development, and closing of the act's narrative arc

**For entity state changes:**
- Emotionally intelligent — captures the inner life, not just external events
- Dramatically interesting — highlights the changes that matter for the story's themes
- Precise — names the exact change, its cause, and its consequence
- Free of purple prose — every sentence earns its place
- Honest about uncomfortable truths — characters aren't idealized

### 12.2 Consistency Assertions

```
ASSERT: Character behavior in scenes is consistent with their profile (personality, flaws, coping_strategy)
ASSERT: Character arc in scenes matches the arc field in their profile
ASSERT: Location descriptions in scenes match the location profile (atmosphere, features)
ASSERT: Timeline is plausible — events don't happen simultaneously in different locations for the same character
ASSERT: Power dynamics respect established group structures
ASSERT: Magic/technology/concept rules established in profiles are consistently applied
ASSERT: Previously established injuries, emotional states, and relationship changes carry forward
```

---

## 13. Summary: Complete Lifecycle Sequence

```
PHASE 1 — STORY ROOT
  1.1  Title, Genre, Target Audience
  1.2  Punchline
  1.3  Main Character + Antagonist
  1.4  Supporting Characters
  1.5  Protagonist Goal
  1.6  Summary (300-500 words)
  1.7  Identify all important entities (characters, locations, objects, groups, concepts)
  1.8  Create entities in world database with full profiles
  1.9  Generate reference images for all entities
  1.10 Generate Story Root image
  1.11 Write entity state changes (story-level) for all important entities
  1.12 User approval
  ── PRE-PLOT GATE ──

PHASE 2 — PLOT DEFINITION
  2.1  Propose full set of plots (number and nature)
  2.2  User confirms plot set
  2.3  For each plot:
       a. Name and type
       b. Description (500-800 words)
       c. Identify important entities for this plot
       d. Write entity state changes (plot-level)
       e. Generate plot image (with reference images)
  ── PRE-ACT GATE ──

PHASE 3 — ACT / EPISODE STRUCTURE
  3.1  Propose act/episode count and high-level plan
  3.2  User confirms structure
  3.3  Create all act/episode nodes
  3.4  For each act (in order):
       a. Name
       b. Description (300-500 words)
       c. Turning point / Cliffhanger (in turningPoint field)
       d. Act-plot connections (all plots, with plotInvolvement)
       e. Identify important entities for this act
       f. Write entity state changes (act-level)
       g. Generate act image (with reference images)
       h. Run intra-act assertions
  ── PRE-SCENE GATE ──

PHASE 4 — SCENE BREAKDOWN
  4.1  For each act (in order):
       a. Propose scene count, sequence, and plot assignments
       b. User confirms scene plan
       c. Create all scene nodes, connect to parent act
       d. For each scene (in order):
          i.   Title
          ii.  Description / Scene Action (200-500 words, novel-quality prose)
          iii. Entity participation (entities array)
          iv.  Scene-plot connections (at least 1 plot per scene)
          v.   Entity state changes (scene-level)
          vi.  Scene image (with reference images)
          vii. Run scene-level assertions
       e. Run act-completion assertions

PHASE 5 — SHOT STORYBOARD (optional)
  5.1  User chooses novel mode or storyboard mode
  5.2  For each scene:
       a. Determine shot count and composition
       b. For each shot:
          i.   Title
          ii.  Description (camera angle, action, dialogue, sound)
          iii. Entity state changes (only if meaningful)
          iv.  Shot image (with reference images)
       c. Run shot-level assertions
```

---

## 14. Entity Lifecycle Quick Reference

| When | Action | Target |
|---|---|---|
| Phase 1.7 | Identify entity | All categories |
| Phase 1.8 | Create entity + full profile | `create_entity` + `set_entity_profile` |
| Phase 1.9 | Generate reference image | `generate_entity_image` (portrait for characters) |
| Phase 2.3c | Identify plot-relevant entities | May discover new entities → create them |
| Phase 3.4e | Identify act-relevant entities | May discover new entities → create them |
| Phase 4.1d.iii | Add entities to scene participation | Use existing entity IDs |
| Any image generation | Assert reference images exist | Generate if missing |
| Any profile gap discovered | Complete the profile | `patch_entity_profile` or `set_entity_profile` |
| Any reference image gap discovered | Generate the image | `generate_entity_image` |

---

*This lifecycle document is the authoritative reference for Dream-E's co-writing mode. The system prompt, procedural checks, and agent behavior should all conform to this specification.*
