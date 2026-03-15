/**
 * =============================================================================
 * PROJECTS DATABASE OPERATIONS
 * =============================================================================
 *
 * This file contains all database operations for projects.
 *
 * WHAT THIS MODULE DOES:
 * - Create new projects
 * - Load existing projects
 * - Save/update projects
 * - Delete projects
 * - List all projects
 *
 * WHY SEPARATE THIS?
 * Keeping database operations in dedicated modules:
 * - Makes code easier to test
 * - Separates concerns (UI doesn't know about database details)
 * - Allows changing database implementation without affecting UI
 *
 * =============================================================================
 */

import { db, type ProjectRecord } from './database';
import type {
  Project,
  ProjectSummary,
  CreateProjectOptions,
  StoryNode,
  SceneNode,
} from '@/types';
import { createDefaultSettings, createDefaultProjectInfo } from '@/types/project';
import { generateId } from '@/utils/idGenerator';
import { rehydrateForSave } from '@/utils/blobCache';

/**
 * DEBUG LOGGER FOR DATABASE OPERATIONS
 * Logs database operations in development mode.
 *
 * @param operation - Name of the operation
 * @param data - Optional data to log
 */
function logDB(operation: string, data?: unknown): void {
  if (import.meta.env.DEV) {
    console.log(`[ProjectsDB] ${operation}`, data ?? '');
  }
}

/**
 * CREATE NEW PROJECT
 * Creates a new project in the database.
 *
 * This function:
 * 1. Generates a unique ID
 * 2. Creates default settings
 * 3. Optionally adds starter content
 * 4. Saves to database
 *
 * @param options - Project creation options
 * @returns The created project
 * @throws Error if creation fails
 */
export async function createProject(
  options: CreateProjectOptions
): Promise<Project> {
  logDB('Creating project', options);

  try {
    // Generate unique project ID
    const projectId = generateId('project');

    // Create project info with defaults
    const info = createDefaultProjectInfo(options.title);
    info.author = options.author || '';
    info.description = options.description || '';
    info.theme = options.theme || 'modern';

    // Create default settings
    const settings = createDefaultSettings();

    // Initialize empty arrays
    let nodes: StoryNode[] = [];
    let edges: never[] = [];

    // If requested, add starter content
    if (options.addStarterContent !== false) {
      const startNode = createStarterSceneNode();
      nodes = [startNode];
      settings.startNodeId = startNode.id;
    }

    // Create default variables (Health with green bar)
    const defaultVariables = [
      {
        id: generateId('var'),
        name: 'Health',
        type: 'integer' as const,
        defaultValue: 100,
        showInHUD: true,
        hudIcon: 'heart' as const,
        hudColor: '#22c55e',
        maxValue: 100,
        minValue: 0,
        description: 'Player health points',
        category: 'Stats',
      },
    ];

    // Construct the project object
    const project: Project = {
      id: projectId,
      info,
      globalVariables: defaultVariables,
      nodes,
      edges,
      settings,
    };

    // Create database record
    const record: ProjectRecord = {
      id: projectId,
      data: project,
      updatedAt: Date.now(),
    };

    // Save to database
    await db.projects.add(record);

    logDB('Project created', { id: projectId, title: options.title });

    return project;
  } catch (error) {
    console.error('[ProjectsDB] Failed to create project:', error);
    throw new Error(`Failed to create project: ${getErrorMessage(error)}`);
  }
}

/**
 * GET PROJECT BY ID
 * Retrieves a project from the database.
 *
 * @param id - Project ID
 * @returns The project, or null if not found
 * @throws Error if retrieval fails
 */
export async function getProject(id: string): Promise<Project | null> {
  logDB('Getting project', id);

  try {
    // Query database for the project
    const record = await db.projects.get(id);

    // Return null if not found (not an error)
    if (!record) {
      logDB('Project not found', id);
      return null;
    }

    logDB('Project loaded', { id, title: record.data.info.title });

    return record.data;
  } catch (error) {
    console.error('[ProjectsDB] Failed to get project:', error);
    throw new Error(`Failed to load project: ${getErrorMessage(error)}`);
  }
}

/**
 * SAVE PROJECT
 * Updates an existing project in the database.
 *
 * This function:
 * 1. Updates the modification timestamp
 * 2. Saves the entire project data
 *
 * @param project - The project to save
 * @throws Error if save fails
 */
export async function saveProject(project: Project): Promise<void> {
  logDB('Saving project', { id: project.id, title: project.info.title });

  try {
    // Update timestamp
    const updatedAt = Date.now();

    // rehydrateForSave() creates a deep clone and converts any blob URLs
    // back to base64 data URLs from the cached Blobs. After asset offloading,
    // in-memory nodes hold blob URLs (~50 bytes) instead of multi-MB base64
    // strings, so the clone is cheap. This replaces the old
    // JSON.parse(JSON.stringify(project)) which doubled memory usage.
    const projectCopy = await rehydrateForSave(project);
    projectCopy.info.updatedAt = updatedAt;

    // Create updated record
    const record: ProjectRecord = {
      id: projectCopy.id,
      data: projectCopy,
      updatedAt,
    };

    // Save to database (upsert - update or insert)
    await db.projects.put(record);

    logDB('Project saved', { id: projectCopy.id });
  } catch (error) {
    console.error('[ProjectsDB] Failed to save project:', error);
    throw new Error(`Failed to save project: ${getErrorMessage(error)}`);
  }
}

/**
 * DELETE PROJECT
 * Removes a project and all its associated data from the database.
 *
 * This function also deletes:
 * - All assets belonging to the project
 * - All saves belonging to the project
 *
 * @param id - Project ID to delete
 * @throws Error if deletion fails
 */
export async function deleteProject(id: string): Promise<void> {
  logDB('Deleting project', id);

  try {
    // Use a transaction to delete project and related data atomically
    await db.transaction('rw', [db.projects, db.assets, db.saves], async () => {
      // Delete the project
      await db.projects.delete(id);

      // Delete all assets for this project
      await db.assets.where('projectId').equals(id).delete();

      // Delete all saves for this project
      await db.saves.where('projectId').equals(id).delete();
    });

    logDB('Project deleted', id);
  } catch (error) {
    console.error('[ProjectsDB] Failed to delete project:', error);
    throw new Error(`Failed to delete project: ${getErrorMessage(error)}`);
  }
}

/**
 * GET ALL PROJECTS (SUMMARIES)
 * Retrieves summary information for all projects.
 *
 * Returns lightweight summaries instead of full project data
 * for better performance in the dashboard.
 *
 * PERFORMANCE FIX: Uses .each() cursor instead of .toArray().
 * .toArray() loads EVERY full ProjectRecord (including all nodes with
 * multi-MB base64 images) into memory simultaneously. With 3+ projects
 * that each have 50 scenes (50×2MB = 100MB per project), this allocates
 * 300+ MB at once and causes OOM crashes on the dashboard.
 *
 * .each() processes records one at a time via an IndexedDB cursor.
 * Only one project's data is in memory at a time — the GC can reclaim
 * each record's memory after we extract the summary fields. This reduces
 * peak memory from O(all projects) to O(largest single project).
 *
 * Additionally, coverImage is skipped if it's a large base64 data URL
 * (it should have been offloaded to a blob URL, but if not, we don't
 * want to keep a multi-MB string in the summary just for a thumbnail).
 *
 * @returns Array of project summaries, sorted by updatedAt (newest first)
 */
export async function getAllProjects(): Promise<ProjectSummary[]> {
  logDB('Getting all projects');

  try {
    const summaries: ProjectSummary[] = [];

    // Process one record at a time via cursor — prevents loading all
    // full project data into memory simultaneously (OOM fix).
    await db.projects
      .orderBy('updatedAt')
      .reverse()
      .each((record) => {
        // Skip cover images that are large base64 data URLs — these
        // should have been offloaded to blob URLs, but if they weren't,
        // keeping a multi-MB string in the dashboard summary wastes memory.
        // Small cover images (< 100KB encoded) and blob/http URLs pass through.
        let coverImage = record.data.info.coverImage;
        if (coverImage && coverImage.startsWith('data:') && coverImage.length > 100_000) {
          coverImage = undefined;
        }

        summaries.push({
          id: record.data.id,
          title: record.data.info.title,
          author: record.data.info.author,
          coverImage,
          updatedAt: record.updatedAt,
          nodeCount: record.data.nodes.length,
          theme: record.data.info.theme,
        });
      });

    logDB('Got projects', { count: summaries.length });

    return summaries;
  } catch (error) {
    console.error('[ProjectsDB] Failed to get projects:', error);
    throw new Error(`Failed to load projects: ${getErrorMessage(error)}`);
  }
}

/**
 * DUPLICATE PROJECT
 * Creates a copy of an existing project.
 *
 * The copy gets:
 * - New ID
 * - "(Copy)" appended to title
 * - New timestamps
 *
 * @param id - ID of project to duplicate
 * @returns The new duplicate project
 * @throws Error if duplication fails
 */
export async function duplicateProject(id: string): Promise<Project> {
  logDB('Duplicating project', id);

  try {
    // Get the original project
    const original = await getProject(id);

    if (!original) {
      throw new Error('Project not found');
    }

    // Create a deep copy with new IDs
    const newProjectId = generateId('project');
    const now = Date.now();

    // Clone the project — structuredClone avoids the intermediate JSON string
    // that JSON.parse(JSON.stringify()) creates, reducing peak memory by ~2x.
    const duplicate: Project = {
      ...structuredClone(original),
      id: newProjectId,
      info: {
        ...original.info,
        title: `${original.info.title} (Copy)`,
        createdAt: now,
        updatedAt: now,
      },
    };

    // Regenerate IDs for nodes, choices, and edges to avoid conflicts.
    // Choice IDs must also be remapped because edges use them as sourceHandle.
    const idMap = new Map<string, string>();

    // Generate new node IDs and choice IDs
    duplicate.nodes = duplicate.nodes.map((node) => {
      const newId = generateId('node');
      idMap.set(node.id, newId);
      const cloned = { ...node, id: newId };

      // Remap choice IDs inside scene nodes
      if (cloned.type === 'scene' && cloned.data?.choices) {
        cloned.data = {
          ...cloned.data,
          choices: cloned.data.choices.map((choice: { id: string; label: string }) => {
            const newChoiceId = generateId('choice');
            idMap.set(choice.id, newChoiceId);
            return { ...choice, id: newChoiceId };
          }),
        };
      }

      return cloned;
    });

    // Update edge references — source, target, AND sourceHandle
    duplicate.edges = duplicate.edges.map((edge) => ({
      ...edge,
      id: generateId('edge'),
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
      sourceHandle: (edge.sourceHandle && idMap.get(edge.sourceHandle)) || edge.sourceHandle,
    }));

    // Update start node reference
    if (duplicate.settings.startNodeId && idMap.has(duplicate.settings.startNodeId)) {
      duplicate.settings.startNodeId = idMap.get(duplicate.settings.startNodeId)!;
    }

    // Save the duplicate
    const record: ProjectRecord = {
      id: newProjectId,
      data: duplicate,
      updatedAt: now,
    };

    await db.projects.add(record);

    logDB('Project duplicated', { originalId: id, newId: newProjectId });

    return duplicate;
  } catch (error) {
    console.error('[ProjectsDB] Failed to duplicate project:', error);
    throw new Error(`Failed to duplicate project: ${getErrorMessage(error)}`);
  }
}

/**
 * IMPORT PROJECT FROM ZIP FILE
 * Reads a .dream-e.zip (or legacy .storyweaver.zip) file, extracts
 * the project.json inside, validates its structure, assigns a new
 * unique ID, and saves it to the database.
 *
 * The imported project gets:
 * - A brand new unique ID (avoids collisions with existing projects)
 * - New node and edge IDs (avoids cross-project ID conflicts)
 * - Updated creation and modification timestamps
 * - " (Imported)" appended to the title for clarity
 *
 * @param file - The .dream-e.zip or .storyweaver.zip File from a file input or drop
 * @returns The imported project
 * @throws Error if the file is not valid or import fails
 */
export async function importProject(file: File): Promise<Project> {
  logDB('Importing project from file', file.name);

  try {
    // Dynamically import JSZip (it's already a dependency)
    const JSZip = (await import('jszip')).default;

    // Read the ZIP file
    const zip = await JSZip.loadAsync(file);

    // Look for project.json inside the ZIP
    const projectFile = zip.file('project.json');
    if (!projectFile) {
      throw new Error(
        'Invalid Dream-E file: no project.json found inside the ZIP.'
      );
    }

    // Parse the JSON content
    const jsonText = await projectFile.async('text');
    let projectData: Project;

    try {
      projectData = JSON.parse(jsonText);
    } catch {
      throw new Error(
        'Invalid Dream-E file: project.json contains invalid JSON.'
      );
    }

    // Basic validation — make sure it looks like a Dream-E project
    if (!projectData.info || !projectData.nodes || !projectData.edges) {
      throw new Error(
        'Invalid Dream-E file: missing required project fields (info, nodes, edges).'
      );
    }

    if (!projectData.info.title) {
      throw new Error(
        'Invalid Dream-E file: project has no title.'
      );
    }

    // Generate a new unique ID for this import
    const newProjectId = generateId('project');
    const now = Date.now();

    // Build maps of old IDs to new IDs so all internal references stay consistent.
    // This includes node IDs AND choice IDs (which are used as edge sourceHandles).
    const idMap = new Map<string, string>();

    // Generate new node IDs and choice IDs
    const newNodes = projectData.nodes.map((node) => {
      const newNodeId = generateId('node');
      idMap.set(node.id, newNodeId);

      const clonedNode = structuredClone(node);
      clonedNode.id = newNodeId;

      // Regenerate choice IDs inside scene nodes AND record old→new mapping.
      // This is critical because edges use choice IDs as their sourceHandle
      // to identify which output port they connect from.
      if (clonedNode.type === 'scene' && clonedNode.data?.choices) {
        clonedNode.data.choices = clonedNode.data.choices.map(
          (choice: { id: string; label: string }) => {
            const newChoiceId = generateId('choice');
            idMap.set(choice.id, newChoiceId);
            return { ...choice, id: newChoiceId };
          }
        );
      }

      return clonedNode;
    });

    // Update edges with new IDs — remap source, target, AND sourceHandle.
    // sourceHandle can be a choice ID (e.g. "choice_abc123"), "default", or "success"/"failure".
    // Only choice IDs exist in the idMap, so fixed strings pass through unchanged.
    const newEdges = projectData.edges.map((edge) => ({
      ...structuredClone(edge),
      id: generateId('edge'),
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
      sourceHandle: (edge.sourceHandle && idMap.get(edge.sourceHandle)) || edge.sourceHandle,
    }));

    // Regenerate variable IDs
    const newVariables = (projectData.globalVariables || []).map((v) => ({
      ...structuredClone(v),
      id: generateId('var'),
    }));

    // Update the start node reference
    const settings = projectData.settings
      ? structuredClone(projectData.settings)
      : createDefaultSettings();

    if (settings.startNodeId && idMap.has(settings.startNodeId)) {
      settings.startNodeId = idMap.get(settings.startNodeId)!;
    }

    // Regenerate entity IDs and remap any entity references in scene nodes
    const entityIdMap = new Map<string, string>();
    const newEntities = (projectData.entities || []).map((entity) => {
      const newEntityId = generateId('entity');
      entityIdMap.set(entity.id, newEntityId);
      // Deep clone to capture profile and all nested data
      const cloned = structuredClone(entity);
      cloned.id = newEntityId;
      return cloned;
    });

    // Remap entity references inside scene node data (linkedCharacters, linkedLocations, etc.)
    for (const node of newNodes) {
      if (node.type === 'scene' && node.data) {
        const d = node.data as Record<string, unknown>;
        for (const field of ['linkedCharacters', 'linkedLocations', 'linkedObjects', 'linkedConcepts']) {
          if (Array.isArray(d[field])) {
            d[field] = (d[field] as string[]).map(
              (eid: string) => entityIdMap.get(eid) || eid
            );
          }
        }
        // Remap entityStates keys
        if (d.entityStates && typeof d.entityStates === 'object') {
          const oldStates = d.entityStates as Record<string, unknown>;
          const newStates: Record<string, unknown> = {};
          for (const [oldId, val] of Object.entries(oldStates)) {
            newStates[entityIdMap.get(oldId) || oldId] = val;
          }
          d.entityStates = newStates;
        }
      }
    }

    // Assemble the imported project — include ALL fields from the source
    const importedProject: Project = {
      id: newProjectId,
      info: {
        ...projectData.info,
        title: `${projectData.info.title} (Imported)`,
        createdAt: now,
        updatedAt: now,
      },
      globalVariables: newVariables,
      nodes: newNodes,
      edges: newEdges,
      settings,
      entities: newEntities,
      notes: projectData.notes || '',
      assetNames: projectData.assetNames
        ? structuredClone(projectData.assetNames)
        : {},
      chatMessages: [],
    };

    // Save to database
    const record: ProjectRecord = {
      id: newProjectId,
      data: importedProject,
      updatedAt: now,
    };

    await db.projects.add(record);

    logDB('Project imported', {
      id: newProjectId,
      title: importedProject.info.title,
      nodeCount: newNodes.length,
    });

    return importedProject;
  } catch (error) {
    console.error('[ProjectsDB] Failed to import project:', error);
    throw new Error(
      `Failed to import project: ${getErrorMessage(error)}`
    );
  }
}

/**
 * CHECK IF PROJECT EXISTS
 * Quickly checks if a project exists without loading all data.
 *
 * @param id - Project ID to check
 * @returns true if project exists
 */
export async function projectExists(id: string): Promise<boolean> {
  const count = await db.projects.where('id').equals(id).count();
  return count > 0;
}

/**
 * DEFAULT DREAM ROOM TEXT
 * The introductory scene text for every new adventure. Describes a white
 * holodeck-like simulation room that can become anything the player imagines.
 * This is paired with the dreamroom.jpg image in public/.
 */
const DEFAULT_START_TEXT = `You wake up standing in the middle of a perfectly empty room.

The floor is smooth white glass. The walls curve upward like the inside of a giant pearl. Soft light glows from nowhere and everywhere at once.

There are no doors. No windows. No furniture.

Just you.

For a moment you wonder if you're dreaming. Then a calm voice speaks from the air around you.

"Welcome to the Dream Room."

A faint ripple of light passes across the walls. The empty space begins to shimmer, as if reality itself is waiting for instructions.

"This environment is a fully immersive holodeck simulation. Any world can be created here. Any story. Any person."

You feel a subtle vibration under your feet, like the room is alive.

"You will be able to walk through cities that do not exist. Meet people who were never born. Fight battles, solve mysteries, fall in love, explore distant planets, or relive forgotten memories."

The voice pauses for a moment.

"In this room, your imagination becomes reality."

You raise your hand and notice something strange: the air ripples slightly where your fingers move, like touching the surface of water.

"This simulation will feel real," the voice continues.

"You will feel wind, warmth, movement. You may even feel pain or exhaustion. But do not worry — your body will always remain safe."

The white walls pulse faintly with soft light.

"Nothing here can truly harm you."

A thin circle of glowing symbols appears in the air in front of you. It slowly rotates, waiting.

"Simply imagine a world."

The room grows quiet.

Reality itself seems to lean forward in anticipation.

What would you like to create?`;

/**
 * CREATE STARTER SCENE NODE
 * Creates a default starting scene for new projects.
 *
 * Every new adventure starts in the "Dream Room" — a white holodeck-like
 * environment. The background image (/dreamroom.jpg) is served from public/
 * and the story text introduces the player to the simulation concept.
 * This ensures players can immediately jump into Open World mode.
 *
 * @returns A new scene node with the Dream Room setup
 */
function createStarterSceneNode(): SceneNode {
  return {
    id: generateId('node'),
    type: 'scene',
    position: { x: 250, y: 200 },
    label: 'The Dream Room',
    data: {
      storyText: DEFAULT_START_TEXT,
      speakerName: 'Narrator',
      backgroundImage: '/dreamroom.jpg',
      choices: [
        {
          id: generateId('choice'),
          label: 'Begin the adventure',
        },
      ],
      musicKeepPlaying: false,
      voiceoverAutoplay: false,
    },
  };
}

/**
 * GET ERROR MESSAGE
 * Extracts a readable error message from various error types.
 *
 * @param error - The error object
 * @returns Human-readable error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}
