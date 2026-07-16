import { useCallback, useEffect, useMemo, useState } from "react";
import { categoriesService } from "../../services/categories";

import '../../styles/admin/room-management.css';

import FacilityPanel from "../../components/admin/room-management/FacilityPanel";
import RoomPanel from "../../components/admin/room-management/RoomPanel";
import FacilityModal from '../../components/admin/room-management/FacilityModal';
import RoomModal from "../../components/admin/room-management/RoomModal";

import useDebounce from "../../hooks/useDebounce";

import { roomsService } from "../../services/rooms";

export default function RoomManagement() {

  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [facilitySearch, setFacilitySearch] = useState("");
  const debouncedSearch = useDebounce(facilitySearch, 300);

  const handleSelectFacility = (facility) => {
    setSelectedFacility(facility);
  };

  const handleEditFacility = (facility) => {
    setEditingFacility(facility);
    setModalOpen(true);
  };

  const handleDeleteFacility = async (facility) => {

  const confirmed = window.confirm(
    `Delete "${facility.name}"?`
  );

  if (!confirmed) return;

    try {

      await categoriesService.remove(facility._id);

      if (selectedFacility?._id === facility._id) {
        setSelectedFacility(null);
      }

      await fetchFacilities();

    } catch (err) {
      console.error("Failed to delete category:", err);
    }

  };

  const fetchFacilities = useCallback(async () => {
    setLoading(true);

    try {
      const data = await categoriesService.list();
      setFacilities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRooms = useCallback(async (facilityId) => {

    if (!facilityId) {
      setRooms([]);
      return;
    }

    setRoomsLoading(true);

    try {

      const data = await roomsService.list();

      // Filter rooms belonging to the selected facility
      const filtered = Array.isArray(data)
        ? data.filter((room) => {
            const categoryId =
              typeof room.category === "object"
                ? room.category?._id
                : room.category;

            return categoryId === facilityId;
          })
        : [];

      setRooms(filtered);

    } catch (err) {

      console.error(err);
      setRooms([]);

    } finally {

      setRoomsLoading(false);

    }

  }, []);

  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  useEffect(() => {

    if (selectedFacility) {
      fetchRooms(selectedFacility._id);
    } else {
      setRooms([]);
    }

  }, [selectedFacility, fetchRooms]);

  

  const handleAddFacility = () => {
    setEditingFacility(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingFacility(null);
  };

  const handleSubmitRoom = async (formData) => {
    try {

      if (editingRoom) {

        await roomsService.update(editingRoom._id, formData);

      } else {

        await roomsService.create(formData);

      }

      await fetchRooms(selectedFacility._id);

      handleCloseRoomModal();

    } catch (err) {

      console.error("Failed to save room:", err);

    }
  };

  const handleAddRoom = () => {
    setEditingRoom(null);
    setRoomModalOpen(true);
  };

  const handleEditRoom = (room) => {
    setEditingRoom(room);
    setRoomModalOpen(true);
  };

  const handleDeleteRoom = async (room) => {

    const confirmed = window.confirm(
      `Delete "${room.name}"?`
    );

    if (!confirmed) return;

    try {

      await roomsService.remove(room._id);

      await fetchRooms(selectedFacility._id);

    } catch (err) {

      console.error("Failed to delete room:", err);

    }

  };

  const handleCloseRoomModal = () => {
    setEditingRoom(null);
    setRoomModalOpen(false);
  };

  const handleSubmitFacility = async (formData) => {
  try {

    if (editingFacility) {

      await categoriesService.update(editingFacility._id, {
        name: formData.name,
        description: formData.description,
        isActive: formData.status === "Available",
      });

    } else {

      await categoriesService.create({
        name: formData.name,
        description: formData.description,
        isActive: formData.status === "Available",
      });

    }

      await fetchFacilities();

      handleCloseModal();

    } catch (err) {
      console.error("Failed to save facility:", err);
    }
  };

  const filteredFacilities = useMemo(() => {
    const keyword = debouncedSearch.trim().toLowerCase();

    if (!keyword) return facilities;

    return facilities.filter(facility =>
        facility.name.toLowerCase().includes(keyword)
    );
  }, [facilities, debouncedSearch]);

  useEffect(() => {
    if (!filteredFacilities.length) {
      setSelectedFacility(null);
      return;
    }

    const stillExists = filteredFacilities.some(
      (facility) => facility._id === selectedFacility?._id
    );

    if (!stillExists) {
      setSelectedFacility(filteredFacilities[0]);
    }
  }, [filteredFacilities, selectedFacility]);

  return (
    <div className="panel active">
      <div className="rm-page">
        <div className="rm-header">
          <div>
            <h2>Room Management</h2>
            <p>Manage facilities and their rooms.</p>
          </div>

          <button className="btn btn-primary" onClick={handleAddFacility}>
            <i className="ti ti-plus"></i>
            Add Facility
          </button>
        </div>

        <div className="rm-grid">

          <FacilityPanel
            facilities={filteredFacilities}
            selectedFacility={selectedFacility}
            loading={loading}
            search={facilitySearch}
            onSearch={setFacilitySearch}
            onSelect={handleSelectFacility}
            onAdd={handleAddFacility}
            onEdit={handleEditFacility}
            onDelete={handleDeleteFacility}
          />

          <RoomPanel
            facility={selectedFacility}
            rooms={rooms}
            loading={roomsLoading}
            onAddRoom={handleAddRoom}
            onEditRoom={handleEditRoom}
            onDeleteRoom={handleDeleteRoom}
          />

        </div>
      </div>

        <FacilityModal
          open={modalOpen}
          facility={editingFacility}
          mode={editingFacility ? "edit" : "create"}
          onClose={handleCloseModal}
          onSubmit={handleSubmitFacility}
        />

        <RoomModal
          open={roomModalOpen}
          room={editingRoom}
          facility={selectedFacility}
          mode={editingRoom ? "edit" : "create"}
          onClose={handleCloseRoomModal}
          onSubmit={handleSubmitRoom}
        />
    </div>
  );
}   