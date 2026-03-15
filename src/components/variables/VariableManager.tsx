/**
 * =============================================================================
 * VARIABLE MANAGER COMPONENT
 * =============================================================================
 *
 * A modal for managing global game variables.
 *
 * WHAT ARE VARIABLES?
 * Variables store data that changes during the game:
 * - Player stats like Health (HP), Mana, Gold
 * - Flags like "HasKey", "DoorOpened", "MetTheKing"
 * - Counters like "EnemiesDefeated", "DaysElapsed"
 * - Lists like Inventory items
 *
 * This modal allows users to:
 * - View all existing variables
 * - Create new variables
 * - Edit variable properties (including HUD display settings)
 * - Delete variables
 *
 * =============================================================================
 */

import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Heart,
  Zap,
  Coins,
  Star,
  Shield,
  HelpCircle,
  Edit2,
  Check,
  Sword,
  Clock,
  Brain,
  Dumbbell,
  Activity,
} from 'lucide-react';
import type { Variable, VariableType, HudIcon } from '@/types';
import { useProjectStore } from '@stores/useProjectStore';
import { Button, Modal } from '@components/common';
import { generateId } from '@/utils/idGenerator';

/**
 * VARIABLE MANAGER PROPS
 */
interface VariableManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * AVAILABLE VARIABLE TYPES
 */
const VARIABLE_TYPES: { value: VariableType; label: string; description: string }[] = [
  { value: 'integer', label: 'Number (Integer)', description: 'Whole numbers like 1, 42, 100' },
  { value: 'float', label: 'Number (Decimal)', description: 'Decimal numbers like 3.14, 0.5' },
  { value: 'boolean', label: 'True/False', description: 'Yes/No, On/Off, Has/HasNot' },
  { value: 'string', label: 'Text', description: 'Names, messages, any text' },
  { value: 'collection', label: 'List', description: 'Collection of items (like inventory)' },
];

/**
 * AVAILABLE HUD ICONS
 */
const HUD_ICONS: { value: HudIcon; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'heart', label: 'Heart', icon: Heart },
  { value: 'mana', label: 'Mana', icon: Zap },
  { value: 'energy', label: 'Energy', icon: Activity },
  { value: 'coin', label: 'Coin', icon: Coins },
  { value: 'star', label: 'Star', icon: Star },
  { value: 'shield', label: 'Shield', icon: Shield },
  { value: 'sword', label: 'Sword', icon: Sword },
  { value: 'clock', label: 'Clock', icon: Clock },
  { value: 'brain', label: 'Brain', icon: Brain },
  { value: 'muscle', label: 'Muscle', icon: Dumbbell },
];

/**
 * AVAILABLE HUD COLORS
 * Wide variety of colors for progress bars
 */
const HUD_COLORS: { value: string; label: string }[] = [
  { value: '#22c55e', label: 'Green' },
  { value: '#ef4444', label: 'Red' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#f59e0b', label: 'Amber/Gold' },
  { value: '#84cc16', label: 'Lime' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#a855f7', label: 'Violet' },
  { value: '#f43f5e', label: 'Rose' },
  { value: '#64748b', label: 'Gray' },
];

/**
 * VARIABLE MANAGER COMPONENT
 */
export default function VariableManager({ isOpen, onClose }: VariableManagerProps) {
  // Use targeted selectors to avoid re-rendering on unrelated store changes
  const currentProject = useProjectStore(s => s.currentProject);
  const addVariable = useProjectStore(s => s.addVariable);
  const updateVariable = useProjectStore(s => s.updateVariable);
  const deleteVariable = useProjectStore(s => s.deleteVariable);

  // State for new variable form
  const [isCreating, setIsCreating] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<VariableType>('integer');
  const [newVarDefault, setNewVarDefault] = useState<string>('100');
  const [newVarShowHUD, setNewVarShowHUD] = useState(true);
  const [newVarIcon, setNewVarIcon] = useState<HudIcon>('heart');
  const [newVarColor, setNewVarColor] = useState('#22c55e');
  const [newVarMin, setNewVarMin] = useState<string>('0');
  const [newVarMax, setNewVarMax] = useState<string>('100');

  // State for editing
  const [editingId, setEditingId] = useState<string | null>(null);

  // Get existing variables
  const variables = currentProject?.globalVariables || [];

  /**
   * Create a new variable
   */
  const handleCreate = () => {
    if (!newVarName.trim()) {
      alert('Please enter a variable name');
      return;
    }

    // Check for duplicate name
    if (variables.some((v) => v.name.toLowerCase() === newVarName.toLowerCase())) {
      alert('A variable with this name already exists');
      return;
    }

    // Parse default value based on type
    let defaultValue: any;
    switch (newVarType) {
      case 'integer':
        defaultValue = parseInt(newVarDefault) || 0;
        break;
      case 'float':
        defaultValue = parseFloat(newVarDefault) || 0;
        break;
      case 'boolean':
        defaultValue = newVarDefault.toLowerCase() === 'true';
        break;
      case 'string':
        defaultValue = newVarDefault;
        break;
      case 'collection':
        defaultValue = [];
        break;
    }

    const newVariable: Variable = {
      id: generateId('var'),
      name: newVarName.trim(),
      type: newVarType,
      defaultValue,
      showInHUD: newVarShowHUD && (newVarType === 'integer' || newVarType === 'float'),
      hudIcon: newVarShowHUD ? newVarIcon : undefined,
      hudColor: newVarShowHUD ? newVarColor : undefined,
      minValue: (newVarType === 'integer' || newVarType === 'float') ? parseInt(newVarMin) || 0 : undefined,
      maxValue: (newVarType === 'integer' || newVarType === 'float') ? parseInt(newVarMax) || 100 : undefined,
    };

    addVariable(newVariable);

    // Reset form
    setNewVarName('');
    setNewVarType('integer');
    setNewVarDefault('100');
    setNewVarShowHUD(true);
    setNewVarIcon('heart');
    setNewVarColor('#22c55e');
    setNewVarMin('0');
    setNewVarMax('100');
    setIsCreating(false);
  };

  /**
   * Delete a variable with confirmation
   */
  const handleDelete = (variable: Variable) => {
    if (confirm(`Delete variable "${variable.name}"? This cannot be undone.`)) {
      deleteVariable(variable.id);
    }
  };

  /**
   * Toggle HUD visibility
   */
  const toggleHUD = (variable: Variable) => {
    updateVariable(variable.id, { showInHUD: !variable.showInHUD });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Variable Manager"
      size="lg"
    >
      {/* Help section */}
      <div className="bg-editor-bg rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="text-editor-accent flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm">
            <p className="font-medium text-editor-text mb-1">What are Variables?</p>
            <p className="text-editor-muted">
              Variables store information that can change during your game.
              For example, a player's health starts at 100 but decreases when they take damage.
              Variables with "Show in HUD" enabled will display as stat bars during gameplay.
            </p>
          </div>
        </div>
      </div>

      {/* Variable list */}
      <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
        {variables.length === 0 ? (
          <div className="text-center py-8 text-editor-muted">
            <p className="mb-2">No variables yet.</p>
            <p className="text-sm">Create your first variable to track player stats, flags, or items.</p>
          </div>
        ) : (
          variables.map((variable) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              isEditing={editingId === variable.id}
              onStartEdit={() => setEditingId(variable.id)}
              onStopEdit={() => setEditingId(null)}
              onToggleHUD={() => toggleHUD(variable)}
              onDelete={() => handleDelete(variable)}
              onUpdate={(updates) => updateVariable(variable.id, updates)}
            />
          ))
        )}
      </div>

      {/* Create new variable section */}
      {isCreating ? (
        <div className="border border-editor-border rounded-lg p-4 space-y-4">
          <h4 className="font-medium text-editor-text">Create New Variable</h4>

          {/* Name */}
          <div>
            <label className="input-label">Variable Name</label>
            <input
              type="text"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value.replace(/\s/g, '_'))}
              className="input"
              placeholder="e.g., Health, Has_Key, Gold"
            />
          </div>

          {/* Type */}
          <div>
            <label className="input-label">Type</label>
            <select
              value={newVarType}
              onChange={(e) => setNewVarType(e.target.value as VariableType)}
              className="input"
            >
              {VARIABLE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Default Value */}
          <div>
            <label className="input-label">Starting Value</label>
            {newVarType === 'boolean' ? (
              <select
                value={newVarDefault}
                onChange={(e) => setNewVarDefault(e.target.value)}
                className="input"
              >
                <option value="false">False (No)</option>
                <option value="true">True (Yes)</option>
              </select>
            ) : newVarType === 'collection' ? (
              <p className="text-sm text-editor-muted">Lists start empty</p>
            ) : (
              <input
                type={newVarType === 'string' ? 'text' : 'number'}
                value={newVarDefault}
                onChange={(e) => setNewVarDefault(e.target.value)}
                className="input"
              />
            )}
          </div>

          {/* String variable hint */}
          {newVarType === 'string' && (
            <div className="bg-editor-bg rounded-lg p-3 text-sm text-editor-muted">
              <p className="font-medium text-editor-text mb-1">String Variables</p>
              <p>
                Use <code className="bg-black/30 px-1 rounded">{`{{${newVarName || 'variable-name'}}}`}</code> in
                your scene text to display this variable's value.
              </p>
              <p className="mt-1">
                String variables are useful for dynamic text like character names,
                conditional messages, or story elements that change based on player choices.
              </p>
              <p className="mt-1 text-xs">
                Variable names can contain letters, numbers, underscores, and hyphens.
              </p>
            </div>
          )}

          {/* HUD Settings (only for numbers) */}
          {(newVarType === 'integer' || newVarType === 'float') && (
            <>
              {/* Show in HUD checkbox */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newVarShowHUD}
                  onChange={(e) => setNewVarShowHUD(e.target.checked)}
                  className="rounded border-editor-border"
                />
                <span className="text-sm text-editor-text">Show in player HUD (as progress bar)</span>
              </label>

              {newVarShowHUD && (
                <div className="pl-6 space-y-4 border-l-2 border-editor-accent/30">
                  {/* Min/Max */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="input-label">Minimum Value</label>
                      <input
                        type="number"
                        value={newVarMin}
                        onChange={(e) => setNewVarMin(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="input-label">Maximum Value</label>
                      <input
                        type="number"
                        value={newVarMax}
                        onChange={(e) => setNewVarMax(e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="input-label">Icon</label>
                    <div className="flex flex-wrap gap-2">
                      {HUD_ICONS.map((iconOpt) => {
                        const IconComp = iconOpt.icon;
                        return (
                          <button
                            key={iconOpt.value}
                            type="button"
                            onClick={() => setNewVarIcon(iconOpt.value)}
                            className={`p-2 rounded-lg border-2 transition-colors ${
                              newVarIcon === iconOpt.value
                                ? 'border-editor-accent bg-editor-accent/20'
                                : 'border-editor-border hover:border-editor-accent/50'
                            }`}
                            title={iconOpt.label}
                          >
                            <IconComp size={20} style={{ color: newVarColor }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="input-label">Bar Color</label>
                    <div className="flex flex-wrap gap-2">
                      {HUD_COLORS.map((colorOpt) => (
                        <button
                          key={colorOpt.value}
                          type="button"
                          onClick={() => setNewVarColor(colorOpt.value)}
                          className={`w-8 h-8 rounded-lg border-2 transition-all ${
                            newVarColor === colorOpt.value
                              ? 'border-white scale-110'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: colorOpt.value }}
                          title={colorOpt.label}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div>
                    <label className="input-label">Preview</label>
                    <div className="bg-black/50 rounded-lg p-3 w-48">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const IconComp = HUD_ICONS.find((i) => i.value === newVarIcon)?.icon || Star;
                            return <IconComp size={16} style={{ color: newVarColor }} />;
                          })()}
                          <span className="text-sm font-medium text-white">{newVarName || 'Variable'}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {newVarDefault}/{newVarMax}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (parseInt(newVarDefault) / parseInt(newVarMax)) * 100)}%`,
                            backgroundColor: newVarColor,
                            boxShadow: `0 0 8px ${newVarColor}50`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>
              Create Variable
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          leftIcon={<Plus size={18} />}
          onClick={() => setIsCreating(true)}
          fullWidth
        >
          Create New Variable
        </Button>
      )}

      {/* Quick templates */}
      {!isCreating && variables.length === 0 && (
        <div className="mt-4 pt-4 border-t border-editor-border">
          <p className="text-sm text-editor-muted mb-3">Quick Start Templates:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                addVariable({
                  id: generateId('var'),
                  name: 'Health',
                  type: 'integer',
                  defaultValue: 100,
                  showInHUD: true,
                  hudIcon: 'heart',
                  hudColor: '#22c55e',
                  maxValue: 100,
                  minValue: 0,
                });
              }}
            >
              + Health (Green)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                addVariable({
                  id: generateId('var'),
                  name: 'Mana',
                  type: 'integer',
                  defaultValue: 50,
                  showInHUD: true,
                  hudIcon: 'mana',
                  hudColor: '#3b82f6',
                  maxValue: 50,
                  minValue: 0,
                });
              }}
            >
              + Mana (Blue)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                addVariable({
                  id: generateId('var'),
                  name: 'Gold',
                  type: 'integer',
                  defaultValue: 0,
                  showInHUD: true,
                  hudIcon: 'coin',
                  hudColor: '#eab308',
                  minValue: 0,
                });
              }}
            >
              + Gold
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                addVariable({
                  id: generateId('var'),
                  name: 'Inventory',
                  type: 'collection',
                  defaultValue: [],
                  showInHUD: false,
                });
              }}
            >
              + Inventory
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                addVariable({
                  id: generateId('var'),
                  name: 'PlayerName',
                  type: 'string',
                  defaultValue: 'Adventurer',
                  showInHUD: false,
                  description: 'The player character name',
                });
              }}
            >
              + Player Name (Text)
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * VARIABLE ROW COMPONENT
 */
interface VariableRowProps {
  variable: Variable;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onToggleHUD: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<Variable>) => void;
}

function VariableRow({
  variable,
  isEditing,
  onStartEdit,
  onStopEdit,
  onToggleHUD,
  onDelete,
  onUpdate,
}: VariableRowProps) {
  // Local edit state
  const [editMin, setEditMin] = useState(String(variable.minValue || 0));
  const [editMax, setEditMax] = useState(String(variable.maxValue || 100));
  const [editIcon, setEditIcon] = useState<HudIcon>(variable.hudIcon || 'star');
  const [editColor, setEditColor] = useState(variable.hudColor || '#22c55e');
  const [editStringValue, setEditStringValue] = useState(String(variable.defaultValue || ''));

  // Get type color
  const getTypeColor = () => {
    switch (variable.type) {
      case 'integer':
      case 'float':
        return 'text-blue-400';
      case 'boolean':
        return 'text-yellow-400';
      case 'string':
        return 'text-green-400';
      case 'collection':
        return 'text-purple-400';
      default:
        return 'text-editor-muted';
    }
  };

  // Format default value for display
  const formatValue = () => {
    if (variable.type === 'boolean') {
      return variable.defaultValue ? 'True' : 'False';
    }
    if (variable.type === 'collection') {
      return '[ ]';
    }
    if (variable.type === 'string') {
      const str = String(variable.defaultValue);
      // Truncate long strings for display
      return str.length > 25 ? `"${str.substring(0, 22)}..."` : `"${str}"`;
    }
    return String(variable.defaultValue);
  };

  const handleSaveEdit = () => {
    onUpdate({
      minValue: parseInt(editMin) || 0,
      maxValue: parseInt(editMax) || 100,
      hudIcon: editIcon,
      hudColor: editColor,
    });
    onStopEdit();
  };

  if (isEditing && (variable.type === 'integer' || variable.type === 'float')) {
    return (
      <div className="p-3 bg-editor-surface rounded-lg border border-editor-accent space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-editor-text">{variable.name}</p>
          <div className="flex gap-2">
            <button
              onClick={onStopEdit}
              className="p-1 rounded text-editor-muted hover:text-editor-text"
            >
              <X size={16} />
            </button>
            <button
              onClick={handleSaveEdit}
              className="p-1 rounded text-editor-accent hover:bg-editor-accent/20"
            >
              <Check size={16} />
            </button>
          </div>
        </div>

        {/* Min/Max */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-editor-muted">Min</label>
            <input
              type="number"
              value={editMin}
              onChange={(e) => setEditMin(e.target.value)}
              className="input text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-editor-muted">Max</label>
            <input
              type="number"
              value={editMax}
              onChange={(e) => setEditMax(e.target.value)}
              className="input text-sm"
            />
          </div>
        </div>

        {/* Icon */}
        <div>
          <label className="text-xs text-editor-muted">Icon</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {HUD_ICONS.map((iconOpt) => {
              const IconComp = iconOpt.icon;
              return (
                <button
                  key={iconOpt.value}
                  type="button"
                  onClick={() => setEditIcon(iconOpt.value)}
                  className={`p-1.5 rounded border ${
                    editIcon === iconOpt.value
                      ? 'border-editor-accent bg-editor-accent/20'
                      : 'border-editor-border'
                  }`}
                >
                  <IconComp size={16} style={{ color: editColor }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="text-xs text-editor-muted">Color</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {HUD_COLORS.map((colorOpt) => (
              <button
                key={colorOpt.value}
                type="button"
                onClick={() => setEditColor(colorOpt.value)}
                className={`w-6 h-6 rounded border ${
                  editColor === colorOpt.value ? 'border-white' : 'border-transparent'
                }`}
                style={{ backgroundColor: colorOpt.value }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Editing mode for string variables
  if (isEditing && variable.type === 'string') {
    const handleSaveStringEdit = () => {
      onUpdate({ defaultValue: editStringValue });
      onStopEdit();
    };

    return (
      <div className="p-3 bg-editor-surface rounded-lg border border-editor-accent space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-editor-text">{variable.name}</p>
          <div className="flex gap-2">
            <button
              onClick={onStopEdit}
              className="p-1 rounded text-editor-muted hover:text-editor-text"
            >
              <X size={16} />
            </button>
            <button
              onClick={handleSaveStringEdit}
              className="p-1 rounded text-editor-accent hover:bg-editor-accent/20"
            >
              <Check size={16} />
            </button>
          </div>
        </div>

        {/* Default Text Value */}
        <div>
          <label className="text-xs text-editor-muted">Default Text Value</label>
          <textarea
            value={editStringValue}
            onChange={(e) => setEditStringValue(e.target.value)}
            className="input text-sm min-h-[80px] resize-y"
            placeholder="Enter default text..."
          />
        </div>

        {/* Usage hint */}
        <div className="text-xs text-editor-muted bg-editor-bg rounded p-2">
          <p>
            Use <code className="bg-black/30 px-1 rounded">{`{{${variable.name}}}`}</code> in
            scene text, speaker name, or choice labels to display this value.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-editor-surface rounded-lg border border-editor-border">
      {/* Color indicator */}
      {variable.showInHUD && variable.hudColor && (
        <div
          className="w-2 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: variable.hudColor }}
        />
      )}

      {/* Name and type */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-editor-text truncate">{variable.name}</p>
        <p className={`text-xs ${getTypeColor()}`}>
          {VARIABLE_TYPES.find((t) => t.value === variable.type)?.label || variable.type}
          <span className="text-editor-muted ml-2">= {formatValue()}</span>
          {variable.maxValue && (
            <span className="text-editor-muted ml-1">(max: {variable.maxValue})</span>
          )}
        </p>
      </div>

      {/* Edit button (for numeric and string types) */}
      {(variable.type === 'integer' || variable.type === 'float' || variable.type === 'string') && (
        <button
          onClick={onStartEdit}
          className="p-2 rounded-lg text-editor-muted hover:text-editor-text hover:bg-editor-bg"
          title={variable.type === 'string' ? 'Edit default text' : 'Edit HUD settings'}
        >
          <Edit2 size={16} />
        </button>
      )}

      {/* HUD toggle - only for numeric types (not string, boolean, or collection) */}
      {(variable.type === 'integer' || variable.type === 'float') && (
        <button
          onClick={onToggleHUD}
          className={`p-2 rounded-lg transition-colors ${
            variable.showInHUD
              ? 'bg-editor-accent/20 text-editor-accent'
              : 'bg-editor-bg text-editor-muted hover:text-editor-text'
          }`}
          title={variable.showInHUD ? 'Visible in HUD' : 'Hidden from HUD'}
        >
          {variable.showInHUD ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="p-2 rounded-lg text-editor-muted hover:text-error hover:bg-error/10"
        title="Delete variable"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
