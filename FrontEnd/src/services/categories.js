import { apiRequest } from "./api";

const BASE = "/api/categories";

export const categoriesService = {
  // Public
  listActive: () =>
    apiRequest(`${BASE}?activeOnly=true`, {
      fallbackMessage: "Failed to load room categories.",
    }),

  // Admin
  list: () =>
    apiRequest(BASE, {
      fallbackMessage: "Failed to load categories.",
    }),

  create: (payload) =>
    apiRequest(BASE, {
      method: "POST",
      body: payload,
      fallbackMessage: "Failed to create category.",
    }),

  update: (id, payload) =>
    apiRequest(`${BASE}/${id}`, {
      method: "PUT",
      body: payload,
      fallbackMessage: "Failed to update category.",
    }),

  remove: (id) =>
    apiRequest(`${BASE}/${id}`, {
      method: "DELETE",
      fallbackMessage: "Failed to delete category.",
    }),
};