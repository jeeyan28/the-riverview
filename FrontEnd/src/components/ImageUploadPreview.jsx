import { useEffect, useMemo, useRef, useState } from 'react';

export default function ImageUploadPreview({
  icon = 'ti-photo',
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
    inputRef.current?.click();
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`Image must be smaller than ${maxSizeMB}MB.`);
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image.');
      e.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    setPreview((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return objectUrl;
    });

    onFileSelect?.(file);
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

      <div
        className="image-upload-preview"
        onClick={chooseFile}
        style={{
          cursor: 'pointer',
          border: '2px dashed var(--border,#d9d9d9)',
          borderRadius: 12,
          overflow: 'hidden',
          minHeight: maxHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa',
          transition: '.2s',
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            style={{
              width: '100%',
              maxHeight,
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            <i
              className={`ti ${icon}`}
              style={{
                fontSize: 34,
                display: 'block',
                marginBottom: 10,
              }}
            />

            <div
              style={{
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {title}
            </div>

            <div
              style={{
                fontSize: '.8rem',
                color: '#9ca3af',
              }}
            >
              {helper}
            </div>
          </div>
        )}
      </div>
    </>
  );
}