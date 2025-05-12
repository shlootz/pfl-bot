// src/pages/Dashboard.jsx
import React, { useState } from "react";

const tabs = [
  "My Mares",
  "All Studs",
  "KD Winners",
  "KD Winners Progeny",
  "Elite Studs",
  "Breeding Pairs",
];

function Dashboard() {
  const [activeTab, setActiveTab] = useState("My Mares");

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">📊 PFL Dashboard</h1>

      <div className="flex space-x-2 border-b border-gray-300 pb-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-t-md font-medium transition-colors duration-200 ${
              activeTab === tab ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="border p-4 rounded bg-white shadow">
        <h2 className="text-xl font-semibold mb-2">{activeTab}</h2>
        <p className="text-gray-600">Coming soon: {activeTab} data</p>
      </div>
    </div>
  );
}

export default Dashboard;