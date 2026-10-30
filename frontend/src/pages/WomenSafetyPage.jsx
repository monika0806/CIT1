import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './WomenSafetyPage.css';

export default function WomenSafetyPage() {
  // Navigation Tabs: 'monitor' (Live Tumakuru Streets) vs 'route' (Source -> Destination SafeWalk Planner)
  const [activeTab, setActiveTab] = useState('monitor');

  // =============================================================
  // 1. Live Simulation State (Tab 1: City Monitor)
  // =============================================================
  const [simulationData, setSimulationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [simulatedHour, setSimulatedHour] = useState(() => new Date().getHours());
  const [refreshIntervalSec, setRefreshIntervalSec] = useState(150);
  const [countdown, setCountdown] = useState(150);
  const [autoSimulate, setAutoSimulate] = useState(true);

  // Filters & Selection
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStreet, setSelectedStreet] = useState(null);
  const [bypassModalStreet, setBypassModalStreet] = useState(null);

  // SOS Emergency Dispatch Modal
  const [sosModalData, setSosModalData] = useState(null);
  const [isDispatchingSos, setIsDispatchingSos] = useState(false);

  // City Map References
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const baseLayersRef = useRef({});
  const [basemap, setBasemap] = useState('dark');

  // =============================================================
  // 2. SafeWalk Route Planner State (Tab 2: Source -> Destination)
  // =============================================================
  const [landmarks, setLandmarks] = useState([]);
  const [sourceId, setSourceId] = useState('LM-01'); // Default: SIT Girls Hostel
  const [destId, setDestId] = useState('LM-03');     // Default: Tumakuru Railway Station
  const [routePlanData, setRoutePlanData] = useState(null);
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [copyNotification, setCopyNotification] = useState(false);

  // Route Map References
  const routeMapContainerRef = useRef(null);
  const routeMapInstanceRef = useRef(null);
  const routeLayersRef = useRef(null);
  const routeBaseLayersRef = useRef({});
  const [routeBasemap, setRouteBasemap] = useState('dark');

  // Optional Vision Section Accordion
  const [showVisionSection, setShowVisionSection] = useState(false);
  const [uploadData, setUploadData] = useState(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const fileInputRef = useRef(null);

  // -------------------------------------------------------------
  // API: Fetch Landmarks on mount
  // -------------------------------------------------------------
  useEffect(() => {
    fetch('/api/safety/landmarks')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setLandmarks(data);
        }
      })
      .catch(e => console.warn('Could not load safety landmarks:', e));
  }, []);

  // -------------------------------------------------------------
  // API: Fetch Tumakuru Streets Simulation (Tab 1)
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

  useEffect(() => {
    fetchSimulation(simulatedHour, false);
  }, [simulatedHour]);

  // Periodic Countdown for City Simulation
  useEffect(() => {
    if (!autoSimulate || activeTab !== 'monitor') return;

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
  }, [autoSimulate, simulatedHour, refreshIntervalSec, activeTab]);

  // -------------------------------------------------------------
  // API: Plan Safe Walking Route (Tab 2)
  // -------------------------------------------------------------
  const handlePlanRoute = async (src = sourceId, dst = destId, hr = simulatedHour) => {
    setIsPlanningRoute(true);
    try {
      const res = await fetch(`/api/safety/plan-safe-route?source=${encodeURIComponent(src)}&destination=${encodeURIComponent(dst)}&hour=${hr}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setRoutePlanData(data);
      }
    } catch (e) {
      console.error('Failed to plan safe route:', e);
    } finally {
      setIsPlanningRoute(false);
    }
  };

  // Auto-plan default route once landmarks load or when switching to 'route'
  useEffect(() => {
    if (activeTab === 'route' && !routePlanData && !isPlanningRoute) {
      handlePlanRoute(sourceId, destId, simulatedHour);
    }
  }, [activeTab]);

  // -------------------------------------------------------------
  // Map 1: City Monitor Leaflet Map
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'monitor' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [13.332, 77.120],
        zoom: 13,
        zoomControl: true,
        attributionControl: false
      });

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
    } else {
      mapInstanceRef.current.invalidateSize();
    }
  }, [activeTab]);

  const handleBasemapChange = (type) => {
    setBasemap(type);
    const map = mapInstanceRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers) return;

    Object.values(baseLayers).forEach(layer => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (baseLayers[type]) baseLayers[type].addTo(map);
  };

  // Sync City Map Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer || !simulationData?.streets || activeTab !== 'monitor') return;

    markersLayer.clearLayers();

    simulationData.streets.forEach((street) => {
      const isCritical = street.risk_level === 'CRITICAL_RISK';
      const isModerate = street.risk_level === 'MODERATE_RISK';
      const color = isCritical ? '#ef4444' : isModerate ? '#f59e0b' : '#10b981';

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
              <strong style="color: ${color};">${street.risk_rate_pct}% (${street.risk_level.replace('_', ' ')})</strong>
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
              <span>${street.security.pink_patrol_unit} (${street.security.pink_patrol_eta_mins} mins)</span>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => setSelectedStreet(street));
      markersLayer.addLayer(marker);
    });
  }, [simulationData, activeTab]);

  // -------------------------------------------------------------
  // Map 2: SafeWalk Route Planner Leaflet Map
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'route' || !routeMapContainerRef.current) return;

    if (!routeMapInstanceRef.current) {
      const map = L.map(routeMapContainerRef.current, {
        center: [13.330, 77.120],
        zoom: 14,
        zoomControl: true,
        attributionControl: false
      });

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
      routeBaseLayersRef.current = baseLayers;

      routeLayersRef.current = L.layerGroup().addTo(map);
      routeMapInstanceRef.current = map;
    } else {
      setTimeout(() => routeMapInstanceRef.current?.invalidateSize(), 200);
    }
  }, [activeTab]);

  const handleRouteBasemapChange = (type) => {
    setRouteBasemap(type);
    const map = routeMapInstanceRef.current;
    const baseLayers = routeBaseLayersRef.current;
    if (!map || !baseLayers) return;

    Object.values(baseLayers).forEach(layer => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (baseLayers[type]) baseLayers[type].addTo(map);
  };

  // Sync Route Polylines & Markers on Map
  useEffect(() => {
    const map = routeMapInstanceRef.current;
    const layer = routeLayersRef.current;
    if (!map || !layer || !routePlanData || activeTab !== 'route') return;

    layer.clearLayers();

    const { origin, destination, direct_route, safelit_route } = routePlanData;

    // 1. Origin Marker (Green Pin)
    const originIcon = L.divIcon({
      className: 'route-node-icon origin',
      html: `<div class="node-badge green"><span>🚶 A</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const originMarker = L.marker([origin.lat, origin.lng], { icon: originIcon });
    originMarker.bindPopup(`<strong>Origin: ${origin.name}</strong><br/>${origin.category}`);
    layer.addLayer(originMarker);

    // 2. Destination Marker (Finish Flag)
    const destIcon = L.divIcon({
      className: 'route-node-icon destination',
      html: `<div class="node-badge blue"><span>🏁 B</span></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const destMarker = L.marker([destination.lat, destination.lng], { icon: destIcon });
    destMarker.bindPopup(`<strong>Destination: ${destination.name}</strong><br/>${destination.category}`);
    layer.addLayer(destMarker);

    // 3. Direct Route (Dashed Red Line - High Risk)
    if (direct_route?.polyline) {
      const directLine = L.polyline(direct_route.polyline, {
        color: '#ef4444',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.8
      });
      directLine.bindPopup(`<strong>Direct Route (High Risk)</strong><br/>Risk Rate: ${direct_route.risk_rate_pct}%<br/>Avoid at Night!`);
      layer.addLayer(directLine);

      // Add Hazard Markers on Direct Line
      direct_route.hazards_identified?.forEach(h => {
        const hazardIcon = L.divIcon({
          className: 'hazard-icon',
          html: `<div class="hazard-badge">⚠️</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const hm = L.marker([h.lat, h.lng], { icon: hazardIcon });
        hm.bindPopup(`<strong>⚠️ Hazard Spot: ${h.title}</strong><br/>${h.description}`);
        layer.addLayer(hm);
      });
    }

    // 4. SafeLit Route (Solid Glowing Emerald Line - High Safety)
    if (safelit_route?.polyline) {
      // Glow underlay
      const glowLine = L.polyline(safelit_route.polyline, {
        color: 'rgba(16, 185, 129, 0.4)',
        weight: 10,
        opacity: 0.6
      });
      layer.addLayer(glowLine);

      // Core green line
      const safeLine = L.polyline(safelit_route.polyline, {
        color: '#10b981',
        weight: 5,
        opacity: 0.95
      });
      safeLine.bindPopup(`<strong>AI SafeLit Route (Recommended)</strong><br/>Risk Rate: ${safelit_route.risk_rate_pct}%<br/>100% High-Mast LED Lighting & Police Booths`);
      layer.addLayer(safeLine);

      // Add Safe Checkpoints Markers
      safelit_route.safe_checkpoints?.forEach(cp => {
        const cpIcon = L.divIcon({
          className: 'checkpoint-icon',
          html: `<div class="checkpoint-badge">🛡️</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        const cpm = L.marker([cp.lat, cp.lng], { icon: cpIcon });
        cpm.bindPopup(`<strong>🛡️ Safe Checkpoint: ${cp.title}</strong><br/>${cp.description}`);
        layer.addLayer(cpm);
      });
    }

    // Fit map bounds to encompass both routes
    const allPoints = [...(direct_route?.polyline || []), ...(safelit_route?.polyline || [])];
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [routePlanData, activeTab]);

  // -------------------------------------------------------------
  // Helpers & Handlers
  // -------------------------------------------------------------
  const handleSelectStreet = (street) => {
    setSelectedStreet(street);
    if (mapInstanceRef.current && street.lat && street.lng) {
      mapInstanceRef.current.flyTo([street.lat, street.lng], 15, { duration: 1.2 });
    }
  };

  const handleTriggerSos = async (target) => {
    setIsDispatchingSos(true);
    try {
      const res = await fetch('/api/safety/sos-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridor_name: target?.name || 'Tumakuru Urban Corridor',
          lat: target?.lat || 13.3276,
          lng: target?.lng || 77.1259
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

  const handleSwapEndpoints = () => {
    const temp = sourceId;
    setSourceId(destId);
    setDestId(temp);
    handlePlanRoute(destId, temp, simulatedHour);
  };

  const handleShareTrackingLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopyNotification(true);
    setTimeout(() => setCopyNotification(false), 2500);
  };

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
      <section className="dashboard-header" style={{ marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.6rem' }}>🛡️</span>
            <h1 className="page-title" style={{ margin: 0 }}>TUMAKURU WOMEN'S SAFETY & SAFEWALK AI</h1>
            <span className="badge-live-pulse">
              ● REAL-TIME RISK AUDIT & ROUTING
            </span>
          </div>
          <p className="page-desc" style={{ margin: 0 }}>
            Dynamic perception engine auditing pedestrian density, dark stretches, and streetlight coverage. Calculates walking risk rates and plans the safest illuminated corridors across Tumakuru.
          </p>
        </div>

        {/* Global Emergency SOS Panic Button */}
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
            Connected to Dial 112 & Tumakuru City Police
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* MAIN NAVIGATION TAB SWITCHER                                 */}
      {/* ============================================================ */}
      <div className="main-safety-nav-tabs">
        <button 
          className={`main-nav-tab ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          <span>🏙️</span> Tumakuru Streets Live Risk Monitor
        </button>
        <button 
          className={`main-nav-tab ${activeTab === 'route' ? 'active' : ''}`}
          onClick={() => setActiveTab('route')}
        >
          <span>🧭</span> SafeWalk Walking Route Planner (Source ➔ Destination Risk Auditor)
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: TUMAKURU CITY STREETS LIVE RISK MONITOR              */}
      {/* ============================================================ */}
      {activeTab === 'monitor' && (
        <>
          {/* SIMULATION CONTROLS DECK */}
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

          {/* CITY-WIDE RISK & SAFETY KPI RIBBON */}
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
                <span className="city-kpi-sub">Solo Walk NOT Recommended</span>
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
                <span className="city-kpi-sub">Low Density / Walk Lit Sections</span>
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
                <span className="city-kpi-sub">High Eyes-on-the-Street</span>
              </div>
            </div>

            <div className="city-kpi-card">
              <div className="city-kpi-header">
                <span className="city-kpi-icon">🚓</span>
                <span className="city-kpi-title">Pink Patrol Fleet</span>
              </div>
              <div className="city-kpi-body">
                <span className="city-kpi-value" style={{ color: 'var(--safety-pink)' }}>6 Units Active</span>
                <span className="city-kpi-sub">Avg ETA: ~3.5 Mins in Tumakuru</span>
              </div>
            </div>
          </section>

          {/* GIS INTERACTIVE MAP */}
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

                <div className="speed-toggle" style={{ marginLeft: 'auto' }}>
                  <button className={`speed-pill ${basemap === 'dark' ? 'active' : ''}`} onClick={() => handleBasemapChange('dark')}>
                    Dark Cyber
                  </button>
                  <button className={`speed-pill ${basemap === 'osm' ? 'active' : ''}`} onClick={() => handleBasemapChange('osm')}>
                    OpenStreetMap
                  </button>
                  <button className={`speed-pill ${basemap === 'satellite' ? 'active' : ''}`} onClick={() => handleBasemapChange('satellite')}>
                    Satellite
                  </button>
                </div>
              </div>
            </div>

            <div className="gis-map-canvas-wrapper" ref={mapContainerRef}></div>
          </section>

          {/* SEARCH & RISK FILTER TABS */}
          <section className="filter-search-deck">
            <div className="filter-pills">
              <button className={`filter-pill ${filterRisk === 'ALL' ? 'active' : ''}`} onClick={() => setFilterRisk('ALL')}>
                All Corridors ({simulationData?.streets?.length || 12})
              </button>
              <button className={`filter-pill red ${filterRisk === 'CRITICAL_RISK' ? 'active' : ''}`} onClick={() => setFilterRisk('CRITICAL_RISK')}>
                🔴 Critical Risk ({cityOverview.high_risk_count || 0})
              </button>
              <button className={`filter-pill yellow ${filterRisk === 'MODERATE_RISK' ? 'active' : ''}`} onClick={() => setFilterRisk('MODERATE_RISK')}>
                🟡 Moderate Caution ({cityOverview.moderate_risk_count || 0})
              </button>
              <button className={`filter-pill green ${filterRisk === 'LOW_RISK' ? 'active' : ''}`} onClick={() => setFilterRisk('LOW_RISK')}>
                🟢 Safe Solo Walk ({cityOverview.safe_count || 0})
              </button>
              <button className={`filter-pill campus ${filterRisk === 'CAMPUS' ? 'active' : ''}`} onClick={() => setFilterRisk('CAMPUS')}>
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

          {/* STREET RISK CARDS GRID */}
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

                  <div className="risk-progress-track">
                    <div 
                      className="risk-progress-fill" 
                      style={{ 
                        width: `${street.risk_rate_pct}%`, 
                        background: isCritical ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : isModerate ? '#f59e0b' : '#10b981' 
                      }}
                    ></div>
                  </div>

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
                        <span className="telem-label">Pink Patrol</span>
                        <strong className="telem-val" style={{ color: 'var(--safety-pink)' }}>
                          ETA {street.security.pink_patrol_eta_mins} Mins
                        </strong>
                        <span className="telem-sub">Booth {street.security.police_booth_distance_m}m</span>
                      </div>
                    </div>
                  </div>

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
        </>
      )}

      {/* ============================================================ */}
      {/* TAB 2: SAFEWALK ROUTE PLANNER (SOURCE ➔ DESTINATION AUDIT)   */}
      {/* ============================================================ */}
      {activeTab === 'route' && (
        <section className="route-planner-section">
          {/* Source & Destination Selector Deck */}
          <div className="route-selector-deck">
            <div className="route-inputs-row">
              {/* Origin Dropdown */}
              <div className="route-input-group">
                <label className="route-input-label">
                  <span className="dot green"></span> Origin / Starting Point
                </label>
                <select 
                  value={sourceId} 
                  onChange={(e) => setSourceId(e.target.value)}
                  className="route-select"
                >
                  {landmarks.map(lm => (
                    <option key={lm.id} value={lm.id}>
                      {lm.name} ({lm.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Swap Button */}
              <button 
                onClick={handleSwapEndpoints} 
                className="btn-swap-endpoints"
                title="Swap Origin and Destination"
              >
                ⇄
              </button>

              {/* Destination Dropdown */}
              <div className="route-input-group">
                <label className="route-input-label">
                  <span className="dot blue"></span> Destination
                </label>
                <select 
                  value={destId} 
                  onChange={(e) => setDestId(e.target.value)}
                  className="route-select"
                >
                  {landmarks.map(lm => (
                    <option key={lm.id} value={lm.id}>
                      {lm.name} ({lm.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Simulated Hour for Route */}
              <div className="route-hour-group">
                <label className="route-input-label">Travel Time</label>
                <select 
                  value={simulatedHour} 
                  onChange={(e) => setSimulatedHour(parseInt(e.target.value))}
                  className="route-select hour"
                >
                  <option value={14}>14:00 (Daylight)</option>
                  <option value={19}>19:00 (Evening Dusk)</option>
                  <option value={22}>22:00 (Late Night)</option>
                  <option value={2}>02:00 (Midnight)</option>
                </select>
              </div>

              {/* Action Button */}
              <button 
                onClick={() => handlePlanRoute(sourceId, destId, simulatedHour)}
                disabled={isPlanningRoute}
                className="btn-plan-safe-route"
              >
                <span>{isPlanningRoute ? 'Auditing...' : '🛡️ Audit Route Safety'}</span>
              </button>
            </div>

            {/* Quick Popular Route Presets */}
            <div className="quick-presets-row">
              <span className="presets-label">Popular Walking Corridors:</span>
              <button 
                onClick={() => { setSourceId('LM-01'); setDestId('LM-03'); handlePlanRoute('LM-01', 'LM-03', simulatedHour); }}
                className="preset-pill"
              >
                🚶 SIT Girls Hostel ➔ Railway Station
              </button>
              <button 
                onClick={() => { setSourceId('LM-11'); setDestId('LM-04'); handlePlanRoute('LM-11', 'LM-04', simulatedHour); }}
                className="preset-pill"
              >
                🚶 SIT Back Gate ➔ Batawadi Junction
              </button>
              <button 
                onClick={() => { setSourceId('LM-05'); setDestId('LM-07'); handlePlanRoute('LM-05', 'LM-07', simulatedHour); }}
                className="preset-pill"
              >
                🚶 Gandhi Nagar ➔ Ashoka Road Market
              </button>
              <button 
                onClick={() => { setSourceId('LM-06'); setDestId('LM-02'); handlePlanRoute('LM-06', 'LM-02', simulatedHour); }}
                className="preset-pill"
              >
                🚶 SS Puram ➔ SIT Main Gate
              </button>
            </div>
          </div>

          {/* AI Route Safety Verdict Callout */}
          {routePlanData && (
            <div className="route-verdict-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem' }}>🌟</span>
                <div>
                  <strong style={{ fontSize: '0.98rem', color: '#10b981', textTransform: 'uppercase' }}>
                    SafeWalk AI Recommendation Available
                  </strong>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.5 }}>
                    {routePlanData.summary_verdict}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button onClick={handleShareTrackingLink} className="btn-share-live-route">
                  <span>📲</span> {copyNotification ? 'Link Copied!' : 'Share Live Tracking'}
                </button>
                <button 
                  onClick={() => handleTriggerSos({ name: `Route: ${routePlanData.origin.name} to ${routePlanData.destination.name}` })}
                  className="btn-escort-dispatch"
                >
                  <span>🚨</span> Request Pink Patrol Escort
                </button>
              </div>
            </div>
          )}

          {/* Dual Route Map Display */}
          <section className="route-map-showcase">
            <div className="gis-map-header">
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-pure)' }}>
                  🧭 Direct Shortcut (Red Dashed) vs. AI SafeLit Route (Solid Green)
                </h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Comparing dark alley risk vs. high-mast LED smart arterial routing with police booth checkpoints.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div className="map-legend">
                  <span className="legend-chip"><span className="route-legend-line red"></span> Direct Path (Risk: {routePlanData?.direct_route?.risk_rate_pct || '--'}%)</span>
                  <span className="legend-chip"><span className="route-legend-line green"></span> SafeLit Route (Risk: {routePlanData?.safelit_route?.risk_rate_pct || '--'}%)</span>
                </div>

                <div className="speed-toggle">
                  <button className={`speed-pill ${routeBasemap === 'dark' ? 'active' : ''}`} onClick={() => handleRouteBasemapChange('dark')}>
                    Dark Cyber
                  </button>
                  <button className={`speed-pill ${routeBasemap === 'osm' ? 'active' : ''}`} onClick={() => handleRouteBasemapChange('osm')}>
                    OSM
                  </button>
                  <button className={`speed-pill ${routeBasemap === 'satellite' ? 'active' : ''}`} onClick={() => handleRouteBasemapChange('satellite')}>
                    Satellite
                  </button>
                </div>
              </div>
            </div>

            <div className="gis-map-canvas-wrapper route-canvas" ref={routeMapContainerRef}></div>
          </section>

          {/* Route Comparison Side-by-Side Cards */}
          {routePlanData && (
            <div className="route-comparison-grid">
              {/* Card 1: Direct Route (Vulnerable) */}
              <div className="route-card direct-vulnerable">
                <div className="route-card-header">
                  <div>
                    <span className="route-card-badge red">⚠️ DIRECT SHORTCUT (UNLIT ALLEY)</span>
                    <h4 className="route-title">{routePlanData.direct_route.name}</h4>
                  </div>
                  <div className="route-risk-badge red">
                    <span className="num">{routePlanData.direct_route.risk_rate_pct}%</span>
                    <span className="lbl">RISK RATE</span>
                  </div>
                </div>

                <div className="route-metrics-bar">
                  <div><strong>Distance:</strong> {routePlanData.direct_route.distance_km} km</div>
                  <div><strong>Walking Time:</strong> {routePlanData.direct_route.walking_time_mins} mins</div>
                  <div><strong>Safety Score:</strong> {routePlanData.direct_route.safewalk_score}/100</div>
                </div>

                <div className="route-hazards-box">
                  <strong style={{ fontSize: '0.78rem', color: '#ef4444' }}>Identified Hazards Along Direct Path:</strong>
                  <ul className="hazards-list">
                    {routePlanData.direct_route.hazards_identified.map((h, i) => (
                      <li key={i}>
                        <strong>⚠️ {h.title}:</strong> {h.description}
                      </li>
                    ))}
                    <li>
                      <strong>👥 Low Pedestrian Density:</strong> {routePlanData.direct_route.pedestrian_density}
                    </li>
                    <li>
                      <strong>💡 Lighting:</strong> {routePlanData.direct_route.lighting_status}
                    </li>
                  </ul>
                </div>

                <div className="route-card-verdict red">
                  ⚠️ NOT RECOMMENDED FOR WOMEN TRAVELING OR WALKING ALONE AT NIGHT.
                </div>
              </div>

              {/* Card 2: AI Recommended SafeLit Route */}
              <div className="route-card safelit-recommended">
                <div className="route-card-header">
                  <div>
                    <span className="route-card-badge green">🌟 AI SAFELIT ROUTE (RECOMMENDED)</span>
                    <h4 className="route-title">{routePlanData.safelit_route.name}</h4>
                  </div>
                  <div className="route-risk-badge green">
                    <span className="num">{routePlanData.safelit_route.risk_rate_pct}%</span>
                    <span className="lbl">RISK RATE</span>
                  </div>
                </div>

                <div className="route-metrics-bar">
                  <div><strong>Distance:</strong> {routePlanData.safelit_route.distance_km} km ({routePlanData.safelit_route.extra_distance_m > 0 ? `+${routePlanData.safelit_route.extra_distance_m}m` : 'Direct'})</div>
                  <div><strong>Walking Time:</strong> {routePlanData.safelit_route.walking_time_mins} mins (+{routePlanData.safelit_route.extra_time_mins} mins)</div>
                  <div><strong>Safety Score:</strong> <span style={{ color: '#10b981', fontWeight: 900 }}>{routePlanData.safelit_route.safewalk_score}/100</span></div>
                </div>

                <div className="route-safeguards-box">
                  <strong style={{ fontSize: '0.78rem', color: '#10b981' }}>Monitored Safety Infrastructure on this Route:</strong>
                  <ul className="safeguards-list">
                    {routePlanData.safelit_route.safe_checkpoints.map((cp, i) => (
                      <li key={i}>
                        <strong>🛡️ {cp.title}:</strong> {cp.description}
                      </li>
                    ))}
                    <li>
                      <strong>💡 Lighting:</strong> {routePlanData.safelit_route.lighting_status}
                    </li>
                    <li>
                      <strong>👥 Natural Surveillance:</strong> {routePlanData.safelit_route.pedestrian_density}
                    </li>
                  </ul>
                </div>

                <div className="turn-by-turn-box">
                  <strong style={{ fontSize: '0.78rem', color: 'var(--neon-cyan)' }}>Turn-by-Turn Safe Walking Guidance:</strong>
                  <ol className="directions-list">
                    {routePlanData.safelit_route.turn_by_turn_directions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="route-card-verdict green">
                  ✅ HIGH SAFETY: FULLY MONITORED, ILLUMINATED & SAFE FOR WOMEN SOLO WALKING.
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============================================================ */}
      {/* SOS EMERGENCY BANNER (TRIGGERED ON DEMAND)                   */}
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
              <div><strong>Corridor / Route:</strong> {sosModalData.corridor}</div>
              <div><strong>Assigned Vehicle:</strong> <span style={{ color: 'var(--neon-cyan)' }}>{sosModalData.patrol_vehicle} ({sosModalData.unit_assigned})</span></div>
              <div><strong>ETA:</strong> <span style={{ color: '#10b981', fontWeight: 800 }}>{sosModalData.eta_mins} Minutes</span></div>
              <div><strong>Officer in Charge:</strong> {sosModalData.officer_in_charge}</div>
            </div>
          </div>
          <button onClick={() => setSosModalData(null)} className="sos-close-btn">✕</button>
        </div>
      )}

      {/* ============================================================ */}
      {/* SAFE BYPASS MODAL (FOR TAB 1 CORRIDOR CARDS)                 */}
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
                <button onClick={() => setBypassModalStreet(null)} className="btn-modal-cancel">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* OPTIONAL VISION CAMERA ACCORDION                             */}
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
                  if (f) {
                    setIsAnalyzingImage(true);
                    const formData = new FormData();
                    formData.append('file', f);
                    formData.append('hour', simulatedHour);
                    formData.append('street_name', selectedStreet?.name || 'Tumakuru Urban Road');
                    fetch('/api/safety/analyze-image', { method: 'POST', body: formData })
                      .then(r => r.json())
                      .then(d => { if (d.status === 'success') setUploadData(d); })
                      .finally(() => setIsAnalyzingImage(false));
                  }
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
