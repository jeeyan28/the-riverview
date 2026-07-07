// ─────────────────────────────────────────────────────────────────────────
// services/pos.js — Phase 14. Wraps the 3 /api/pos/* endpoints Pos.jsx
// calls directly today. Mirrors Backend/routes (POS route group) 1:1 — see
// services/README.md.
//
// All 3 functions preserve their call site's exact fallback error text
// from Pos.jsx pre-extraction:
//   listToday      ← fetchSalesToday()  (GET /api/pos/sales?date=)
//   completeSale   ← completeSale()      (POST /api/pos/sales)
//   voidSale       ← voidSale()          (PUT /api/pos/sales/:id/void)
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const BASE = '/api/pos/sales';

export const posService = {
  /** @param {string} dateStr - YYYY-MM-DD, local date (matches todayDateStr()) */
  listToday: (dateStr) => apiRequest(`${BASE}?date=${dateStr}`, { fallbackMessage: 'Failed to load sales.' }),

  /** @param {{items: {name:string,price:number,quantity:number}[], discount:number, paymentMethod:string, note:string}} payload */
  completeSale: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to complete sale.' }),

  voidSale: (id) => apiRequest(`${BASE}/${id}/void`, { method: 'PUT', fallbackMessage: 'Failed to void sale.' }),
};
