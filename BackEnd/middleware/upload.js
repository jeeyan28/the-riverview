const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const roomImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "riverview/rooms",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1600, crop: "limit" }],
  },
});

function imageFileFilter(req, file, cb) {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Only JPG, PNG, or WEBP images are allowed."), ok);
}

const roomImageUpload = multer({
  storage: roomImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

// Separate Cloudinary folder for payment proof screenshots, kept apart from room
// photos so admins reviewing payments never have to wade through facility images
// (and so the two can get different retention/visibility rules later if needed).
const paymentProofStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "riverview/payment-proofs",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 1200, crop: "limit" }],
  },
});

const paymentProofUpload = multer({
  storage: paymentProofStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

// QR codes for admin-managed payment methods (Settings > Payment Methods —
// e.g. GCash, Maya, or any wallet the business adds). Separate folder from
// both room photos and payment-proof screenshots so these long-lived
// "scan to pay" images never get mixed up with one-off customer uploads.
const paymentMethodQrStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "riverview/payment-method-qr",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, crop: "limit" }],
  },
});

const paymentMethodQrUpload = multer({
  storage: paymentMethodQrStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter,
});

// Backward-compatible default export (existing code does
// `const upload = require("../middleware/upload")` and calls `upload.single(...)`
// for room images) while also exposing named exports for the new payment-proof
// uploader.
module.exports = roomImageUpload;
module.exports.roomImageUpload = roomImageUpload;
module.exports.paymentProofUpload = paymentProofUpload;
module.exports.paymentMethodQrUpload = paymentMethodQrUpload;