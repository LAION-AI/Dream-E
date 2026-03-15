/**
 * =============================================================================
 * TYPE DEFINITIONS INDEX - RE-EXPORTS ALL TYPES
 * =============================================================================
 *
 * This file serves as the central export point for all TypeScript types.
 *
 * WHY USE A CENTRAL EXPORT FILE?
 * Instead of importing from multiple files:
 *   import { Project } from '@types/project';
 *   import { SceneNode } from '@types/nodes';
 *   import { GameState } from '@types/gamestate';
 *
 * You can import from one place:
 *   import { Project, SceneNode, GameState } from '@types';
 *
 * This makes imports cleaner and refactoring easier.
 *
 * =============================================================================
 */

// Export all node-related types
export * from './nodes';

// Export all project-related types
export * from './project';

// Export all variable-related types
export * from './variables';

// Export all theme-related types
export * from './themes';

// Export all game state types
export * from './gamestate';
