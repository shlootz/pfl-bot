import React, { useState } from "react";
import MyMares from "./MyMares";
import AllStuds from './AllStuds';
import KDWinners from "./KDWinners";
import KDProgeny from "./KDProgeny";
import EliteStuds from "./EliteStuds";
import BreedingPairs from "./BreedingPairs";

export default function Dashboard() {
  const [tab, setTab] = useState("mares");

  const renderContent = () => {
    switch (tab) {
      case "mares":
        return <MyMares />;
      case "studs":
        return <AllStuds />;
      case "kd":
        return <KDWinners />;
      case "kdProgeny":
        return <KDProgeny />;
      case "elite":
        return <EliteStuds />;
      case "pairs":
        return <BreedingPairs />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        📊 PFL Dashboard
      </h1>
      <div className="space-x-2 mb-4">
        <button onClick={() => setTab("mares")} className="border px-3 py-1 rounded">My Mares</button>
        <button onClick={() => setTab("studs")} className="border px-3 py-1 rounded">All Studs</button>
        <button onClick={() => setTab("kd")} className="border px-3 py-1 rounded">KD Winners</button>
        <button onClick={() => setTab("kdProgeny")} className="border px-3 py-1 rounded">KD Winners Progeny</button>
        <button onClick={() => setTab("elite")} className="border px-3 py-1 rounded">Elite Studs</button>
        <button onClick={() => setTab("pairs")} className="border px-3 py-1 rounded">Breeding Pairs</button>
      </div>
      <div className="border rounded p-4 bg-white">{renderContent()}</div>
    </div>
  );
}