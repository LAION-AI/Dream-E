/**
 * =============================================================================
 * BUTTON COMPONENT
 * =============================================================================
 *
 * A reusable button component with multiple variants and sizes.
 *
 * DESIGN PHILOSOPHY:
 * Buttons are one of the most common UI elements. Having a consistent
 * button component ensures:
 * - Visual consistency across the app
 * - Accessibility features built-in
 * - Easy updates to all buttons from one place
 *
 * VARIANTS:
 * - primary: Main action buttons (blue background)
 * - secondary: Secondary actions (gray background)
 * - ghost: Text-only buttons for tertiary actions
 * - danger: Destructive actions (red)
 *
 * =============================================================================
 */

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * BUTTON VARIANT TYPE
 * The visual style of the button.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * BUTTON SIZE TYPE
 * The size of the button.
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * BUTTON PROPS INTERFACE
 * Props accepted by the Button component.
 *
 * Extends HTML button attributes for full flexibility.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant of the button.
   * @default 'primary'
   */
  variant?: ButtonVariant;

  /**
   * Size of the button.
   * @default 'md'
   */
  size?: ButtonSize;

  /**
   * Whether the button is in a loading state.
   * Shows a spinner and disables interaction.
   */
  isLoading?: boolean;

  /**
   * Icon to display before the button text.
   */
  leftIcon?: React.ReactNode;

  /**
   * Icon to display after the button text.
   */
  rightIcon?: React.ReactNode;

  /**
   * Makes the button take full width of its container.
   */
  fullWidth?: boolean;
}

/**
 * VARIANT STYLES
 * CSS classes for each button variant.
 */
const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-editor-accent text-white
    hover:bg-editor-accent/80
    focus:ring-editor-accent
    disabled:bg-editor-accent/50
  `,
  secondary: `
    bg-editor-surface text-editor-text
    border border-editor-border
    hover:bg-editor-surface/80
    focus:ring-editor-border
    disabled:bg-editor-surface/50
  `,
  ghost: `
    bg-transparent text-editor-text
    hover:bg-editor-surface
    focus:ring-editor-border
    disabled:text-editor-muted
  `,
  danger: `
    bg-error text-white
    hover:bg-error/80
    focus:ring-error
    disabled:bg-error/50
  `,
};

/**
 * SIZE STYLES
 * CSS classes for each button size.
 */
const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

/**
 * BUTTON COMPONENT
 * A flexible, accessible button component.
 *
 * Uses forwardRef to allow parent components to access
 * the underlying button element (for focus management, etc.).
 *
 * @example
 * // Primary button (default)
 * <Button onClick={handleClick}>Save</Button>
 *
 * @example
 * // Secondary button with icon
 * <Button variant="secondary" leftIcon={<PlusIcon />}>
 *   Add Node
 * </Button>
 *
 * @example
 * // Loading state
 * <Button isLoading>Saving...</Button>
 *
 * @example
 * // Danger button
 * <Button variant="danger" onClick={handleDelete}>
 *   Delete
 * </Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    // Combine disabled state with loading state
    const isDisabled = disabled || isLoading;

    // Build class string
    const classes = [
      // Base styles
      'inline-flex items-center justify-center',
      'font-medium rounded-button',
      'transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-editor-bg',
      'disabled:cursor-not-allowed',
      // Variant styles
      variantStyles[variant],
      // Size styles
      sizeStyles[size],
      // Full width
      fullWidth ? 'w-full' : '',
      // Custom classes
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        {...props}
      >
        {/* Loading spinner or left icon */}
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : leftIcon ? (
          <span className="mr-2">{leftIcon}</span>
        ) : null}

        {/* Button text */}
        {children}

        {/* Right icon (not shown when loading) */}
        {!isLoading && rightIcon && (
          <span className="ml-2">{rightIcon}</span>
        )}
      </button>
    );
  }
);

// Display name for React DevTools
Button.displayName = 'Button';

/**
 * ICON BUTTON COMPONENT
 * A button that only contains an icon.
 *
 * @example
 * <IconButton
 *   icon={<TrashIcon />}
 *   label="Delete"
 *   onClick={handleDelete}
 * />
 */
export interface IconButtonProps
  extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  /**
   * The icon to display.
   */
  icon: React.ReactNode;

  /**
   * Accessible label for screen readers.
   */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, size = 'md', className = '', ...props }, ref) => {
    // Icon button specific sizes
    const iconSizes: Record<ButtonSize, string> = {
      sm: 'p-1.5',
      md: 'p-2',
      lg: 'p-3',
    };

    return (
      <Button
        ref={ref}
        size={size}
        className={`${iconSizes[size]} ${className}`}
        aria-label={label}
        title={label}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';

export default Button;
