import React, { useEffect, useState } from "react";

const INDENT = 20;

const FamilyTreeNode = ({ horse, depth = 0 }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => setExpanded(!expanded);

  return (
    <div style={{ marginLeft: depth * INDENT }} className="mb-2">
      <div
        className="cursor-pointer hover:underline text-blue-600"
        onClick={toggleExpand}
      >
        <span className="font-medium">{horse.name}</span>
        {horse.is_kd_winner && <span className="ml-2 text-yellow-500">🏆 KD</span>}
        <a
          href={`https://photofinish.live/horses/${horse.horse_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-xs text-gray-500"
        >
          [view]
        </a>
      </div>

      {expanded && horse.children?.length > 0 && (
        <div className="mt-1">
          {horse.children.map((child) => (
            <FamilyTreeNode key={child.horse_id} horse={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const FamilyTreeV2 = () => {
  const [treeData, setTreeData] = useState([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/family-tree-v2")
      .then((res) => res.json())
      .then((data) => setTreeData(data))
      .catch((err) => console.error("Failed to fetch tree data:", err));
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🌿 Family Tree Graph (2 Generations)</h1>
      {treeData.length === 0 ? (
        <p>Loading...</p>
      ) : (
        treeData.map((horse) => <FamilyTreeNode key={horse.horse_id} horse={horse} />)
      )}
    </div>
  );
};

export default FamilyTreeV2;
