import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './GreenCorridorPage.css';

export default function GreenCorridorPage() {
  const [searchParams] = useSearchParams();

  // Location Nodes & Selection
  const [locations, setLocations] = useState({ facilities: [], junctions: [] });
  const [origin, setOrigin] = useState(searchParams.get('from') || 'HOSP-04'); // SIT Clinic
  const [destination, setDestination] = useState(searchParams.get('to') || 'HOSP-01'); // District Hospital
  const [vehicleType, setVehicleType] = useState('AMBULANCE');
  const [priority, setPriority] = useState('CODE_RED');

  // Route Planning State
  const [corridorData, setCorridorData] = useState(null);
  const [selectedRouteType, setSelectedRouteType] = useState('PRIMARY'); // 'PRIMARY' | 'ALTERNATIVE'
  const [isCalculating, setIsCalculating] = useState(false);

  // Signal Preemption Modal / Alert State
  const [preemptionActive, setPreemptionActive] = useState(false);
  const [preemptionCountdown, setPreemptionCountdown] = useState(60);
  const [preemptionSignals, setPreemptionSignals] = useState([]);

  // Map References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const routeLayersRef = useRef({
    primary: null,
    alternative: null,
    signals: [],
    markers: []
  });
  const [basemap, setBasemap] = useState('dark');
  const audioContextRef = useRef(null);

  // 1. Fetch available emergency locations
  useEffect(() => {
    fetch('/api/emergency/locations')
      .then(res => res.json())
      .then(data => {
        if (data && (data.facilities || data.junctions)) {
          setLocations(data);
        }
      })
      .catch(err => console.warn('Could not load emergency locations:', err));
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [13.3320, 77.1180],
        zoom: 14,
        zoomControl: true,
        attributionControl: false
      });

      const baseLayers = {
        dark: L.layerGroup([
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 16
          }),
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 16
          })
        ]),
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19
        })
      };

      baseLayers.dark.addTo(map);
      baseLayersRef.current = baseLayers;
      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 200);
    }
  }, []);

  const handleBasemapChange = (type) => {
    setBasemap(type);
    const map = mapInstanceRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers || !baseLayers[type]) return;

    Object.values(baseLayers).forEach(layer => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    baseLayers[type].addTo(map);
  };

  // 3. Auto-Plan route on initial load or trigger
  const handlePlanCorridor = async (fromVal = origin, toVal = destination, vType = vehicleType, prio = priority) => {
    setIsCalculating(true);
    try {
      const res = await fetch(`/api/emergency/corridor?from=${fromVal}&to=${toVal}&vehicle_type=${vType}&priority=${prio}`);
      const data = await res.json();
      if (data && data.status === 'success') {
        setCorridorData(data);
        setSelectedRouteType('PRIMARY');
      }
    } catch (e) {
      console.error('Error planning green corridor:', e);
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    handlePlanCorridor();
  }, []);

  // 4. Render Corridor Polylines & Preempted Signals on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !corridorData) return;

    // Clear previous layers
    if (routeLayersRef.current.primary) map.removeLayer(routeLayersRef.current.primary);
    if (routeLayersRef.current.alternative) map.removeLayer(routeLayersRef.current.alternative);
    routeLayersRef.current.signals.forEach(m => map.removeLayer(m));
    routeLayersRef.current.markers.forEach(m => map.removeLayer(m));
    routeLayersRef.current.signals = [];
    routeLayersRef.current.markers = [];

    const bounds = [];

    // Alternative Route (Cyan Glow or Dashed)
    if (corridorData.alternative_route?.polyline?.length > 1) {
      const altPoly = L.polyline(corridorData.alternative_route.polyline, {
        color: selectedRouteType === 'ALTERNATIVE' ? '#00f5ff' : '#0284c7',
        weight: selectedRouteType === 'ALTERNATIVE' ? 6 : 4,
        opacity: selectedRouteType === 'ALTERNATIVE' ? 0.95 : 0.65,
        dashArray: '8, 8'
      }).addTo(map);
      altPoly.bindPopup(`<strong>${corridorData.alternative_route.name}</strong><br/>ETA: ${corridorData.alternative_route.green_corridor_time_mins} mins (${corridorData.alternative_route.distance_km} km)<br/>Status: Contingency Bypass`);
      routeLayersRef.current.alternative = altPoly;
      corridorData.alternative_route.polyline.forEach(p => bounds.push(p));
    }

    // Primary Route (Emerald Green Wave Line)
    if (corridorData.primary_route?.polyline?.length > 1) {
      const primaryPoly = L.polyline(corridorData.primary_route.polyline, {
        color: selectedRouteType === 'PRIMARY' ? '#10b981' : '#059669',
        weight: selectedRouteType === 'PRIMARY' ? 7 : 4,
        opacity: selectedRouteType === 'PRIMARY' ? 0.98 : 0.65
      }).addTo(map);
      primaryPoly.bindPopup(`<strong>⚡ ${corridorData.primary_route.name}</strong><br/>Emergency Transit Time: <strong>${corridorData.primary_route.green_corridor_time_mins} mins</strong> (Saved: ${corridorData.primary_route.time_saved_mins} mins)<br/>Signal Green Wave: SYNCHRONIZED`);
      routeLayersRef.current.primary = primaryPoly;
      corridorData.primary_route.polyline.forEach(p => bounds.push(p));
    }

    // Origin Marker
    if (corridorData.origin?.lat) {
      const origIcon = L.divIcon({
        className: 'custom-hub-icon',
        html: `<div class="hub-marker origin-marker"><span>🚨</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const om = L.marker([corridorData.origin.lat, corridorData.origin.lng], { icon: origIcon }).addTo(map);
      om.bindPopup(`<strong>Depart: ${corridorData.origin.name}</strong><br/>${corridorData.origin.sub_type || 'Dispatch Station'}`);
      routeLayersRef.current.markers.push(om);
      bounds.push([corridorData.origin.lat, corridorData.origin.lng]);
    }

    // Destination Marker
    if (corridorData.destination?.lat) {
      const destIcon = L.divIcon({
        className: 'custom-hub-icon',
        html: `<div class="hub-marker dest-marker"><span>🏥</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      const dm = L.marker([corridorData.destination.lat, corridorData.destination.lng], { icon: destIcon }).addTo(map);
      dm.bindPopup(`<strong>Destination: ${corridorData.destination.name}</strong><br/>${corridorData.destination.description || 'Emergency Trauma Center'}`);
      routeLayersRef.current.markers.push(dm);
      bounds.push([corridorData.destination.lat, corridorData.destination.lng]);
    }

    // Pre-empted Traffic Signals Markers along active route
    const activeRoute = selectedRouteType === 'PRIMARY' ? corridorData.primary_route : corridorData.alternative_route;
    if (activeRoute?.intersections_preempted) {
      activeRoute.intersections_preempted.forEach(sig => {
        if (sig.lat && sig.lng) {
          const sigIcon = L.divIcon({
            className: 'custom-sig-icon',
            html: `<div class="sig-marker ${preemptionActive ? 'preempted' : ''}"><span>🚦</span></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });
          const sm = L.marker([sig.lat, sig.lng], { icon: sigIcon }).addTo(map);
          sm.bindPopup(`<strong>Signal: ${sig.signal_id} (${sig.junction_name})</strong><br/>Status: <strong>${preemptionActive ? 'FORCE GREEN (HOLD 60s)' : 'AI GREEN WAVE ARMED'}</strong><br/>Cross-traffic: ${sig.current_cross_traffic}`);
          routeLayersRef.current.signals.push(sm);
        }
      });
    }

    // Fit map bounds
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [corridorData, selectedRouteType, preemptionActive]);

  // Web Audio Alert Chime for Signal Preemption
  const playPreemptionSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.30); // G5
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.45); // C6

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch (e) {
      console.warn('Audio preemption chime warning:', e);
    }
  };

  // Signal Preemption Countdown
  useEffect(() => {
    let timer;
    if (preemptionActive && preemptionCountdown > 0) {
      timer = setInterval(() => {
        setPreemptionCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (preemptionCountdown === 0) {
      setPreemptionActive(false);
    }
    return () => clearInterval(timer);
  }, [preemptionActive, preemptionCountdown]);

  const handleActivateSignalPreemption = async () => {
    playPreemptionSound();
    setPreemptionActive(true);
    setPreemptionCountdown(60);
    try {
      const res = await fetch('/api/emergency/preempt-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corridor_id: corridorData?.emergency_id })
      });
      const data = await res.json();
      if (data && data.preempted_signals) {
        setPreemptionSignals(data.preempted_signals);
      }
    } catch (e) {
      console.error('Signal preemption error:', e);
    }
  };

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    handlePlanCorridor(destination, temp, vehicleType, priority);
  };

  const allSelectableItems = [
    { label: '🏥 HOSPITALS & MEDICAL FACILITIES', items: locations.facilities || [] },
    { label: '🚦 ROAD JUNCTIONS & INTERCHANGES', items: locations.junctions || [] }
  ];

  const primaryRoute = corridorData?.primary_route;
  const altRoute = corridorData?.alternative_route;
  const activeRoute = selectedRouteType === 'PRIMARY' ? primaryRoute : altRoute;

  return (
    <main className="green-corridor-container">
      {/* HEADER COMMAND STRIP */}
      <header className="corridor-header">
        <div className="header-titles">
          <div className="status-badge-glow">
            <span className="live-pulse red"></span>
            <span>EMERGENCY DISPATCH CORRIDOR</span>
          </div>
          <h2>AI Green Vehicle Corridor & Signal Preemption Engine</h2>
          <p>
            Automated traffic signal override, green-wave synchronization, and congestion-bypassing transit for emergency response units.
          </p>
        </div>

        <div className="header-telemetry-chips">
          <div className="telemetry-pill">
            <span className="pill-lbl">CITY TRAFFIC LOAD</span>
            <strong className="pill-val">{corridorData?.live_traffic_context?.city_average_congestion_pct ?? 28}%</strong>
          </div>
          <div className="telemetry-pill">
            <span className="pill-lbl">ACTIVE PROTOCOL</span>
            <strong className="pill-val green">{priority}</strong>
          </div>
          <div className="telemetry-pill">
            <span className="pill-lbl">AI VEHICLE TYPE</span>
            <strong className="pill-val">{vehicleType.replace('_', ' ')}</strong>
          </div>
        </div>
      </header>

      {/* DRIVER DISPATCH CONSOLE / CONTROL DECK */}
      <section className="dispatch-control-deck">
        <div className="selectors-grid">
          {/* Origin */}
          <div className="input-group">
            <label className="input-label">
              <span className="indicator-dot origin"></span>
              Emergency Dispatch Origin (From)
            </label>
            <select 
              value={origin} 
              onChange={(e) => setOrigin(e.target.value)}
              className="corridor-select"
            >
              {allSelectableItems.map((group, idx) => (
                <optgroup key={idx} label={group.label}>
                  {group.items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.current_congestion !== undefined ? `(${item.current_congestion}% Traffic)` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <button onClick={handleSwap} className="btn-swap" title="Reverse Route Direction">
            ⇄
          </button>

          {/* Destination */}
          <div className="input-group">
            <label className="input-label">
              <span className="indicator-dot destination"></span>
              Emergency Destination / Hospital (To)
            </label>
            <select 
              value={destination} 
              onChange={(e) => setDestination(e.target.value)}
              className="corridor-select"
            >
              {allSelectableItems.map((group, idx) => (
                <optgroup key={idx} label={group.label}>
                  {group.items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.emergency_services ? `— ${item.sub_type}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Vehicle Type */}
          <div className="input-group small">
            <label className="input-label">Vehicle Type</label>
            <select 
              value={vehicleType} 
              onChange={(e) => setVehicleType(e.target.value)}
              className="corridor-select"
            >
              <option value="AMBULANCE">🚑 Advanced Life Support Ambulance</option>
              <option value="FIRE_ENGINE">🚒 Fire & Rescue Heavy Tender</option>
              <option value="POLICE_ESCORT">🚓 High-Speed Police Pilot Escort</option>
              <option value="ORGAN_TRANSPORT">🫀 Critical Organ Transit Vehicle</option>
            </select>
          </div>

          {/* Priority */}
          <div className="input-group small">
            <label className="input-label">Priority Code</label>
            <select 
              value={priority} 
              onChange={(e) => setPriority(e.target.value)}
              className="corridor-select"
            >
              <option value="CODE_RED">🔴 CODE RED (Maximum Preemption)</option>
              <option value="CODE_YELLOW">🟡 CODE YELLOW (Urgent Transport)</option>
              <option value="STANDARD">🟢 CODE GREEN (Standard Emergency)</option>
            </select>
          </div>

          {/* Plan Button */}
          <button 
            onClick={() => handlePlanCorridor(origin, destination, vehicleType, priority)}
            disabled={isCalculating}
            className="btn-plan-corridor"
          >
            <span>{isCalculating ? 'Computing...' : '⚡ Audit Green Corridor'}</span>
          </button>
        </div>

        {/* Quick Corridor Presets */}
        <div className="popular-corridors-bar">
          <span className="presets-title">Popular Hospital Corridors:</span>
          <button 
            onClick={() => { setOrigin('HOSP-04'); setDestination('HOSP-01'); handlePlanCorridor('HOSP-04', 'HOSP-01', vehicleType, priority); }}
            className="preset-chip"
          >
            🚑 SIT Clinic ➔ District Hospital
          </button>
          <button 
            onClick={() => { setOrigin('J3'); setDestination('HOSP-02'); handlePlanCorridor('J3', 'HOSP-02', vehicleType, priority); }}
            className="preset-chip"
          >
            🚑 Batawadi NH-48 ➔ Siddaganga Trauma Hub
          </button>
          <button 
            onClick={() => { setOrigin('FIRE-01'); setDestination('J8'); handlePlanCorridor('FIRE-01', 'J8', 'FIRE_ENGINE', priority); }}
            className="preset-chip"
          >
            🚒 Central Fire Station ➔ Town Hall Core
          </button>
          <button 
            onClick={() => { setOrigin('LIVE_CAM'); setDestination('HOSP-03'); handlePlanCorridor('LIVE_CAM', 'HOSP-03', vehicleType, priority); }}
            className="preset-chip"
          >
            📹 Live Cam Beacon ➔ Shridevi Hospital
          </button>
        </div>
      </section>

      {/* ACTIVE GREEN WAVE SIGNAL OVERRIDE ALERT BANNER */}
      {preemptionActive && (
        <section className="preemption-alert-banner">
          <div className="preemption-alert-left">
            <span className="beacon-siren">🚨</span>
            <div>
              <strong className="preemption-title">
                AUTOMATED GREEN WAVE SIGNAL OVERRIDE IS ACTIVE!
              </strong>
              <p className="preemption-sub">
                Intersections along this corridor are locked to GREEN. Cross-traffic signals are on RED hold.
              </p>
            </div>
          </div>
          <div className="preemption-countdown-box">
            <span className="countdown-tag">CLEARANCE WINDOW REMAINING</span>
            <div className="countdown-timer">{preemptionCountdown}s</div>
          </div>
        </section>
      )}

      {/* WORKSPACE: MAP VIEWPORT + AI COMPARISON HUD */}
      <div className="corridor-workspace-grid">
        {/* MAP STAGE */}
        <section className="corridor-map-stage">
          <div className="stage-top-bar">
            <div className="map-corridor-tags">
              <span className="map-badge green">🟢 Primary Green Corridor (Solid)</span>
              <span className="map-badge cyan">🔵 Alternative Contingency Route (Dashed)</span>
              <span className="map-badge amber">🚦 Pre-empted Intersections</span>
            </div>

            <div className="map-basemap-controls">
              <button 
                className={`basemap-pill ${basemap === 'dark' ? 'active' : ''}`} 
                onClick={() => handleBasemapChange('dark')}
              >
                Dark Cyber
              </button>
              <button 
                className={`basemap-pill ${basemap === 'osm' ? 'active' : ''}`} 
                onClick={() => handleBasemapChange('osm')}
              >
                OSM Streets
              </button>
              <button 
                className={`basemap-pill ${basemap === 'satellite' ? 'active' : ''}`} 
                onClick={() => handleBasemapChange('satellite')}
              >
                Satellite
              </button>
            </div>
          </div>

          <div className="corridor-map-canvas" ref={mapContainerRef}></div>
        </section>

        {/* AI ROUTE COMPARISON & REASONING HUD */}
        <aside className="corridor-hud-deck">
          {/* Signal Preemption Quick Action Trigger */}
          <div className="preemption-trigger-card">
            <div className="trigger-header">
              <span className="trigger-icon">📡</span>
              <div>
                <strong>Emergency Signal Preemption System</strong>
                <p>Broadcasts instant optical / RF green clearance to road junctions.</p>
              </div>
            </div>
            <button 
              onClick={handleActivateSignalPreemption}
              disabled={preemptionActive}
              className={`btn-activate-preemption ${preemptionActive ? 'active' : ''}`}
            >
              <span>{preemptionActive ? '⏳' : '🚨'}</span>
              <span>{preemptionActive ? `GREEN WAVE ARMED (${preemptionCountdown}s)` : 'ACTIVATE SIGNAL GREEN WAVE PREEMPTION'}</span>
            </button>
          </div>

          {/* DUAL ROUTE CARDS: PRIMARY VS ALTERNATIVE */}
          <div className="routes-comparison-stack">
            {/* Card 1: Primary AI Green Corridor */}
            {primaryRoute && (
              <div 
                className={`route-choice-card primary-choice ${selectedRouteType === 'PRIMARY' ? 'selected' : ''}`}
                onClick={() => setSelectedRouteType('PRIMARY')}
              >
                <div className="route-choice-header">
                  <div>
                    <span className="route-badge-chip emerald">⚡ AI RECOMMENDED GREEN CORRIDOR</span>
                    <h4 className="route-choice-title">{primaryRoute.name}</h4>
                  </div>
                  <div className="time-savings-pill">
                    <span className="time-num">{primaryRoute.green_corridor_time_mins} min</span>
                    <span className="time-sub">⏱️ Save {primaryRoute.time_saved_mins}m ({primaryRoute.time_saved_pct}%)</span>
                  </div>
                </div>

                <div className="metrics-strip">
                  <div className="metric-cell">
                    <span className="lbl">Distance</span>
                    <strong>{primaryRoute.distance_km} km</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="lbl">Emergency Speed</span>
                    <strong style={{ color: '#10b981' }}>~{primaryRoute.effective_speed_kmh} km/h</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="lbl">Signals Preempted</span>
                    <strong>{primaryRoute.intersections_preempted?.length || 0} Lights</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="lbl">Congestion</span>
                    <strong style={{ color: primaryRoute.congestion_index_pct > 40 ? '#f59e0b' : '#10b981' }}>
                      {primaryRoute.congestion_index_pct}%
                    </strong>
                  </div>
                </div>

                {/* AI Reasoning Section */}
                <div className="ai-reasons-box primary">
                  <div className="reasons-header">
                    <span>🧠</span>
                    <strong>AI Recommendation Reasoning (Why this route?):</strong>
                  </div>
                  <ul className="reasons-list">
                    {primaryRoute.ai_recommendation_reasons?.map((reason, idx) => (
                      <li key={idx}>
                        <span className="bullet-check">✅</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Card 2: Alternative Contingency Route */}
            {altRoute && (
              <div 
                className={`route-choice-card alt-choice ${selectedRouteType === 'ALTERNATIVE' ? 'selected' : ''}`}
                onClick={() => setSelectedRouteType('ALTERNATIVE')}
              >
                <div className="route-choice-header">
                  <div>
                    <span className="route-badge-chip cyan">🛡️ CONTINGENCY BYPASS ROUTE</span>
                    <h4 className="route-choice-title">{altRoute.name}</h4>
                  </div>
                  <div className="time-savings-pill alt">
                    <span className="time-num">{altRoute.green_corridor_time_mins} min</span>
                    <span className="time-sub">Normal: {altRoute.standard_travel_time_mins}m</span>
                  </div>
                </div>

                <div className="metrics-strip">
                  <div className="metric-cell">
                    <span className="lbl">Distance</span>
                    <strong>{altRoute.distance_km} km</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="lbl">Emergency Speed</span>
                    <strong style={{ color: '#00f5ff' }}>~{altRoute.effective_speed_kmh} km/h</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="lbl">Signals Preempted</span>
                    <strong>{altRoute.intersections_preempted?.length || 0} Lights</strong>
                  </div>
                  <div className="metric-cell">
                    <span className="lbl">Congestion</span>
                    <strong>{altRoute.congestion_index_pct}%</strong>
                  </div>
                </div>

                {/* AI Reasoning Section */}
                <div className="ai-reasons-box alt">
                  <div className="reasons-header">
                    <span>⚠️</span>
                    <strong>Alternative Corridor Reasoning & Trade-offs:</strong>
                  </div>
                  <ul className="reasons-list">
                    {altRoute.ai_recommendation_reasons?.map((reason, idx) => (
                      <li key={idx}>
                        <span className="bullet-info">ℹ️</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* TURN-BY-TURN EMERGENCY DRIVER GUIDANCE */}
          {activeRoute && (
            <div className="driver-directions-card">
              <div className="directions-header">
                <span className="directions-icon">🧭</span>
                <div>
                  <strong>Driver Turn-by-Turn Guidance ({selectedRouteType === 'PRIMARY' ? 'Primary' : 'Alternative'})</strong>
                  <p>Synchronized intersection clearance status.</p>
                </div>
              </div>

              <ol className="directions-stepper">
                {activeRoute.directions?.map((step, idx) => (
                  <li key={idx} className="step-item">
                    <span className="step-num">{idx + 1}</span>
                    <span className="step-text">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
