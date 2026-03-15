/**
 * =============================================================================
 * MEDIA UPLOADER COMPONENT
 * =============================================================================
 *
 * A reusable component for uploading images and audio files.
 *
 * FEATURES:
 * - Click to open file picker
 * - Drag and drop support
 * - Preview for images
 * - File type validation
 * - Clear/remove uploaded file
 *
 * =============================================================================
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { Upload, X, Image as ImageIcon, Music, Mic } from 'lucide-react';
import { useEditorStore } from '@stores/useEditorStore';
import { getBlobUrl } from '@/utils/blobCache';

/**
 * MEDIA UPLOADER PROPS
 */
export interface MediaUploaderProps {
  /**
   * Type of media to accept
   */
  type: 'image' | 'audio';

  /**
   * Current value (URL or blob URL)
   */
  value?: string;

  /**
   * Callback when file is selected
   */
  onChange: (file: File | null, url: string | null) => void;

  /**
   * Label to display
   */
  label?: string;

  /**
   * Placeholder text
   */
  placeholder?: string;

  /**
   * Whether the uploader is disabled
   */
  disabled?: boolean;

  /**
   * Custom class name
   */
  className?: string;

  /**
   * Optional display name for the asset (from the Asset Manager)
   */
  assetName?: string;
}

/**
 * MEDIA UPLOADER COMPONENT
 */
export default function MediaUploader({
  type,
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  className = '',
  assetName,
}: MediaUploaderProps) {
  // Reference to the hidden file input
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag state for visual feedback
  const [isDragging, setIsDragging] = useState(false);

  // Loading state for file processing
  const [isLoading, setIsLoading] = useState(false);

  // Error message
  const [error, setError] = useState<string | null>(null);

  // Convert data URL to blob URL for rendering (keeps binary out of JS heap)
  const displayUrl = useMemo(() => getBlobUrl(value), [value]);

  /**
   * Get accepted file types based on media type
   */
  const getAcceptedTypes = () => {
    if (type === 'image') {
      return 'image/png,image/jpeg,image/gif,image/webp';
    }
    return 'audio/mpeg,audio/wav,audio/ogg,audio/mp3';
  };

  /**
   * Get icon based on media type
   */
  const getIcon = () => {
    if (type === 'image') return ImageIcon;
    return Music;
  };

  const Icon = getIcon();

  /**
   * Handle click to open file picker
   */
  const handleClick = () => {
    if (!disabled && !isLoading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  /**
   * Handle file selection from input
   */
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  // Get upload tracking from editor store
  const { startUpload, finishUpload } = useEditorStore();

  /**
   * Process and validate the selected file
   */
  const processFile = (file: File) => {
    setError(null);

    // Validate file type
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');

    if (type === 'image' && !isImage) {
      setError('Please select an image file (PNG, JPG, GIF, WebP)');
      return;
    }

    if (type === 'audio' && !isAudio) {
      setError('Please select an audio file (MP3, WAV, OGG)');
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File is too large. Maximum size is 50MB.');
      return;
    }

    // Show loading state while processing
    setIsLoading(true);
    startUpload(); // Track this upload globally

    // Convert to base64 Data URL for persistence
    // Data URLs survive page refreshes unlike blob URLs
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;
      console.log(`[MediaUploader] File loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      onChange(file, dataUrl);
      setIsLoading(false);
      finishUpload(); // Mark upload as complete
    };

    reader.onerror = () => {
      console.error('[MediaUploader] Failed to read file:', reader.error);
      setError('Failed to read file. Please try again.');
      setIsLoading(false);
      finishUpload(); // Mark upload as complete (even on error)
    };

    reader.onabort = () => {
      console.warn('[MediaUploader] File read was aborted');
      setError('File upload was cancelled. Please try again.');
      setIsLoading(false);
      finishUpload(); // Mark upload as complete
    };

    reader.readAsDataURL(file);
  };

  /**
   * Handle drag over
   */
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  /**
   * Handle drag leave
   */
  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  /**
   * Handle drop
   */
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [disabled, type]);

  /**
   * Handle clear/remove
   */
  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setError(null);
    onChange(null, null);
  };

  return (
    <div className={className}>
      {/* Label */}
      {label && (
        <label className="input-label flex items-center gap-2 mb-2">
          <Icon size={14} />
          {label}
        </label>
      )}

      {/* Upload area */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative
          border-2 border-dashed rounded-lg
          transition-all cursor-pointer
          ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragging
            ? 'border-editor-accent bg-editor-accent/10'
            : 'border-editor-border hover:border-editor-accent hover:bg-editor-surface/50'
          }
          ${error ? 'border-error' : ''}
        `}
      >
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-editor-bg/80 rounded-lg flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-editor-muted">Processing...</span>
            </div>
          </div>
        )}
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptedTypes()}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {/* Content based on whether there's a value */}
        {value ? (
          // Preview
          <div className="relative">
            {type === 'image' ? (
              // Image preview
              <div className="relative inline-block max-w-[300px]">
                <img
                  src={displayUrl}
                  alt="Preview"
                  className="max-w-[300px] w-auto h-auto rounded-lg"
                />
                {/* Asset name badge (if named in Asset Manager) */}
                {assetName && (
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                    {assetName}
                  </span>
                )}
                {/* Clear button */}
                <button
                  onClick={handleClear}
                  className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-error rounded-full text-white"
                  title="Remove image"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              // Audio preview
              <div className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-editor-accent/20 flex items-center justify-center">
                  <Music size={24} className="text-editor-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-editor-text truncate">
                    {assetName || 'Audio file loaded'}
                  </p>
                  <audio src={displayUrl} controls className="w-full mt-2 h-8" />
                </div>
                <button
                  onClick={handleClear}
                  className="p-2 hover:bg-error/20 rounded-lg text-editor-muted hover:text-error"
                  title="Remove audio"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        ) : (
          // Empty state / upload prompt
          <div className="p-6 text-center">
            <div className={`
              w-12 h-12 mx-auto mb-3 rounded-full
              flex items-center justify-center
              ${isDragging ? 'bg-editor-accent/20' : 'bg-editor-surface'}
            `}>
              <Upload size={24} className={isDragging ? 'text-editor-accent' : 'text-editor-muted'} />
            </div>
            <p className="text-sm text-editor-text mb-1">
              {placeholder || `Click to upload ${type}`}
            </p>
            <p className="text-xs text-editor-muted">
              or drag and drop
            </p>
            <p className="text-xs text-editor-muted mt-2">
              {type === 'image'
                ? 'PNG, JPG, GIF, WebP (max 50MB)'
                : 'MP3, WAV, OGG (max 50MB)'
              }
            </p>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-error">{error}</p>
      )}
    </div>
  );
}
