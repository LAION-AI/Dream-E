/**
 * =============================================================================
 * DASHBOARD COMPONENT (SCREEN A)
 * =============================================================================
 *
 * The main landing page of Dream-E - the project manager.
 *
 * FEATURES:
 * - Grid view of all projects
 * - Create new project
 * - Open, duplicate, delete projects
 * - Tutorial sidebar
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Logo                                      Profile │ Logout  │
 * ├────────────┬────────────────────────────────────────────────┤
 * │            │                                                │
 * │ My Projects│    Projects Grid                               │
 * │ Tutorials  │    ┌─────┐ ┌─────┐ ┌─────┐                    │
 * │ Community  │    │  +  │ │ Proj│ │ Proj│                    │
 * │            │    │ New │ │  1  │ │  2  │                    │
 * │            │    └─────┘ └─────┘ └─────┘                    │
 * │            │                                                │
 * └────────────┴────────────────────────────────────────────────┘
 *
 * =============================================================================
 */

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Folder,
  BookOpen,
  Users,
  Settings,
  LogOut,
  Trash2,
  Copy,
  Play,
  Edit3,
  MoreVertical,
  Upload,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import type { ProjectSummary, CreateProjectOptions, Project } from '@/types';
import * as projectsDB from '@/db/projectsDB';
import { Button, Modal } from '@components/common';

/**
 * BACKUP SUMMARY TYPE
 * Lightweight summary returned by GET /api/list-backups.
 * Contains just enough info to display in the recovery banner.
 */
interface BackupSummary {
  id: string;
  title: string;
  updatedAt: number;
  fileSize: number;
}

/**
 * DASHBOARD PROPS
 * The Dashboard receives a `mode` prop from the router to determine which
 * projects to display. Game Mode shows interactive fiction / RPG projects,
 * Co-Writing Mode shows collaborative writing projects.
 */
interface DashboardProps {
  mode: 'game' | 'cowrite';
}

/**
 * DASHBOARD COMPONENT
 * Main project management interface.
 *
 * Accepts a `mode` prop that controls:
 * - Which projects are displayed (filtered by mode)
 * - Navigation paths for edit/play (prefixed with /cowrite for co-writing projects)
 * - UI labels ("Game Projects" vs "Co-Writing Projects")
 * - New project creation (assigns the correct mode to new projects)
 */
export default function Dashboard({ mode }: DashboardProps) {
  // Navigation hook for routing
  const navigate = useNavigate();

  // State for projects list
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for new project modal
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // State for delete confirmation
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for importing projects from ZIP files
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // State for server-side backup recovery.
  // When the user has 0 projects in IndexedDB but backups exist on disk,
  // we show a recovery banner so they can restore their work. This handles
  // the common scenario of switching browsers or clearing cache.
  const [availableBackups, setAvailableBackups] = useState<BackupSummary[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  /**
   * Load projects on component mount, and reload when mode changes.
   * When the user navigates between /game and /cowrite, the mode prop
   * changes and we need to re-fetch and re-filter the project list.
   */
  useEffect(() => {
    loadProjects();
  }, [mode]);

  /**
   * Fetch all projects from database.
   * If no projects are found, also check for server-side backups
   * that could be restored (e.g., after cache clear or browser switch).
   */
  async function loadProjects() {
    try {
      setIsLoading(true);
      setError(null);
      const allProjects = await projectsDB.getAllProjects();
      // Filter projects by the current dashboard mode.
      // Backwards compatibility: projects without a mode field are treated as 'game'.
      const projectList = allProjects.filter(p => (p.mode || 'game') === mode);
      setProjects(projectList);

      // When the user has no projects, check if filesystem backups exist.
      // This runs only when projects are empty — not on every load — to
      // avoid unnecessary network requests during normal usage.
      if (projectList.length === 0) {
        checkForBackups();
      } else {
        // Clear any previously shown backup banner if projects now exist
        setAvailableBackups([]);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load projects:', err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * CHECK FOR SERVER-SIDE BACKUPS
   * Queries the Vite dev server for filesystem backups. If any exist,
   * populates the availableBackups state to trigger the recovery banner.
   *
   * This is called only when loadProjects() returns 0 projects, so it
   * won't fire during normal operation.
   */
  async function checkForBackups() {
    try {
      const resp = await fetch('/api/list-backups');
      if (!resp.ok) return; // Silently skip — backup API may not be available in production

      const backups: BackupSummary[] = await resp.json();
      if (backups.length > 0) {
        console.log(`[Dashboard] Found ${backups.length} backup(s) on disk:`, backups.map(b => b.title));
        setAvailableBackups(backups);
      }
    } catch {
      // Silently ignore — the backup server endpoint is only available
      // during Vite dev server. In production builds, this fetch will fail
      // and that's expected behavior.
    }
  }

  /**
   * RESTORE ALL BACKUPS FROM SERVER
   * Fetches each backup's full project JSON from the server, then saves
   * it via projectsDB.saveProject() which extracts assets into separate
   * records (avoiding the giant 40 MB single-record write that causes
   * IOError on Edge). The redundant server backup triggered by saveProject
   * is harmless — it just overwrites the same file.
   */
  async function handleRestoreAll() {
    setIsRestoring(true);
    setError(null);

    let restored = 0;
    let failed = 0;

    for (const backup of availableBackups) {
      try {
        const resp = await fetch(`/api/restore-backup/${backup.id}`);
        if (!resp.ok) {
          console.error(`[Dashboard] Failed to fetch backup ${backup.id}: HTTP ${resp.status}`);
          failed++;
          continue;
        }

        const project: Project = await resp.json();

        // Use saveProject() which extracts assets into separate records.
        // This avoids writing a giant 40 MB record to IndexedDB.
        await projectsDB.saveProject(project);

        restored++;
        console.log(`[Dashboard] Restored backup: "${project.info?.title}" (${project.id})`);
      } catch (err) {
        console.error(`[Dashboard] Failed to restore backup ${backup.id}:`, err);
        failed++;
      }
    }

    // Clear the backup banner and reload the project list
    setAvailableBackups([]);
    setIsRestoring(false);

    if (failed > 0) {
      setError(`Restored ${restored} project(s), but ${failed} failed. Check console for details.`);
    }

    // Reload to show the newly restored projects in the grid
    await loadProjects();
  }

  /**
   * Create a new project
   */
  async function handleCreateProject() {
    if (!newProjectTitle.trim()) {
      return;
    }

    try {
      setIsCreating(true);

      const options: CreateProjectOptions = {
        title: newProjectTitle.trim(),
        addStarterContent: true,
        // Assign the current dashboard mode to the new project so it appears
        // in the correct dashboard when filtering.
        mode,
      };

      const project = await projectsDB.createProject(options);

      // Close modal and navigate to the editor under the correct mode prefix.
      setIsNewProjectOpen(false);
      setNewProjectTitle('');
      navigate(mode === 'cowrite' ? `/cowrite/edit/${project.id}` : `/edit/${project.id}`);
    } catch (err) {
      console.error('[Dashboard] Failed to create project:', err);
      setError('Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  /**
   * Delete a project
   */
  async function handleDeleteProject() {
    if (!deleteProjectId) return;

    try {
      setIsDeleting(true);
      await projectsDB.deleteProject(deleteProjectId);
      setProjects(projects.filter((p) => p.id !== deleteProjectId));
      setDeleteProjectId(null);
    } catch (err) {
      console.error('[Dashboard] Failed to delete project:', err);
      setError('Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  /**
   * Duplicate a project
   */
  async function handleDuplicateProject(id: string) {
    try {
      await projectsDB.duplicateProject(id);
      loadProjects(); // Reload to show the new project
    } catch (err) {
      console.error('[Dashboard] Failed to duplicate project:', err);
      setError('Failed to duplicate project. Please try again.');
    }
  }

  /**
   * Import a project from a .dream-e.zip file.
   * Opens a file picker, reads the selected ZIP, and imports it.
   */
  async function handleImportProject(file: File) {
    try {
      setIsImporting(true);
      setError(null);

      const project = await projectsDB.importProject(file);

      // Reload the project list to show the imported project
      await loadProjects();

      // Navigate directly to the imported project in the editor,
      // using the correct mode-aware route prefix.
      navigate(mode === 'cowrite' ? `/cowrite/edit/${project.id}` : `/edit/${project.id}`);
    } catch (err) {
      console.error('[Dashboard] Failed to import project:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to import project. Make sure this is a valid .dream-e.zip file.'
      );
    } finally {
      setIsImporting(false);
      // Reset input so the same file can be re-selected
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  }

  /**
   * Format date for display
   */
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)} hours ago`;
    } else if (diffHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  }

  return (
    <div className="min-h-screen bg-editor-bg flex">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="w-64 bg-editor-surface border-r border-editor-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-editor-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-editor-accent flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-editor-text">Dream-E</h1>
              <p className="text-xs text-editor-muted">Visual Novel Engine</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-editor-accent/10 text-editor-accent">
                <Folder size={20} />
                <span>My Projects</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-editor-muted hover:bg-editor-surface hover:text-editor-text transition-colors">
                <BookOpen size={20} />
                <span>Tutorials</span>
              </button>
            </li>
            <li>
              <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-editor-muted hover:bg-editor-surface hover:text-editor-text transition-colors">
                <Users size={20} />
                <span>Community</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-editor-border">
          <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-editor-muted hover:bg-editor-surface hover:text-editor-text transition-colors">
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 px-8 flex items-center justify-between border-b border-editor-border">
          <div className="flex items-center gap-4">
            {/* Back to Start Menu button */}
            <button
              onClick={() => navigate('/')}
              className="text-editor-muted hover:text-editor-text text-sm flex items-center gap-1"
            >
              &larr; Back to Start
            </button>
            <h2 className="text-xl font-semibold text-editor-text">
              {mode === 'cowrite' ? 'Co-Writing Projects' : 'Game Projects'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-editor-surface flex items-center justify-center">
              <span className="text-editor-muted">U</span>
            </div>
            <button className="text-editor-muted hover:text-editor-text">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-8 overflow-auto">
          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-error/10 border border-error rounded-lg text-error">
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-4 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ==================== BACKUP RECOVERY BANNER ==================== */}
          {/* Shown when IndexedDB has 0 projects but filesystem backups exist.
              This catches the common case of browser cache being cleared,
              switching to a different browser, or IndexedDB eviction under
              storage pressure. The banner offers one-click restoration. */}
          {availableBackups.length > 0 && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
              <div className="flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-editor-text font-medium">
                    Found {availableBackups.length} project backup{availableBackups.length !== 1 ? 's' : ''} on disk
                  </p>
                  <p className="text-sm text-editor-muted mt-1">
                    These were saved from a previous session. Your browser&apos;s local
                    storage appears empty, but your work is safe on the filesystem.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {availableBackups.map((b) => (
                      <li key={b.id} className="text-sm text-editor-muted">
                        &bull; {b.title} ({(b.fileSize / (1024 * 1024)).toFixed(1)} MB)
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={handleRestoreAll}
                    isLoading={isRestoring}
                    className="mt-3"
                  >
                    Restore All
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-editor-border border-t-editor-accent rounded-full animate-spin" />
            </div>
          ) : (
            /* Projects grid */
            <>
            {/* Hidden file input for importing .dream-e.zip files */}
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportProject(file);
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* New Project Card */}
              <button
                onClick={() => setIsNewProjectOpen(true)}
                className="aspect-[4/3] rounded-xl border-2 border-dashed border-editor-border hover:border-editor-accent bg-editor-surface/50 hover:bg-editor-surface transition-all flex flex-col items-center justify-center gap-4 group"
              >
                <div className="w-16 h-16 rounded-full bg-editor-accent/10 group-hover:bg-editor-accent/20 flex items-center justify-center transition-colors">
                  <Plus className="w-8 h-8 text-editor-accent" />
                </div>
                <span className="text-editor-muted group-hover:text-editor-text font-medium">
                  {mode === 'cowrite' ? 'Create New Story' : 'Create New Adventure'}
                </span>
              </button>

              {/* Import Project Card */}
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
                className="aspect-[4/3] rounded-xl border-2 border-dashed border-editor-border hover:border-green-500 bg-editor-surface/50 hover:bg-editor-surface transition-all flex flex-col items-center justify-center gap-4 group disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                    </div>
                    <span className="text-editor-muted font-medium">
                      Importing...
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-500/10 group-hover:bg-green-500/20 flex items-center justify-center transition-colors">
                      <Upload className="w-8 h-8 text-green-500" />
                    </div>
                    <span className="text-editor-muted group-hover:text-editor-text font-medium">
                      Import from ZIP
                    </span>
                    <span className="text-xs text-editor-muted">
                      .dream-e.zip
                    </span>
                  </>
                )}
              </button>

              {/* Project Cards */}
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => navigate(mode === 'cowrite' ? `/cowrite/edit/${project.id}` : `/edit/${project.id}`)}
                  onPlay={() => navigate(mode === 'cowrite' ? `/cowrite/play/${project.id}` : `/play/${project.id}`)}
                  onPlayOpenWorld={() => navigate(mode === 'cowrite' ? `/cowrite/play/${project.id}?openWorld=1` : `/play/${project.id}?openWorld=1`)}
                  onDuplicate={() => handleDuplicateProject(project.id)}
                  onDelete={() => setDeleteProjectId(project.id)}
                  formatDate={formatDate}
                />
              ))}
            </div>
            </>
          )}
        </div>
      </main>

      {/* ==================== NEW PROJECT MODAL ==================== */}
      <Modal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        title={mode === 'cowrite' ? 'Create New Story' : 'Create New Adventure'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsNewProjectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              isLoading={isCreating}
              disabled={!newProjectTitle.trim()}
            >
              Create Project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Project Title</label>
            <input
              type="text"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              placeholder="My Awesome Adventure"
              className="input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectTitle.trim()) {
                  handleCreateProject();
                }
              }}
            />
          </div>
          <p className="text-sm text-editor-muted">
            You can change the title and add more details later.
          </p>
        </div>
      </Modal>

      {/* ==================== DELETE CONFIRMATION MODAL ==================== */}
      <Modal
        isOpen={!!deleteProjectId}
        onClose={() => setDeleteProjectId(null)}
        title="Delete Project"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteProjectId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteProject}
              isLoading={isDeleting}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-editor-muted">
          Are you sure you want to delete this project? This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}

/**
 * PROJECT CARD COMPONENT
 * Displays a single project in the grid.
 */
interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: () => void;
  onPlay: () => void;
  onPlayOpenWorld: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  formatDate: (timestamp: number) => string;
}

function ProjectCard({
  project,
  onOpen,
  onPlay,
  onPlayOpenWorld,
  onDuplicate,
  onDelete,
  formatDate,
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Theme color based on project theme
  const themeColors = {
    fantasy: 'from-amber-900/50 to-amber-700/30',
    cyberpunk: 'from-cyan-900/50 to-purple-900/30',
    modern: 'from-indigo-900/50 to-purple-900/30',
    custom: 'from-gray-900/50 to-gray-700/30',
  };

  return (
    <div className="group relative rounded-xl bg-editor-surface border border-editor-border overflow-hidden hover:border-editor-accent transition-colors">
      {/* Cover Image / Gradient */}
      <div
        className={`aspect-[4/3] bg-gradient-to-br ${themeColors[project.theme]} flex items-center justify-center`}
      >
        {project.coverImage ? (
          <img
            src={project.coverImage}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <BookOpen className="w-16 h-16 text-white/30" />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button
            onClick={onOpen}
            className="p-3 rounded-full bg-editor-accent text-white hover:bg-editor-accent/80 transition-colors"
            title="Edit"
          >
            <Edit3 size={20} />
          </button>
          <button
            onClick={onPlay}
            className="p-3 rounded-full bg-green-500 text-white hover:bg-green-500/80 transition-colors"
            title="Play"
          >
            <Play size={20} />
          </button>
          <button
            onClick={onPlayOpenWorld}
            className="p-3 rounded-full bg-pink-500 text-white hover:bg-pink-500/80 transition-colors"
            title="Play Open World"
          >
            <Sparkles size={20} />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-editor-text truncate">
              {project.title}
            </h3>
            <p className="text-sm text-editor-muted">
              Last edited: {formatDate(project.updatedAt)}
            </p>
          </div>

          {/* Menu button */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded hover:bg-editor-border"
            >
              <MoreVertical size={16} className="text-editor-muted" />
            </button>

            {/* Dropdown menu - opens upward to avoid being cut off */}
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 bottom-full mb-1 w-40 py-1 bg-editor-surface border border-editor-border rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDuplicate();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-editor-text hover:bg-editor-border"
                  >
                    <Copy size={16} />
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-error/10"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center gap-4 text-xs text-editor-muted">
          <span>{project.nodeCount} nodes</span>
          <span className="capitalize">{project.theme}</span>
        </div>
      </div>
    </div>
  );
}
