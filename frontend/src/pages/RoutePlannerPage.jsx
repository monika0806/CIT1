import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import './RoutePlannerPage.css';

export default function RoutePlannerPage() {
  const [searchParams] = useSearchParams();
  const [nodes, setNodes] = useState([]);
  const [origin, setOrigin] = useState(searchParams.get('from') || 'J1');
  const [destination, setDestination] = useState(searchParams.get('to') || 'J8');
  const [routePlan, setRoutePlan] = useState(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0); // 0 = recommended, 1+ = alternatives
  const [isLoading, setIsLoading] = useState(false);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayersRef = useRef({
    polylines: [],
    markers: []
  });

  // 1. Fetch available routing nodes
  useEffect(() => {
    fetch('/api/routes/nodes')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNodes(data);
          const fromParam = searchParams.get('from');
          const toParam = searchParams.get('to');
          if (fromParam && data.some(n => n.id === fromParam)) setOrigin(fromParam);
          if (toParam && data.some(n => n.id === toParam)) setDestination(toParam);
        }
      })
      .catch(e => console.warn('Could not load routing nodes:', e));
  }, [searchParams]);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (typeof window.L === 'undefined' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = window.L.map(mapContainerRef.current, {
        center: [13.3300, 77.1265],
        zoom: 14,
        zoomControl: true,
        attributionControl: false
      });

      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

      mapInstanceRef.current = map;
    }
  }, []);

  // 3. Plan route whenever origin or destination changes
  useEffect(() => {
    if (!origin || !destination) return;

    const planRoute = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/routes/plan?origin=${origin}&destination=${destination}`);
        const data = await res.json();
        if (data.status === 'success') {
          setRoutePlan(data);
          setSelectedRouteIndex(0);
          renderRoutesOnMap(data, 0);
        }
      } catch (e) {
        console.error('Route planning error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    planRoute();
  }, [origin, destination]);

  const renderRoutesOnMap = (plan, activeIdx) => {
    if (!mapInstanceRef.current || !plan) return;
    const map = mapInstanceRef.current;
    const L = window.L;

    // Clear previous layers
    routeLayersRef.current.polylines.forEach(p => map.removeLayer(p));
    routeLayersRef.current.markers.forEach(m => map.removeLayer(m));
    routeLayersRef.current.polylines = [];
    routeLayersRef.current.markers = [];

    const allRoutes = [plan.recommended_route, ...(plan.alternative_routes || [])].filter(Boolean);

    allRoutes.forEach((r, idx) => {
      const isSelected = idx === activeIdx;
      const polyline = L.polyline(r.polyline, {
        color: isSelected ? (r.color || '#00f5ff') : '#64748b',
        weight: isSelected ? 7 : 4,
        opacity: isSelected ? 0.95 : 0.5,
        dashArray: isSelected ? null : '6, 8',
        lineJoin: 'round'
      }).addTo(map);

      routeLayersRef.current.polylines.push(polyline);

      if (isSelected) {
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
      }
    });

    // Add Start and End Pins
    if (plan.origin) {
      const startMarker = L.marker([plan.origin.lat, plan.origin.lng], {
        icon: L.divIcon({
          className: 'pin-start',
          html: '<div style="background: #10b981; color: white; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; border: 2px solid white; box-shadow: 0 0 10px #10b981;">A</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(map);
      routeLayersRef.current.markers.push(startMarker);
    }

    if (plan.destination) {
      const endMarker = L.marker([plan.destination.lat, plan.destination.lng], {
        icon: L.divIcon({
          className: 'pin-end',
          html: '<div style="background: #ff0055; color: white; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; border: 2px solid white; box-shadow: 0 0 10px #ff0055;">B</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(map);
      routeLayersRef.current.markers.push(endMarker);
    }
  };

  const handleSelectRoute = (idx) => {
    setSelectedRouteIndex(idx);
    if (routePlan) {
      renderRoutesOnMap(routePlan, idx);
    }
  };

  const allRoutes = routePlan 
    ? [routePlan.recommended_route, ...(routePlan.alternative_routes || [])].filter(Boolean)
    : [];
  const currentRoute = allRoutes[selectedRouteIndex] || routePlan?.recommended_route;

  return (
    <main className="dashboard-container">
      {/* Route Control Ribbon */}
      <section className="kpi-ribbon" style={{ gridTemplateColumns: '1.2fr 1.2fr 1fr' }}>
        <div className="radar-card" style={{ padding: '0.85rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
            🟢 Origin Location (Depart):
          </label>
          <select 
            value={origin} 
            onChange={(e) => setOrigin(e.target.value)} 
            className="flow-select" 
            style={{ width: '100%' }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        <div className="radar-card" style={{ padding: '0.85rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
            🔴 Destination Location (Arrive):
          </label>
          <select 
            value={destination} 
            onChange={(e) => setDestination(e.target.value)} 
            className="flow-select" 
            style={{ width: '100%' }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        <div className="radar-card" style={{ padding: '0.85rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button 
            onClick={() => {
              const temp = origin;
              setOrigin(destination);
              setDestination(temp);
            }}
            className="action-btn"
            style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--neon-cyan)', color: 'var(--neon-cyan)' }}
          >
            <span>🔄</span> Reverse Waypoints
          </button>
        </div>
      </section>

      {/* Workspace Grid */}
      <div className="workspace-grid" style={{ gridTemplateColumns: '1fr 380px' }}>
        {/* Map View */}
        <section className="surveillance-stage" style={{ padding: 0, overflow: 'hidden', height: '680px', position: 'relative' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', background: '#080c14' }} />

          {/* Time Savings Notification Banner */}
          {routePlan?.savings_summary && (
            <div style={{ position: 'absolute', top: '1rem', left: '1rem', right: '1rem', background: 'rgba(16, 185, 129, 0.94)', border: '1px solid rgba(255, 255, 255, 0.25)', color: '#ffffff', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', zIndex: 500, fontWeight: 700, fontSize: '0.82rem', backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)' }}>
              {routePlan.savings_summary}
            </div>
          )}
        </section>

        {/* Sidebar Navigation Steps & Comparisons */}
        <aside className="analytics-deck" style={{ maxHeight: '680px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Route Options Comparison Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Suggested Route Options:
            </h4>
            {allRoutes.map((r, idx) => {
              const isSelected = idx === selectedRouteIndex;
              return (
                <div 
                  key={idx}
                  onClick={() => handleSelectRoute(idx)}
                  className="radar-card"
                  style={{
                    padding: '0.85rem',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(0, 245, 255, 0.10)' : 'var(--card-bg)',
                    borderColor: isSelected ? 'var(--neon-cyan)' : 'var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isSelected ? 'var(--neon-cyan)' : 'var(--text-pure)' }}>
                      {r.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, background: r.color, color: '#fff', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      {r.tag || 'AI ROUTE'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', fontSize: '0.72rem', marginTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.4rem' }}>
                    <div>Time: <strong style={{ color: r.color }}>{r.travel_time_mins} min</strong></div>
                    <div>Distance: <strong>{r.distance_km} km</strong></div>
                    <div>Avg: <strong>{r.avg_speed_kmh} km/h</strong></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Turn-by-Turn Navigation Instructions */}
          <div className="radar-card" style={{ padding: '1rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', flex: 1 }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--neon-emerald)', marginBottom: '0.7rem', textTransform: 'uppercase' }}>
              🧭 Turn-by-Turn Directions:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.78rem' }}>
              {currentRoute?.directions?.map((step, sIdx) => (
                <div key={sIdx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0, 245, 255, 0.15)', color: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, flexShrink: 0 }}>
                    {sIdx + 1}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
