/**
 * =============================================================================
 * MODIFIER INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for Modifier Nodes with three modes:
 * - Math: Add, subtract, multiply, divide
 * - Set: Assign a value directly
 * - Random: Generate random number
 *
 * =============================================================================
 */

import React, { useState } from 'react';
import { Plus, Minus, X, Divide, Equal, Dice6, PlusCircle } from 'lucide-react';
import type { ModifierNode, ModifierMode, MathOperation, Variable, VariableType } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import { Tabs, TabPanel, Button } from '@components/common';
import { generateId } from '@/utils/idGenerator';

/**
 * MODIFIER INSPECTOR PROPS
 */
interface ModifierInspectorProps {
  node: ModifierNode;
}

/**
 * MODIFIER INSPECTOR COMPONENT
 */
export default function ModifierInspector({ node }: ModifierInspectorProps) {
  const updateNode = useProjectStore(s => s.updateNode);
  const currentProject = useProjectStore(s => s.currentProject);
  const addVariable = useProjectStore(s => s.addVariable);

  // State for quick create variable form
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickVarName, setQuickVarName] = useState('');
  const [quickVarType, setQuickVarType] = useState<VariableType>('integer');

  /**
   * Update node data helper
   */
  const updateData = (updates: Partial<ModifierNode['data']>) => {
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

  /**
   * Change mode
   */
  const setMode = (mode: ModifierMode) => {
    updateData({ mode });
  };

  // Get variables for dropdown
  const variables = currentProject?.globalVariables || [];

  // Format the operation preview
  const formatPreview = () => {
    const variable = node.data.targetVariable || '???';

    switch (node.data.mode) {
      case 'math': {
        const ops: Record<string, string> = {
          add: '+',
          subtract: '-',
          multiply: '×',
          divide: '÷',
        };
        const op = ops[node.data.mathOperation || 'add'];
        const val = node.data.mathValue ?? '?';
        return `${variable} = ${variable} ${op} ${val}`;
      }
      case 'set':
        return `${variable} = ${node.data.setValue ?? '?'}`;
      case 'random':
        return `${variable} = Random(${node.data.randomMin ?? 1}, ${node.data.randomMax ?? 10})`;
      default:
        return 'No operation';
    }
  };

  // Tab definitions for modes
  const modeTabs = [
    { id: 'math', label: 'Math', icon: <Plus size={14} /> },
    { id: 'set', label: 'Set', icon: <Equal size={14} /> },
    { id: 'random', label: 'Random', icon: <Dice6 size={14} /> },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Node label */}
      <div>
        <label className="input-label">Node Label</label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateLabel(e.target.value)}
          className="input"
          placeholder="Modifier name"
        />
      </div>

      {/* Target variable */}
      <div>
        <label className="input-label">Target Variable</label>
        <div className="flex gap-2">
          <select
            value={node.data.targetVariable}
            onChange={(e) => updateData({ targetVariable: e.target.value })}
            className="input flex-1"
          >
            <option value="">Select variable...</option>
            {variables.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name} ({v.type})
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowQuickCreate(!showQuickCreate)}
            className={`p-2 rounded-lg border transition-colors ${
              showQuickCreate
                ? 'bg-node-modifier/20 border-node-modifier text-node-modifier'
                : 'border-editor-border text-editor-muted hover:text-editor-text hover:border-editor-accent'
            }`}
            title="Create new variable"
          >
            <PlusCircle size={18} />
          </button>
        </div>

        {/* Quick Create Variable Form */}
        {showQuickCreate && (
          <div className="mt-3 p-3 bg-editor-bg rounded-lg border border-editor-border space-y-3">
            <p className="text-xs font-medium text-editor-text">Quick Create Variable</p>

            <div>
              <label className="text-xs text-editor-muted">Name</label>
              <input
                type="text"
                value={quickVarName}
                onChange={(e) => setQuickVarName(e.target.value.replace(/\s/g, '_'))}
                className="input text-sm"
                placeholder="e.g., HP, Gold, HasKey"
              />
            </div>

            <div>
              <label className="text-xs text-editor-muted">Type</label>
              <select
                value={quickVarType}
                onChange={(e) => setQuickVarType(e.target.value as VariableType)}
                className="input text-sm"
              >
                <option value="integer">Number (Integer)</option>
                <option value="float">Number (Decimal)</option>
                <option value="boolean">True/False</option>
                <option value="string">Text</option>
              </select>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowQuickCreate(false);
                  setQuickVarName('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (!quickVarName.trim()) {
                    alert('Please enter a variable name');
                    return;
                  }

                  // Check for duplicates
                  if (variables.some(v => v.name.toLowerCase() === quickVarName.toLowerCase())) {
                    alert('A variable with this name already exists');
                    return;
                  }

                  // Create the variable with default value based on type
                  let defaultValue: any;
                  switch (quickVarType) {
                    case 'integer':
                    case 'float':
                      defaultValue = 0;
                      break;
                    case 'boolean':
                      defaultValue = false;
                      break;
                    case 'string':
                      defaultValue = '';
                      break;
                    default:
                      defaultValue = 0;
                  }

                  const newVariable: Variable = {
                    id: generateId('var'),
                    name: quickVarName.trim(),
                    type: quickVarType,
                    defaultValue,
                    showInHUD: false,
                  };

                  addVariable(newVariable);

                  // Auto-select the new variable
                  updateData({ targetVariable: newVariable.name });

                  // Reset form
                  setQuickVarName('');
                  setShowQuickCreate(false);
                }}
              >
                Create & Use
              </Button>
            </div>
          </div>
        )}

        {variables.length === 0 && !showQuickCreate && (
          <p className="text-xs text-warning mt-1">
            No variables defined. Click the + button to create one.
          </p>
        )}
      </div>

      {/* Mode tabs */}
      <div>
        <label className="input-label mb-2">Operation Mode</label>
        <Tabs
          tabs={modeTabs}
          activeTab={node.data.mode}
          onTabChange={(id) => setMode(id as ModifierMode)}
          variant="pills"
          size="sm"
          fullWidth
        />
      </div>

      {/* Mode-specific content */}
      <div className="space-y-4">
        {/* ==================== MATH MODE ==================== */}
        <TabPanel id="math" activeTab={node.data.mode}>
          {/* Operation selector */}
          <div>
            <label className="input-label">Operation</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {([
                { op: 'add', icon: Plus, label: 'Add' },
                { op: 'subtract', icon: Minus, label: 'Subtract' },
                { op: 'multiply', icon: X, label: 'Multiply' },
                { op: 'divide', icon: Divide, label: 'Divide' },
              ] as const).map(({ op, icon: Icon, label }) => (
                <button
                  key={op}
                  onClick={() => updateData({ mathOperation: op })}
                  className={`
                    p-3 rounded-lg border flex flex-col items-center gap-1
                    transition-colors
                    ${node.data.mathOperation === op
                      ? 'bg-node-modifier/20 border-node-modifier text-node-modifier'
                      : 'bg-editor-surface border-editor-border text-editor-muted hover:border-editor-accent'
                    }
                  `}
                  title={label}
                >
                  <Icon size={20} />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Value input */}
          <div className="mt-4">
            <label className="input-label">Value</label>
            <input
              type="number"
              value={node.data.mathValue ?? ''}
              onChange={(e) => updateData({ mathValue: parseFloat(e.target.value) || 0 })}
              className="input"
              placeholder="Enter value"
            />
          </div>
        </TabPanel>

        {/* ==================== SET MODE ==================== */}
        <TabPanel id="set" activeTab={node.data.mode}>
          <div>
            <label className="input-label">New Value</label>
            <input
              type="text"
              value={String(node.data.setValue ?? '')}
              onChange={(e) => {
                // Try to parse as different types
                const val = e.target.value;
                if (val === 'true') {
                  updateData({ setValue: true });
                } else if (val === 'false') {
                  updateData({ setValue: false });
                } else if (!isNaN(parseFloat(val)) && val.trim() !== '') {
                  updateData({ setValue: parseFloat(val) });
                } else {
                  updateData({ setValue: val });
                }
              }}
              className="input"
              placeholder="Enter value (number, true/false, or text)"
            />
            <p className="text-xs text-editor-muted mt-1">
              Enter a number, true/false for boolean, or text for string
            </p>
          </div>
        </TabPanel>

        {/* ==================== RANDOM MODE ==================== */}
        <TabPanel id="random" activeTab={node.data.mode}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Min Value</label>
              <input
                type="number"
                value={node.data.randomMin ?? 1}
                onChange={(e) => updateData({ randomMin: parseInt(e.target.value) || 1 })}
                className="input"
              />
            </div>
            <div>
              <label className="input-label">Max Value</label>
              <input
                type="number"
                value={node.data.randomMax ?? 10}
                onChange={(e) => updateData({ randomMax: parseInt(e.target.value) || 10 })}
                className="input"
              />
            </div>
          </div>
          <p className="text-xs text-editor-muted mt-2">
            Generates a random integer between min and max (inclusive)
          </p>
        </TabPanel>
      </div>

      {/* Preview */}
      <div className="bg-editor-bg rounded-lg p-3">
        <label className="input-label">Logic Preview</label>
        <p className="text-sm font-mono text-node-modifier">
          {formatPreview()}
        </p>
      </div>
    </div>
  );
}
