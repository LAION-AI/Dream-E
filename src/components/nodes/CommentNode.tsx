/**
 * =============================================================================
 * COMMENT NODE COMPONENT
 * =============================================================================
 *
 * A simple note-taking node for designers.
 *
 * COMMENT NODES ARE:
 * - For designer notes and documentation
 * - Do NOT affect gameplay
 * - Gray colored (or custom color)
 * - No handles (no connections)
 * - Dashed border to indicate non-functional
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { MessageSquare } from 'lucide-react';

/**
 * COMMENT NODE DATA
 */
interface CommentNodeData {
  label: string;
  text: string;
  color: string;
}

/**
 * COMMENT NODE COMPONENT
 * Renders a comment/note node.
 */
function CommentNode({ data, selected }: NodeProps<CommentNodeData>) {
  // Truncate text for preview
  const previewText = data.text
    ? data.text.length > 150
      ? data.text.substring(0, 150) + '...'
      : data.text
    : 'Empty comment';

  // Use custom color or default gray
  const borderColor = data.color || '#6b7280';

  return (
    <div
      className={`
        min-w-[180px] max-w-[280px]
        rounded-node p-3
        bg-editor-surface/50
        border-2 border-dashed
        ${selected ? 'ring-2 ring-offset-2 ring-offset-editor-bg ring-gray-500' : ''}
      `}
      style={{ borderColor }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={14} style={{ color: borderColor }} />
        <span
          className="text-xs font-medium"
          style={{ color: borderColor }}
        >
          {data.label || 'Comment'}
        </span>
      </div>

      {/* Text content */}
      <p className="text-sm text-editor-muted whitespace-pre-wrap">
        {previewText}
      </p>
    </div>
  );
}

// Memo to prevent unnecessary re-renders
export default memo(CommentNode);
