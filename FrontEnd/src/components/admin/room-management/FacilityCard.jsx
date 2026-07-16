export default function FacilityCard({
  facility,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
}) {

  const status = facility.isActive ? "Available" : "Unavailable";

  return (
    <div className={`rm-facility-card ${selected ? "active" : ""}`} onClick={() => onSelect?.(facility)}>

      <div className="rm-facility-top">

        <div className="rm-facility-info">

          <h4>{facility.name}</h4>

          <span
            className={`badge badge-${status.toLowerCase()}`}
          >
            {status}
          </span>

        </div>

        <div className="rm-actions">

          <button
            className="icon-btn"
            onClick={(e) => {
                e.stopPropagation();
                onEdit?.(facility);
            }}
          >
            <i className="ti ti-pencil"></i>
        </button>

          <button
            className="icon-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(facility);
            }}
          >
            <i className="ti ti-trash"></i>
          </button>

        </div>

      </div>

      <p className="rm-facility-description">
        {facility.description || "No description provided."}
      </p>

    </div>
  );
}