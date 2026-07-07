import { useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// ImageUploadPreview — generic click-to-upload box, per components/
// README.md ("ImageUploadPreview.jsx — room images, payment QR images").
// Matches admin.html's `.upload-box` pattern used identically for both the
// Facility Image upload (fm-upload-box) and the QR Code Image upload
// (pm-upload-box): a clickable box with a hidden <input type="file">, an
// icon + title + subtitle when empty, and an <img> preview once a file is
// chosen. Same client-side validation (accepted MIME types + max size,
// both configurable per use) as admin.js's fm-image-input/pm-image-input
// change handlers.
//
// This only produces a local preview (via URL.createObjectURL) and hands
// the raw File back via onFileSelect — actually uploading it to Cloudinary
// is a Phase 12 concern and stays in whichever page/service calls this.
//
// Usage (as Admin/Settings.jsx's Facility form will use it in Phase 8):
//   <ImageUploadPreview
//     icon="ti-photo" title="Click to upload facility image" subtitle="PNG, JPG up to 10MB"
//     accept="image/png,image/jpeg" maxSizeMB={10} maxHeight={110}
//     value={existingImageUrl}
//     onFileSelect={(file) => setSelectedImageFile(file)}
//   />
// ─────────────────────────────────────────────────────────────────────────
function ImageUploadPreview({
  icon,
  title,
  subtitle,
  accept,
  maxSizeMB,
  maxHeight = 110,
  value,
  onFileSelect,
}) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(value || null);

  function handleChange(e) {
    const file = e.target.files[0];
    if (!file) {
      onFileSelect?.(null);
      return;
    }
    const acceptedTypes = accept ? accept.split(',').map((t) => t.trim()) : null;
    if (acceptedTypes && !acceptedTypes.includes(file.type)) {
      alert(`Please choose a ${acceptedTypes.map((t) => t.split('/')[1]?.toUpperCase()).join(' or ')} image.`);
      e.target.value = '';
      return;
    }
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      alert(`Image must be under ${maxSizeMB}MB.`);
      e.target.value = '';
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelect?.(file);
  }

  return (
    <div className="upload-box" onClick={() => inputRef.current?.click()}>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          style={{ display: 'block', maxHeight, borderRadius: 8, marginBottom: 8, objectFit: 'cover' }}
        />
      ) : null}
      <i className={`ti ${icon}`}></i>
      <div className="up-title">{title}</div>
      <div className="up-sub">{subtitle}</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}

export default ImageUploadPreview;
