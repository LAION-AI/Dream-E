/**
 * =============================================================================
 * MODIFIER NODE COMPONENT
 * =============================================================================
 *
 * The visual representation of a Modifier Node in the editor canvas.
 *
 * MODIFIER NODES ARE:
 * - "Processor" nodes that change variable values
 * - Green colored
 * - Display the operation being performed
 * - Have single input and output handles
 * - Support three modes: Math, Set, Random
 *
 * =============================================================================
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Calculator, Plus, Minus, X, Divide, Equal, Dice6 } from 'lucide-react';
import type { ModifierMode, MathOperation } from '@/types';

/**
 * MODIFIER NODE DATA
 */
interface ModifierNodeData {
  label: string;
  mode: ModifierMode;
  targetVariable: string;
  mathOperation?: MathOperation;
  mathValue?: number | string;
  setValue?: unknown;
  randomMin?: number;
  randomMax?: number;
}

/**
 * GET OPERATION ICON
 * Returns the appropriate icon for the math operation.
 */
function getOperationIcon(operation?: MathOperation) {
  switch (operation) {
    case 'add':
      return Plus;
    case 'subtract':
      return Minus;
    case 'multiply':
      return X;
    case 'divide':
      return Divide;
    default:
      return Plus;
  }
}

/**
 * FORMAT OPERATION FOR DISPLAY
 * Converts the modifier data to a readable preview string.
 */
function formatOperation(data: ModifierNodeData): string {
  const variable = data.targetVariable || '???';

  switch (data.mode) {
    case 'math': {
      const ops: Record<string, string> = {
        add: '+',
        subtract: '-',
        multiply: '×',
        divide: '÷',
      };
      const op = ops[data.mathOperation || 'add'];
      const value = data.mathValue ?? '?';
      return `${variable} = ${variable} ${op} ${value}`;
    }

    case 'set':
      return `${variable} = ${data.setValue ?? '?'}`;

    case 'random':
      return `${variable} = Random(${data.randomMin ?? 1}, ${data.randomMax ?? 10})`;

    default:
      return 'No operation';
  }
}

/**
 * GET MODE COLOR
 * Returns a color class based on the mode.
 */
function getModeColor(mode: ModifierMode): string {
  switch (mode) {
    case 'math':
      return 'text-blue-400';
    case 'set':
      return 'text-purple-400';
    case 'random':
      return 'text-orange-400';
    default:
      return 'text-node-modifier';
  }
}

/**
 * MODIFIER NODE COMPONENT
 * Renders a modifier node with operation preview.
 */
function ModifierNode({ data, selected }: NodeProps<ModifierNodeData>) {
  const operationText = formatOperation(data);
  const OperationIcon = data.mode === 'random'
    ? Dice6
    : data.mode === 'set'
      ? Equal
      : getOperationIcon(data.mathOperation);

  return (
    <div
      className={`
        node-modifier min-w-[180px] max-w-[240px]
        ${selected ? 'selected ring-2 ring-node-modifier shadow-glow-green' : ''}
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!bg-node-modifier !w-3 !h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-node-modifier/30">
        <Calculator size={16} className="text-node-modifier" />
        <span className="font-medium text-sm text-editor-text truncate">
          {data.label || 'Modifier'}
        </span>
      </div>

      {/* Mode indicator */}
      <div className="px-3 py-1 flex items-center gap-2 border-b border-node-modifier/30 bg-node-modifier/5">
        <OperationIcon size={14} className={getModeColor(data.mode)} />
        <span className={`text-xs font-medium capitalize ${getModeColor(data.mode)}`}>
          {data.mode}
        </span>
      </div>

      {/* Operation preview */}
      <div className="px-3 py-3">
        <p className="text-sm text-editor-text font-mono bg-editor-bg px-2 py-1 rounded truncate">
          {operationText}
        </p>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!bg-node-modifier !w-3 !h-3"
      />
    </div>
  );
}

// Memo to prevent unnecessary re-renders
export default memo(ModifierNode);
