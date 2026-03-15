/**
 * =============================================================================
 * HUD COMPONENT (Heads-Up Display)
 * =============================================================================
 *
 * Displays player stats and inventory during gameplay.
 *
 * FEATURES:
 * - Dynamic stat bars based on project variables with showInHUD enabled
 * - Configurable colors for each variable
 * - Inventory grid
 *
 * POSITION:
 * - Stats: Top-left
 * - Inventory: Top-right
 *
 * =============================================================================
 */

import React from 'react';
import {
  Heart,
  Zap,
  Brain,
  Coins,
  Star,
  Shield,
  Sword,
  Clock,
  Eye,
  MessageCircle,
  Dumbbell,
  Activity,
} from 'lucide-react';
import type { Variable, VariableValue, HudIcon } from '@/types';

/**
 * HUD PROPS
 */
interface HUDProps {
  /** Current variable values at runtime */
  variables: Record<string, VariableValue>;
  /** Variable definitions from the project (to get display settings) */
  variableDefinitions?: Variable[];
}

/**
 * ICON MAP
 * Maps HudIcon types to actual icon components.
 */
const ICON_MAP: Record<HudIcon, React.ComponentType<any>> = {
  heart: Heart,
  mana: Zap,
  energy: Activity,
  coin: Coins,
  star: Star,
  shield: Shield,
  sword: Sword,
  clock: Clock,
  brain: Brain,
  muscle: Dumbbell,
  eye: Eye,
  chat: MessageCircle,
  custom: Star, // Fallback for custom icons
};

/**
 * HUD COMPONENT
 */
export default function HUD({ variables, variableDefinitions = [] }: HUDProps) {
  // Filter variables that should be shown in HUD
  const hudVariables = variableDefinitions.filter(
    (v) => v.showInHUD && (v.type === 'integer' || v.type === 'float')
  );

  // Check if we have any HUD variables to display
  const hasHudVariables = hudVariables.length > 0;

  // Check for inventory
  const inventoryVar = variableDefinitions.find(
    (v) => v.type === 'collection' && v.name.toLowerCase() === 'inventory'
  );
  const inventoryItems = inventoryVar
    ? (variables[inventoryVar.name] as string[] || [])
    : [];

  return (
    <>
      {/* Stats - Top Left */}
      {hasHudVariables && (
        <div className="absolute top-20 left-6 space-y-3 pointer-events-auto">
          {hudVariables.map((varDef) => {
            const value = typeof variables[varDef.name] === 'number'
              ? (variables[varDef.name] as number)
              : (varDef.defaultValue as number);
            const max = varDef.maxValue || 100;
            const min = varDef.minValue || 0;
            const range = max - min;
            const percentage = Math.min(100, Math.max(0, ((value - min) / range) * 100));
            const color = varDef.hudColor || '#22c55e'; // Default green
            const Icon = varDef.hudIcon ? ICON_MAP[varDef.hudIcon] : Star;

            return (
              <StatBar
                key={varDef.id}
                name={varDef.name}
                value={value}
                max={max}
                percentage={percentage}
                color={color}
                Icon={Icon}
              />
            );
          })}

          {/* Gold display (non-bar format for currency-type variables) */}
          {variableDefinitions
            .filter((v) => v.hudIcon === 'coin' && !v.maxValue && v.showInHUD)
            .map((varDef) => {
              const value = variables[varDef.name];
              if (typeof value !== 'number') return null;
              return (
                <div key={varDef.id} className="flex items-center gap-2 text-yellow-400 player-box px-3 py-2">
                  <Coins size={20} />
                  <span className="font-bold">{value}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* Inventory - Top Right */}
      {inventoryVar && (
        <div className="absolute top-20 right-6 pointer-events-auto">
          <Inventory items={inventoryItems} />
        </div>
      )}
    </>
  );
}

/**
 * STAT BAR COMPONENT
 */
interface StatBarProps {
  name: string;
  value: number;
  max: number;
  percentage: number;
  color: string;
  Icon: React.ComponentType<any>;
}

function StatBar({ name, value, max, percentage, color, Icon }: StatBarProps) {
  return (
    <div className="player-box px-3 py-2 w-48">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color }} />
          <span className="text-sm font-medium" style={{ color: 'var(--player-text)' }}>
            {name}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--player-text-muted)' }}>
          {Math.round(value)}/{max}
        </span>
      </div>
      {/* Progress bar track - uses semi-transparent white for visibility */}
      {/* Height increased to h-4 (1.5x the original h-3) for better visibility */}
      <div
        className="h-4 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
      >
        {/* Progress bar fill - uses user-selected color with glow effect */}
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}, 0 0 20px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * INVENTORY COMPONENT
 */
interface InventoryProps {
  items: string[];
}

function Inventory({ items }: InventoryProps) {
  // Show empty grid if no items
  const slots = items.length > 0 ? items : ['', '', ''];

  return (
    <div className="player-box p-3">
      <div className="grid grid-cols-3 gap-2">
        {slots.slice(0, 9).map((item, index) => (
          <div
            key={index}
            className={`
              w-12 h-12 rounded-lg
              flex items-center justify-center
              border border-white/10
              ${item ? 'bg-white/10' : 'bg-black/20'}
            `}
            title={item || 'Empty slot'}
          >
            {item && (
              <span className="text-2xl">
                {getItemEmoji(item)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * GET ITEM EMOJI
 * Maps item names to emojis (placeholder for actual item icons).
 */
function getItemEmoji(itemName: string): string {
  const itemEmojis: Record<string, string> = {
    sword: '⚔️',
    shield: '🛡️',
    key: '🔑',
    potion: '🧪',
    scroll: '📜',
    gold: '💰',
    gem: '💎',
    book: '📕',
    map: '🗺️',
    torch: '🔦',
  };

  return itemEmojis[itemName.toLowerCase()] || '📦';
}
