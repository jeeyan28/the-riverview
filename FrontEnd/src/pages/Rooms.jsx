import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';
import '../styles/rooms-page.css';

import billiardsImg from '../assets/images/billiards.png';
import courtImg from '../assets/images/court.png';
import heroBgImg from '../assets/images/main.png';
import heroImg4 from '../assets/pictures/RiverView_4.jpg';
import heroImg6 from '../assets/pictures/RiverView_6.jpg';

// Static/demo data only — this page has no backend yet (see
// FEATURE_REQUESTS.md "View All Rooms" task). Facility images reuse
// existing site assets; Karaoke/Private Drinking Rooms have no dedicated
// photo yet, so they borrow the closest existing hero shots.
const FACILITIES = [
  {
    id: 'billiards',
    name: 'Billiards',
    icon: 'fa-circle-nodes',
    image: billiardsImg,
    description: 'Premium tables for friendly games and tournaments.',
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    icon: 'fa-microphone',
    image: heroImg4,
    description: 'Sing your heart out with friends and family.',
  },
  {
    id: 'drinking-rooms',
    name: 'Private Drinking Rooms',
    icon: 'fa-martini-glass-citrus',
    image: heroImg6,
    description: 'Private spaces for intimate gatherings and celebrations.',
  },
  {
    id: 'rental-court',
    name: 'Rental Court',
    icon: 'fa-basketball',
    image: courtImg,
    description: 'Spacious court for basketball and other sports.',
  },
];

const ROOMS_BY_FACILITY = {
  billiards: [
    { id: 'B1', name: 'Room B1', type: 'Solo Room', capacity: '1–4 People', price: 200, available: true, description: 'Perfect for solo players or small groups who just want to sink a few balls without the crowd. Quiet corner spot with soft ambient lighting and a full rack of house cues.' },
    { id: 'B2', name: 'Room B2', type: 'Big Room', capacity: '1–6 People', price: 300, available: true, description: 'Spacious room built for bigger groups and friendly matches. Extra seating around the table plus a mini fridge for drinks between rounds.' },
    { id: 'B3', name: 'Room B3', type: 'Solo Room', capacity: '1–4 People', price: 200, available: true, description: 'A comfortable, relaxed setting for a casual game with friends. Great lighting over the table and enough space to line up your shot from any angle.' },
    { id: 'B4', name: 'Room B4', type: 'Shared Room', capacity: '1–6 People', price: 150, available: true, description: "Share the space and the fun with other players in this open, social layout. Ideal if you're up for meeting new people over a game or two." },
  ],
  karaoke: [
    { id: 'K1', name: 'Room K1', type: 'Solo Room', capacity: '1–2 People', price: 250, available: true, description: 'A cozy pod built for solo singers or duets who want their own space. Compact but comes with the same premium mic setup as the bigger rooms.' },
    { id: 'K2', name: 'Room K2', type: 'Big Room', capacity: '1–10 People', price: 450, available: true, description: 'Our party-sized room with a premium sound system and plenty of room to move. Fits the whole barkada comfortably with couch seating around the screen.' },
    { id: 'K3', name: 'Room K3', type: 'Shared Room', capacity: '1–6 People', price: 300, available: false, description: "A mid-sized room that's great for small groups looking for a laid-back sing-along. Currently fully reserved — check back later or pick another room." },
    { id: 'K4', name: 'Room K4', type: 'Big Room', capacity: '1–8 People', price: 400, available: true, description: 'Spacious room with mood lighting and a song library spanning every genre. Great for birthdays or just a fun night out with friends.' },
  ],
  'drinking-rooms': [
    { id: 'P1', name: 'Room P1', type: 'Shared Room', capacity: '1–8 People', price: 500, available: true, description: 'A private lounge with premium service, low lighting, and comfortable seating. Ideal for intimate get-togethers or a relaxed night with close friends.' },
    { id: 'P2', name: 'Room P2', type: 'Big Room', capacity: '1–12 People', price: 700, available: false, description: 'Our largest private room, built for celebrations and bigger gatherings. Currently fully reserved — popular for birthdays and reunions, so reserve early next time.' },
  ],
  'rental-court': [
    { id: 'R1', name: 'Court R1', type: 'Big Room', capacity: '1–10 People', price: 600, available: true, description: 'A full-size court with proper flooring, a working scoreboard, and a sound system for official games. Great for pickup games, practice, or a real tournament match.' },
  ],
};

const TOTAL_ROOM_COUNT = FACILITIES.reduce((sum, f) => sum + ROOMS_BY_FACILITY[f.id].length, 0);

// "All Facilities" is a selectable card like any other, not a special
// mode — it's just the facility grid's own way of clearing the filter,
// per the request to drop the separate dropdown.
const ALL_FACILITY = {
  id: 'all',
  name: 'All Facilities',
  icon: 'fa-grip',
  image: heroBgImg,
  description: 'Browse every room across all our facilities.',
};

// Rooms for a given facility selection, each tagged with its facility's
// image/name so the "All Facilities" view can show mixed rooms clearly.
function getRoomsForSelection(selectedId) {
  const facilities = selectedId === 'all' ? FACILITIES : FACILITIES.filter((f) => f.id === selectedId);
  return facilities.flatMap((f) =>
    ROOMS_BY_FACILITY[f.id].map((room) => ({
      ...room,
      facilityImage: f.image,
      facilityName: f.name,
      facilityDescription: f.description,
    }))
  );
}

function FacilityCard({ facility, isSelected, roomCount, onSelect }) {
  return (
    <button
      type="button"
      className={`rp-facility-card${isSelected ? ' is-selected' : ''}`}
      onClick={() => onSelect(facility.id)}
    >
      <div className="rp-facility-img">
        <img src={facility.image} alt={facility.name} />
      </div>
      <div className="rp-facility-body">
        <div className="rp-facility-top">
          <h3><i className={`fa-solid ${facility.icon}`}></i> {facility.name}</h3>
          <span className="rp-facility-count">
            {roomCount} Room{roomCount > 1 ? 's' : ''}<br />Available
          </span>
        </div>
        <p>{facility.description}</p>
      </div>
    </button>
  );
}

// Clicking the card opens a modal with the room + facility details —
// this card is just the summary, the modal is where you see everything.
function RoomCard({ room, onView }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onView(room);
    }
  }

  return (
    <div
      className="room-card rp-room-card"
      role="button"
      tabIndex={0}
      onClick={() => onView(room)}
      onKeyDown={handleKeyDown}
    >
      <div className="room-card-img">
        <span className={`room-card-status ${room.available ? 'room-status-available' : 'room-status-fullybooked'}`}>
          {room.available ? 'Available' : 'Fully Reserved'}
        </span>
        <img src={room.facilityImage} alt={room.name} />
      </div>
      <div className="room-card-body">
        <span className="rp-room-facility">{room.facilityName}</span>
        <div className="rp-room-title-row">
          <h3>{room.name}</h3>
          <span className="room-tag rp-room-type">{room.type}</span>
        </div>
        <span className="rp-room-capacity"><i className="fa-solid fa-users"></i> {room.capacity}</span>
        <p className="room-card-desc">{room.description}</p>
        <span className="price-amt">₱{room.price}/hr</span>
      </div>
    </div>
  );
}

// Modal content — full room + facility info. `title` on the shared Modal
// takes any node, so the close button lives there rather than requiring
// changes to Modal.jsx itself.
function RoomDetailsModal({ room, onClose }) {
  return (
    <Modal
      open={!!room}
      onClose={onClose}
      size="xl"
      title={
        room && (
          <div className="rp-modal-title-row">
            <span>{room.name}</span>
            <button type="button" className="rp-modal-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )
      }
    >
      {room && (
        <div className="rp-modal-body">
          <div className="rp-modal-img">
            <span className={`room-card-status ${room.available ? 'room-status-available' : 'room-status-fullybooked'}`}>
              {room.available ? 'Available' : 'Fully Reserved'}
            </span>
            <img src={room.facilityImage} alt={room.name} />
          </div>
          <div className="rp-modal-info">
            <span className="rp-room-facility">{room.facilityName}</span>
            <div className="rp-modal-tags">
              <span className="room-tag rp-room-type">{room.type}</span>
              <span className="rp-room-capacity"><i className="fa-solid fa-users"></i> {room.capacity}</span>
            </div>
            <p className="room-card-desc">{room.description}</p>
            <span className="price-amt rp-modal-price">₱{room.price}/hr</span>
          </div>
        </div>
      )}
      {room && (
        <div className="rp-modal-facility-desc">
          <h4><i className="fa-solid fa-circle-info"></i> About {room.facilityName}</h4>
          <p>{room.facilityDescription}</p>
        </div>
      )}
    </Modal>
  );
}

function Rooms() {
  // Defaults to "all" so landing here from "View All Rooms" already
  // shows every room, no extra click required.
  const [selectedId, setSelectedId] = useState('all');
  const [activeRoom, setActiveRoom] = useState(null);
  const isAll = selectedId === 'all';
  const selectedFacility = isAll ? null : FACILITIES.find((f) => f.id === selectedId);
  const rooms = getRoomsForSelection(selectedId);

  return (
    <div className="rp-page">
      {/* HEADER */}
      <section className="rp-hero">
        <div className="rp-hero-inner">
          <Link to="/" className="rp-back-home">
            <i className="fa-solid fa-arrow-left"></i> Back to Home
          </Link>
          <div className="section-label">Explore Our Spaces</div>
          <h1>All Rooms &amp; Facilities</h1>
          <p>Choose a facility and room that suits your needs.</p>
        </div>
      </section>

      {/* FACILITY GRID (includes "All Facilities" as the reset/overview card) */}
      <section className="rp-facilities">
        <div className="rp-facilities-grid">
          <FacilityCard
            facility={ALL_FACILITY}
            isSelected={isAll}
            roomCount={TOTAL_ROOM_COUNT}
            onSelect={setSelectedId}
          />
          {FACILITIES.map((f) => (
            <FacilityCard
              key={f.id}
              facility={f}
              isSelected={selectedId === f.id}
              roomCount={ROOMS_BY_FACILITY[f.id].length}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <div className="rp-rooms">
          <div className="rp-rooms-header">
            <h2>
              <i className={`fa-solid ${isAll ? ALL_FACILITY.icon : selectedFacility.icon}`}></i>
              {isAll ? ' All Rooms' : ` ${selectedFacility.name} Rooms`}
            </h2>
            {!isAll && (
              <button type="button" className="btn-select rp-book-facility" disabled title="Reservation coming soon">
                <i className="fa-solid fa-calendar-check"></i> Reserve Facility
              </button>
            )}
          </div>

          <div className="rooms-grid">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} onView={setActiveRoom} />
            ))}
          </div>
        </div>
      </section>

      <RoomDetailsModal room={activeRoom} onClose={() => setActiveRoom(null)} />
    </div>
  );
}

export default Rooms;