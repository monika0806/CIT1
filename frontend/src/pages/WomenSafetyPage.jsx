import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './WomenSafetyPage.css';

export default function WomenSafetyPage() {
  // 1. Simulation & Network State
  const [simulationData, setSimulationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [simulatedHour, setSimulatedHour] = useState(() => new Date().getHours());
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(150); // 150s (2.5m) or 15s (demo)
  const [countdown, setCountdown] = useState(150);
  const [autoSimulate, setAutoSimulate] = useState(true);

  // 2. Filters & Selection
  const [filterRisk, setFilterRisk] = useState('ALL'); // 'ALL', 'CRITICAL_RISK', 'MODERATE_RISK', 'LOW_RISK', 'CAMPUS'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStreet, setSelectedStreet] = useState(null);
  const [bypassModalStreet, setBypassModalStreet] = useState(null);

  // 3. SOS Dispatch Modal
  const [sosModalData, setSosModalData] = useState(null);
  const [isDispatchingSos, setIsDispatchingSos] = useState(false);

  // 4. Optional Vision Camera Section Accordion
  const [showVisionSection, setShowVisionSection] = useState(false);
  const [uploadData, setUploadData] = useState(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const fileInputRef = useRef(null);

  // 5. Leaflet Map References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const baseLayersRef = useRef({});
  const [basemap, setBasemap] = useState('dark');

  // -------------------------------------------------------------
  // API: Fetch Tumakuru Streets Simulation
  // -------------------------------------------------------------
  const fetchSimulation = async (hour = simulatedHour, force = false) => {
    if (force) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/safety/tumkur-streets?hour=${hour}&refresh=${force ? 'true' : 'false'}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setSimulationData(data);
        setCountdown(data.next_refresh_seconds || refreshIntervalSec);
        if (!selectedStreet && data.streets?.length > 0) {
          setSelectedStreet(data.streets[0]);
        } else if (selectedStreet && data.streets) {
          const updated = data.streets.find(s => s.id === selectedStreet.id);
          if (updated) setSelectedStreet(updated);
        }
      }
    } catch (e) {
      console.error('Failed to load Tumakuru street safety simulation:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchSimulation(simulatedHour, false);
  }, [simulatedHour]);

  // Periodic Countdown & Auto-simulation Interval
  useEffect(() => {
    if (!autoSimulate) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchSimulation(simulatedHour, true);
          return refreshIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoSimulate, simulatedHour, refreshIntervalSec]);

  // -------------------------------------------------------------
  // Leaflet Map Initialization & Marker Updates
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [13.332, 77.120], // Tumakuru city center
        zoom: 13,
        zoomControl: true,
        attributionControl: false
      });

      // 100% Free & Open High-Performance Basemaps (ZERO API KEY REQUIRED, ZERO WATERMARK)
      const baseLayers = {
        dark: L.layerGroup([
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 16,
            attribution: 'Esri Canvas'
          }),
          L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 16
          })
        ]),
        osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: 'OpenStreetMap'
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: 'Esri Satellite'
        })
      };

      baseLayers.dark.addTo(map);
      baseLayersRef.current = baseLayers;

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }
  }, []);

  const handleBasemapChange = (type) => {
    setBasemap(type);
    const map = mapInstanceRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers) return;

    Object.values(baseLayers).forEach(layer => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    if (baseLayers[type]) {
      baseLayers[type].addTo(map);
    }
  };

  // Sync Markers when simulationData changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer || !simulationData?.streets) return;

    markersLayer.clearLayers();

    simulationData.streets.forEach((street) => {
      const isCritical = street.risk_level === 'CRITICAL_RISK';
      const isModerate = street.risk_level === 'MODERATE_RISK';
      const color = isCritical ? '#ef4444' : isModerate ? '#f59e0b' : '#10b981';

      // Custom pulsing pulse HTML icon
      const customIcon = L.divIcon({
        className: 'tumkur-map-marker',
        html: `
          <div class="marker-pin-wrapper">
            <div class="marker-pulse" style="background: ${color}; border-color: ${color}"></div>
            <div class="marker-core" style="background: ${color};">
              <span>${street.risk_rate_pct}%</span>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([street.lat, street.lng], { icon: customIcon });

      const popupHtml = `
        <div class="map-popup-card">
          <div class="map-popup-header" style="border-bottom: 2px solid ${color};">
            <strong>${street.name}</strong>
            <span class="popup-zone">${street.zone}</span>
          </div>
          <div class="map-popup-body">
            <div class="popup-metric">
              <span>Risk Rate:</span>
              <strong style="color: ${color}; font-size: 1rem;">${street.risk_rate_pct}% (${street.risk_level.replace('_', ' ')})</strong>
            </div>
            <div class="popup-metric">
              <span>Pedestrian Density:</span>
              <span>${street.pedestrian_density_text}</span>
            </div>
            <div class="popup-metric">
              <span>Lighting:</span>
              <span>${street.lighting.description}</span>
            </div>
            <div class="popup-metric">
              <span>Police / Pink Patrol:</span>
              <span>${street.security.pink_patrol_unit} (${street.security.pink_patrol_eta_mins} mins away)</span>
            </div>
            <div class="popup-recom" style="color: ${street.solo_recommended ? '#10b981' : '#ef4444'};">
              ${street.solo_recommended ? '✅ Safe for Solo Travel' : '⚠️ AVOID SOLO WALKING'}
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        setSelectedStreet(street);
      });

      markersLayer.addLayer(marker);
    });
  }, [simulationData]);

  // Center Map on Selected Street
  const handleSelectStreet = (street) => {
    setSelectedStreet(street);
    if (mapInstanceRef.current && street.lat && street.lng) {
      mapInstanceRef.current.flyTo([street.lat, street.lng], 15, { duration: 1.2 });
    }
  };

  // -------------------------------------------------------------
  // SOS Pink Patrol Emergency Dispatch
  // -------------------------------------------------------------
  const handleTriggerSos = async (street) => {
    setIsDispatchingSos(true);
    try {
      const res = await fetch('/api/safety/sos-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridor_name: street?.name || 'Tumakuru Urban Corridor',
          lat: street?.lat || 13.3276,
          lng: street?.lng || 77.1259
        })
      });
      const data = await res.json();
      setSosModalData(data);
    } catch (e) {
      console.error('SOS dispatch error:', e);
    } finally {
      setIsDispatchingSos(false);
    }
  };

  // -------------------------------------------------------------
  // Optional Vision Image Analysis
  // -------------------------------------------------------------
  const runImageSafetyInference = async (file) => {
    if (!file) return;
    setIsAnalyzingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('hour', simulatedHour);
      formData.append('street_name', selectedStreet?.name || 'Tumakuru Urban Road');

      const res = await fetch('/api/safety/analyze-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.status === 'success') {
        setUploadData(data);
      }
    } catch (e) {
      console.error('Vision analysis error:', e);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // -------------------------------------------------------------
  // Filter & Search Logic
  // -------------------------------------------------------------
  const filteredStreets = (simulationData?.streets || []).filter((s) => {
    if (filterRisk === 'CRITICAL_RISK' && s.risk_level !== 'CRITICAL_RISK') return false;
    if (filterRisk === 'MODERATE_RISK' && s.risk_level !== 'MODERATE_RISK') return false;
    if (filterRisk === 'LOW_RISK' && s.risk_level !== 'LOW_RISK') return false;
    if (filterRisk === 'CAMPUS' && !s.zone.toLowerCase().includes('campus') && !s.name.toLowerCase().includes('sit')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.zone.toLowerCase().includes(q);
    }
    return true;
  });

  const cityOverview = simulationData?.city_overview || {};

  return (
    <main className="safety-container">
      {/* ============================================================ */}
      {/* 1. TOP HEADER & TELEMETRY CONTROLS                          */}
      {/* ============================================================ */}
      <section className="dashboard-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.6rem' }}>🛡️</span>
            <h1 className="page-title" style={{ margin: 0 }}>TUMAKURU CITY STREETS — WOMEN'S SAFETY SIMULATOR</h1>
            <span className="badge-live-pulse">
              ● REAL-TIME DENSITY & RISK ENGINE
            </span>
          </div>
          <p className="page-desc" style={{ margin: 0 }}>
            Simulates dynamic natural surveillance (pedestrian density), traffic flow, and streetlight illumination every 2–3 minutes for all monitored streets in Tumakuru without requiring image uploads.
          </p>
        </div>

        {/* Global Emergency 1-Click Panic Button */}
        <div>
          <button 
            onClick={() => handleTriggerSos(selectedStreet || simulationData?.streets?.[0])}
            disabled={isDispatchingSos}
            className="sos-panic-btn"
          >
            <span>🚨</span>
            {isDispatchingSos ? 'Dispatching...' : '1-CLICK POLICE SOS (PINK PATROL)'}
          </button>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.4rem' }}>
            Integrated with Dial 112 & Tumakuru City Police HQ
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. SIMULATION CONTROLS DECK                                  */}
      {/* ============================================================ */}
      <section className="sim-control-deck">
        <div className="sim-timer-group">
          <div className="sim-timer-badge">
            <span className="timer-icon">⏱️</span>
            <span>Next Refresh In:</span>
            <strong className="mono timer-count">
              {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </strong>
          </div>

          <button 
            onClick={() => fetchSimulation(simulatedHour, true)}
            disabled={isRefreshing}
            className={`btn-simulate-now ${isRefreshing ? 'spinning' : ''}`}
          >
            <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s' }}>🔄</span>
            {isRefreshing ? 'Simulating...' : 'Simulate Next Cycle Now'}
          </button>

          <div className="speed-toggle">
            <button 
              className={`speed-pill ${refreshIntervalSec === 150 ? 'active' : ''}`}
              onClick={() => {
                setRefreshIntervalSec(150);
                setCountdown(150);
              }}
            >
              Standard (2.5 Mins)
            </button>
            <button 
              className={`speed-pill ${refreshIntervalSec === 15 ? 'active' : ''}`}
              onClick={() => {
                setRefreshIntervalSec(15);
                setCountdown(15);
              }}
            >
              ⚡ Fast Demo (15s)
            </button>
          </div>
        </div>

        {/* Time of Day Slider & Presets */}
        <div className="sim-time-slider-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Simulated Hour:</span>
            <span className="mono" style={{ color: 'var(--neon-cyan)', fontWeight: 800, fontSize: '0.95rem' }}>
              {String(simulatedHour).padStart(2, '0')}:00 hrs
            </span>
          </div>

          <input 
            type="range"
            min="0"
            max="23"
            value={simulatedHour}
            onChange={(e) => {
              const hr = parseInt(e.target.value);
              setSimulatedHour(hr);
              fetchSimulation(hr, true);
            }}
            className="hour-range-slider"
          />

          <div className="time-presets">
            <button onClick={() => { setSimulatedHour(14); fetchSimulation(14, true); }} className={simulatedHour === 14 ? 'active' : ''}>
              ☀️ 14:00 (Day)
            </button>
            <button onClick={() => { setSimulatedHour(19); fetchSimulation(19, true); }} className={simulatedHour === 19 ? 'active' : ''}>
              🌆 19:00 (Dusk)
            </button>
            <button onClick={() => { setSimulatedHour(22); fetchSimulation(22, true); }} className={simulatedHour === 22 ? 'active' : ''}>
              🌙 22:00 (Night)
            </button>
            <button onClick={() => { setSimulatedHour(2); fetchSimulation(2, true); }} className={simulatedHour === 2 ? 'active' : ''}>
              🌌 02:00 (Midnight)
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. CITY-WIDE RISK & SAFETY KPI RIBBON                        */}
      {/* ============================================================ */}
      <section className="city-kpi-ribbon">
        <div className="city-kpi-card">
          <div className="city-kpi-header">
            <span className="city-kpi-icon">📊</span>
            <span className="city-kpi-title">Avg City Risk Rate</span>
          </div>
          <div className="city-kpi-body">
            <span className="city-kpi-value" style={{ color: (cityOverview.average_risk_rate_pct || 0) >= 50 ? '#ef4444' : (cityOverview.average_risk_rate_pct || 0) >= 25 ? '#f59e0b' : '#10b981' }}>
              {cityOverview.average_risk_rate_pct !== undefined ? `${cityOverview.average_risk_rate_pct}%` : '--'}
            </span>
            <span className="city-kpi-sub">
              {(cityOverview.average_risk_rate_pct || 0) >= 50 ? '🔴 Elevated Night Danger' : (cityOverview.average_risk_rate_pct || 0) >= 25 ? '🟡 Moderate Caution' : '🟢 Optimal Daytime Safety'}
            </span>
          </div>
        </div>

        <div className="city-kpi-card">
          <div className="city-kpi-header">
            <span className="city-kpi-icon">🔴</span>
            <span className="city-kpi-title">High Risk Streets</span>
          </div>
          <div className="city-kpi-body">
            <span className="city-kpi-value" style={{ color: '#ef4444' }}>
              {cityOverview.high_risk_count !== undefined ? `${cityOverview.high_risk_count} Corridors` : '--'}
            </span>
            <span className="city-kpi-sub">
              Solo Walk NOT Recommended
            </span>
          </div>
        </div>

        <div className="city-kpi-card">
          <div className="city-kpi-header">
            <span className="city-kpi-icon">🟡</span>
            <span className="city-kpi-title">Moderate Vigilance</span>
          </div>
          <div className="city-kpi-body">
            <span className="city-kpi-value" style={{ color: '#f59e0b' }}>
              {cityOverview.moderate_risk_count !== undefined ? `${cityOverview.moderate_risk_count} Corridors` : '--'}
            </span>
            <span className="city-kpi-sub">
              Low Density / Walk Lit Sections
            </span>
          </div>
        </div>

        <div className="city-kpi-card">
          <div className="city-kpi-header">
            <span className="city-kpi-icon">🟢</span>
            <span className="city-kpi-title">Safe Solo Corridors</span>
          </div>
          <div className="city-kpi-body">
            <span className="city-kpi-value" style={{ color: '#10b981' }}>
              {cityOverview.safe_count !== undefined ? `${cityOverview.safe_count} Corridors` : '--'}
            </span>
            <span className="city-kpi-sub">
              High Eyes-on-the-Street
            </span>
          </div>
        </div>

        <div className="city-kpi-card">
          <div className="city-kpi-header">
            <span className="city-kpi-icon">🚓</span>
            <span className="city-kpi-title">Pink Patrol Fleet</span>
          </div>
          <div className="city-kpi-body">
            <span className="city-kpi-value" style={{ color: 'var(--safety-pink)' }}>
              6 Units Active
            </span>
            <span className="city-kpi-sub">
              Avg ETA: ~3.5 Mins in Tumakuru
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. SOS EMERGENCY MODAL                                       */}
      {/* ============================================================ */}
      {sosModalData && (
        <div className="sos-alert-banner">
          <div className="sos-alert-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.4rem' }}>🚨</span>
              <strong style={{ fontSize: '1rem', color: '#fff', letterSpacing: '0.5px' }}>
                EMERGENCY PINK PATROL DISPATCHED — {sosModalData.dispatch_id}
              </strong>
            </div>
            <p style={{ margin: '0.4rem 0', fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.9)' }}>
              {sosModalData.message}
            </p>
            <div className="sos-alert-grid">
              <div><strong>Corridor:</strong> {sosModalData.corridor}</div>
              <div><strong>Assigned Vehicle:</strong> <span style={{ color: 'var(--neon-cyan)' }}>{sosModalData.patrol_vehicle} ({sosModalData.unit_assigned})</span></div>
              <div><strong>ETA:</strong> <span style={{ color: '#10b981', fontWeight: 800 }}>{sosModalData.eta_mins} Minutes</span></div>
              <div><strong>Officer in Charge:</strong> {sosModalData.officer_in_charge}</div>
            </div>
          </div>
          <button onClick={() => setSosModalData(null)} className="sos-close-btn">✕</button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. GIS INTERACTIVE MAP & STREET INSPECTOR                    */}
      {/* ============================================================ */}
      <section className="gis-map-showcase">
        <div className="gis-map-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-pure)' }}>
              🗺️ Tumakuru City Street Safety & Risk Perception GIS Map
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Pulsing markers represent real-time simulated risk rate across 12 corridors. Click any pin to focus and view telemetry.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="map-legend">
              <span className="legend-chip"><span className="legend-dot red"></span> High Risk (≥50%)</span>
              <span className="legend-chip"><span className="legend-dot yellow"></span> Moderate Risk (25-49%)</span>
              <span className="legend-chip"><span className="legend-dot green"></span> Safe (&lt;25%)</span>
            </div>

            {/* Free Basemap Switcher (Zero API Key) */}
            <div className="speed-toggle" style={{ marginLeft: 'auto' }}>
              <button 
                className={`speed-pill ${basemap === 'dark' ? 'active' : ''}`}
                onClick={() => handleBasemapChange('dark')}
              >
                Dark Cyber
              </button>
              <button 
                className={`speed-pill ${basemap === 'osm' ? 'active' : ''}`}
                onClick={() => handleBasemapChange('osm')}
              >
                OpenStreetMap
              </button>
              <button 
                className={`speed-pill ${basemap === 'satellite' ? 'active' : ''}`}
                onClick={() => handleBasemapChange('satellite')}
              >
                Satellite
              </button>
            </div>
          </div>
        </div>

        <div className="gis-map-canvas-wrapper" ref={mapContainerRef}></div>
      </section>

      {/* ============================================================ */}
      {/* 6. SEARCH & RISK FILTER TABS                                 */}
      {/* ============================================================ */}
      <section className="filter-search-deck">
        <div className="filter-pills">
          <button 
            className={`filter-pill ${filterRisk === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterRisk('ALL')}
          >
            All Corridors ({simulationData?.streets?.length || 12})
          </button>
          <button 
            className={`filter-pill red ${filterRisk === 'CRITICAL_RISK' ? 'active' : ''}`}
            onClick={() => setFilterRisk('CRITICAL_RISK')}
          >
            🔴 Critical Risk ({cityOverview.high_risk_count || 0})
          </button>
          <button 
            className={`filter-pill yellow ${filterRisk === 'MODERATE_RISK' ? 'active' : ''}`}
            onClick={() => setFilterRisk('MODERATE_RISK')}
          >
            🟡 Moderate Caution ({cityOverview.moderate_risk_count || 0})
          </button>
          <button 
            className={`filter-pill green ${filterRisk === 'LOW_RISK' ? 'active' : ''}`}
            onClick={() => setFilterRisk('LOW_RISK')}
          >
            🟢 Safe Solo Walk ({cityOverview.safe_count || 0})
          </button>
          <button 
            className={`filter-pill campus ${filterRisk === 'CAMPUS' ? 'active' : ''}`}
            onClick={() => setFilterRisk('CAMPUS')}
          >
            🏫 SIT Campus & Hostels
          </button>
        </div>

        <div className="search-box-wrapper">
          <span className="search-icon">🔍</span>
          <input 
            type="text"
            placeholder="Search Tumakuru streets, hostels, zones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="search-clear-btn">✕</button>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. STREET RISK CARDS GRID                                    */}
      {/* ============================================================ */}
      <section className="street-cards-grid">
        {filteredStreets.map((street) => {
          const isCritical = street.risk_level === 'CRITICAL_RISK';
          const isModerate = street.risk_level === 'MODERATE_RISK';
          const isSelected = selectedStreet?.id === street.id;

          return (
            <div 
              key={street.id}
              className={`street-risk-card ${street.risk_level} ${isSelected ? 'selected' : ''}`}
              onClick={() => handleSelectStreet(street)}
            >
              {/* Card Header */}
              <div className="card-top-row">
                <div>
                  <span className="street-zone-tag">{street.zone}</span>
                  <h4 className="street-card-title">{street.name}</h4>
                </div>
                <div 
                  className="risk-rate-pill" 
                  style={{ background: isCritical ? 'rgba(239, 68, 68, 0.2)' : isModerate ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: street.badge_color, borderColor: street.badge_color }}
                >
                  <span className="risk-rate-num">{street.risk_rate_pct}%</span>
                  <span className="risk-rate-label">RISK RATE</span>
                </div>
              </div>

              {/* Risk Meter Visual Bar */}
              <div className="risk-progress-track">
                <div 
                  className="risk-progress-fill" 
                  style={{ 
                    width: `${street.risk_rate_pct}%`, 
                    background: isCritical ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : isModerate ? '#f59e0b' : '#10b981' 
                  }}
                ></div>
              </div>

              {/* 4 Pillars of Live Perception */}
              <div className="telemetry-chips-grid">
                <div className="telem-chip">
                  <span className="telem-icon">👥</span>
                  <div className="telem-content">
                    <span className="telem-label">Pedestrian Density</span>
                    <strong className="telem-val">{street.pedestrians_count} People</strong>
                    <span className="telem-sub">{street.pedestrian_density_text}</span>
                  </div>
                </div>

                <div className="telem-chip">
                  <span className="telem-icon">🚗</span>
                  <div className="telem-content">
                    <span className="telem-label">Traffic Density</span>
                    <strong className="telem-val">{street.vehicles_flow_per_min} Veh/min</strong>
                    <span className="telem-sub">{street.traffic_flow_level} Transit Flow</span>
                  </div>
                </div>

                <div className="telem-chip">
                  <span className="telem-icon">💡</span>
                  <div className="telem-content">
                    <span className="telem-label">Lighting Status</span>
                    <strong className="telem-val" style={{ color: street.lighting.quality === 'DARK_DEADZONE' ? '#ef4444' : '#10b981' }}>
                      {street.lighting.luminance_value} Lumens
                    </strong>
                    <span className="telem-sub">{street.lighting.description}</span>
                  </div>
                </div>

                <div className="telem-chip">
                  <span className="telem-icon">🚓</span>
                  <div className="telem-content">
                    <span className="telem-label">Pink Patrol Proximity</span>
                    <strong className="telem-val" style={{ color: 'var(--safety-pink)' }}>
                      ETA {street.security.pink_patrol_eta_mins} Mins
                    </strong>
                    <span className="telem-sub">Booth {street.security.police_booth_distance_m}m away</span>
                  </div>
                </div>
              </div>

              {/* Solo Recommendation Banner */}
              <div 
                className="recommendation-callout" 
                style={{ 
                  background: isCritical ? 'rgba(239, 68, 68, 0.12)' : isModerate ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  borderColor: isCritical ? 'rgba(239, 68, 68, 0.35)' : isModerate ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span>{street.solo_recommended ? '✅' : '⚠️'}</span>
                  <strong style={{ fontSize: '0.78rem', color: street.badge_color, textTransform: 'uppercase' }}>
                    {street.solo_recommended ? 'Safe for Solo Travel' : 'Solo Walk Caution / Not Advised'}
                  </strong>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {street.recommendation}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="card-actions-row">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTriggerSos(street);
                  }}
                  className="btn-card-sos"
                >
                  <span>🚨</span> Dispatch Pink Patrol
                </button>

                {street.safe_bypass && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setBypassModalStreet(street);
                    }}
                    className="btn-card-bypass"
                  >
                    <span>🗺️</span> View Safe Bypass
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ============================================================ */}
      {/* 8. SAFE BYPASS MODAL                                         */}
      {/* ============================================================ */}
      {bypassModalStreet && (
        <div className="bypass-modal-overlay" onClick={() => setBypassModalStreet(null)}>
          <div className="bypass-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="bypass-modal-header">
              <div>
                <span className="modal-tag">🛡️ AI SAFE ROUTE BYPASS</span>
                <h3 style={{ margin: '0.3rem 0 0', color: '#fff', fontSize: '1.1rem' }}>
                  Alternative Route for: {bypassModalStreet.name}
                </h3>
              </div>
              <button onClick={() => setBypassModalStreet(null)} className="modal-close-btn">✕</button>
            </div>

            <div className="bypass-modal-body">
              <div className="bypass-risk-alert">
                <span>⚠️ Current Road Risk Rate: <strong>{bypassModalStreet.risk_rate_pct}%</strong> ({bypassModalStreet.risk_level.replace('_', ' ')})</span>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  This road has low pedestrian density ({bypassModalStreet.pedestrians_count} people) and weak lighting. We recommend taking the following monitored corridor instead:
                </p>
              </div>

              {bypassModalStreet.safe_bypass && (
                <div className="bypass-recommendation-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, color: 'var(--neon-emerald)', fontSize: '0.98rem' }}>
                      🌟 {bypassModalStreet.safe_bypass.route_name}
                    </h4>
                    <span className="bypass-score-badge">
                      Safety Score: {bypassModalStreet.safe_bypass.bypass_safety_score}/100
                    </span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.9)', margin: '0.6rem 0' }}>
                    {bypassModalStreet.safe_bypass.reason}
                  </p>
                  <div className="bypass-specs">
                    <div><strong>Distance Delta:</strong> {bypassModalStreet.safe_bypass.distance_delta}</div>
                    <div><strong>Natural Surveillance:</strong> Continuous footfall & student activity</div>
                    <div><strong>Lighting:</strong> High-Mast LED Smart Array (100% lit)</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button 
                  onClick={() => {
                    handleTriggerSos(bypassModalStreet);
                    setBypassModalStreet(null);
                  }}
                  className="btn-modal-emergency"
                >
                  <span>🚨</span> Request Police Escort / Pink Patrol
                </button>
                <button 
                  onClick={() => setBypassModalStreet(null)}
                  className="btn-modal-cancel"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 9. OPTIONAL: CCTV VISION CAMERA DIAGNOSTIC ACCORDION         */}
      {/* ============================================================ */}
      <section className="vision-accordion-section">
        <button 
          onClick={() => setShowVisionSection(!showVisionSection)}
          className="vision-accordion-toggle"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📷</span>
            <strong>Optional: Test Custom Street Surveillance Camera Image</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              (Runs YOLO pedestrian density & darkness vision detection)
            </span>
          </div>
          <span style={{ fontSize: '1.2rem', transform: showVisionSection ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
            ▼
          </span>
        </button>

        {showVisionSection && (
          <div className="vision-accordion-body">
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
              Upload any CCTV snapshot or street photo to test YOLO object detection for natural surveillance and illumination:
            </p>

            <div 
              className="vision-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runImageSafetyInference(f);
                }} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
              <span style={{ fontSize: '2rem' }}>📁</span>
              <strong style={{ fontSize: '0.9rem', color: '#fff' }}>Click to Upload Street Image</strong>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {isAnalyzingImage ? 'Running YOLO Detection...' : 'PNG, JPG or JPEG from local drive'}
              </span>
            </div>

            {uploadData && (
              <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                <div>
                  <h5 style={{ margin: '0 0 0.5rem', color: 'var(--neon-cyan)' }}>AI Vision Output</h5>
                  <img 
                    src={uploadData.annotated_image_url} 
                    alt="Vision Perception" 
                    style={{ width: '100%', borderRadius: '6px', border: '1px solid var(--border-color)' }} 
                  />
                </div>
                <div>
                  <h5 style={{ margin: '0 0 0.5rem', color: '#fff' }}>Vision Diagnostics</h5>
                  <div style={{ fontSize: '0.8rem', lineHeight: 1.8 }}>
                    <div><strong>Pedestrians Detected:</strong> {uploadData.perception_metrics?.pedestrians_detected}</div>
                    <div><strong>Surveillance Level:</strong> {uploadData.perception_metrics?.natural_surveillance_level}</div>
                    <div><strong>Ambient Lighting:</strong> {uploadData.perception_metrics?.ambient_illumination?.mean_luminance}/255</div>
                    <div><strong>Calculated SafeWalk Score:</strong> {uploadData.safety_assessment?.safewalk_score}/100</div>
                    <div><strong>Verdict:</strong> {uploadData.safety_assessment?.verdict}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
