import React, { useEffect, useState } from "react";

const FamilyTree = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/family-tree")
      .then((res) => res.json())
      .then(setData);
  }, []);

  // Group horses by sire_id
  const groupedBySire = data.reduce((acc, horse) => {
    const sireId = horse.sire_id || "UNKNOWN";
    if (!acc[sireId]) {
      acc[sireId] = {
        sire: null,
        progeny: [],
      };
    }
    if (horse.horse_id === sireId) {
      acc[sireId].sire = horse;
    } else {
      acc[sireId].progeny.push(horse);
    }
    return acc;
  }, {});

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-6">📚 Family Tree - Grouped by Sire</h1>

      {Object.entries(groupedBySire).map(([sireId, group]) => {
        const { sire, progeny } = group;

        return (
          <div key={sireId} className="mb-8 border rounded p-4 shadow-md bg-white">
            <h2 className="text-lg font-bold text-blue-700 mb-2">
              🐎 {sire?.name || "Unknown Sire"}{" "}
              <span className="text-sm text-gray-600">({sireId})</span>{" "}
              <a
                href={`https://photofinish.live/horses/${sireId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-blue-500 underline"
              >
                View Profile
              </a>
            </h2>

            <table className="w-full text-sm border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border">Name</th>
                  <th className="p-2 border">ID</th>
                  <th className="p-2 border">Dam</th>
                  <th className="p-2 border">Grade</th>
                  <th className="p-2 border">Wins</th>
                  <th className="p-2 border">Majors</th>
                  <th className="p-2 border">🏆 KD</th>
                  <th className="p-2 border">Link</th>
                </tr>
              </thead>
              <tbody>
                {progeny.map((child) => (
                  <tr key={child.horse_id} className="text-center">
                    <td className="p-2 border">{child.name || "-"}</td>
                    <td className="p-2 border">{child.horse_id}</td>
                    <td className="p-2 border">{child.dam_id || "-"}</td>
                    <td className="p-2 border">{child.race_grade || "-"}</td>
                    <td className="p-2 border">{child.total_wins || "-"}</td>
                    <td className="p-2 border">{child.major_wins || "-"}</td>
                    <td className="p-2 border">{child.is_kd_winner ? "✅" : ""}</td>
                    <td className="p-2 border">
                      <a
                        href={`https://photofinish.live/horses/${child.horse_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
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
        );
      })}
    </div>
  );
};

export default FamilyTree;