import React, { useEffect, useState } from "react";

export default function KDProgeny() {
  const [progeny, setProgeny] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:4000/api/kd-progeny")
      .then((res) => res.json())
      .then(setProgeny)
      .catch((err) => setError("Failed to load KD progeny: " + err.message));
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">KD Winners' Progeny</h2>
      {error && <p className="text-red-500">{error}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr>
              <th className="border px-4 py-2">Name</th>
              <th className="border px-4 py-2">Heart</th>
              <th className="border px-4 py-2">Speed</th>
              <th className="border px-4 py-2">Stamina</th>
              <th className="border px-4 py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {progeny.map((horse) => (
              <tr key={horse.id} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{horse.name}</td>
                <td className="border px-4 py-2">{horse.racing?.heart || "-"}</td>
                <td className="border px-4 py-2">{horse.racing?.speed || "-"}</td>
                <td className="border px-4 py-2">{horse.racing?.stamina || "-"}</td>
                <td className="border px-4 py-2">
                  <a
                    href={`https://photofinish.live/horses/${horse.id}`}
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
    </div>
  );
}
