/**
 * =============================================================================
 * IMAGE GENERATION OVERLAY
 * =============================================================================
 *
 * A reusable modal overlay for AI image generation. Can be opened from any
 * part of the app (inspectors, entity manager, asset manager, etc.).
 *
 * FEATURES:
 * - Prompt textarea for the image description
 * - Aspect ratio selector (1:1, 16:9, 9:16, 3:2, 2:3, 4:3, 3:4)
 * - Reference image section (upload or select from project assets)
 * - Shows current AI provider + model from settings
 * - Generate button with loading state
 * - Preview of the result with "Use This Image" / "Regenerate" controls
 *
 * WHY A SEPARATE OVERLAY?
 * Image generation is needed from many places — scene backgrounds, entity
 * portraits, plot images, act images, story root images. Rather than
 * duplicating the generation UI in every inspector, we have one shared
 * overlay that any component can open by passing isOpen + callbacks.
 *
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Upload,
  X,
  Loader2,
  RefreshCw,
  Check,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { Modal } from '@components/common/Modal';
import { useImageGenStore } from '@/stores/useImageGenStore';
import AssetPicker from './AssetPicker';

// =============================================================================
// TYPES
// =============================================================================

export interface ImageGenerationOverlayProps {
  /** Whether the overlay is currently visible */
  isOpen: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /** Called with the generated image data URL when generation succeeds */
  onImageGenerated: (dataUrl: string) => void;
  /** Optional initial prompt text */
  initialPrompt?: string;
  /** Optional title for the overlay header */
  title?: string;
}

// =============================================================================
// ASPECT RATIO DEFINITIONS
// =============================================================================

/**
 * Maps human-readable aspect ratio labels to pixel dimensions.
 * These are standard dimensions suitable for AI image generation APIs.
 */
const ASPECT_RATIOS: Array<{
  label: string;
  width: number;
  height: number;
}> = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1280, height: 720 },
  { label: '9:16', width: 720, height: 1280 },
  { label: '3:2', width: 1200, height: 800 },
  { label: '2:3', width: 800, height: 1200 },
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:4', width: 768, height: 1024 },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function ImageGenerationOverlay({
  isOpen,
  onClose,
  onImageGenerated,
  initialPrompt = '',
  title = 'Generate Image',
}: ImageGenerationOverlayProps) {
  // ── Local state ────────────────────────────────────────────────────────

  /** The user's prompt text */
  const [prompt, setPrompt] = useState(initialPrompt);

  /** Index into ASPECT_RATIOS for the selected dimensions */
  const [aspectIndex, setAspectIndex] = useState(0);

  /** Reference images as base64 data URLs for sending to the API */
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  /** Whether generation is in progress */
  const [isGenerating, setIsGenerating] = useState(false);

  /** Error message from the last generation attempt */
  const [error, setError] = useState<string | null>(null);

  /** The generated image data URL (shown in the preview area) */
  const [resultImage, setResultImage] = useState<string | null>(null);

  /** Whether the AssetPicker sub-modal is open */
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  /** Hidden file input ref for reference image uploads */
  const refImageInputRef = useRef<HTMLInputElement>(null);

  // ── Store values ───────────────────────────────────────────────────────

  const store = useImageGenStore();

  /**
   * Derive the active provider label and model name for the info bar.
   */
  const providerLabel = useMemo(() => {
    switch (store.provider) {
      case 'bfl':
        return 'Black Forest Labs';
      case 'gemini':
        return 'Google Gemini';
      case 'openai-compatible':
        return 'OpenAI-Compatible';
      default:
        return store.provider;
    }
  }, [store.provider]);

  const activeModel = useMemo(() => {
    return store.provider === 'gemini' ? store.geminiImageModel : store.model;
  }, [store.provider, store.geminiImageModel, store.model]);

  // ── Reset state when the modal opens ───────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setPrompt(initialPrompt);
      setReferenceImages([]);
      setIsGenerating(false);
      setError(null);
      setResultImage(null);
    }
  }, [isOpen, initialPrompt]);

  // ── Reference image handling ───────────────────────────────────────────

  /**
   * Handle file upload for reference images.
   * Reads the file as a base64 data URL and appends to the list.
   */
  const handleRefImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setReferenceImages((prev) => [...prev, dataUrl]);
    };
    reader.readAsDataURL(file);

    // Reset so the same file can be re-selected
    event.target.value = '';
  };

  /**
   * Handle selecting an image from the AssetPicker.
   * The picker returns a URL (blob or data) which we add to references.
   */
  const handleAssetPickerSelect = (url: string) => {
    setReferenceImages((prev) => [...prev, url]);
    setAssetPickerOpen(false);
  };

  /**
   * Remove a reference image by index.
   */
  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Generation ─────────────────────────────────────────────────────────

  /**
   * Sends the image generation request to the server endpoint.
   * The server handles provider-specific logic (BFL, Gemini, OpenAI).
   */
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    const { width, height } = ASPECT_RATIOS[aspectIndex];

    try {
      /**
       * Build the request body. The server endpoint `/api/generate-image`
       * expects provider settings + prompt + dimensions + optional reference images.
       */
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
        width,
        height,
        provider: store.provider,
        model: store.provider === 'gemini' ? store.geminiImageModel : store.model,
        apiKey: store.provider === 'gemini' ? store.googleApiKey : store.apiKey,
        endpoint: store.endpoint,
        defaultStyle: store.defaultImageStyle,
      };

      // Attach reference images if any
      if (referenceImages.length > 0) {
        body.referenceImages = referenceImages;
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Generation failed (${res.status})`);
      }

      const data = await res.json();
      if (!data.dataUrl) {
        throw new Error('No image returned from the server.');
      }

      setResultImage(data.dataUrl);
    } catch (err: any) {
      console.error('[ImageGenOverlay] Generation failed:', err);
      setError(err.message || 'Image generation failed. Check your API settings.');
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * User accepts the generated image — pass it back to the caller.
   */
  const handleUseImage = () => {
    if (resultImage) {
      onImageGenerated(resultImage);
      onClose();
    }
  };

  /**
   * User wants to try again — clear the result and re-generate.
   */
  const handleRegenerate = () => {
    setResultImage(null);
    handleGenerate();
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="xl"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Provider Info Bar ── */}
          <div style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'rgba(74, 222, 128, 0.06)',
            border: '1px solid rgba(74, 222, 128, 0.2)',
            fontSize: '0.82em',
            color: '#8b8fa4',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ color: '#4ade80' }}>●</span>
            <span>
              Using{' '}
              <strong style={{ color: '#e2e4ea' }}>{providerLabel}</strong>
              {' — '}
              <span style={{ fontFamily: "'Cascadia Code', monospace", color: '#6c8aff' }}>
                {activeModel}
              </span>
            </span>
          </div>

          {/* ── Prompt Textarea ── */}
          <div>
            <label style={labelStyle}>Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #2d3148',
                background: '#0f1117',
                color: '#e2e4ea',
                fontSize: '0.92em',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: 80,
                outline: 'none',
              }}
              disabled={isGenerating}
            />
          </div>

          {/* ── Aspect Ratio Selector ── */}
          <div>
            <label style={labelStyle}>Aspect Ratio</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ASPECT_RATIOS.map((ar, idx) => {
                const isActive = idx === aspectIndex;
                return (
                  <button
                    key={ar.label}
                    onClick={() => setAspectIndex(idx)}
                    disabled={isGenerating}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: `1px solid ${isActive ? '#6c8aff' : '#2d3148'}`,
                      background: isActive ? 'rgba(108, 138, 255, 0.15)' : '#171923',
                      color: isActive ? '#6c8aff' : '#8b8fa4',
                      fontSize: '0.82em',
                      fontWeight: 600,
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {ar.label}
                    <span style={{ fontSize: '0.75em', marginLeft: 4, opacity: 0.7 }}>
                      {ar.width}x{ar.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Reference Images ── */}
          <div>
            <label style={labelStyle}>Reference Images (optional)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Thumbnail previews of selected reference images */}
              {referenceImages.map((img, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid #2d3148',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={img}
                    alt={`Reference ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    onClick={() => removeReferenceImage(idx)}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)',
                      border: 'none',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title="Remove reference"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {/* Upload button */}
              <button
                onClick={() => refImageInputRef.current?.click()}
                disabled={isGenerating}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  border: '2px dashed #2d3148',
                  background: 'transparent',
                  color: '#8b8fa4',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  gap: 2,
                  fontSize: '0.7em',
                  flexShrink: 0,
                }}
                title="Upload reference image"
              >
                <Upload size={16} />
                Upload
              </button>

              {/* Select from assets button */}
              <button
                onClick={() => setAssetPickerOpen(true)}
                disabled={isGenerating}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  border: '2px dashed #2d3148',
                  background: 'transparent',
                  color: '#8b8fa4',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  gap: 2,
                  fontSize: '0.7em',
                  flexShrink: 0,
                }}
                title="Select from project assets"
              >
                <FolderOpen size={16} />
                Assets
              </button>
            </div>

            {/* Hidden file input for reference image uploads */}
            <input
              ref={refImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleRefImageUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* ── Error Message ── */}
          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.85em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* ── Result Preview ── */}
          {resultImage && (
            <div style={{
              borderRadius: 8,
              border: '1px solid #2d3148',
              padding: 12,
              background: '#171923',
            }}>
              <label style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>
                Generated Image
              </label>
              <img
                src={resultImage}
                alt="Generated"
                style={{
                  width: '100%',
                  maxHeight: 400,
                  objectFit: 'contain',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={handleRegenerate}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #2d3148',
                    background: 'transparent',
                    color: '#8b8fa4',
                    fontWeight: 500,
                    fontSize: '0.88em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <RefreshCw size={14} />
                  Regenerate
                </button>
                <button
                  onClick={handleUseImage}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#6c8aff',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.88em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Check size={14} />
                  Use This Image
                </button>
              </div>
            </div>
          )}

          {/* ── Action Buttons (Generate / Cancel) ── */}
          {!resultImage && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: '1px solid #2d3148',
                  background: 'transparent',
                  color: '#8b8fa4',
                  fontWeight: 500,
                  fontSize: '0.9em',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: isGenerating || !prompt.trim() ? '#6c8aff80' : '#6c8aff',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.9em',
                  cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Asset Picker Sub-Modal ── */}
      <AssetPicker
        isOpen={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onSelect={handleAssetPickerSelect}
        filterType="image"
      />
    </>
  );
}

// =============================================================================
// INLINE STYLES
// =============================================================================

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8em',
  fontWeight: 600,
  color: '#8b8fa4',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};
