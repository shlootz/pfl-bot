import React, { useEffect, useState } from "react";

function MyMares() {
  const [mares, setMares] = useState([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/mares")
      .then(res => res.json())
      .then(data => setMares(data))
      .catch(err => console.error("Failed to load mares:", err));
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">My Mares</h2>
      <table className="table-auto border w-full">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-4 py-2">Name</th>
            <th className="border px-4 py-2">Grade</th>
            <th className="border px-4 py-2">Heart</th>
            <th className="border px-4 py-2">Speed</th>
            <th className="border px-4 py-2">Stamina</th>
            <th className="border px-4 py-2">Link</th>
          </tr>
        </thead>
        <tbody>
          {mares.map((m) => (
            <tr key={m.id}>
              <td className="border px-4 py-2">{m.name}</td>
              <td className="border px-4 py-2">{m.racing?.grade || "-"}</td>
              <td className="border px-4 py-2">{m.racing?.heart || "-"}</td>
              <td className="border px-4 py-2">{m.racing?.speed || "-"}</td>
              <td className="border px-4 py-2">{m.racing?.stamina || "-"}</td>
              <td className="border px-4 py-2">
                <a
                  href={`https://photofinish.live/horses/${m.id}`}
                  className="text-blue-600 underline"
                  target="_blank"
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
}

export default MyMares;