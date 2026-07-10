// ─────────────────────────────────────────────────────────────────────────
// services/categories.js — wraps the public GET /api/categories endpoint.
// Mirrors Backend/routes/categoryRoutes.js — see services/README.md.
// Only the read side is needed so far (Room Monitoring's Manual Add category
// filter, FEATURE_REQUESTS.md Priority 1 item 2). Category management
// itself (create/rename/delete) still has no frontend UI anywhere in the
// app — see PROJECT_PROGRESS.md's Known Issues.
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const BASE = '/api/categories';

export const categoriesService = {
  /** Active categories only — GET /api/categories?activeOnly=true */
  listActive: () => apiRequest(`${BASE}?activeOnly=true`, { fallbackMessage: 'Failed to load room categories.' }),
};
