export default function RoomToolbar({
  facility,
  search,
  onSearch,
  onAddRoom,
}) {
  return (
    <div className="rm-room-toolbar">

      <div className="rm-room-title">

        <div>
          <h2>
            Rooms in <span>{facility.name}</span>
          </h2>

          <p>Manage rooms for this facility.</p>
        </div>

      </div>

      <div className="rm-room-toolbar-actions">

        <input
          type="text"
          className="rm-search"
          placeholder="Search rooms..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />

        <button
          className="btn btn-primary"
          onClick={onAddRoom}
        >
          <i className="ti ti-plus"></i>
          Add Room
        </button>

      </div>

    </div>
  );
}