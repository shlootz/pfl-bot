import React, { useEffect, useState } from "react";

const FamilyTree = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/family-tree")
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">📜 Family Tree</h1>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Sire</th>
            <th>Dam</th>
            <th>Grade</th>
            <th>Wins</th>
            <th>Majors</th>
            <th>🏆 KD</th>
          </tr>
        </thead>
        <tbody>
          {data.map(horse => (
            <tr key={horse.horse_id}>
              <td>{horse.horse_id}</td>
              <td>{horse.name}</td>
              <td>{horse.sire_id || '-'}</td>
              <td>{horse.dam_id || '-'}</td>
              <td>{horse.race_grade}</td>
              <td>{horse.total_wins}</td>
              <td>{horse.major_wins}</td>
              <td>{horse.is_kd_winner ? '✅' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FamilyTree;