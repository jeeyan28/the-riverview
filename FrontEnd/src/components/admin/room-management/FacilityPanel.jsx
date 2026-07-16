import FacilityCard from "./FacilityCard";

export default function FacilityPanel({
  facilities,
  selectedFacility,
  loading,
  search,
  onSearch,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}) {
  return (
    <section className="rm-panel rm-facility-panel">

      <div className="rm-panel-header">

        <div>
          <h2>Facilities</h2>
          <p>Manage all facilities</p>
        </div>

        <button
          className="btn btn-primary"
          onClick={onAdd}
        >
          + Add Facility
        </button>

      </div>

      <div className="rm-search">
        <input
          type="text"
          placeholder="Search facilities..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />

        {search && (
          <button
            type="button"
            className="rm-search-clear"
            onClick={() => onSearch("")}
            aria-label="Clear search"
          >
            <i className="ti ti-x"></i>
          </button>
        )}
      </div>

      <div className="rm-facility-list">

        {loading ? (

          <p>Loading...</p>

        ) : facilities.length === 0 ? (

          <div className="rm-empty">

            <i className="ti ti-search"></i>

            <h3>No facilities found</h3>

            <p>
              Try another search keyword.
            </p>

            {search && (
              <button
                className="btn"
                onClick={() => onSearch("")}
              >
                Clear Search
              </button>
            )}

          </div>

        ) : (

          facilities.map((facility) => (

            <FacilityCard
              key={facility._id}
              facility={facility}
              selected={
                selectedFacility?._id === facility._id
              }
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />

          ))

        )}

      </div>

    </section>
  );
}