export default function RoomCard({
  room,
  onEdit,
  onDelete,
}) {
  const status = room.status || "Available";

  return (
    <div className="rm-room-card">

      <div className="rm-room-card-header">

        <div>
          <h3>{room.name}</h3>

          <p>
            {room.description || "No description provided."}
          </p>
        </div>

        <span
          className={`rm-status-badge ${room.status
            ?.toLowerCase()
            .replace(/\s+/g, "-")}`}
        >
          {room.status}
        </span>

      </div>

      <div className="rm-room-card-footer">

        <div className="rm-room-meta">

          <div className="rm-meta-item">
            <i className="ti ti-users"></i>

            <div>
              <small>Capacity</small>
              <strong>{room.capacity ?? "-"}</strong>
            </div>
          </div>

          <div className="rm-meta-item">
            <i className="ti ti-users"></i>

            <div>
              <small>Price</small>
              <strong>{room.price ?? "-"}</strong>
            </div>
          </div>

        </div>

        <div className="rm-room-actions">

          <button className="icon-btn" onClick={() => onEdit?.(room)} title="Edit Room" aria-label="Edit Room">
            <i className="ti ti-pencil"></i>
          </button>

          <button className="icon-btn danger" onClick={() => onDelete?.(room)}title="Delete Room" aria-label="Delete Room" >
            <i className="ti ti-trash"></i>
          </button>

        </div>

      </div>

    </div>
  );
}