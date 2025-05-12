// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;