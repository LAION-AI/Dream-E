/**
 * =============================================================================
 * CHOICE NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Choice Node in the editor canvas.
 *
 * CHOICE NODES ARE:
 * - "Decision" nodes that branch the story based on conditions
 * - Yellow colored
 * - Display the condition being checked
 * - Have two outputs: Success (green) and Failure (red)
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch, Check, X } from 'lucide-react';
import type { Condition } from '@/types';

/**
 * CHOICE NODE DATA
 */
interface ChoiceNodeData {
  label: string;
  condition: Condition;
}

/**
 * FORMAT CONDITION FOR DISPLAY
 * Converts a condition to a readable string.
 */
function formatCondition(condition: Condition): string {
  if (!condition || !condition.variableA) {
    return 'No condition set';
  }

  const operators: Record<string, string> = {
    '>': '>',
    '<': '<',
    '=': '=',
    '!=': '≠',
    '>=': '≥',
    '<=': '≤',
    'contains': 'contains',
  };

  const op = operators[condition.operator] || condition.operator;
  const value = condition.useVariable
    ? `[${condition.valueB}]`
    : condition.valueB;

  return `${condition.variableA} ${op} ${value}`;
}

/**
 * CHOICE NODE COMPONENT
 * Renders a choice/decision node with condition display.
 */
function ChoiceNode({ data, selected }: NodeProps<ChoiceNodeData>) {
  const conditionText = formatCondition(data.condition);

  return (
    <div
      className={`
        node-choice min-w-[180px] max-w-[240px]
        ${selected ? 'selected ring-2 ring-node-choice shadow-glow-yellow' : ''}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!bg-node-choice !w-3 !h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-node-choice/30">
        <GitBranch size={16} className="text-node-choice" />
        <span className="font-medium text-sm text-editor-text truncate">
          {data.label || 'Choice'}
        </span>
      </div>

      {/* Condition display */}
      <div className="px-3 py-3">
        <p className="text-xs text-editor-muted mb-1">Condition:</p>
        <p className="text-sm text-editor-text font-mono bg-editor-bg px-2 py-1 rounded truncate">
          {conditionText}
        </p>
      </div>

      {/* Output handles */}
      <div className="border-t border-node-choice/30 grid grid-cols-2">
        {/* Success output */}
        <div className="relative px-3 py-2 flex items-center gap-1 border-r border-node-choice/30">
          <Check size={14} className="text-green-500" />
          <span className="text-xs text-green-500">True</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="success"
            className="!bg-green-500 !w-3 !h-3 !bottom-[-6px] !left-1/2 !-translate-x-1/2"
          />
        </div>

        {/* Failure output */}
        <div className="relative px-3 py-2 flex items-center gap-1 justify-end">
          <X size={14} className="text-red-500" />
          <span className="text-xs text-red-500">False</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="failure"
            className="!bg-red-500 !w-3 !h-3 !bottom-[-6px] !left-1/2 !-translate-x-1/2"
          />
        </div>
      </div>
    </div>
  );
}

// Memo to prevent unnecessary re-renders
export default memo(ChoiceNode);
