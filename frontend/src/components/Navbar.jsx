import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  const [theme, setTheme] = useState(localStorage.getItem('roadpulse_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('roadpulse_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <header className="navbar">
      <div className="brand">
        <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <div className="brand-logo">
            <span className="logo-core"></span>
            <span className="logo-ring"></span>
          </div>
          <div className="brand-text">
            <div className="brand-title">
              <span>ROADPULSE</span>
              <span className="brand-tag">AI CORE v3.0</span>
            </div>
            <div className="brand-sub">Intelligent Vision & Autonomous Law Enforcement</div>
          </div>
        </NavLink>
      </div>

      <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <NavLink 
          to="/" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          end
        >
          <span>📹</span> Live Stream
        </NavLink>
        <NavLink 
          to="/map" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>🗺️</span> GIS Heatmap
        </NavLink>
        <NavLink 
          to="/routes" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>🧭</span> AI Route Planner
        </NavLink>
        <NavLink 
          to="/parking" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>🅿️</span> Street Parking AI
        </NavLink>
        <NavLink 
          to="/safety" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>🛡️</span> Women Safety AI
        </NavLink>
        <NavLink 
          to="/officer" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>👮</span> Officer Portal
        </NavLink>
        <NavLink 
          to="/citizen" 
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span>🏛️</span> Citizen Portal
        </NavLink>
      </nav>

      <div className="system-status">
        <button 
          className="theme-toggle-btn" 
          onClick={toggleTheme} 
          title="Toggle Dark / Light Theme"
          style={{ cursor: 'pointer', background: 'var(--chip-bg)', border: '1px solid var(--border-subtle)', borderRadius: '999px', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 600 }}
        >
          <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
        </button>

        <div className="status-pill status-online">
          <span className="pulse-dot"></span>
          <span>SYSTEM ONLINE</span>
        </div>
      </div>
    </header>
  );
}
