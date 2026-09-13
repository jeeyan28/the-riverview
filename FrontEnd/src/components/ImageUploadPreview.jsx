import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, UploadCloud } from 'lucide-react';

export default function ImageUploadPreview({
  title = 'Click to upload image',
  subtitle = 'PNG, JPG',
  accept = 'image/*',
  maxSizeMB = 10,
  maxHeight = 120,
  value = '',
  onFileSelect,
}) {
  const inputRef = useRef(null);

  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof value === 'string') {
      setPreview(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (preview?.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const helper = useMemo(
    () => `${subtitle} • Max ${maxSizeMB}MB`,
    [subtitle, maxSizeMB]
  );

  function chooseFile() {
    setError('');
    inputRef.current?.click();
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Choose an image smaller than ${maxSizeMB}MB.`);
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Choose a valid PNG or JPG image.');
      e.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    setPreview((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return objectUrl;
    });

    onFileSelect?.(file);
    setError('');
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={handleFile}
      />

      <button
        type="button"
        className="image-upload-preview"
        onClick={chooseFile}
        aria-label={preview ? 'Change selected image' : title}
        style={{ '--upload-min-height': `${maxHeight}px` }}
      >
        {preview ? (
          <>
            <img src={preview} alt="Selected preview" />
            <span className="image-upload-change"><ImagePlus size={16} />Change image</span>
          </>
        ) : (
          <div className="image-upload-empty">
            <span className="image-upload-icon"><UploadCloud size={23} aria-hidden="true" /></span>
            <strong>{title}</strong>
            <span>{helper}</span>
          </div>
        )}
      </button>
      {error && <div className="image-upload-error" role="alert">{error}</div>}
    </>
  );
}
