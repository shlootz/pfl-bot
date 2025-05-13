import React, { useEffect, useState } from "react";

const TopStuds = () => {
  const [studs, setStuds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:4000/api/top-studs")
      .then((res) => res.json())
      .then((data) => {
        setStuds(data);
        setLoading(false);
      })
      .catch((err) => console.error("Failed to fetch top studs:", err));
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🏆 Top Ranked Studs per Mare</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        Object.entries(studs).map(([mareId, info]) => (
          <div key={mareId} className="mb-8">
            <h2 className="text-lg font-semibold text-blue-700">
              {info.mare_name} (<a className="text-blue-500 underline" href={info.mare_link} target="_blank">link</a>)
            </h2>
            <table className="w-full text-sm border border-gray-300 mt-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border">Rank</th>
                  <th className="p-2 border">Name</th>
                  <th className="p-2 border">Reason</th>
                  <th className="p-2 border">Heart</th>
                  <th className="p-2 border">Stamina</th>
                  <th className="p-2 border">Speed</th>
                  <th className="p-2 border">Start</th>
                  <th className="p-2 border">Temper</th>
                  <th className="p-2 border">Grade</th>
                  <th className="p-2 border">Link</th>
                </tr>
              </thead>
              <tbody>
                {info.matches.map((match, i) => (
                  <tr key={i} className="text-center">
                    <td className="p-2 border">{match.rank}</td>
                    <td className="p-2 border">{match.stud_name}</td>
                    <td className="p-2 border">{match.reason}</td>
                    <td className="p-2 border">{match.stud_stats?.heart || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.stamina || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.speed || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.start || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.temper || "-"}</td>
                    <td className="p-2 border">{match.stud_stats?.grade || "-"}</td>
                    <td className="p-2 border">
                      <a className="text-blue-500 underline" href={match.stud_link} target="_blank">View</a>
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

export default TopStuds;