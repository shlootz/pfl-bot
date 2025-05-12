import React, { useEffect, useState } from "react";

export default function KDWinners() {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/kd-winners")
      .then((res) => res.json())
      .then((data) => {
        setWinners(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load KD winners:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="p-4">Loading...</p>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Kentucky Derby Winners</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {winners.map((horse) => (
          <div key={horse.id} className="border p-4 rounded shadow">
            <h3 className="font-semibold text-lg mb-2">{horse.name || "Unnamed Horse"}</h3>
            <p><strong>Grade:</strong> {horse.racing?.grade || "-"}</p>
            <p><strong>Heart:</strong> {horse.racing?.heart || "-"}</p>
            <p><strong>Speed:</strong> {horse.racing?.speed || "-"}</p>
            <p><strong>Stamina:</strong> {horse.racing?.stamina || "-"}</p>
            <p><strong>Start:</strong> {horse.racing?.start || "-"}</p>
            <p><strong>Finish:</strong> {horse.racing?.finish || "-"}</p>
            <p><strong>Temper:</strong> {horse.racing?.temper || "-"}</p>
            <p><strong>Direction:</strong> {horse.racing?.direction?.value || "-"}</p>
            <p><strong>Surface:</strong> {horse.racing?.surface?.value || "-"}</p>
            <p><a href={`https://photofinish.live/horses/${horse.id}`} target="_blank" className="text-blue-500 underline">View on PFL</a></p>
          </div>
        ))}
      </div>
    </div>
  );
}
