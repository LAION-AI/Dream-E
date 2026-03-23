/**
 * =============================================================================
 * NODE TYPE DEFINITIONS
 * =============================================================================
 *
 * This file defines the TypeScript interfaces for all node types in Dream-E.
 *
 * WHAT ARE NODES?
 * Nodes are the building blocks of a story. They appear as boxes on the canvas
 * that users can connect together. There are four types:
 *
 * 1. SCENE NODE (Blue) - Displays story content to the player
 *    - Shows background image, text, and choices
 *    - The game "pauses" here waiting for player input
 *
 * 2. CHOICE NODE (Yellow) - Makes decisions based on conditions
 *    - Checks if a condition is true or false
 *    - Routes the flow to "Success" or "Failure" path
 *
 * 3. MODIFIER NODE (Green) - Changes variable values
 *    - Can do math (add, subtract, multiply, divide)
 *    - Can set values directly
 *    - Can generate random numbers
 *
 * 4. COMMENT NODE (Gray) - For designer notes
 *    - Doesn't affect gameplay
 *    - Helps organize and document the story
 *
 * =============================================================================
 */

/**
 * POSITION INTERFACE
 * Represents a 2D position on the canvas.
 *
 * WHY SEPARATE THIS?
 * Many things have positions (nodes, the viewport, mouse cursor).
 * Having a reusable Position type ensures consistency.
 */
export interface Position {
  /** X coordinate (horizontal position from left edge) */
  x: number;
  /** Y coordinate (vertical position from top edge) */
  y: number;
}

/**
 * BASE NODE INTERFACE
 * Properties shared by ALL node types.
 *
 * WHY USE A BASE INTERFACE?
 * All nodes have an ID, position, and label. Instead of repeating
 * these in each node type, we define them once here.
 *
 * The "extends BaseNode" syntax means "include everything from BaseNode
 * plus these additional properties."
 */
export interface BaseNode {
  /**
   * Unique identifier for this node.
   * Format: "node_" + UUID (e.g., "node_abc123def456")
   *
   * WHY UNIQUE IDs?
   * - To find specific nodes in the collection
   * - To define connections between nodes
   * - To track which node the player is currently on
   */
  id: string;

  /**
   * The node type determines its behavior and appearance.
   * This is a "discriminated union" - it helps TypeScript
   * narrow down which node type we're working with.
   */
  type: 'scene' | 'choice' | 'modifier' | 'comment' | 'storyRoot' | 'plot' | 'character';

  /**
   * Position on the canvas.
   * (0, 0) is the top-left corner.
   * X increases going right, Y increases going down.
   */
  position: Position;

  /**
   * Display label shown on the node.
   * Users can edit this to describe what the node does.
   * Example: "Opening Scene", "Check Intelligence", "Apply Damage"
   */
  label: string;
}

/**
 * SCENE CHOICE INTERFACE
 * Represents a single choice button in a Scene Node.
 *
 * EXAMPLE:
 * A scene showing a fork in the road might have choices:
 * - "Take the left path"
 * - "Take the right path"
 * - "Wait and observe" (only if player has "Perception" > 5)
 */
export interface SceneChoice {
  /**
   * Unique identifier for this choice.
   * Used to identify which choice the player selected.
   */
  id: string;

  /**
   * Text displayed on the button.
   * Should be concise and clearly describe the action.
   */
  label: string;

  /**
   * Optional icon to display next to the text.
   * Can be an emoji or icon name (e.g., "sword", "shield")
   */
  icon?: string;

  /**
   * Optional condition for visibility.
   * If set, the choice only appears when the condition is true.
   *
   * EXAMPLE USE CASES:
   * - "Only show 'Pick the lock' if player has lockpicks"
   * - "Only show 'Cast fireball' if player has enough mana"
   * - "Only show 'Persuade' if charisma > 10"
   */
  condition?: Condition;

  /**
   * Whether the choice should be shown but disabled (grayed out)
   * when the condition is not met.
   *
   * If true: Show button but grayed out with lock icon
   * If false: Hide the button completely
   */
  showWhenLocked?: boolean;

  /**
   * Text to display when hovering over a locked choice.
   * Tells the player why they can't select this option.
   * Example: "Requires: Hacking Tool"
   */
  lockedTooltip?: string;
}

/**
 * CONDITION INTERFACE
 * Defines a logical comparison between values.
 *
 * HOW CONDITIONS WORK:
 * A condition compares a variable to a value using an operator.
 *
 * Structure: [Variable A] [Operator] [Value B]
 * Example: "Player_Health" > 50
 * Example: "Has_Key" = true
 * Example: "Inventory" contains "Sword"
 */
export interface Condition {
  /**
   * Name of the variable to check.
   * Must match a variable defined in globalVariables.
   */
  variableA: string;

  /**
   * Comparison operator.
   * - '>' : Greater than (numbers)
   * - '<' : Less than (numbers)
   * - '=' : Equals (any type)
   * - '!=' : Not equals (any type)
   * - '>=' : Greater than or equal (numbers)
   * - '<=' : Less than or equal (numbers)
   * - 'contains' : List contains item (for collections/inventory)
   */
  operator: '>' | '<' | '=' | '!=' | '>=' | '<=' | 'contains';

  /**
   * Value to compare against.
   * Can be a literal value or a variable reference.
   */
  valueB: string | number | boolean;

  /**
   * If true, valueB is treated as a variable name, not a literal.
   *
   * EXAMPLE:
   * useVariable = false, valueB = 50 -> Compare to number 50
   * useVariable = true, valueB = "Max_Health" -> Compare to variable's value
   */
  useVariable: boolean;
}

/**
 * SCENE NODE INTERFACE
 * A node that displays content and waits for player input.
 *
 * THIS IS THE MOST IMPORTANT NODE TYPE:
 * - It's the only node where the game "pauses"
 * - It shows the story to the player
 * - It presents choices for the player to select
 */
export interface SceneNode extends BaseNode {
  /** Identifies this as a scene node */
  type: 'scene';

  /** Scene-specific data */
  data: {
    // ==================== MEDIA TAB ====================

    /**
     * Background image displayed behind the scene.
     * Can be a URL, blob URL, or asset ID.
     */
    backgroundImage?: string;

    /**
     * Background music that plays during this scene.
     * References an asset ID from the asset manager.
     */
    backgroundMusic?: string;

    /**
     * If true, the music continues to the next scene
     * instead of stopping.
     */
    musicKeepPlaying: boolean;

    /**
     * One-shot audio for voiceover or sound effects.
     * Plays once when the scene loads.
     */
    voiceoverAudio?: string;

    /**
     * If true, voiceover starts automatically.
     * If false, player clicks a button to hear it.
     */
    voiceoverAutoplay: boolean;

    // ==================== CONTENT TAB ====================

    /**
     * Name of the character speaking (optional).
     * Displayed above the story text.
     * Example: "Narrator", "Guard Captain", "????"
     */
    speakerName?: string;

    /**
     * The main story text.
     * This is what the player reads.
     * Can include basic formatting (bold, italic).
     */
    storyText: string;

    // ==================== WORLD REFERENCES ====================

    /**
     * IDs of characters that appear in or are relevant to this scene.
     * Even if a character is just mentioned by another, they should be linked.
     */
    linkedCharacters?: string[];

    /**
     * IDs of locations that appear in or are relevant to this scene.
     * A location can be relevant even if the scene doesn't take place there.
     */
    linkedLocations?: string[];

    /**
     * IDs of objects that appear in or are relevant to this scene.
     */
    linkedObjects?: string[];

    /**
     * IDs of game concepts relevant to this scene (magic, factions, rules, etc.).
     */
    linkedConcepts?: string[];

    /**
     * Situational attributes for entities in this scene.
     * Maps an entity ID to a freeform text describing the entity's state,
     * condition, mood, or any scene-specific attributes AT THE BEGINNING
     * of this scene. Changes that occur during the scene should be
     * reflected in the next scene where the entity appears.
     *
     * Example: { "entity_abc123": "Wounded, suspicious, carrying a hidden dagger" }
     */
    entityStates?: Record<string, string>;

    // ==================== SUMMARY ====================

    /**
     * Auto-generated condensed summary of the scene (~20% of original).
     * Captures key events, state changes, and entity interactions.
     * Used by the Open World context builder to compress the story path
     * when the full text would exceed the token budget.
     */
    summary?: string;

    // ==================== AI RESPONSE ====================

    /**
     * Raw JSON response from the scene-writing AI model.
     * Stored for debugging, manual inspection, and so the AI can
     * reference its previous analysis (flow analysis, engagement strategy)
     * when generating subsequent scenes.
     * Only present on scenes created by Open World mode.
     */
    aiResponse?: string;

    /**
     * Full context (system prompt + user message) sent to the AI model
     * to generate this scene. Stored for debugging.
     * @deprecated Use constructedContext + constructedSystemPrompt instead.
     */
    aiContext?: string;

    /**
     * The full user message (assembled context) that was sent to the AI model.
     * Contains: notes, entity summaries, story timeline, variables, player action, instruction.
     * Stored so users can inspect exactly what the LM saw when it wrote the scene.
     */
    constructedContext?: string;

    /**
     * The system prompt that was sent to the AI model for this scene.
     * Comes from WriterSettings (user-editable in AI Settings).
     */
    constructedSystemPrompt?: string;

    /**
     * The exact text of the user prompt or choice that led to this scene being created.
     * Used to provide the exact wording of the player action in the Open World context timeline.
     * Only present on scenes created by Open World mode.
     */
    playerAction?: string;

    // ==================== OUTPUTS TAB ====================

    /**
     * List of choice buttons.
     * Each choice can connect to a different next node.
     * Empty array means no choices (dead end or auto-continue).
     */
    choices: SceneChoice[];
  };
}

/**
 * CHOICE NODE INTERFACE
 * A node that branches the story based on a condition.
 *
 * HOW IT WORKS:
 * 1. Evaluates the condition (e.g., "Is HP > 50?")
 * 2. If TRUE, follows the "Success" output
 * 3. If FALSE, follows the "Failure" output
 *
 * IMPORTANT: This node is "invisible" to players.
 * The game instantly evaluates and moves on.
 * Players only see Scene Nodes.
 */
export interface ChoiceNode extends BaseNode {
  /** Identifies this as a choice node */
  type: 'choice';

  /** Choice-specific data */
  data: {
    /**
     * The condition to evaluate.
     * Determines which output path to follow.
     */
    condition: Condition;
  };
}

/**
 * MODIFIER MODE TYPE
 * The three modes a Modifier Node can operate in.
 */
export type ModifierMode = 'math' | 'set' | 'random';

/**
 * MATH OPERATION TYPE
 * Operations available in Math mode.
 */
export type MathOperation = 'add' | 'subtract' | 'multiply' | 'divide';

/**
 * MODIFIER NODE INTERFACE
 * A node that changes variable values.
 *
 * THREE MODES:
 *
 * 1. MATH MODE - Perform arithmetic
 *    Example: HP = HP - 20 (subtract 20 from HP)
 *
 * 2. SET MODE - Assign a value directly
 *    Example: HasKey = true (set a flag)
 *
 * 3. RANDOM MODE - Generate a random number
 *    Example: DiceRoll = Random(1, 20)
 *
 * IMPORTANT: This node is also "invisible" to players.
 * Changes happen instantly, then the game continues.
 */
export interface ModifierNode extends BaseNode {
  /** Identifies this as a modifier node */
  type: 'modifier';

  /** Modifier-specific data */
  data: {
    /**
     * Which mode the modifier operates in.
     */
    mode: ModifierMode;

    /**
     * Name of the variable to modify.
     * Must match a variable in globalVariables.
     */
    targetVariable: string;

    // ==================== MATH MODE PROPERTIES ====================

    /**
     * Mathematical operation to perform.
     * Only used when mode = 'math'.
     */
    mathOperation?: MathOperation;

    /**
     * Value for math operation.
     * Can be a number or a variable name (as string).
     * Only used when mode = 'math'.
     */
    mathValue?: number | string;

    /**
     * If true, mathValue is a variable name.
     * If false, mathValue is a literal number.
     */
    mathValueIsVariable?: boolean;

    // ==================== SET MODE PROPERTIES ====================

    /**
     * Value to assign to the variable.
     * Only used when mode = 'set'.
     */
    setValue?: string | number | boolean;

    /**
     * If true, setValue is a variable name.
     * If false, setValue is a literal value.
     */
    setValueIsVariable?: boolean;

    // ==================== RANDOM MODE PROPERTIES ====================

    /**
     * Minimum value for random number (inclusive).
     * Only used when mode = 'random'.
     */
    randomMin?: number;

    /**
     * Maximum value for random number (inclusive).
     * Only used when mode = 'random'.
     */
    randomMax?: number;
  };
}

/**
 * COMMENT NODE INTERFACE
 * A node for designer notes and organization.
 *
 * DOES NOT affect gameplay. Players never see these.
 * Useful for:
 * - Explaining complex logic
 * - Leaving TODO notes
 * - Organizing sections of the story
 */
export interface CommentNode extends BaseNode {
  /** Identifies this as a comment node */
  type: 'comment';

  /** Comment-specific data */
  data: {
    /**
     * The comment text.
     * Can be multiple lines.
     */
    text: string;

    /**
     * Background color for the comment.
     * Helps visually categorize notes.
     * Format: Hex color (e.g., "#ffeb3b")
     */
    color: string;
  };
}

/** Data for the story root node — the central node of a co-writing project */
export interface StoryRootNodeData {
  title: string;
  genre: string;
  targetAudience: string;
  punchline: string;
  mainCharacter: { name: string; role: string };
  antagonist: { name: string; role: string };
  supportingCharacters: Array<{ name: string; archetype: string; customArchetype?: string }>;
  protagonistGoal: string;
  summary: string;
  image?: string;
}

export interface StoryRootNode extends BaseNode {
  type: 'storyRoot';
  data: StoryRootNodeData;
}

/** Data for a plot node — represents a narrative arc */
export interface PlotNodeData {
  name: string;
  plotType: string;
  customPlotType?: string;
  description: string;
  image?: string;
}

export interface PlotNode extends BaseNode {
  type: 'plot';
  data: PlotNodeData;
}

/** Data for a character node on the character canvas — links to an entity */
export interface CharacterNodeData {
  entityId: string;
}

export interface CharacterNode extends BaseNode {
  type: 'character';
  data: CharacterNodeData;
}

/** Data stored on relationship edges between character nodes */
export interface RelationshipEdgeData {
  relationshipType: string;
  description: string;
  status: string;
  history: string;
  /** If a relationship entity was created, its ID */
  entityId?: string;
}

/**
 * STORY NODE UNION TYPE
 * Any of the four node types.
 *
 * WHY UNION TYPES?
 * When we have an array of mixed nodes, we need a type that
 * can represent any node. TypeScript will narrow this down
 * based on the 'type' property.
 *
 * EXAMPLE:
 * function processNode(node: StoryNode) {
 *   if (node.type === 'scene') {
 *     // TypeScript knows node.data.storyText exists here
 *   }
 * }
 */
export type StoryNode = SceneNode | ChoiceNode | ModifierNode | CommentNode | StoryRootNode | PlotNode | CharacterNode;

/**
 * EDGE INTERFACE
 * Represents a connection between two nodes.
 *
 * EDGES ARE THE "WIRES":
 * - They define the flow of the story
 * - Each edge goes from one node's output to another node's input
 * - Scene Nodes can have multiple outputs (one per choice)
 * - Choice Nodes have two outputs (Success, Failure)
 * - Modifier Nodes have one output (continues to next)
 */
export interface StoryEdge {
  /**
   * Unique identifier for this edge.
   * Format: "edge_" + UUID
   */
  id: string;

  /**
   * ID of the source node (where the edge starts).
   */
  source: string;

  /**
   * Which output of the source node this edge connects to.
   * - 'default': Standard output (Modifier nodes)
   * - 'success': True path (Choice nodes)
   * - 'failure': False path (Choice nodes)
   * - Choice ID: Specific choice button (Scene nodes)
   */
  sourceHandle?: string;

  /**
   * ID of the target node (where the edge ends).
   */
  target: string;

  /**
   * Which input of the target node this edge connects to.
   * Usually 'input' for most nodes.
   */
  targetHandle: string;

  /**
   * If true, shows an animation on the edge.
   * Useful for visualizing the flow during testing.
   */
  animated?: boolean;

  /**
   * Custom styling for the edge.
   * Most commonly used to set the stroke color.
   */
  style?: {
    /** Line color (CSS color value) */
    stroke?: string;
    /** Line width in pixels */
    strokeWidth?: number;
  };

  /**
   * Optional edge type for custom edge rendering.
   * - undefined / omitted: default React Flow edge renderer
   * - 'relationship': RelationshipEdge component (dashed pink bezier + label)
   */
  type?: string;

  /**
   * Optional relationship data for edges between character nodes.
   * Only present on edges in the character canvas that represent
   * interpersonal relationships.
   */
  data?: RelationshipEdgeData;
}

/**
 * NODE HANDLE POSITION TYPE
 * Where connection handles appear on nodes.
 */
export type HandlePosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * NODE HANDLE TYPE
 * Whether a handle is for input or output.
 */
export type HandleType = 'source' | 'target';

/**
 * NODE HANDLE INTERFACE
 * Defines a connection point on a node.
 */
export interface NodeHandle {
  /** Unique ID for this handle within the node */
  id: string;
  /** Whether this is an input or output */
  type: HandleType;
  /** Where the handle appears on the node */
  position: HandlePosition;
  /** Optional label shown near the handle */
  label?: string;
  /** Color of the handle dot */
  color?: string;
}
