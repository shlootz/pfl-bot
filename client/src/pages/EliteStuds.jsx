import React, { useEffect, useState } from "react";

export default function EliteStuds() {
  const [studs, setStuds] = useState([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/elite-studs")
      .then((res) => res.json())
      .then((data) => setStuds(data))
      .catch((err) => console.error("Failed to load elite studs:", err));
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Elite Studs</h2>
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Heart</th>
            <th className="p-2 border">Stamina</th>
            <th className="p-2 border">Speed</th>
            <th className="p-2 border">Temper</th>
            <th className="p-2 border">Start</th>
            <th className="p-2 border">Link</th>
          </tr>
        </thead>
        <tbody>
          {studs.map((stud) => (
            <tr key={stud.id} className="border-t">
              <td className="p-2 border font-semibold">{stud.name}</td>
              <td className="p-2 border">{stud.racing?.heart || "-"}</td>
              <td className="p-2 border">{stud.racing?.stamina || "-"}</td>
              <td className="p-2 border">{stud.racing?.speed || "-"}</td>
              <td className="p-2 border">{stud.racing?.temper || "-"}</td>
              <td className="p-2 border">{stud.racing?.start || "-"}</td>
              <td className="p-2 border text-blue-500">
                <a
                  href={`https://photofinish.live/horses/${stud.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View ➜
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
