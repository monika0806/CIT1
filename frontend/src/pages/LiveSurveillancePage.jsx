import React, { useState, useEffect, useRef } from 'react';
import LocationEditModal from '../components/LocationEditModal';
import VideoUploadModal from '../components/VideoUploadModal';
import EvidenceModal from '../components/EvidenceModal';
import ReceiptModal from '../components/ReceiptModal';
import './LiveSurveillancePage.css';

const STANDARD_CATEGORIES = ['car', 'motorcycle', 'bus', 'truck', 'bicycle', 'pedestrian'];

export default function LiveSurveillancePage() {
  const [telemetry, setTelemetry] = useState({});
  const [violations, setViolations] = useState([]);
  const [activeTab, setActiveTab] = useState('violations');
  const [camTitle, setCamTitle] = useState('CAM-01: HIGHWAY ARTERIAL');
  const [cameraLocation, setCameraLocation] = useState({
    name: 'CAM-01: HIGHWAY ARTERIAL',
    address: 'B.H. Road, SIT Campus Main Entrance, Tumakuru, Karnataka 572103',
    lat: 13.3276,
    lng: 77.1259,
    active: true
  });

  // Ribbon toggles
  const [toggles, setToggles] = useState({
    boxes: true,
    heatmap: false,
    tripwire: true
  });

  const [direction, setDirection] = useState('bidirectional_split');
  const [activeSource, setActiveSource] = useState('sample1');
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Modals
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [receiptViolation, setReceiptViolation] = useState(null);

  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const knownViolationsRef = useRef(new Set());

  // 1. Fetch initial camera location
  useEffect(() => {
    fetch('/api/camera/location')
      .then(res => res.json())
      .then(data => {
        if (data && data.lat) {
          setCameraLocation(data);
          if (data.name) setCamTitle(data.name);
        }
      })
      .catch(err => console.warn('Could not load camera location:', err));
  }, []);

  // 2. Poll telemetry (every 1s)
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/telemetry');
        if (!res.ok) return;
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setTelemetry(data);
          if (data.location && data.location.address) {
            setCameraLocation(data.location);
          }
        }
      } catch (e) {
        // fail silently
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Poll violations (every 1.5s)
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/violations?limit=25');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          // Check for new violation audio ping
          if (audioEnabled) {
            data.forEach(v => {
              if (v.id && !knownViolationsRef.current.has(v.id)) {
                knownViolationsRef.current.add(v.id);
                playAlertSound();
              }
            });
          }
          setViolations(data);
        }
      } catch (e) {
        // fail silently
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [audioEnabled]);

  const playAlertSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  };

  const handleToggle = async (feature) => {
    const nextState = !toggles[feature];
    setToggles(prev => ({ ...prev, [feature]: nextState }));
    try {
      await fetch('/api/toggle_feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, enabled: nextState })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDirectionChange = async (e) => {
    const val = e.target.value;
    setDirection(val);
    try {
      await fetch('/api/set_direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: val })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectSource = async (src, label) => {
    setActiveSource(src);
    setCamTitle(label.toUpperCase());
    try {
      await fetch('/api/select_source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: src })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetCounts = async () => {
    try {
      await fetch('/api/reset_counts', { method: 'POST' });
      setTelemetry({});
    } catch (e) {
      console.error(e);
    }
  };

  const handleSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.naturalWidth || 1280;
      canvas.height = videoRef.current.naturalHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `RoadPulseAI_Snapshot_${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (e) {
      console.warn('Snapshot handled via stream:', e);
    }
  };

  const handleFullscreen = () => {
    const wrap = document.getElementById('video-frame-wrap');
    if (wrap) {
      if (!document.fullscreenElement) {
        wrap.requestFullscreen().catch(err => console.log(err));
      } else {
        document.exitFullscreen().catch(err => console.log(err));
      }
    }
  };

  // Calculations for radar bars
  const visibleClassification = telemetry.classification_visible || {};
  const totalActive = Math.max(1, Object.values(visibleClassification).reduce((a, b) => a + b, 0));
  const totalCounted = telemetry.total_counted ?? 0;
  const inCount = telemetry.in_count ?? 0;
  const outCount = telemetry.out_count ?? 0;
  const vehicleCountVisible = telemetry.vehicle_count_visible ?? 0;
  const density = telemetry.density || {};
  const totalRevenue = violations.reduce((acc, v) => acc + (v.fine_amount || 1000), 0);

  // Address label formatting
  const shortAddress = cameraLocation.address ? cameraLocation.address.split(',')[0] : cameraLocation.name;
  const badgeCoordText = `${shortAddress} (${Number(cameraLocation.lat).toFixed(4)}, ${Number(cameraLocation.lng).toFixed(4)})`;

  return (
    <main className="dashboard-container">
      {/* KPI Command Ribbon */}
      <section className="kpi-ribbon">
        <div className="kpi-card accent-cyan">
          <div className="kpi-icon">🚗</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{vehicleCountVisible}</div>
            <div className="kpi-label">Active In-Frame Vehicles</div>
          </div>
          <div className="kpi-sparkle"></div>
        </div>

        <div className="kpi-card accent-emerald">
          <div className="kpi-icon">📊</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{totalCounted}</div>
            <div className="kpi-label">Cumulative Flow Count</div>
          </div>
          <div className="kpi-meta">
            <span className="meta-badge in">IN: {inCount}</span>
            <span className="meta-badge out">OUT: {outCount}</span>
          </div>
        </div>

        <div className="kpi-card accent-amber">
          <div className="kpi-icon">🚦</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{density.congestion_pct ?? 0}%</div>
            <div className="kpi-label">Spatial Density Index</div>
          </div>
          <div className="kpi-meta">
            <span className="meta-tag los-tag">
              LOS {density.level_of_service || 'B'} • {density.status || 'Stable Flow'}
            </span>
          </div>
        </div>

        <div className="kpi-card accent-rose">
          <div className="kpi-icon">🚨</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{violations.length}</div>
            <div className="kpi-label">Enforcement Infractions</div>
          </div>
          <div className="kpi-meta">
            <span className="meta-tag fine-tag">₹{totalRevenue.toLocaleString()} Fines</span>
          </div>
        </div>
      </section>

      {/* Main Workspace Split: Viewport + Analytics Deck */}
      <div className="workspace-grid">
        {/* Surveillance Stage */}
        <section className="surveillance-stage">
          {/* Header Bar */}
          <div className="stage-header">
            <div className="cam-info">
              <span className="rec-dot"></span>
              <span className="cam-name">{camTitle}</span>
              <button 
                onClick={() => setIsLocationModalOpen(true)}
                className="cam-tag location-badge-btn" 
                title={`Mapped Location: ${cameraLocation.address} [${cameraLocation.lat}, ${cameraLocation.lng}] - Click to Edit`}
                style={{ background: 'rgba(0, 245, 255, 0.15)', color: 'var(--neon-cyan)', border: '1px solid rgba(0, 245, 255, 0.4)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderRadius: '999px', padding: '0.25rem 0.65rem', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, transition: 'all 0.2s ease' }}
              >
                <span>📍</span>
                <span>{badgeCoordText}</span>
                <span style={{ fontSize: '0.68rem', opacity: 0.75, marginLeft: '2px' }}>✏️</span>
              </button>
              <span className="cam-tag">LIVE FEED</span>
            </div>

            <div className="stage-actions">
              <button 
                onClick={() => setIsLocationModalOpen(true)}
                className="stage-btn" 
                title="Set Location Address & Coordinates" 
                style={{ borderColor: 'rgba(0, 245, 255, 0.4)', color: 'var(--neon-cyan)' }}
              >
                <span>📍</span> Set Location
              </button>
              <button onClick={handleSnapshot} className="stage-btn" title="Download Screenshot">
                <span>📷</span> Snapshot
              </button>
              <button onClick={handleFullscreen} className="stage-btn" title="Toggle Fullscreen">
                <span>⛶</span> Fullscreen
              </button>
            </div>
          </div>

          {/* Video Frame */}
          <div className="video-enclosure" id="video-frame-wrap">
            <div className="reticle top-left"></div>
            <div className="reticle top-right"></div>
            <div className="reticle bottom-left"></div>
            <div className="reticle bottom-right"></div>

            <img 
              ref={videoRef}
              className="stream-element" 
              src="/video_feed" 
              alt="Surveillance Stream" 
            />
          </div>

          {/* Quick-Toggle Control Ribbon */}
          <div className="ribbon-bar">
            <div className="ribbon-group">
              <button 
                onClick={() => handleToggle('boxes')}
                className={`ribbon-pill ${toggles.boxes ? 'active' : ''}`}
              >
                <span className="pill-dot"></span> Bounding Boxes
              </button>
              <button 
                onClick={() => handleToggle('heatmap')}
                className={`ribbon-pill ${toggles.heatmap ? 'active' : ''}`}
              >
                <span className="pill-dot"></span> Thermal Heatmap
              </button>
              <button 
                onClick={() => handleToggle('tripwire')}
                className={`ribbon-pill ${toggles.tripwire ? 'active' : ''}`}
              >
                <span className="pill-dot"></span> Tripwire Line
              </button>
            </div>

            <div className="ribbon-group">
              <span className="select-label">Road Flow:</span>
              <select 
                value={direction} 
                onChange={handleDirectionChange} 
                className="cyber-select"
              >
                <option value="bidirectional_split">🔄 Two-Way Divided (Left Up / Right Down)</option>
                <option value="auto">✨ Auto-Detect Flow (Consensus)</option>
                <option value="down">⬇️ One-Way Flow (Down)</option>
                <option value="up">⬆️ One-Way Flow (Up)</option>
                <option value="split_left_down_right_up">🔄 Split (Left Down / Right Up)</option>
              </select>
            </div>
          </div>

          {/* Source Switcher Deck */}
          <div className="source-deck">
            <div className="source-label">Surveillance Feeds:</div>
            <div className="source-chips">
              <button 
                onClick={() => handleSelectSource('sample1', 'Sample 1: Highway Corridor')}
                className={`source-chip ${activeSource === 'sample1' ? 'active' : ''}`}
              >
                <span>🛣️</span> Sample 1: Highway Corridor
              </button>
              <button 
                onClick={() => handleSelectSource('sample2', 'Sample 2: Urban Arterial')}
                className={`source-chip ${activeSource === 'sample2' ? 'active' : ''}`}
              >
                <span>🏙️</span> Sample 2: Urban Arterial
              </button>
              <button 
                onClick={() => handleSelectSource('webcam', 'Live Local Camera')}
                className={`source-chip ${activeSource === 'webcam' ? 'active' : ''}`}
              >
                <span>📷</span> Live Camera
              </button>
              <button 
                onClick={() => setIsUploadModalOpen(true)}
                className={`source-chip upload-chip ${activeSource === 'upload' ? 'active' : ''}`}
              >
                <span>⬆️</span> Upload Custom Video
              </button>
            </div>
          </div>
        </section>

        {/* Right Analytics Deck */}
        <aside className="analytics-deck">
          {/* Tab Header */}
          <div className="tab-header">
            <button 
              onClick={() => setActiveTab('violations')}
              className={`tab-btn ${activeTab === 'violations' ? 'active' : ''}`}
            >
              <span>🚨</span> E-Challan Feed ({violations.length})
            </button>
            <button 
              onClick={() => setActiveTab('classification')}
              className={`tab-btn ${activeTab === 'classification' ? 'active' : ''}`}
            >
              <span>📊</span> Entity Radar
            </button>
          </div>

          {/* Tab Panes */}
          <div className="tab-content">
            {activeTab === 'violations' ? (
              <div className="tab-pane active">
                <div className="violations-feed">
                  {violations.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-shield">🛡️</div>
                      <h4>All Clear — No Violations</h4>
                      <p>Surveillance monitoring helmet compliance, triple-riding, and wrong-way flow in real-time.</p>
                    </div>
                  ) : (
                    violations.map(v => {
                      let tagClass = 'tag-wrong';
                      if (v.violation_type === 'NO_HELMET') tagClass = 'tag-helmet';
                      else if (v.violation_type === 'TRIPLE_RIDING') tagClass = 'tag-triple';

                      return (
                        <div 
                          key={v.id} 
                          onClick={() => setSelectedViolation(v)}
                          className="violation-card" 
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="violation-thumb-wrap">
                            <img 
                              src={v.snapshot_path || ''} 
                              alt="Violation Snapshot" 
                              className="violation-thumb"
                              onError={(e) => { 
                                e.currentTarget.onerror = null; 
                                e.currentTarget.src = '/static/images/placeholder.jpg'; 
                              }}
                            />
                            <span className="zoom-hint">🔍 Expand</span>
                          </div>
                          <div className="violation-body">
                            <div className="violation-top">
                              <span className={`violation-tag ${tagClass}`}>
                                {v.violation_type?.replace(/_/g, ' ') || 'VIOLATION'}
                              </span>
                              <span className="violation-fine">₹{(v.fine_amount || 1000).toLocaleString()}</span>
                            </div>
                            <div className="violation-plate mono">
                              {v.license_plate || 'PLATE PENDING'}
                            </div>
                            <div className="violation-time">
                              {v.timestamp ? new Date(v.timestamp * 1000).toLocaleTimeString() : 'Just now'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="tab-pane active">
                <div className="radar-card" style={{ padding: '1rem', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
                  <h4 style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.85rem', textTransform: 'uppercase' }}>
                    Entity Classification Intensity:
                  </h4>
                  {STANDARD_CATEGORIES.map(cat => {
                    const count = visibleClassification[cat] || (cat === 'pedestrian' ? (visibleClassification['person'] || 0) : 0);
                    const pct = Math.round((count / totalActive) * 100);

                    return (
                      <div key={cat} className="radar-bar-row" style={{ marginBottom: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.2rem' }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{cat}</span>
                          <span className="mono" style={{ color: 'var(--neon-cyan)' }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              height: '100%', 
                              width: `${pct}%`, 
                              background: 'var(--neon-cyan)', 
                              borderRadius: '999px',
                              transition: 'width 0.3s ease'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="deck-footer" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button 
              onClick={handleResetCounts}
              className="action-btn" 
              style={{ flex: 1 }}
            >
              <span>🔄</span> Reset Local Counts
            </button>
            <button 
              onClick={() => setAudioEnabled(prev => !prev)}
              className="action-btn"
              style={{ borderColor: audioEnabled ? 'var(--neon-emerald)' : 'var(--border-subtle)', color: audioEnabled ? 'var(--neon-emerald)' : 'var(--text-secondary)' }}
            >
              <span>{audioEnabled ? '🔔' : '🔕'}</span> {audioEnabled ? 'Audio Alert: ON' : 'Audio Alert: OFF'}
            </button>
          </div>
        </aside>
      </div>

      {/* Modals */}
      <LocationEditModal 
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={cameraLocation}
        onLocationUpdated={(newLoc) => {
          setCameraLocation(newLoc);
          if (newLoc.name) setCamTitle(newLoc.name);
        }}
      />

      <VideoUploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={(data) => {
          setActiveSource('upload');
          if (data.filename) setCamTitle(`📁 ${data.filename.toUpperCase()}`);
          if (data.location) setCameraLocation(data.location);
        }}
      />

      <EvidenceModal 
        isOpen={!!selectedViolation}
        onClose={() => setSelectedViolation(null)}
        violation={selectedViolation}
        onOpenReceipt={(v) => setReceiptViolation(v)}
      />

      <ReceiptModal 
        isOpen={!!receiptViolation}
        onClose={() => setReceiptViolation(null)}
        violation={receiptViolation}
      />
    </main>
  );
}
