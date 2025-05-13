import React, { useEffect, useState } from "react";

const KdTargets = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/kd-targets")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Failed to fetch KD targets:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">
        🏇 Kentucky Derby Target Breeding Matches
      </h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        Object.entries(data).map(([mareId, entry]) => (
          <div
            key={mareId}
            className="mb-6 border rounded p-4 shadow bg-white"
          >
            <h2 className="text-lg font-semibold text-blue-700 mb-2">
              🐎 {entry.mare_name || mareId}
              <span className="ml-2 text-gray-500 text-sm">({mareId})</span>
              {entry.mare_link && (
                <a
                  className="ml-2 text-blue-500 underline"
                  href={entry.mare_link}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Profile
                </a>
              )}
            </h2>
            <p className="text-sm mb-2 text-gray-600">
              Preferred: {entry.mare_stats?.direction?.value || "-"} |{' '}
              {entry.mare_stats?.surface?.value || "-"}
            </p>
            <table className="w-full text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 border">Rank</th>
                  <th className="p-2 border">Stud</th>
                  <th className="p-2 border">Score</th>
                  <th className="p-2 border">Reason</th>
                  <th className="p-2 border">Direction</th>
                  <th className="p-2 border">Surface</th>
                  <th className="p-2 border">Heart</th>
                  <th className="p-2 border">Stamina</th>
                  <th className="p-2 border">Speed</th>
                  <th className="p-2 border">Temper</th>
                  <th className="p-2 border">Start</th>
                  <th className="p-2 border">Link</th>
                </tr>
              </thead>
              <tbody>
                {(entry.matches || []).map((match) => (
                  <tr
                    key={match.stud_id}
                    className="text-center"
                  >
                    <td className="p-2 border">{match.rank}</td>
                    <td className="p-2 border">{match.stud_name}</td>
                    <td className="p-2 border font-bold text-green-700">{match.score}</td>
                    <td className="p-2 border">{match.reason}</td>
                    <td className="p-2 border">{match.stud_stats?.direction?.value || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.surface?.value || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.heart || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.stamina || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.speed || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.temper || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.start || "-"}</td>
                    <td className="p-2 border">
                      <a
                        href={`https://photofinish.live/horses/${match.stud_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 underline"
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

export default KdTargets;