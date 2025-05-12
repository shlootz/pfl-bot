import React, { useEffect, useState } from "react";

export default function AllStuds() {
  const [studs, setStuds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:4000/api/studs")
      .then((res) => res.json())
      .then((data) => {
        setStuds(data);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load studs: " + err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-4">Loading studs...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">All Studs ({studs.length})</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {studs.map((stud) => (
          <div
            key={stud.id}
            className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition"
          >
            <div className="font-semibold text-lg mb-2">{stud.name}</div>
            <div className="text-sm text-gray-500">ID: {stud.id}</div>
            <div className="mt-2 text-sm">
              <div><strong>Grade:</strong> {stud.racing?.grade || "-"}</div>
              <div><strong>Heart:</strong> {stud.racing?.heart || "-"}</div>
              <div><strong>Speed:</strong> {stud.racing?.speed || "-"}</div>
              <div><strong>Stamina:</strong> {stud.racing?.stamina || "-"}</div>
              <div><strong>Temper:</strong> {stud.racing?.temper || "-"}</div>
              <div><strong>Start:</strong> {stud.racing?.start || "-"}</div>
              <div><strong>Direction:</strong> {stud.racing?.direction?.value || "-"}</div>
              <div><strong>Surface:</strong> {stud.racing?.surface?.value || "-"}</div>
            </div>
            <a
              href={`https://photofinish.live/horses/${stud.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-blue-600 hover:underline text-sm"
            >
              View on PhotoFinish
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
