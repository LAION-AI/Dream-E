/**
 * =============================================================================
 * VARIABLE TYPE DEFINITIONS
 * =============================================================================
 *
 * This file defines types for the variable system in Dream-E.
 *
 * WHAT ARE VARIABLES?
 * Variables store data that persists throughout the game:
 * - Player stats (HP, Mana, Strength)
 * - Flags (HasKey, DoorOpened, MetThePrince)
 * - Counters (Gold, DaysElapsed, EnemiesDefeated)
 * - Collections (Inventory items, Discovered locations)
 *
 * WHY VARIABLES MATTER:
 * Variables enable complex game logic:
 * - "If HP < 20, show 'You feel weak' message"
 * - "Add 'Ancient Sword' to inventory"
 * - "If 'MetThePrince' is true, unlock new dialogue options"
 *
 * =============================================================================
 */

/**
 * VARIABLE TYPE ENUM
 * The different data types a variable can hold.
 *
 * WHY TYPES MATTER:
 * Different variable types support different operations:
 * - Numbers can be added, subtracted, compared
 * - Booleans can be toggled, checked
 * - Strings can be displayed, compared
 * - Collections can have items added/removed
 */
export type VariableType = 'integer' | 'float' | 'boolean' | 'string' | 'collection';

/**
 * VARIABLE VALUE TYPE
 * The possible values a variable can hold.
 *
 * This is a union type - a variable's actual value
 * will be ONE of these types based on its VariableType.
 */
export type VariableValue = number | boolean | string | string[];

/**
 * HUD ICON TYPE
 * Icons available for displaying variables in the HUD.
 *
 * These are semantic names that map to actual icons.
 * The player UI will render the appropriate icon based on this.
 */
export type HudIcon =
  | 'heart'      // For health
  | 'mana'       // For magic points
  | 'energy'     // For stamina/energy
  | 'coin'       // For currency
  | 'star'       // For experience/score
  | 'shield'     // For defense/armor
  | 'sword'      // For attack power
  | 'clock'      // For time-based stats
  | 'brain'      // For intelligence
  | 'muscle'     // For strength
  | 'eye'        // For perception
  | 'chat'       // For charisma
  | 'custom';    // Custom icon (uses iconUrl)

/**
 * VARIABLE INTERFACE
 * Defines a single variable in the game.
 *
 * Variables are defined globally and can be:
 * - Read by conditions (Choice nodes, Scene choice visibility)
 * - Modified by Modifier nodes
 * - Displayed in the HUD
 */
export interface Variable {
  /**
   * Unique identifier for this variable.
   * Format: "var_" + UUID
   */
  id: string;

  /**
   * Display name of the variable.
   * Used in the editor and can be shown in the HUD.
   * Should be descriptive: "Player_Health", "Gold", "Has_Key"
   */
  name: string;

  /**
   * The data type of this variable.
   * Determines what operations are valid.
   */
  type: VariableType;

  /**
   * Initial value when a new game starts.
   * Must match the variable's type:
   * - integer/float: number
   * - boolean: true/false
   * - string: text
   * - collection: array of strings
   */
  defaultValue: VariableValue;

  /**
   * Whether to display this variable in the player HUD.
   * Typically used for important stats like HP, Mana, Gold.
   */
  showInHUD: boolean;

  /**
   * Icon to display next to the variable in the HUD.
   * Only used if showInHUD is true.
   */
  hudIcon?: HudIcon;

  /**
   * URL to a custom icon image.
   * Only used when hudIcon is 'custom'.
   */
  customIconUrl?: string;

  /**
   * Maximum value for this variable (for numbers).
   * Used to display progress bars in the HUD.
   * Example: HP might have max 100, displayed as "85/100"
   */
  maxValue?: number;

  /**
   * Minimum value for this variable (for numbers).
   * The engine will clamp values to this minimum.
   * Example: HP minimum 0 (can't go negative)
   */
  minValue?: number;

  /**
   * Color for the HUD display.
   * Used for progress bars and badges.
   * Format: CSS color (hex, rgb, or named)
   */
  hudColor?: string;

  /**
   * Description for the editor.
   * Helps story designers understand the variable's purpose.
   */
  description?: string;

  /**
   * Category for organizing variables.
   * Examples: "Stats", "Flags", "Inventory", "Quest"
   */
  category?: string;
}

/**
 * VARIABLE OPERATION TYPE
 * Operations that can be performed on variables.
 */
export type VariableOperation =
  | 'add'        // Add to number
  | 'subtract'   // Subtract from number
  | 'multiply'   // Multiply number
  | 'divide'     // Divide number
  | 'set'        // Set to specific value
  | 'toggle'     // Toggle boolean
  | 'append'     // Add item to collection
  | 'remove'     // Remove item from collection
  | 'clear';     // Clear collection or reset to default

/**
 * VARIABLE CHANGE INTERFACE
 * Represents a change to be applied to a variable.
 *
 * This is used internally by the engine to track
 * and execute variable modifications.
 */
export interface VariableChange {
  /** ID of the variable to modify */
  variableId: string;

  /** Name of the variable (for display/debugging) */
  variableName: string;

  /** Operation to perform */
  operation: VariableOperation;

  /** Value for the operation */
  value?: VariableValue;

  /** Old value (before the change) */
  previousValue?: VariableValue;

  /** New value (after the change) */
  newValue?: VariableValue;

  /** Timestamp when the change occurred */
  timestamp: number;

  /** Which node triggered this change */
  sourceNodeId?: string;
}

/**
 * VARIABLE CONTEXT INTERFACE
 * The current state of all variables at runtime.
 *
 * This is a key-value map where:
 * - Key: Variable name (string)
 * - Value: Current value (VariableValue)
 */
export type VariableContext = Record<string, VariableValue>;

/**
 * VARIABLE VALIDATION RESULT
 * Result of validating a variable operation.
 */
export interface VariableValidationResult {
  /** Whether the operation is valid */
  isValid: boolean;

  /** Error message if invalid */
  error?: string;

  /** Warning message (valid but might cause issues) */
  warning?: string;
}

/**
 * VARIABLE TEMPLATE INTERFACE
 * Predefined variable templates for quick setup.
 *
 * These provide common variable configurations that
 * users can quickly add to their projects.
 */
export interface VariableTemplate {
  /** Template name (e.g., "RPG Health") */
  name: string;

  /** Description of what this template provides */
  description: string;

  /** Category for organizing templates */
  category: string;

  /** Variables included in this template */
  variables: Omit<Variable, 'id'>[];
}

/**
 * PREDEFINED VARIABLE TEMPLATES
 * Common variable setups for different game types.
 */
export const VARIABLE_TEMPLATES: VariableTemplate[] = [
  {
    name: 'RPG Basic Stats',
    description: 'Health, Mana, and Stamina for RPG games',
    category: 'RPG',
    variables: [
      {
        name: 'HP',
        type: 'integer',
        defaultValue: 100,
        showInHUD: true,
        hudIcon: 'heart',
        maxValue: 100,
        minValue: 0,
        hudColor: '#ef4444',
        description: 'Player health points',
        category: 'Stats',
      },
      {
        name: 'MP',
        type: 'integer',
        defaultValue: 50,
        showInHUD: true,
        hudIcon: 'mana',
        maxValue: 50,
        minValue: 0,
        hudColor: '#3b82f6',
        description: 'Magic/Mana points',
        category: 'Stats',
      },
      {
        name: 'Stamina',
        type: 'integer',
        defaultValue: 100,
        showInHUD: true,
        hudIcon: 'energy',
        maxValue: 100,
        minValue: 0,
        hudColor: '#22c55e',
        description: 'Stamina/Energy points',
        category: 'Stats',
      },
    ],
  },
  {
    name: 'Currency',
    description: 'Gold coins for economy',
    category: 'Economy',
    variables: [
      {
        name: 'Gold',
        type: 'integer',
        defaultValue: 0,
        showInHUD: true,
        hudIcon: 'coin',
        minValue: 0,
        hudColor: '#eab308',
        description: 'Player currency',
        category: 'Economy',
      },
    ],
  },
  {
    name: 'Inventory',
    description: 'Basic inventory system',
    category: 'Items',
    variables: [
      {
        name: 'Inventory',
        type: 'collection',
        defaultValue: [],
        showInHUD: false,
        description: 'List of item IDs the player owns',
        category: 'Items',
      },
    ],
  },
];
