// middleware/upload.js
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { Readable } = require("stream");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function imageFileFilter(req, file, cb) {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Only JPG, PNG, or WEBP images are allowed."), ok);
}

function uploadBufferToCloudinary(buffer, cloudinaryParams) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(cloudinaryParams, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Creates a Cloudinary-backed uploader that mimics the multer-storage-cloudinary
 * interface (req.file.path = secure_url, req.file.filename = public_id) so
 * existing route code using upload.single(fieldName) keeps working unchanged.
 */
function makeCloudinaryUploader(cloudinaryParams) {
  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFileFilter,
  });

  return {
    single(fieldName) {
      const multerMiddleware = memoryUpload.single(fieldName);

      return function (req, res, next) {
        multerMiddleware(req, res, async (err) => {
          if (err) return next(err);
          if (!req.file) return next(); // no file uploaded, let route decide

          try {
            const result = await uploadBufferToCloudinary(req.file.buffer, cloudinaryParams);

            // Mimic multer-storage-cloudinary's req.file shape
            req.file.path = result.secure_url;
            req.file.filename = result.public_id;
            req.file.cloudinary = result; // full result available if needed

            next();
          } catch (uploadErr) {
            next(uploadErr);
          }
        });
      };
    },
  };
}

const roomImageUpload = makeCloudinaryUploader({
  folder: "riverview/rooms",
  allowed_formats: ["jpg", "jpeg", "png", "webp"],
  transformation: [{ width: 1600, crop: "limit" }],
});

// Separate Cloudinary folder for payment proof screenshots, kept apart from room
// photos so admins reviewing payments never have to wade through facility images
// (and so the two can get different retention/visibility rules later if needed).
const paymentProofUpload = makeCloudinaryUploader({
  folder: "riverview/payment-proofs",
  allowed_formats: ["jpg", "jpeg", "png", "webp"],
  transformation: [{ width: 1200, crop: "limit" }],
});

// QR codes for admin-managed payment methods (Settings > Payment Methods —
// e.g. GCash, Maya, or any wallet the business adds). Separate folder from
// both room photos and payment-proof screenshots so these long-lived
// "scan to pay" images never get mixed up with one-off customer uploads.
const paymentMethodQrUpload = makeCloudinaryUploader({
  folder: "riverview/payment-method-qr",
  allowed_formats: ["jpg", "jpeg", "png", "webp"],
  transformation: [{ width: 800, crop: "limit" }],
});

// Backward-compatible default export (existing code does
// `const upload = require("../middleware/upload")` and calls `upload.single(...)`
// for room images) while also exposing named exports for the new payment-proof
// uploader.
module.exports = roomImageUpload;
module.exports.roomImageUpload = roomImageUpload;
module.exports.paymentProofUpload = paymentProofUpload;
module.exports.paymentMethodQrUpload = paymentMethodQrUpload;