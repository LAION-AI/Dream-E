/**
 * =============================================================================
 * HELP MODAL COMPONENT
 * =============================================================================
 *
 * A comprehensive help guide for using Dream-E.
 * Written for users who may not have programming experience.
 *
 * =============================================================================
 */

import React, { useState } from 'react';
import {
  HelpCircle,
  Film,
  GitBranch,
  Calculator,
  MessageSquare,
  MousePointer,
  Link,
  Play,
  Save,
  Database,
} from 'lucide-react';
import { Modal, Tabs, TabPanel } from '@components/common';

/**
 * HELP MODAL PROPS
 */
interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * HELP MODAL COMPONENT
 */
export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [activeTab, setActiveTab] = useState('basics');

  const tabs = [
    { id: 'basics', label: 'Basics' },
    { id: 'nodes', label: 'Nodes' },
    { id: 'variables', label: 'Variables' },
    { id: 'tips', label: 'Tips' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Help & Documentation"
      size="xl"
    >
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant="pills"
        size="sm"
        fullWidth
      />

      <div className="mt-4 max-h-[60vh] overflow-y-auto">
        {/* ==================== BASICS TAB ==================== */}
        <TabPanel id="basics" activeTab={activeTab}>
          <div className="space-y-6">
            <section>
              <h3 className="text-lg font-semibold text-editor-text mb-3 flex items-center gap-2">
                <HelpCircle className="text-editor-accent" size={20} />
                What is Dream-E?
              </h3>
              <p className="text-editor-muted leading-relaxed">
                Dream-E is a tool for creating interactive stories and games.
                Instead of writing code, you create your story by placing <strong>nodes</strong> (boxes)
                on a canvas and connecting them with lines. Each node represents a part of your story.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-editor-text mb-3 flex items-center gap-2">
                <MousePointer className="text-editor-accent" size={20} />
                How to Navigate
              </h3>
              <ul className="space-y-2 text-editor-muted">
                <li className="flex items-start gap-2">
                  <span className="bg-editor-surface px-2 py-0.5 rounded text-sm">Pan</span>
                  <span>Click and drag on empty space to move around the canvas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-editor-surface px-2 py-0.5 rounded text-sm">Zoom</span>
                  <span>Use your mouse wheel or trackpad to zoom in/out</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-editor-surface px-2 py-0.5 rounded text-sm">Select</span>
                  <span>Click on a node to select it and see its settings on the right</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-editor-surface px-2 py-0.5 rounded text-sm">Delete</span>
                  <span>Select a node and press Delete or Backspace to remove it</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-editor-text mb-3 flex items-center gap-2">
                <Link className="text-editor-accent" size={20} />
                How to Connect Nodes
              </h3>
              <ol className="space-y-3 text-editor-muted list-decimal list-inside">
                <li>
                  Look for the <strong>colored dots</strong> on nodes:
                  <ul className="ml-6 mt-1 space-y-1 list-disc list-inside text-sm">
                    <li>Top dot = Input (where connections come IN)</li>
                    <li>Bottom/Right dots = Outputs (where connections go OUT)</li>
                  </ul>
                </li>
                <li>
                  <strong>Click and hold</strong> on an output dot (bottom or right)
                </li>
                <li>
                  <strong>Drag</strong> the line that appears to another node's input dot (top)
                </li>
                <li>
                  <strong>Release</strong> to create the connection
                </li>
              </ol>
              <div className="mt-3 p-3 bg-editor-bg rounded-lg text-sm">
                <strong>Tip:</strong> If connecting doesn't work, make sure you're dragging FROM an output
                TO an input. You can't connect input-to-input or output-to-output.
              </div>
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
                <strong>Deleting Connections:</strong> Click on a connection line to select it (turns red),
                then press <strong>Delete</strong> or <strong>Ctrl+X</strong>, or click the trash icon in the toolbar.
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-editor-text mb-3 flex items-center gap-2">
                <Save className="text-editor-accent" size={20} />
                Saving Your Work
              </h3>
              <p className="text-editor-muted">
                Click the <strong>Save</strong> button in the top bar, or press <strong>Ctrl+S</strong> (Cmd+S on Mac).
                Your project is saved in your browser's storage - no account needed!
              </p>
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-200">
                <strong>Important:</strong> Always save before clicking "Play" to test your game,
                otherwise your changes won't appear in the test.
              </div>
            </section>
          </div>
        </TabPanel>

        {/* ==================== NODES TAB ==================== */}
        <TabPanel id="nodes" activeTab={activeTab}>
          <div className="space-y-6">
            <p className="text-editor-muted">
              There are 4 types of nodes. Drag them from the left toolbar onto the canvas.
            </p>

            {/* Scene Node */}
            <section className="p-4 rounded-lg border-2 border-node-scene bg-node-scene/5">
              <h3 className="text-lg font-semibold text-node-scene mb-2 flex items-center gap-2">
                <Film size={20} />
                Scene Node (Blue)
              </h3>
              <p className="text-editor-muted mb-3">
                This is where your story happens. Scene nodes display:
              </p>
              <ul className="space-y-1 text-editor-muted list-disc list-inside">
                <li>A background image (optional)</li>
                <li>Story text that the player reads</li>
                <li>Choice buttons for the player to click</li>
                <li>Background music and voiceover (optional)</li>
              </ul>
              <p className="mt-3 text-sm text-node-scene">
                <strong>When to use:</strong> Anytime you want to show something to the player
                and let them make a choice.
              </p>
            </section>

            {/* Choice Node */}
            <section className="p-4 rounded-lg border-2 border-node-choice bg-node-choice/5">
              <h3 className="text-lg font-semibold text-node-choice mb-2 flex items-center gap-2">
                <GitBranch size={20} />
                Choice Node (Yellow)
              </h3>
              <p className="text-editor-muted mb-3">
                Makes decisions automatically based on game state. It checks a condition
                and goes one of two ways:
              </p>
              <ul className="space-y-1 text-editor-muted list-disc list-inside">
                <li><span className="text-green-400">Success (True)</span> - if the condition is true</li>
                <li><span className="text-red-400">Failure (False)</span> - if the condition is false</li>
              </ul>
              <p className="mt-3 text-sm text-node-choice">
                <strong>Example:</strong> "If player HP is greater than 50, go to victory scene.
                Otherwise, go to defeat scene."
              </p>
            </section>

            {/* Modifier Node */}
            <section className="p-4 rounded-lg border-2 border-node-modifier bg-node-modifier/5">
              <h3 className="text-lg font-semibold text-node-modifier mb-2 flex items-center gap-2">
                <Calculator size={20} />
                Modifier Node (Green)
              </h3>
              <p className="text-editor-muted mb-3">
                Changes variable values. Has three modes:
              </p>
              <ul className="space-y-1 text-editor-muted list-disc list-inside">
                <li><strong>Math:</strong> Add, subtract, multiply, or divide (e.g., HP - 10)</li>
                <li><strong>Set:</strong> Set to a specific value (e.g., HasKey = True)</li>
                <li><strong>Random:</strong> Generate a random number (e.g., dice roll 1-20)</li>
              </ul>
              <p className="mt-3 text-sm text-node-modifier">
                <strong>Example:</strong> Player takes damage → Modifier subtracts 10 from HP → Game continues
              </p>
            </section>

            {/* Comment Node */}
            <section className="p-4 rounded-lg border-2 border-dashed border-node-comment bg-node-comment/5">
              <h3 className="text-lg font-semibold text-node-comment mb-2 flex items-center gap-2">
                <MessageSquare size={20} />
                Comment Node (Gray)
              </h3>
              <p className="text-editor-muted">
                Notes for yourself. Comment nodes don't affect the game at all - they're just
                for keeping your project organized and leaving reminders.
              </p>
            </section>
          </div>
        </TabPanel>

        {/* ==================== VARIABLES TAB ==================== */}
        <TabPanel id="variables" activeTab={activeTab}>
          <div className="space-y-6">
            <section>
              <h3 className="text-lg font-semibold text-editor-text mb-3 flex items-center gap-2">
                <Database className="text-editor-accent" size={20} />
                What are Variables?
              </h3>
              <p className="text-editor-muted leading-relaxed">
                Variables are like containers that store information. Think of them as labeled boxes
                that hold values which can change during the game.
              </p>
            </section>

            <section>
              <h4 className="font-semibold text-editor-text mb-2">Types of Variables</h4>
              <div className="space-y-2">
                <div className="p-3 bg-editor-surface rounded-lg">
                  <p className="font-medium text-blue-400">Number (Integer)</p>
                  <p className="text-sm text-editor-muted">Whole numbers: 0, 1, 42, 100, -5</p>
                  <p className="text-xs text-editor-muted mt-1">Use for: Health, Gold, Score, Level</p>
                </div>
                <div className="p-3 bg-editor-surface rounded-lg">
                  <p className="font-medium text-yellow-400">True/False (Boolean)</p>
                  <p className="text-sm text-editor-muted">Only two values: True or False</p>
                  <p className="text-xs text-editor-muted mt-1">Use for: HasKey, DoorOpen, MetTheKing, IsAlive</p>
                </div>
                <div className="p-3 bg-editor-surface rounded-lg">
                  <p className="font-medium text-green-400">Text (String)</p>
                  <p className="text-sm text-editor-muted">Any text: "Hello", "Knight", "Secret Password"</p>
                  <p className="text-xs text-editor-muted mt-1">Use for: PlayerName, CurrentLocation</p>
                </div>
                <div className="p-3 bg-editor-surface rounded-lg">
                  <p className="font-medium text-purple-400">List (Collection)</p>
                  <p className="text-sm text-editor-muted">Multiple items: ["Sword", "Shield", "Potion"]</p>
                  <p className="text-xs text-editor-muted mt-1">Use for: Inventory, VisitedPlaces</p>
                </div>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-editor-text mb-2">How to Create Variables</h4>
              <ol className="space-y-2 text-editor-muted list-decimal list-inside">
                <li>Click the <strong>"Variables"</strong> button in the top bar</li>
                <li>Click <strong>"Create New Variable"</strong></li>
                <li>Give it a name (use underscores for spaces: Player_Health)</li>
                <li>Choose the type</li>
                <li>Set the starting value</li>
                <li>Click Create!</li>
              </ol>
            </section>

            <section>
              <h4 className="font-semibold text-editor-text mb-2">How to Use Variables</h4>
              <ul className="space-y-2 text-editor-muted list-disc list-inside">
                <li><strong>Change values:</strong> Use a Modifier Node to add, subtract, or set</li>
                <li><strong>Check values:</strong> Use a Choice Node to branch based on conditions</li>
                <li><strong>Show in game:</strong> Enable "Show in HUD" to display stats to players</li>
              </ul>
            </section>

            <section>
              <h4 className="font-semibold text-editor-text mb-2">HUD Display Settings</h4>
              <p className="text-editor-muted mb-3">
                For number variables, you can configure how they appear in the player HUD:
              </p>
              <ul className="space-y-2 text-editor-muted list-disc list-inside">
                <li><strong>Min/Max Values:</strong> Define the range for the progress bar</li>
                <li><strong>Icon:</strong> Choose from heart, mana, coin, star, shield, and more</li>
                <li><strong>Color:</strong> Pick from 15 colors including green, red, blue, gold, pink, purple, etc.</li>
              </ul>
              <p className="text-sm text-editor-muted mt-3">
                New projects start with a "Health" variable (green bar) by default.
              </p>
            </section>
          </div>
        </TabPanel>

        {/* ==================== TIPS TAB ==================== */}
        <TabPanel id="tips" activeTab={activeTab}>
          <div className="space-y-4">
            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">🎯 Start Simple</h4>
              <p className="text-editor-muted text-sm">
                Begin with just 2-3 scenes connected together. Get that working before adding
                variables and complex logic.
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">💾 Save Often</h4>
              <p className="text-editor-muted text-sm">
                Press Ctrl+S frequently. Always save before testing your game with the Play button.
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">🧪 Test Frequently</h4>
              <p className="text-editor-muted text-sm">
                Use the Play button to test your game often. It's easier to find problems when
                you test small changes.
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">📝 Use Comments</h4>
              <p className="text-editor-muted text-sm">
                Add Comment nodes to organize your story and remind yourself what different
                sections do.
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">🔗 Connection Problems?</h4>
              <p className="text-editor-muted text-sm">
                If you can't connect nodes: 1) Make sure you're dragging from OUTPUT to INPUT,
                2) The dots should highlight when you hover over them, 3) Try zooming in for better precision.
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">⌨️ Keyboard Shortcuts</h4>
              <ul className="text-editor-muted text-sm space-y-1">
                <li><strong>Ctrl+S</strong> - Save project</li>
                <li><strong>Ctrl+Z</strong> - Undo</li>
                <li><strong>Ctrl+Y</strong> - Redo</li>
                <li><strong>Ctrl+C</strong> - Copy selected node</li>
                <li><strong>Ctrl+V</strong> - Paste copied node</li>
                <li><strong>Ctrl+X</strong> - Cut node (copy + delete) or delete connection</li>
                <li><strong>Delete / Backspace</strong> - Delete selected node or connection</li>
                <li><strong>Ctrl+Shift+C</strong> - Toggle Chat window</li>
                <li><strong>Escape</strong> - Deselect all</li>
              </ul>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">📋 Copy & Paste</h4>
              <p className="text-editor-muted text-sm">
                Select a node and press <strong>Ctrl+C</strong> to copy it, then <strong>Ctrl+V</strong> to paste.
                Pasted nodes appear with "Copy 1", "Copy 2", etc. in their names. You can paste multiple times
                from a single copy!
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">💾 Save As / Export</h4>
              <p className="text-editor-muted text-sm">
                Click the <strong>"Save As"</strong> button in the top bar to download your project as a
                .dream-e.zip file. This lets you backup your work or share it with others.
              </p>
            </div>

            <div className="p-4 bg-editor-surface rounded-lg">
              <h4 className="font-semibold text-editor-text mb-2">🖼️ Asset Manager</h4>
              <p className="text-editor-muted text-sm">
                Click the <strong>"Assets"</strong> button to see all images and audio files in your project.
                You can delete unused assets to clean up your project. Deleting an asset removes it from all scenes that use it.
              </p>
            </div>
          </div>
        </TabPanel>
      </div>
    </Modal>
  );
}
