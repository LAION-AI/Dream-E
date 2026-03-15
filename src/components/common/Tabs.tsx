/**
 * =============================================================================
 * TABS COMPONENT
 * =============================================================================
 *
 * A reusable tab navigation component.
 *
 * TABS ARE USED FOR:
 * - Inspector panels (Media / Content / Outputs)
 * - Modifier modes (Math / Set / Random)
 * - Settings sections
 *
 * ACCESSIBILITY:
 * - Keyboard navigation (arrow keys)
 * - ARIA roles for screen readers
 * - Visual focus indicators
 *
 * =============================================================================
 */

import React, { useState, useCallback } from 'react';

/**
 * TAB ITEM INTERFACE
 * Defines a single tab.
 */
export interface TabItem {
  /**
   * Unique identifier for the tab.
   */
  id: string;

  /**
   * Display label for the tab.
   */
  label: string;

  /**
   * Optional icon to display before the label.
   */
  icon?: React.ReactNode;

  /**
   * Whether the tab is disabled.
   */
  disabled?: boolean;
}

/**
 * TABS PROPS INTERFACE
 */
export interface TabsProps {
  /**
   * List of tabs to display.
   */
  tabs: TabItem[];

  /**
   * Currently active tab ID.
   */
  activeTab: string;

  /**
   * Callback when tab changes.
   */
  onTabChange: (tabId: string) => void;

  /**
   * Visual variant of the tabs.
   * @default 'default'
   */
  variant?: 'default' | 'pills' | 'underline';

  /**
   * Size of the tabs.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Whether tabs should take full width.
   * @default false
   */
  fullWidth?: boolean;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

/**
 * TABS COMPONENT
 * Renders a horizontal tab bar.
 *
 * @example
 * const [activeTab, setActiveTab] = useState('media');
 *
 * <Tabs
 *   tabs={[
 *     { id: 'media', label: 'Media' },
 *     { id: 'content', label: 'Content' },
 *     { id: 'outputs', label: 'Outputs' },
 *   ]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 */
export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className = '',
}: TabsProps) {
  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, currentIndex: number) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      const currentTabIndex = enabledTabs.findIndex(
        (t) => t.id === tabs[currentIndex].id
      );

      let newIndex: number | null = null;

      switch (event.key) {
        case 'ArrowLeft':
          // Move to previous tab
          newIndex = currentTabIndex > 0 ? currentTabIndex - 1 : enabledTabs.length - 1;
          break;
        case 'ArrowRight':
          // Move to next tab
          newIndex = currentTabIndex < enabledTabs.length - 1 ? currentTabIndex + 1 : 0;
          break;
        case 'Home':
          // Move to first tab
          newIndex = 0;
          break;
        case 'End':
          // Move to last tab
          newIndex = enabledTabs.length - 1;
          break;
      }

      if (newIndex !== null) {
        event.preventDefault();
        onTabChange(enabledTabs[newIndex].id);
      }
    },
    [tabs, onTabChange]
  );

  // Size styles
  const sizeStyles = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-base px-4 py-2',
    lg: 'text-lg px-5 py-2.5',
  };

  // Variant styles
  const getTabClasses = (tab: TabItem, isActive: boolean) => {
    const base = `
      ${sizeStyles[size]}
      font-medium
      transition-all duration-200
      focus:outline-none focus:ring-2 focus:ring-editor-accent focus:ring-offset-1 focus:ring-offset-editor-bg
      disabled:opacity-50 disabled:cursor-not-allowed
      ${fullWidth ? 'flex-1' : ''}
    `;

    const variants = {
      default: `
        rounded-t-lg
        ${isActive
          ? 'bg-editor-surface text-editor-text border-b-2 border-editor-accent'
          : 'text-editor-muted hover:text-editor-text hover:bg-editor-surface/50'
        }
      `,
      pills: `
        rounded-button
        ${isActive
          ? 'bg-editor-accent text-white'
          : 'text-editor-muted hover:text-editor-text hover:bg-editor-surface'
        }
      `,
      underline: `
        border-b-2
        ${isActive
          ? 'border-editor-accent text-editor-accent'
          : 'border-transparent text-editor-muted hover:text-editor-text hover:border-editor-border'
        }
      `,
    };

    return `${base} ${variants[variant]}`;
  };

  return (
    <div
      className={`flex ${fullWidth ? 'w-full' : ''} ${className}`}
      role="tablist"
      aria-label="Tabs"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            className={getTabClasses(tab, isActive)}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {tab.icon && (
              <span className="mr-2 inline-flex items-center">{tab.icon}</span>
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * TAB PANEL COMPONENT
 * Container for tab content.
 *
 * @example
 * <TabPanel id="media" activeTab={activeTab}>
 *   <MediaUploader />
 * </TabPanel>
 */
export interface TabPanelProps {
  /**
   * Panel ID (should match tab ID).
   */
  id: string;

  /**
   * Currently active tab ID.
   */
  activeTab: string;

  /**
   * Panel content.
   */
  children: React.ReactNode;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

export function TabPanel({
  id,
  activeTab,
  children,
  className = '',
}: TabPanelProps) {
  const isActive = id === activeTab;

  if (!isActive) return null;

  return (
    <div
      id={`tabpanel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={`animate-fade-in ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * TABBED CONTAINER COMPONENT
 * Combines Tabs and TabPanels for easy use.
 *
 * @example
 * <TabbedContainer
 *   tabs={[
 *     { id: 'media', label: 'Media', content: <MediaTab /> },
 *     { id: 'content', label: 'Content', content: <ContentTab /> },
 *   ]}
 * />
 */
export interface TabbedContainerProps {
  tabs: Array<TabItem & { content: React.ReactNode }>;
  defaultTab?: string;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  panelClassName?: string;
}

export function TabbedContainer({
  tabs,
  defaultTab,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className = '',
  panelClassName = '',
}: TabbedContainerProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');

  return (
    <div className={className}>
      <Tabs
        tabs={tabs.map(({ id, label, icon, disabled }) => ({
          id,
          label,
          icon,
          disabled,
        }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        variant={variant}
        size={size}
        fullWidth={fullWidth}
      />

      <div className={`mt-4 ${panelClassName}`}>
        {tabs.map((tab) => (
          <TabPanel key={tab.id} id={tab.id} activeTab={activeTab}>
            {tab.content}
          </TabPanel>
        ))}
      </div>
    </div>
  );
}

export default Tabs;
