import { useState, useRef, useId } from 'react';
import { Upload, Link as LinkIcon, ImageIcon, Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { resolveImageSrc } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/* ────────────────────────────────────────────────────────────────
   ImageField — shared admin form control for product / category /
   promotion images. Lets the admin EITHER paste a URL OR upload a
   file. The uploaded file goes to POST /api/uploads/image, which
   resizes via sharp and returns a URL. Either way the resulting
   string is reported via the `value`/`onChange` prop, so the parent
   form just stores a single string in its existing imageUrl field.
   ──────────────────────────────────────────────────────────────── */

interface ImageFieldProps {
  /** The current image URL (absolute http(s):// or relative /api/uploads/...) */
  value: string;
  /** Called when the URL changes (typing OR upload completes) */
  onChange: (url: string) => void;
  /** Optional label shown above the field */
  label?: string;
  /** Optional helper text shown below */
  helper?: string;
  /** Optional CSS class */
  className?: string;
}

type Mode = 'url' | 'upload';

// Resolve relative /api/uploads/... URLs against the API host for previews.
// Delegates to the shared resolveImageSrc so every place we show a stored
// image goes through the same logic.
const resolvePreviewUrl = resolveImageSrc;

export function ImageField({ value, onChange, label = 'Image', helper, className }: ImageFieldProps) {
  // If the existing value looks like an uploaded file (relative path), default
  // to upload mode; otherwise default to URL mode. Admin can switch any time.
  const initialMode: Mode = value.startsWith('/api/uploads/') ? 'upload' : 'url';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const radioGroupId = useId();

  const handleFileSelect = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post<{ url: string; bytes: number }>(
        '/uploads/image',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      if (data?.url) {
        onChange(data.url);
      } else {
        setError('Upload succeeded but no URL was returned.');
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Upload failed');
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const previewUrl = resolvePreviewUrl(value);

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--text-primary)]">{label}</label>
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('url')}
            aria-pressed={mode === 'url'}
            className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ${
              mode === 'url'
                ? 'bg-primary-500 text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LinkIcon className="h-3 w-3" /> URL
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            aria-pressed={mode === 'upload'}
            className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ${
              mode === 'upload'
                ? 'bg-primary-500 text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Preview thumbnail */}
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]"
          aria-hidden="true"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Preview"
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-[var(--text-tertiary)]" />
          )}
        </div>

        {/* Input area */}
        <div className="flex-1 space-y-2">
          {mode === 'url' ? (
            <>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <Input
                  className="pl-9"
                  placeholder="https://example.com/image.jpg"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              </div>
              {value && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="text-xs text-[var(--text-tertiary)] hover:text-danger inline-flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                id={radioGroupId}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" /> Choose file
                    </>
                  )}
                </Button>
                {value && (
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    className="text-xs text-[var(--text-tertiary)] hover:text-danger inline-flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              {value && value.startsWith('/api/uploads/') && (
                <p className="text-xs text-[var(--text-tertiary)] truncate" title={value}>
                  {value}
                </p>
              )}
            </>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          {helper && !error && <p className="text-xs text-[var(--text-tertiary)]">{helper}</p>}
        </div>
      </div>
    </div>
  );
}
