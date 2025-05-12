import React, { useState } from "react";
import MyMares from "./MyMares";

export default function Dashboard() {
  const [tab, setTab] = useState("mares");

  const renderContent = () => {
    switch (tab) {
      case "mares":
        return <MyMares />;
      case "studs":
        return <div className="p-4"><h2 className="text-xl font-bold">All Studs</h2><p>Coming soon: Studs data</p></div>;
      case "kd":
        return <div className="p-4"><h2 className="text-xl font-bold">KD Winners</h2><p>Coming soon: KD Winners data</p></div>;
      case "kdProgeny":
        return <div className="p-4"><h2 className="text-xl font-bold">KD Winners Progeny</h2><p>Coming soon: Progeny data</p></div>;
      case "elite":
        return <div className="p-4"><h2 className="text-xl font-bold">Elite Studs</h2><p>Coming soon: Elite Studs data</p></div>;
      case "pairs":
        return <div className="p-4"><h2 className="text-xl font-bold">Breeding Pairs</h2><p>Coming soon: Breeding Pairs data</p></div>;
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