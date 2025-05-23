import React, { useEffect, useState } from "react";

const TrackWinners = () => {
  const [trackData, setTrackData] = useState({});
  const [filteredTracks, setFilteredTracks] = useState({});
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/tracks-winners")
      .then((res) => res.json())
      .then((data) => {
        setTrackData(data);
        setFilteredTracks(data);
        setLoading(false);
      })
      .catch((err) => console.error("Failed to fetch winners:", err));
  }, []);

  useEffect(() => {
    if (filter.length < 3) {
      setFilteredTracks(trackData);
    } else {
      const lower = filter.toLowerCase();
      const filtered = Object.fromEntries(
        Object.entries(trackData).filter(([track]) =>
          track.toLowerCase().includes(lower)
        )
      );
      setFilteredTracks(filtered);
    }
  }, [filter, trackData]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🏁 Major Race Winners by Track</h1>

      <input
        type="text"
        placeholder="Type at least 3 characters to filter by race name..."
        className="mb-6 p-2 border rounded w-full max-w-md"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {loading ? (
        <p>Loading...</p>
      ) : (
        Object.entries(filteredTracks).map(([track, horses]) => (
          <div key={track} className="mb-6">
            <h2 className="text-lg font-semibold text-blue-700 mb-2">{track}</h2>
            <table className="w-full text-sm border border-gray-300 mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border">Name</th>
                  <th className="p-2 border">Race</th>
                  <th className="p-2 border">Season</th>
                  <th className="p-2 border">Grade</th>
                  <th className="p-2 border">Heart</th>
                  <th className="p-2 border">Stamina</th>
                  <th className="p-2 border">Speed</th>
                  <th className="p-2 border">Start</th>
                  <th className="p-2 border">Temper</th>
                  <th className="p-2 border">Link</th>
                </tr>
              </thead>
              <tbody>
                {horses.map((h) => (
                  <tr key={h.id} className="text-center">
                    <td className="p-2 border">{h.name || h.id}</td>
                    <td className="p-2 border">{h.race}</td>
                    <td className="p-2 border">{h.season}</td>
                    <td className="p-2 border">{h.grade}</td>
                    <td className="p-2 border">{h.heart}</td>
                    <td className="p-2 border">{h.stamina}</td>
                    <td className="p-2 border">{h.speed}</td>
                    <td className="p-2 border">{h.start}</td>
                    <td className="p-2 border">{h.temper}</td>
                    <td className="p-2 border">
                      <a
                        className="text-blue-600 underline"
                        href={`https://photofinish.live/horses/${h.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
};

export default TrackWinners;