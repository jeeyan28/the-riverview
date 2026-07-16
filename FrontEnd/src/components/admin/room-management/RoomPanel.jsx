import { useState } from "react";

import RoomCard from "./RoomCard";
import RoomStats from "./RoomStats";
import RoomToolbar from "./RoomToolbar";


export default function RoomPanel({ facility, rooms = [], loading = false, onAddRoom, onEditRoom, onDeleteRoom, }) {
  const [search, setSearch] = useState("");

  if (!facility) {
    
    return (
      <section className="rm-panel rm-room-panel">
        <div className="rm-room-empty">
          <i className="ti ti-building"></i>

          <h3>Select a Facility</h3>

          <p>
            Choose a facility from the left to manage its rooms.
          </p>
        </div>
      </section>
    );
  }

  const filteredRooms = rooms.filter((room) => {
    const keyword = search.toLowerCase();

    return (
      room.name?.toLowerCase().includes(keyword) ||
      room.roomNumber?.toLowerCase().includes(keyword)
    );
  });

  return (
    <section className="rm-panel rm-room-panel">

      <RoomToolbar
        facility={facility}
        search={search}
        onSearch={setSearch}
        onAddRoom={onAddRoom}
      />

      <RoomStats rooms={rooms} />

      <div className="rm-room-list">

        {loading ? (

          <div className="rm-empty">
            Loading rooms...
          </div>

        ) : rooms.length === 0 ? (

          <div className="rm-empty">

            <i className="ti ti-door"></i>

            <h3>No Rooms Yet</h3>

            <p>
              Create the first room for <strong>{facility.name}</strong>.
            </p>

            <button className="btn btn-primary">
              <i className="ti ti-plus"></i>
              Add Room
            </button>

          </div>

        ) : (

          filteredRooms.map(room => (
            <RoomCard
              key={room._id}
              room={room}
              onEdit={onEditRoom}
              onDelete={onDeleteRoom}
            />
          ))

        )}

      </div>

    </section>
  );
}