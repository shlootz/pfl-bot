import React, { useEffect, useState } from 'react';
import Tree from 'react-d3-tree';

const containerStyles = {
  width: '100%',
  height: '100vh',
  overflow: 'auto',
};

const FamilyTreeGraph = () => {
  const [treeData, setTreeData] = useState(null);

  useEffect(() => {
    fetch('http://localhost:4000/api/family-tree-v2?depth=2')
      .then((res) => res.json())
      .then((data) => {
        const tree = buildFullTree(data);
        setTreeData(tree);
      });
  }, []);

  const buildFullTree = (nodes) => {
    const idMap = {};
    const childrenMap = {};

    nodes.forEach((node) => {
      idMap[node.horse_id] = {
        name: `${node.name || node.horse_id}${node.is_kd_winner ? ' 🏆' : ''}`,
        attributes: { Grade: node.grade },
        children: [],
      };
      if (node.sire_id) {
        childrenMap[node.sire_id] = childrenMap[node.sire_id] || [];
        childrenMap[node.sire_id].push(node.horse_id);
      }
      if (node.dam_id) {
        childrenMap[node.dam_id] = childrenMap[node.dam_id] || [];
        childrenMap[node.dam_id].push(node.horse_id);
      }
    });

    // Build child links
    Object.entries(childrenMap).forEach(([parentId, children]) => {
      if (idMap[parentId]) {
        children.forEach((childId) => {
          if (idMap[childId]) {
            idMap[parentId].children.push(idMap[childId]);
          }
        });
      }
    });

    // Find root nodes (not a child of any other node)
    const allChildIds = new Set(Object.values(childrenMap).flat());
    const roots = Object.keys(idMap).filter((id) => !allChildIds.has(id)).map((id) => idMap[id]);

    return roots.length === 1 ? roots[0] : { name: 'PFL Roots', children: roots };
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🌳 Full Lineage Tree</h1>
      <div style={containerStyles}>
        {treeData ? (
          <Tree
            data={treeData}
            orientation="vertical"
            pathFunc="elbow"
            collapsible={false}
            zoomable
          />
        ) : (
          <p>Loading tree...</p>
        )}
      </div>
    </div>
  );
};

export default FamilyTreeGraph;