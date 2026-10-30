import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './HeatmapPage.css';

export default function HeatmapPage() {
  const [telemetryData, setTelemetryData] = useState(null);
  const [scenario, setScenario] = useState('college_rush');
  const [timeHour, setTimeHour] = useState(17);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [activeLayers, setActiveLayers] = useState({ corridors: true, heatmap: true, camera: true });

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    segments: null,
    junctions: null,
    cameraMarker: null
  });

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (typeof window.L === 'undefined' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = window.L.map(mapContainerRef.current, {
        center: [13.3280, 77.1265],
        zoom: 15,
        zoomControl: true,
        attributionControl: false
      });

      // Dark CartoDB Tiles (Zero API Key required)
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

      layersRef.current.segments = window.L.featureGroup().addTo(map);
      layersRef.current.junctions = window.L.featureGroup().addTo(map);

      mapInstanceRef.current = map;
    }
  }, []);

  // 2. Poll GIS Telemetry from Flask (/api/map/telemetry)
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await fetch('/api/map/telemetry');
        if (!res.ok) return;
        const data = await res.json();
        setTelemetryData(data);
        renderGISData(data);
      } catch (e) {
        console.warn('GIS telemetry poll error:', e);
      }
    };

    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, 2500);
    return () => clearInterval(timer);
  }, []);

  // 3. Render Segments, Junctions & Live Camera Beacon
  const renderGISData = (data) => {
    if (!mapInstanceRef.current || !data) return;
    const map = mapInstanceRef.current;
    const L = window.L;

    // A. Render Road Segments
    if (layersRef.current.segments) {
      layersRef.current.segments.clearLayers();
      if (data.segments_geojson?.features) {
        data.segments_geojson.features.forEach(feat => {
          const coords = feat.geometry.coordinates.map(pt => [pt[1], pt[0]]);
          const props = feat.properties;

          const polyline = L.polyline(coords, {
            color: props.color || '#10b981',
            weight: 7,
            opacity: 0.88,
            lineJoin: 'round'
          }).addTo(layersRef.current.segments);

          polyline.bindPopup(`
            <div style="font-family: inherit; font-size: 0.8rem; color: #0f172a; min-width: 190px;">
              <h4 style="margin: 0 0 0.3rem 0; font-weight: 800; color: #0f172a;">${props.name}</h4>
              <div style="background: ${props.color}; color: #fff; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.72rem; margin-bottom: 0.4rem; display: inline-block;">
                ${props.status.toUpperCase()} (${props.congestion_pct}%)
              </div>
              <div>Estimated Speed: <strong>${props.avg_speed_kmh} km/h</strong></div>
              <div>Corridor Length: <strong>${props.length_km} km</strong></div>
            </div>
          `);
        });
      }
    }

    // B. Render Junction Circles
    if (layersRef.current.junctions && data.nodes) {
      layersRef.current.junctions.clearLayers();
      Object.entries(data.nodes).forEach(([jid, node]) => {
        const state = data.state?.[jid] || {};
        const cong = state.congestion_pct || 25;
        let color = '#10b981';
        if (cong >= 65) color = '#ef4444';
        else if (cong >= 35) color = '#f59e0b';

        const circle = L.circleMarker([node.lat, node.lng], {
          radius: 9,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.95
        }).addTo(layersRef.current.junctions);

        circle.bindPopup(`
          <div style="font-family: inherit; font-size: 0.8rem; color: #0f172a; min-width: 200px;">
            <h4 style="margin: 0 0 0.2rem 0; font-weight: 800;">${node.name}</h4>
            <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 0.3rem;">${node.description}</div>
            <div>Congestion: <strong style="color: ${color};">${cong}% (LOS ${state.los || 'A'})</strong></div>
            <div>Avg Speed: <strong>${state.avg_speed || 40} km/h</strong></div>
            <div>Active Vehicles: <strong>${state.active_vehicles || 0}</strong></div>
          </div>
        `);
      });
    }

    // C. Render Live Camera Radar Beacon
    if (data.live_camera && data.live_camera.active) {
      const cam = data.live_camera;
      const camIcon = L.divIcon({
        className: 'camera-radar-beacon',
        html: `
          <div style="position: relative; width: 34px; height: 34px;">
            <div style="position: absolute; inset: 0; border-radius: 50%; background: ${cam.color}; opacity: 0.35; animation: radarPing 1.8s infinite ease-out;"></div>
            <div style="position: absolute; inset: 6px; border-radius: 50%; background: ${cam.color}; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; box-shadow: 0 0 14px ${cam.color};">
              📹
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      if (!layersRef.current.cameraMarker) {
        layersRef.current.cameraMarker = L.marker([cam.lat, cam.lng], { icon: camIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        layersRef.current.cameraMarker.setLatLng([cam.lat, cam.lng]);
        layersRef.current.cameraMarker.setIcon(camIcon);
      }

      layersRef.current.cameraMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 0.8rem; color: #0f172a; min-width: 230px;">
          <h4 style="margin: 0 0 0.25rem 0; font-weight: 800;">📹 ${cam.name}</h4>
          <div style="font-size: 0.72rem; color: #64748b; margin-bottom: 0.4rem; border-bottom: 1px dashed #cbd5e1; padding-bottom: 0.3rem;">
            📍 <strong>Address:</strong> ${cam.address || 'Surveillance Location, Tumakuru'}
          </div>
          <div style="background: ${cam.color}; color: #ffffff; font-weight: 800; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem; margin-bottom: 0.4rem; display: inline-block;">
            VOLUME STATUS: ${cam.status?.toUpperCase() || 'FREE FLOW'}
          </div>
          <div>Active In-Frame: <strong>${cam.active_vehicles || 0} vehicles</strong></div>
          <div>Congestion Index: <strong>${cam.congestion_pct || 25}%</strong></div>
          <div>GPS Coordinates: <code>${Number(cam.lat).toFixed(4)}, ${Number(cam.lng).toFixed(4)}</code></div>
          <div>Mapped Junction: <span>${cam.nearest_node_name || 'SIT Main Gate'}</span></div>
          <div style="display: flex; gap: 0.4rem; margin-top: 0.6rem; border-top: 1px solid #e2e8f0; padding-top: 0.5rem;">
            <a href="/routes?from=LIVE_CAM" style="flex: 1; text-align: center; font-size: 0.7rem; background: #0284c7; color: white; padding: 0.3rem; border-radius: 4px; text-decoration: none; font-weight: 700;">Route From</a>
            <a href="/routes?to=LIVE_CAM" style="flex: 1; text-align: center; font-size: 0.7rem; background: #0ea5e9; color: white; padding: 0.3rem; border-radius: 4px; text-decoration: none; font-weight: 700;">Route To</a>
            <a href="/" style="text-align: center; font-size: 0.7rem; background: #f1f5f9; color: #0f172a; padding: 0.3rem 0.5rem; border-radius: 4px; text-decoration: none; font-weight: 700;" title="Live Surveillance Feed">Feed</a>
          </div>
        </div>
      `);
    }
  };

  const handleScenarioChange = async (newScenario) => {
    setScenario(newScenario);
    try {
      await fetch('/api/map/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: newScenario })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTimeChange = async (newHour) => {
    setTimeHour(newHour);
    try {
      await fetch('/api/map/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time_hour: parseInt(newHour, 10) })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const forecast = telemetryData?.forecast || {};
  const predictions = forecast.predictions || {};
  const advisories = forecast.advisories || [];

  return (
    <main className="dashboard-container">
      {/* KPI Ribbon */}
      <section className="kpi-ribbon" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card accent-cyan">
          <div className="kpi-icon">🌐</div>
          <div className="kpi-content">
            <div className="kpi-val mono">SIT Tumkur</div>
            <div className="kpi-label">Active GIS Network Core</div>
          </div>
        </div>

        <div className="kpi-card accent-emerald">
          <div className="kpi-icon">🛣️</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{telemetryData?.segments_geojson?.features?.length || 12}</div>
            <div className="kpi-label">Monitored Street Corridors</div>
          </div>
        </div>

        <div className="kpi-card accent-amber">
          <div className="kpi-icon">📹</div>
          <div className="kpi-content">
            <div className="kpi-val mono" style={{ fontSize: '1.1rem' }}>
              {telemetryData?.live_camera?.name || 'Live Feed'}
            </div>
            <div className="kpi-label">Active Camera Beacon</div>
          </div>
        </div>

        <div className="kpi-card accent-rose">
          <div className="kpi-icon">⚡</div>
          <div className="kpi-content">
            <div className="kpi-val mono">AI Predictive</div>
            <div className="kpi-label">30-Min Congestion Horizon</div>
          </div>
        </div>
      </section>

      {/* Grid: Map + Sidebar Control Deck */}
      <div className="workspace-grid" style={{ gridTemplateColumns: '1fr 340px' }}>
        {/* Leaflet Map Stage */}
        <section className="surveillance-stage" style={{ padding: '0', overflow: 'hidden', height: '680px', position: 'relative' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', background: '#080c14' }} />

          {/* Map Legend Overlay */}
          <div style={{ position: 'absolute', bottom: '1.25rem', left: '1.25rem', background: 'rgba(13, 19, 31, 0.92)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(10px)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', zIndex: 500, fontSize: '0.75rem' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.4rem', color: 'var(--text-pure)' }}>Traffic Volume Thresholds:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ width: '14px', height: '4px', background: '#10b981', borderRadius: '2px' }}></span>
              <span>Free Flow (&lt; 35%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ width: '14px', height: '4px', background: '#f59e0b', borderRadius: '2px' }}></span>
              <span>Moderate Volume (35 - 65%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '14px', height: '4px', background: '#ef4444', borderRadius: '2px' }}></span>
              <span>Heavy Bottleneck (&gt; 65%)</span>
            </div>
          </div>
        </section>

        {/* Sidebar Controls & Forecast Deck */}
        <aside className="analytics-deck" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '680px', overflowY: 'auto' }}>
          {/* Simulation Scenarios */}
          <div className="radar-card" style={{ padding: '1rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--neon-cyan)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
              ⚙️ Simulation Scenarios:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {[
                { id: 'college_rush', name: '🎓 SIT College Rush Hour' },
                { id: 'normal', name: '🟢 Normal Off-Peak Traffic' },
                { id: 'heavy_monsoon', name: '🌧️ Heavy Monsoon Weather' },
                { id: 'highway_diverted', name: '🛣️ NH-48 Highway Diverted' }
              ].map(sc => (
                <button
                  key={sc.id}
                  onClick={() => handleScenarioChange(sc.id)}
                  className="action-btn"
                  style={{
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    borderColor: scenario === sc.id ? 'var(--neon-cyan)' : 'var(--border-subtle)',
                    background: scenario === sc.id ? 'rgba(0, 245, 255, 0.12)' : 'transparent',
                    color: scenario === sc.id ? 'var(--neon-cyan)' : 'var(--text-secondary)'
                  }}
                >
                  {sc.name}
                </button>
              ))}
            </div>

            <div style={{ marginTop: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span>Simulated Hour of Day:</span>
                <span className="mono" style={{ color: 'var(--neon-cyan)' }}>{timeHour}:00 hrs</span>
              </div>
              <input 
                type="range" 
                min="6" 
                max="23" 
                value={timeHour} 
                onChange={(e) => handleTimeChange(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--neon-cyan)' }}
              />
            </div>
          </div>

          {/* AI Travel Advisories */}
          <div className="radar-card" style={{ padding: '1rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--neon-amber)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
              ⚡ AI Traffic Advisories:
            </h4>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {advisories.length === 0 ? (
                <div>Traffic flow across SIT Tumkur arterial network is operating within baseline parameters.</div>
              ) : (
                advisories.map((adv, idx) => (
                  <div key={idx} style={{ background: 'rgba(245, 158, 11, 0.08)', borderLeft: '3px solid var(--neon-amber)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                    {adv}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 30-Min Forecast Horizon */}
          <div className="radar-card" style={{ padding: '1rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--neon-emerald)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
              📈 30-Min Congestion Horizon:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.entries(predictions).slice(0, 5).map(([jid, pred]) => {
                let col = '#10b981';
                if (pred.pred_30m >= 65) col = '#ef4444';
                else if (pred.pred_30m >= 35) col = '#f59e0b';

                return (
                  <div key={jid} style={{ fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 600 }}>{pred.name?.split('(')[0] || jid}</span>
                      <span className="mono" style={{ color: col }}>{pred.pred_30m}% ({pred.trend === 'increasing' ? '▲ rising' : '▼ clearing'})</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ width: `${pred.pred_30m}%`, height: '100%', background: col, borderRadius: '999px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Route Planner Shortcut */}
          <Link 
            to="/routes"
            className="action-btn"
            style={{ textDecoration: 'none', textAlign: 'center', background: 'var(--neon-cyan)', color: '#050811', fontWeight: 800, borderColor: 'var(--neon-cyan)', justifyContent: 'center' }}
          >
            <span>🧭</span> Open AI Route Navigation &rarr;
          </Link>
        </aside>
      </div>
    </main>
  );
}
