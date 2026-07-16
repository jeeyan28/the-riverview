export default function RoomStats({ rooms = [] }) {

  const total = rooms.length;

  const available = rooms.filter(
    room => room.status === "Available"
  ).length;

  const occupied = rooms.filter(
    room => room.status === "Occupied"
  ).length;

  const maintenance = rooms.filter(
    room => room.status === "Under Maintenance"
  ).length;

  const stats = [
    {
      label: "Total",
      value: total,
      icon: "ti ti-door",
      color: "total",
    },
    {
      label: "Available",
      value: available,
      icon: "ti ti-check",
      color: "available",
    },
    {
      label: "Occupied",
      value: occupied,
      icon: "ti ti-user",
      color: "occupied",
    },
    {
      label: "Maintenance",
      value: maintenance,
      icon: "ti ti-tool",
      color: "maintenance",
    },
  ];

  return (
    <div className="rm-room-stats">

      {stats.map((stat) => (
        <div key={stat.label} className={`rm-stat-card ${stat.color}`} >
          <i className={stat.icon}></i>

          <div>

            <h3>{stat.value}</h3>

            <span>{stat.label}</span>

          </div>

        </div>
      ))}

    </div>
  );
}