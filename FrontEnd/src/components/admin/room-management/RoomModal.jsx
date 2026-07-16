import { useEffect, useState } from "react";

export default function RoomModal({
  open,
  mode = "create",
  room,
  facility,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState({
    name: "",
    roomNumber: "",
    description: "",
    capacity: 4,
    price: "",
    status: "Available",
  });

  useEffect(() => {
    if (!open) return;

    if (room) {
      setForm({
        name: room.name || "",
        roomNumber: room.roomNumber || "",
        description: room.description || "",
        capacity: room.capacity || 4,
        price: room.price || "",
        status: room.status || "Available",
      });
    } else {
      setForm({
        name: "",
        roomNumber: "",
        description: "",
        capacity: 4,
        price: "",
        status: "Available",
      });
    }
  }, [room, open]);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]:
        e.target.type === "number"
          ? Number(e.target.value)
          : e.target.value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    console.log("Submitting from modal:", {
      ...form,
      category: facility?._id,
    });

    onSubmit({
      ...form,
      category: facility?._id,
    });
  };

  if (!open) return null;

  return (
    <div className="rm-modal-overlay">
      <div className="rm-modal">

        <h2>
          {mode === "edit"
            ? "Edit Room"
            : "Add Room"}
        </h2>

        <form onSubmit={handleSubmit}>

          <div className="rm-form-group">
            <label>Room Name</label>

            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="VIP Table"
              required
            />
          </div>

          <div className="rm-form-group">
            <label>Room Number</label>

            <input
              type="text"
              name="roomNumber"
              value={form.roomNumber}
              onChange={handleChange}
              placeholder="Table 1"
              required
            />
          </div>

          <div className="rm-form-group">
            <label>Description</label>

            <textarea
              rows="3"
              name="description"
              value={form.description}
              onChange={handleChange}
            />
          </div>

          <div className="rm-form-row">

            <div className="rm-form-group">

              <label>Capacity</label>

              <input
                type="number"
                name="capacity"
                value={form.capacity}
                onChange={handleChange}
              />

            </div>

            <div className="rm-form-group">

              <label>Base Price (₱)</label>

              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
              />

            </div>

          </div>

          <div className="rm-form-group">

            <label>Status</label>

            <select
              name="status"
              value={form.status}
              onChange={handleChange}
            >
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Inactive">Inactive</option>
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
                : "Add Room"}
            </button>

          </div>

        </form>

      </div>
    </div>
  );
}