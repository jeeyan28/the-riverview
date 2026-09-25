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
  const dragDepthRef = useRef(0);
  const ownedPreviewRef = useRef('');

  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (typeof value === 'string') {
      setPreview(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (ownedPreviewRef.current) URL.revokeObjectURL(ownedPreviewRef.current);
    };
  }, []);

  const helper = useMemo(
    () => `${subtitle} • Max ${maxSizeMB}MB`,
    [subtitle, maxSizeMB]
  );

  function chooseFile() {
    setError('');
    inputRef.current?.click();
  }

  function handleFile(file) {
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Choose an image smaller than ${maxSizeMB}MB.`);
      return;
    }

    const allowedTypes = accept.split(',').map((type) => type.trim());
    if (!file.type.startsWith('image/') || (!allowedTypes.includes('image/*') && !allowedTypes.includes(file.type))) {
      setError('Choose a supported image file.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (ownedPreviewRef.current) URL.revokeObjectURL(ownedPreviewRef.current);
    ownedPreviewRef.current = objectUrl;
    setPreview(objectUrl);

    onFileSelect?.(file);
    setError('');
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ''; }}
      />

      <button
        type="button"
        className={`image-upload-preview${dragging ? ' is-dragging' : ''}`}
        onClick={chooseFile}
        onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragging(false); }}
        onDrop={handleDrop}
        aria-label={preview ? 'Change selected image by clicking or dropping a file' : `${title}. You can also drop an image here.`}
        style={{ '--upload-min-height': `${maxHeight}px` }}
      >
        {preview ? (
          <>
            <img src={preview} alt="Selected preview" draggable="false" />
            <span className="image-upload-change"><ImagePlus size={16} />Change or drop image</span>
          </>
        ) : (
          <div className="image-upload-empty">
            <span className="image-upload-icon"><UploadCloud size={23} aria-hidden="true" /></span>
            <strong>{title}</strong>
            <span>or drag and drop here</span>
            <span>{helper}</span>
          </div>
        )}
      </button>
      {error && <div className="image-upload-error" role="alert">{error}</div>}
    </>
  );
}
