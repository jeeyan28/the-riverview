// ─────────────────────────────────────────────────────────────────────────
// services/settings.js — Phase 15. Wraps /api/settings/* endpoints.
// Mirrors Backend/routes/settingsRoutes.js 1:1 — see services/README.md.
//
//   getAdmin              ← fetchSettings()/fetchAnnouncements()/
//                            fetchMethods() in Settings.jsx — all three of
//                            OperatingScheduleAndHolidays/AnnouncementsTab/
//                            PaymentMethodsTab independently call this same
//                            GET /api/settings/admin on their own mount
//                            (matching the original's per-tab lifecycle —
//                            see Settings.jsx's Part 10c header note), so
//                            one shared function, called from 3 places.
//   updateOperatingHours  ← handleSaveSchedule()                (PUT /api/settings/operating-hours)
//   addHoliday            ← handleAddHoliday()                  (POST /api/settings/holidays)
//   removeHoliday         ← handleDeleteHoliday()                (DELETE /api/settings/holidays/:id)
//   addAnnouncement       ← handleAddAnnouncement()              (POST /api/settings/announcements)
//   updateAnnouncement    ← handleToggle()                       (PUT /api/settings/announcements/:id, body: {isActive})
//   removeAnnouncement    ← handleDelete()                       (DELETE /api/settings/announcements/:id)
//   addPaymentMethod      ← PaymentMethodsTab.handleSave() (add)  (POST /api/settings/payment-methods)
//   updatePaymentMethod   ← PaymentMethodsTab.handleSave() (edit)/
//                            handleQuickToggle()                 (PUT /api/settings/payment-methods/:id)
//   removePaymentMethod   ← PaymentMethodsTab.handleRemove()      (DELETE /api/settings/payment-methods/:id)
//
// updatePaymentMethod takes an explicit fallbackMessage param (unlike every
// other function here) because its two original call sites disagree on
// what to show: handleSave() falls back to 'Failed to save payment
// method.', handleQuickToggle() falls back to 'Failed to update.' — and
// unlike, say, roomsService.create()'s duplicate()/saveFacility() split
// (see rooms.js's header note), BOTH of these call sites' catch blocks do
// `alert(err.message)`, i.e. the fallback text is genuinely user-visible
// in each, not just logged — so the two wordings can't be silently
// collapsed into one without changing what a user sees on an unlabeled
// server error. Settings.jsx passes the right one at each call site.
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const BASE = '/api/settings';

export const settingsService = {
  getAdmin: () => apiRequest(`${BASE}/admin`, { fallbackMessage: 'Failed to load settings.' }),

  /** @param {{openTime:string, closeTime:string, openDays:number[], maxAdvanceDays:number, bookingCutoffHours:number}} payload */
  updateOperatingHours: (payload) =>
    apiRequest(`${BASE}/operating-hours`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to save.' }),

  /** @param {{name:string, date:string, fullDay:boolean}} payload */
  addHoliday: (payload) => apiRequest(`${BASE}/holidays`, { method: 'POST', body: payload, fallbackMessage: 'Failed to add holiday.' }),

  removeHoliday: (id) => apiRequest(`${BASE}/holidays/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to remove holiday.' }),

  /** @param {{title:string, message:string}} payload */
  addAnnouncement: (payload) =>
    apiRequest(`${BASE}/announcements`, { method: 'POST', body: payload, fallbackMessage: 'Failed to post announcement.' }),

  /** @param {string} id @param {{isActive:boolean}} payload */
  updateAnnouncement: (id, payload) =>
    apiRequest(`${BASE}/announcements/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update.' }),

  removeAnnouncement: (id) => apiRequest(`${BASE}/announcements/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete.' }),

  /** @param {FormData} formData */
  addPaymentMethod: (formData) =>
    apiRequest(`${BASE}/payment-methods`, { method: 'POST', body: formData, fallbackMessage: 'Failed to save payment method.' }),

  /** @param {string} id @param {FormData} formData @param {string} [fallbackMessage] - see header note */
  updatePaymentMethod: (id, formData, fallbackMessage = 'Failed to save payment method.') =>
    apiRequest(`${BASE}/payment-methods/${id}`, { method: 'PUT', body: formData, fallbackMessage }),

  removePaymentMethod: (id) =>
    apiRequest(`${BASE}/payment-methods/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to remove payment method.' }),
};
