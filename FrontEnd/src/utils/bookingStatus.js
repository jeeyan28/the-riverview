// Mirrors BackEnd/model/booking.js's status enum. Manual sync, no shared
// package across frontend/backend — same convention as utils/otp.js.
export const BOOKING_STATUS = {
  PENDING: 'Pending',
  PENDING_PAYMENT_VERIFICATION: 'Pending Payment Verification',
  AWAITING_ONLINE_PAYMENT: 'Awaiting Online Payment',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  ACTIVE: 'Active',
  DONE: 'Done',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};