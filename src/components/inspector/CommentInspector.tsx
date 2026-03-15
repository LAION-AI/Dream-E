/**
 * =============================================================================
 * COMMENT INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for Comment Nodes.
 * Simple editor for note text and color.
 *
 * =============================================================================
 */

import React from 'react';
import type { CommentNode } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';

/**
 * PRESET COLORS
 * Color options for comment nodes.
 */
const PRESET_COLORS = [
  { value: '#6b7280', label: 'Gray' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
];

/**
 * COMMENT INSPECTOR PROPS
 */
interface CommentInspectorProps {
  node: CommentNode;
}

/**
 * COMMENT INSPECTOR COMPONENT
 */
export default function CommentInspector({ node }: CommentInspectorProps) {
  const { updateNode } = useProjectStore();

  /**
   * Update node data helper
   */
  const updateData = (updates: Partial<CommentNode['data']>) => {
    updateNode(node.id, {
      data: { ...node.data, ...updates },
    });
  };

  /**
   * Update node label
   */
  const updateLabel = (label: string) => {
    updateNode(node.id, { label });
  };

  return (
    <div className="p-4 space-y-6">
      {/* Node label */}
      <div>
        <label className="input-label">Label</label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateLabel(e.target.value)}
          className="input"
          placeholder="Comment title"
        />
      </div>

      {/* Comment text */}
      <div>
        <label className="input-label">Note</label>
        <textarea
          value={node.data.text}
          onChange={(e) => updateData({ text: e.target.value })}
          className="input min-h-[150px] resize-y"
          placeholder="Write your notes here..."
        />
        <p className="text-xs text-editor-muted mt-1">
          Comments are only visible in the editor, not in the game.
        </p>
      </div>

      {/* Color picker */}
      <div>
        <label className="input-label">Color</label>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => updateData({ color: color.value })}
              className={`
                w-full aspect-square rounded-lg border-2 transition-transform
                ${node.data.color === color.value
                  ? 'border-white scale-110'
                  : 'border-transparent hover:scale-105'
                }
              `}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="bg-editor-surface border border-editor-border rounded-lg p-4">
        <h4 className="font-medium text-editor-text mb-2">About Comments</h4>
        <p className="text-sm text-editor-muted">
          Comment nodes are for your notes and organization. They have no effect
          on the game and are not connected to other nodes.
        </p>
        <ul className="text-sm text-editor-muted mt-2 space-y-1 list-disc list-inside">
          <li>Use colors to categorize notes</li>
          <li>Document complex logic</li>
          <li>Leave TODOs and reminders</li>
          <li>Organize story sections</li>
        </ul>
      </div>
    </div>
  );
}
