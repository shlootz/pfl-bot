import React, { useState, useEffect } from 'react';
import Tree from 'react-d3-tree';

const containerStyles = {
  width: '100%',
  height: '100vh',
  overflow: 'auto',
};

const transformTreeData = (node) => {
  if (!node) return null;

  const label = `${node.name || node.horse_id}${node.is_kd_winner ? ' 🏆' : ''}`;
  const nodeLabel = {
    name: label,
    attributes: {
      Grade: node.grade || '-',
      ID: node.horse_id,
    },
  };

  const sire = transformTreeData(node.sire);
  const dam = transformTreeData(node.dam);

  const children = [];
  if (sire) {
    children.push({
      name: 'Sire Line',
      children: [sire],
    });
  }
  if (dam) {
    children.push({
      name: 'Dam Line',
      children: [dam],
    });
  }

  return {
    ...nodeLabel,
    children,
  };
};

const FamilyTreeGraph = () => {
  const [treeData, setTreeData] = useState(null);
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [rawData, setRawData] = useState([]);

  useEffect(() => {
    fetch('http://localhost:4000/api/family-tree-v2?depth=2')
      .then((res) => res.json())
      .then((data) => {
        setRawData(data);
      });
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🌿 Family Tree Graph (2 Generations)</h1>

      {!selectedHorse ? (
        <ul className="list-disc pl-6">
          {rawData.map((h, idx) => (
            <li key={idx}>
              <a
                href={`https://photofinish.live/horses/${h.horse_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {h.name || h.horse_id}
              </a>
              {h.is_kd_winner ? ' 🏆' : ''}
              <button
                className="ml-2 text-sm text-blue-500 underline"
                onClick={() => setSelectedHorse(h)}
              >
                [view tree]
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={containerStyles}>
          <button
            className="mb-4 bg-gray-200 px-3 py-1 rounded"
            onClick={() => setSelectedHorse(null)}
          >
            ← Back to list
          </button>
          <Tree
            data={transformTreeData(selectedHorse)}
            orientation="vertical"
            pathFunc="elbow"
            collapsible={false}
            zoomable
            separation={{ siblings: 1.5, nonSiblings: 2 }}
            translate={{ x: 400, y: 100 }}
          />
        </div>
      )}
    </div>
  );
};

export default FamilyTreeGraph;