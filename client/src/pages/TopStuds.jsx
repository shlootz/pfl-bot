import React, { useEffect, useState } from "react";

const TopStuds = () => {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/top-studs")
      .then((res) => res.json())
      .then((raw) => {
        if (!raw || typeof raw !== "object") throw new Error("Invalid response");
        setData(raw);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load top studs:", err);
        setLoading(false);
      });
  }, []);

  const formatStat = (stat) => stat?.value || "-";

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🥇 Top Stud Matches by Mare</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        Object.entries(data).map(([mareId, mareData]) => {
          const mareDirection = mareData?.mare_stats?.direction?.value;
          const mareSurface = mareData?.mare_stats?.surface?.value;

          return (
            <div key={mareId} className="mb-6">
              <h2 className="text-lg font-semibold text-blue-700 mb-2">
                {mareData.mare_name} ({mareDirection}, {mareSurface})
              </h2>
              <table className="w-full text-sm border border-gray-300 mb-4">
                <thead>
                  <tr className="bg-gray-100 text-xs">
                    <th className="p-2 border">Rank</th>
                    <th className="p-2 border">Name</th>
                    <th className="p-2 border">Score</th>
                    <th className="p-2 border">Reason</th>
                    <th className="p-2 border">Heart</th>
                    <th className="p-2 border">Stamina</th>
                    <th className="p-2 border">Speed</th>
                    <th className="p-2 border">Start</th>
                    <th className="p-2 border">Temper</th>
                    <th className="p-2 border">Grade</th>
                    <th className="p-2 border">Direction</th>
                    <th className="p-2 border">Surface</th>
                    <th className="p-2 border">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {mareData.matches
                    .filter(
                      (stud) =>
                        stud?.stud_stats?.direction?.value === mareDirection
                    )
                    .map((stud) => (
                      <tr key={stud.stud_id} className="text-center">
                        <td className="p-2 border">{stud.rank}</td>
                        <td className="p-2 border">{stud.stud_name}</td>
                        <td className="p-2 border">{stud.score}</td>
                        <td className="p-2 border">{stud.reason}</td>
                        <td className="p-2 border">{stud.stud_stats?.heart}</td>
                        <td className="p-2 border">{stud.stud_stats?.stamina}</td>
                        <td className="p-2 border">{stud.stud_stats?.speed}</td>
                        <td className="p-2 border">{stud.stud_stats?.start}</td>
                        <td className="p-2 border">{stud.stud_stats?.temper}</td>
                        <td className="p-2 border">{stud.stud_stats?.grade}</td>
                        <td className="p-2 border">{formatStat(stud.stud_stats?.direction)}</td>
                        <td className="p-2 border">{formatStat(stud.stud_stats?.surface)}</td>
                        <td className="p-2 border">
                          <a
                            href={`https://photofinish.live/horses/${stud.stud_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
};

export default TopStuds;