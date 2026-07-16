import { useEffect, useState } from "react";

export default function FacilityModal({
  open,
  mode = "create",
  facility,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "Available",
  });

  useEffect(() => {
    if (!open) return;

    if (facility) {
      setForm({
        name: facility.name || "",
        description: facility.description || "",
        status: facility.isActive ? "Available" : "Unavailable",
      });
    } else {
      setForm({
        name: "",
        description: "",
        status: "Available",
      });
    }
  }, [facility, open]);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  if (!open) return null;

  return (
    <div className="rm-modal-overlay">
      <div className="rm-modal">
        <h2>
          {mode === "edit" ? "Edit Facility" : "Add Facility"}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="rm-form-group">
            <label>Facility Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="rm-form-group">
            <label>Description</label>
            <textarea
              name="description"
              rows="4"
              value={form.description}
              onChange={handleChange}
            />
          </div>

          <div className="rm-form-group">
            <label>Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
            >
              <option value="Available">Available</option>
              <option value="Unavailable">Unavailable</option>
            </select>
          </div>

          <div className="rm-modal-actions">
            <button
              type="button"
              className="btn"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
            >
              {mode === "edit"
                ? "Save Changes"
                : "Add Facility"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}