/**
 * =============================================================================
 * CHOICE INSPECTOR COMPONENT
 * =============================================================================
 *
 * Inspector panel for Choice Nodes.
 * Allows configuring the condition that determines branching.
 *
 * =============================================================================
 */

import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import type { ChoiceNode, Condition, Variable, VariableType } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import { Button } from '@components/common';
import { generateId } from '@/utils/idGenerator';

/**
 * OPERATOR OPTIONS
 * Available comparison operators.
 */
const OPERATORS = [
  { value: '>', label: 'Greater than (>)' },
  { value: '<', label: 'Less than (<)' },
  { value: '=', label: 'Equals (=)' },
  { value: '!=', label: 'Not equals (≠)' },
  { value: '>=', label: 'Greater or equal (≥)' },
  { value: '<=', label: 'Less or equal (≤)' },
  { value: 'contains', label: 'Contains (for lists)' },
];

/**
 * CHOICE INSPECTOR PROPS
 */
interface ChoiceInspectorProps {
  node: ChoiceNode;
}

/**
 * CHOICE INSPECTOR COMPONENT
 */
export default function ChoiceInspector({ node }: ChoiceInspectorProps) {
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
  const updateData = (updates: Partial<ChoiceNode['data']>) => {
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
   * Update condition
   */
  const updateCondition = (updates: Partial<Condition>) => {
    updateData({
      condition: { ...node.data.condition, ...updates },
    });
  };

  // Get variables for dropdown
  const variables = currentProject?.globalVariables || [];

  // Format the condition preview
  const formatConditionPreview = () => {
    const c = node.data.condition;
    if (!c.variableA) return 'No condition set';

    const ops: Record<string, string> = {
      '>': '>',
      '<': '<',
      '=': '=',
      '!=': '≠',
      '>=': '≥',
      '<=': '≤',
      'contains': 'contains',
    };

    const op = ops[c.operator] || c.operator;
    const value = c.useVariable ? `[${c.valueB}]` : c.valueB;

    return `Check if: ${c.variableA} ${op} ${value}`;
  };

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
          placeholder="Choice name"
        />
      </div>

      {/* Condition section */}
      <div className="space-y-4">
        <h4 className="font-medium text-editor-text">Condition Check</h4>

        {/* Variable A */}
        <div>
          <label className="input-label">Variable to Check</label>
          <div className="flex gap-2">
            <select
              value={node.data.condition.variableA}
              onChange={(e) => updateCondition({ variableA: e.target.value })}
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
                  ? 'bg-node-choice/20 border-node-choice text-node-choice'
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
                    updateCondition({ variableA: newVariable.name });

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

        {/* Operator */}
        <div>
          <label className="input-label">Comparison</label>
          <select
            value={node.data.condition.operator}
            onChange={(e) =>
              updateCondition({
                operator: e.target.value as Condition['operator'],
              })
            }
            className="input"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {/* Value B */}
        <div>
          <label className="input-label">Compare To</label>
          <div className="flex gap-2 items-center mb-2">
            <label className="flex items-center gap-1 text-sm text-editor-muted cursor-pointer">
              <input
                type="radio"
                name="valueType"
                checked={!node.data.condition.useVariable}
                onChange={() => updateCondition({ useVariable: false })}
              />
              Value
            </label>
            <label className="flex items-center gap-1 text-sm text-editor-muted cursor-pointer">
              <input
                type="radio"
                name="valueType"
                checked={node.data.condition.useVariable}
                onChange={() => updateCondition({ useVariable: true })}
              />
              Variable
            </label>
          </div>

          {node.data.condition.useVariable ? (
            <select
              value={String(node.data.condition.valueB)}
              onChange={(e) => updateCondition({ valueB: e.target.value })}
              className="input"
            >
              <option value="">Select variable...</option>
              {variables.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={String(node.data.condition.valueB)}
              onChange={(e) => {
                // Try to parse as number
                const numValue = parseFloat(e.target.value);
                const value = isNaN(numValue) ? e.target.value : numValue;
                updateCondition({ valueB: value });
              }}
              className="input"
              placeholder="Enter value"
            />
          )}
        </div>

        {/* Preview */}
        <div className="bg-editor-bg rounded-lg p-3">
          <label className="input-label">Logic Preview</label>
          <p className="text-sm font-mono text-node-choice">
            {formatConditionPreview()}
          </p>
        </div>
      </div>

      {/* Outputs info */}
      <div className="bg-editor-surface border border-editor-border rounded-lg p-4">
        <h4 className="font-medium text-editor-text mb-2">Outputs</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-editor-text">On Success (True)</span>
          </div>
          <p className="text-editor-muted ml-5">
            Follows this path when condition is true
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-editor-text">On Failure (False)</span>
          </div>
          <p className="text-editor-muted ml-5">
            Follows this path when condition is false
          </p>
        </div>
      </div>
    </div>
  );
}
