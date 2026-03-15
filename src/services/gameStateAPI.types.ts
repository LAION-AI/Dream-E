/**
 * =============================================================================
 * GAME STATE API — Type Definitions
 * =============================================================================
 *
 * Shared types for the Game State API command system.
 * Used by the registry (metadata), the executor (handlers), and the prompt
 * generator.
 *
 * =============================================================================
 */

/**
 * Every API command returns this discriminated union.
 * On success: { success: true, ...data }
 * On error:   { success: false, error: string, suggestion?: string }
 */
export type APIResult =
  | ({ success: true } & Record<string, unknown>)
  | { success: false; error: string; suggestion?: string };

/**
 * Metadata for a single API command.
 * Drives auto-generation of the system prompt documentation.
 */
export interface CommandMeta {
  name: string;
  group: 'scenes' | 'connections' | 'entities' | 'variables' | 'media' | 'modifiers' | 'branches' | 'comments' | 'project' | 'query' | 'music';
  description: string;
  params: ParamDef[];
  returns: string;
  notes?: string;
}

/**
 * Schema for a single parameter of a command.
 */
export interface ParamDef {
  name: string;
  type: string;
  required: boolean;
  description: string;
  validValues?: string[];
  defaultValue?: unknown;
}

/**
 * Custom error class that carries a suggestion for the agent.
 * When thrown inside a command handler, the suggestion is included
 * in the error result so the agent can self-correct.
 */
export class ValidationError extends Error {
  suggestion?: string;
  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = 'ValidationError';
    this.suggestion = suggestion;
  }
}
