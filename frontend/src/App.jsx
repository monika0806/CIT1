import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import './App.css';
import LiveSurveillancePage from './pages/LiveSurveillancePage';
import HeatmapPage from './pages/HeatmapPage';
import RoutePlannerPage from './pages/RoutePlannerPage';
import OfficerPortalPage from './pages/OfficerPortalPage';
import CitizenPortalPage from './pages/CitizenPortalPage';

export default function App() {
  return (
    <div className="app-layout">
      {/* Ambient Cyber Lighting Glows */}
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="ambient-glow glow-3"></div>

      {/* Top Cyber Navigation Bar */}
      <Navbar />

      {/* Multi-Page Routes */}
      <div className="main-content-viewport">
        <Routes>
          <Route path="/" element={<LiveSurveillancePage />} />
          <Route path="/live" element={<LiveSurveillancePage />} />
          <Route path="/map" element={<HeatmapPage />} />
          <Route path="/routes" element={<RoutePlannerPage />} />
          <Route path="/officer" element={<OfficerPortalPage />} />
          <Route path="/citizen" element={<CitizenPortalPage />} />
          <Route path="*" element={<LiveSurveillancePage />} />
        </Routes>
      </div>
    </div>
  );
}
