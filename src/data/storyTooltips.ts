/**
 * =============================================================================
 * STORY TOOLTIPS — Educational Content for Co-Writing Mode
 * =============================================================================
 *
 * Each tooltip explains a storytelling concept to help writers understand
 * narrative structure, character archetypes, and plot mechanics.
 *
 * These tooltips appear as small info icons next to form fields in the
 * co-writing canvas. Clicking the icon shows a popover with the explanation.
 *
 * WHY DOES THIS EXIST?
 * Co-writing mode is designed to be approachable for writers who may not
 * have formal training in story structure. These tooltips act as an
 * embedded writing coach, teaching concepts in context rather than
 * requiring users to read a separate manual.
 *
 * =============================================================================
 */

export const STORY_TOOLTIPS = {
  // ==================== Story Root fields ====================

  title: 'The working title of your story. A good title hints at the theme, tone, or central conflict. It can always be changed later.',
  genre: 'The primary genre (e.g., Fantasy, Sci-Fi, Romance, Thriller, Literary Fiction, Horror, Mystery). Genre sets reader expectations for tone, pacing, and story conventions.',
  targetAudience: 'Who is this story for? (e.g., Young Adult, Adult, Middle Grade, New Adult). This affects language complexity, theme maturity, and content boundaries.',
  punchline: 'Also called a "logline" or "elevator pitch" — capture your entire story in 1-2 sentences. Formula: [Character] must [Goal] before [Stakes/Deadline], but [Obstacle]. Example: "A hobbit must destroy an ancient ring in a distant volcano before a dark lord recovers it, but the ring slowly corrupts anyone who carries it."',
  mainCharacter: 'The protagonist — the character whose journey drives the story. They should have a clear want (external goal) and a need (internal growth). The reader experiences the story primarily through them.',
  antagonist: 'The primary opposing force. This can be a villain, a rival, nature, society, or even the protagonist\'s own flaws. The best antagonists believe they\'re the hero of their own story and have understandable motivations.',
  supportingCharacters: 'Characters who help, hinder, or reflect the protagonist. Each should serve a narrative function (mentor, comic relief, love interest) AND feel like a real person with their own desires.',
  protagonistGoal: 'The one clear, concrete objective that the protagonist pursues throughout the story. This is what launches the plot (Act 1) and what gets resolved at the climax (Act 3). Make it specific and measurable — the reader should know when it\'s achieved or failed.',
  summary: 'A 300-500 word overview of the entire story from beginning to end, including the ending. This is your roadmap — it doesn\'t need to be polished prose. Cover: the hook (what draws the reader in), the rising action (escalating conflicts), the midpoint shift, the crisis/climax, and the resolution.',

  // ==================== Archetype explanations ====================

  archetypes: {
    Sidekick: 'The loyal companion who supports the protagonist. They often provide humor, practical skills, or emotional grounding. (e.g., Samwise Gamgee, Ron Weasley)',
    Mentor: 'A wise guide who teaches the protagonist essential skills or truths. Often removed from the story to force the hero to act independently. (e.g., Gandalf, Obi-Wan Kenobi)',
    'Love Interest': 'A character who forms a romantic connection with the protagonist. The best love interests have their own goals and agency beyond the romance.',
    Rival: 'A competitor who pushes the protagonist to grow. Unlike the antagonist, a rival often shares the protagonist\'s goals but competes for the same prize.',
    'Comic Relief': 'A character who lightens the mood and provides humor. The best comic relief characters also have genuine emotional depth beneath the jokes.',
    Guardian: 'A protector figure who shields the protagonist, often at great personal cost. They represent safety and stability in a dangerous world.',
    Herald: 'The character or event that announces change and kicks off the adventure. They deliver the "call to adventure" that disrupts the protagonist\'s ordinary world.',
    Trickster: 'A clever, morally ambiguous character who disrupts the status quo through wit, deception, or chaos. They challenge authority and rigid thinking.',
    Shapeshifter: 'A character whose loyalty or nature is uncertain. They keep the protagonist (and reader) guessing — are they friend or foe? Their true nature is revealed at a crucial moment.',
    'Threshold Guardian': 'A character who tests the protagonist before they can advance. They guard transitions between story phases and must be overcome or won over.',
  },

  // ==================== Plot type explanations ====================

  plotTypes: {
    'Main Plot': 'The central storyline driven by the protagonist\'s primary goal. In "The Lord of the Rings," it\'s destroying the One Ring. Every other plot connects to or contrasts with this one. It typically follows: Goal \u2192 Obstacles \u2192 Escalation \u2192 Crisis \u2192 Climax \u2192 Resolution.',
    'Relationship Plot': 'A storyline about a key relationship — romantic, familial, or friendship. It runs parallel to the main plot and often provides the emotional core. The protagonist\'s internal growth is frequently reflected through this relationship.',
    'Antagonist Plot': 'The storyline told from the antagonist\'s perspective. What are they doing while the protagonist acts? Their plot should escalate in parallel, creating increasing pressure. The best stories show the antagonist as a mirror or dark reflection of the protagonist.',
    'Character Development Plot': 'An internal arc where a character overcomes a flaw, learns a truth, or transforms. This is the "need" vs "want" — what the character thinks they need vs what they actually need to grow.',
    Subplot: 'A secondary storyline that enriches the world or themes. Good subplots echo the main plot\'s themes in a different key — e.g., if the main plot is about trust, a subplot might show a minor character learning to trust.',
    Custom: 'A plot arc that doesn\'t fit the standard categories. This could be a mystery thread, a political intrigue, a quest-within-a-quest, or any other narrative through-line you want to track.',
  },

  // ==================== General tooltips ====================

  plotNode: 'A plot is a chain of causally connected events. Each event leads to the next through cause and effect: "Because X happened, Y happened, which caused Z." A good plot creates questions in the reader\'s mind and answers them in surprising but inevitable ways.',
  characterNode: 'Each character node represents a character in your story. Connect characters with relationship edges to map out their dynamics. Changes here sync with the entity system.',
  relationship: 'Relationships are the emotional engine of stories. Define how characters feel about each other, what they want from each other, and how their dynamic changes over time. Conflict between characters is what makes scenes dramatic.',

  // ==================== Act-related tooltips ====================

  act: 'An act is a major structural division of your story. The classic three-act structure divides a story into Setup (Act 1, ~25%), Confrontation (Act 2, ~50%), and Resolution (Act 3, ~25%). Each act has a distinct purpose and ends with a major turning point that propels the story forward. You can use more acts for finer-grained pacing.',

  actPlotRelationship: 'This connection defines which parts of a plot arc play out during a specific act. For example, Act 1 might introduce the mystery (Mystery Plot) and establish the love interest (Relationship Plot), while Act 2 deepens both with complications and reveals. Mapping plots to acts helps you visualize pacing — if all your plot developments are crammed into one act, the others may feel thin.',

  // ==================== Relationship development tooltips ====================

  relationshipBeginning: 'How is this relationship at the very start of the story? What is the status quo before events force it to change? This establishes the baseline the audience measures all future changes against. A strong beginning makes every subsequent shift feel earned.',

  relationshipEnding: 'How is this relationship at the end of the story? Has it deepened, broken, reversed, or reached a new understanding? The ending should feel like a natural consequence of everything that happened — surprising yet inevitable. Compare it to the beginning to see the arc.',

  actDevelopment: 'Track how this relationship evolves through each act of the story. Relationships should change — new information, betrayals, shared ordeals, and revelations all reshape how characters feel about each other. Each act should bring at least one significant shift in the relationship dynamic.',

  // ==================== Character type tooltips ====================

  characterType: 'The narrative role this character serves in the story. Each archetype comes with audience expectations — a Mentor teaches wisdom, a Trickster disrupts the status quo, an Anti-hero walks the moral gray zone. Knowing the archetype helps you write consistent behavior while also knowing when to subvert expectations.',

  characterTypes: {
    Protagonist: 'The central character whose journey drives the story. The audience experiences the narrative primarily through their perspective. They must have a clear external goal (what they want) and an internal need (what they must learn or overcome).',
    Antagonist: 'The primary force opposing the protagonist. The best antagonists have understandable motivations and believe they are justified. They serve as a dark mirror reflecting what the protagonist could become.',
    Sidekick: 'The loyal companion who supports the protagonist. They often provide humor, practical skills, or emotional grounding. (e.g., Samwise Gamgee, Ron Weasley)',
    Mentor: 'A wise guide who teaches the protagonist essential skills or truths. Often removed from the story to force the hero to act independently. (e.g., Gandalf, Obi-Wan Kenobi)',
    'Love Interest': 'A character who forms a romantic connection with the protagonist. The best love interests have their own goals and agency beyond the romance.',
    Rival: 'A competitor who pushes the protagonist to grow. Unlike the antagonist, a rival often shares the protagonist\'s goals but competes for the same prize.',
    'Comic Relief': 'A character who lightens the mood and provides humor. The best comic relief characters also have genuine emotional depth beneath the jokes.',
    Guardian: 'A protector figure who shields the protagonist, often at great personal cost. They represent safety and stability in a dangerous world.',
    Herald: 'The character or event that announces change and kicks off the adventure. They deliver the "call to adventure" that disrupts the protagonist\'s ordinary world.',
    Trickster: 'A clever, morally ambiguous character who disrupts the status quo through wit, deception, or chaos. They challenge authority and rigid thinking.',
    Shapeshifter: 'A character whose loyalty or nature is uncertain. They keep the protagonist (and reader) guessing — are they friend or foe? Their true nature is revealed at a crucial moment.',
    'Threshold Guardian': 'A character who tests the protagonist before they can advance. They guard transitions between story phases and must be overcome or won over.',
    'Anti-hero': 'A protagonist who lacks conventional heroic qualities — they may be morally ambiguous, selfish, or use questionable methods. Their appeal lies in complexity: they do the right thing for the wrong reasons, or the wrong thing for understandable reasons. (e.g., Walter White, Deadpool)',
    Foil: 'A character designed to contrast with the protagonist, highlighting the hero\'s traits through opposition. A foil doesn\'t have to be an enemy — they can be a friend whose different approach to the same problem illuminates the protagonist\'s strengths and weaknesses.',
  },

  // ==================== Reference voice tooltip ====================

  referenceVoice: 'Upload an audio clip of this character\'s voice. This reference is used by the TTS (text-to-speech) engine to match the voice identity when generating voiceovers. A 10-30 second clip with clear speech works best.',
} as const;
