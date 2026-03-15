/**
 * =============================================================================
 * MODAL COMPONENT
 * =============================================================================
 *
 * A reusable modal (dialog) component for displaying content in an overlay.
 *
 * MODALS VS. PANELS:
 * - Modal: Blocks interaction with the rest of the page, focused task
 * - Panel: Sidebar that allows continued interaction with the main content
 *
 * ACCESSIBILITY FEATURES:
 * - Focus trap (Tab stays within modal)
 * - Escape key closes modal
 * - Aria labels for screen readers
 * - Backdrop click closes modal (optional)
 *
 * =============================================================================
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { IconButton, Button } from './Button';

/**
 * MODAL PROPS INTERFACE
 */
export interface ModalProps {
  /**
   * Whether the modal is currently visible.
   */
  isOpen: boolean;

  /**
   * Callback when modal should close.
   */
  onClose: () => void;

  /**
   * Title displayed in the modal header.
   */
  title?: string;

  /**
   * Modal content.
   */
  children: React.ReactNode;

  /**
   * Whether clicking the backdrop closes the modal.
   * @default true
   */
  closeOnBackdropClick?: boolean;

  /**
   * Whether pressing Escape closes the modal.
   * @default true
   */
  closeOnEscape?: boolean;

  /**
   * Whether to show the close button in the header.
   * @default true
   */
  showCloseButton?: boolean;

  /**
   * Size of the modal.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'nearfull';

  /**
   * Footer content (typically buttons).
   */
  footer?: React.ReactNode;

  /**
   * Additional CSS classes for the modal container.
   */
  className?: string;
}

/**
 * SIZE STYLES
 * Width classes for each modal size.
 */
const sizeStyles: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
  nearfull: 'max-w-[90vw]',
};

/**
 * MODAL COMPONENT
 * Displays content in a centered overlay with backdrop.
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Confirm Delete"
 * >
 *   <p>Are you sure you want to delete this?</p>
 * </Modal>
 *
 * @example
 * // With footer
 * <Modal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Create Project"
 *   footer={
 *     <>
 *       <Button variant="ghost" onClick={handleClose}>Cancel</Button>
 *       <Button onClick={handleCreate}>Create</Button>
 *     </>
 *   }
 * >
 *   <input type="text" placeholder="Project name" />
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  size = 'md',
  footer,
  className = '',
}: ModalProps) {
  // Ref to the modal content for focus management
  const modalRef = useRef<HTMLDivElement>(null);
  // Track whether we've already focused this open cycle (prevents re-focus stealing)
  const hasFocusedRef = useRef(false);

  /**
   * Handle Escape key press
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  /**
   * Handle backdrop click
   */
  const handleBackdropClick = (event: React.MouseEvent) => {
    // Only close if clicking the backdrop, not the modal content
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  /**
   * Setup keyboard listener and body scroll lock
   */
  // Reset focus tracking when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasFocusedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Add event listener for Escape key
      document.addEventListener('keydown', handleKeyDown);

      // Prevent body scroll while modal is open
      document.body.style.overflow = 'hidden';

      // Only focus the modal on the FIRST run after open — subsequent re-runs
      // (from handleKeyDown identity changes) must NOT steal focus from children.
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        modalRef.current?.focus();
      }

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    /**
     * MODAL PORTAL
     * The modal is rendered in a portal at the end of the document body
     * to avoid CSS stacking context issues. We use a div with high z-index
     * instead since React portals require additional setup.
     */
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/**
       * BACKDROP
       * Semi-transparent overlay behind the modal.
       */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/**
       * MODAL CONTENT
       * The actual modal container with content.
       */}
      <div
        ref={modalRef}
        className={`
          relative z-10 w-full mx-4
          ${sizeStyles[size]}
          bg-editor-surface rounded-panel
          shadow-xl animate-slide-in-up
          ${className}
        `}
        tabIndex={-1}
      >
        {/**
         * HEADER
         * Contains title and close button.
         */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-editor-border">
            {title && (
              <h2
                id="modal-title"
                className="text-lg font-semibold text-editor-text"
              >
                {title}
              </h2>
            )}

            {showCloseButton && (
              <IconButton
                icon={<X size={20} />}
                label="Close modal"
                variant="ghost"
                size="sm"
                onClick={onClose}
              />
            )}
          </div>
        )}

        {/**
         * BODY
         * The main content area.
         */}
        <div className={`px-6 py-4 overflow-y-auto ${size === 'nearfull' ? 'max-h-[82vh]' : 'max-h-[60vh]'}`}>
          {children}
        </div>

        {/**
         * FOOTER
         * Optional footer with action buttons.
         */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-editor-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CONFIRM MODAL COMPONENT
 * A pre-built modal for confirmation dialogs.
 *
 * @example
 * <ConfirmModal
 *   isOpen={isConfirmOpen}
 *   onClose={() => setIsConfirmOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Project"
 *   message="Are you sure you want to delete this project? This cannot be undone."
 *   confirmLabel="Delete"
 *   danger
 * />
 */
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-editor-muted">{message}</p>
    </Modal>
  );
}

export default Modal;
