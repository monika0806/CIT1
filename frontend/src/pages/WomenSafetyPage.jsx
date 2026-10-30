import React, { useState, useEffect, useRef } from 'react';
import './WomenSafetyPage.css';

export default function WomenSafetyPage() {
  const [activeMode, setActiveMode] = useState('upload'); // 'upload' or 'corridor'
  const [corridors, setCorridors] = useState([]);
  const [selectedCorridorId, setSelectedCorridorId] = useState('COR-01');
  const [simulatedHour, setSimulatedHour] = useState(21);
  
  // Image Upload / Perception State
  const [uploadData, setUploadData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [viewMode, setViewMode] = useState('annotated'); // 'annotated' or 'original'
  const fileInputRef = useRef(null);

  // Corridor Live Network State
  const [corridorData, setCorridorData] = useState(null);

  // SOS Emergency Dispatch Modal
  const [sosModalData, setSosModalData] = useState(null);
  const [isDispatchingSos, setIsDispatchingSos] = useState(false);

  // 1. Fetch monitored corridors on mount
  useEffect(() => {
    fetch('/api/safety/corridors')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCorridors(data);
          setSelectedCorridorId(data[0].id);
        }
      })
      .catch(e => console.warn('Could not load safety corridors:', e));
  }, []);

  // 2. Poll Corridor Safety Assessment in 'corridor' mode
  const fetchCorridorAudit = async (corrId, hour) => {
    try {
      const res = await fetch(`/api/safety/audit?corridor_id=${corrId}&hour=${hour}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success') {
        setCorridorData(data);
      }
    } catch (e) {
      console.warn('Error fetching corridor safety audit:', e);
    }
  };

  useEffect(() => {
    if (activeMode !== 'corridor') return;
    fetchCorridorAudit(selectedCorridorId, simulatedHour);
  }, [selectedCorridorId, simulatedHour, activeMode]);

  // 3. Auto-run model on default sample image in 'upload' mode
  useEffect(() => {
    if (activeMode === 'upload' && !uploadData && !isAnalyzing) {
      runImageSafetyInference({ sampleName: 'busy_safe_street.jpg' });
    }
  }, [activeMode]);

  // 4. Run AI Safety Inference on Image
  const runImageSafetyInference = async ({ file = null, sampleName = null, hour = simulatedHour }) => {
    setIsAnalyzing(true);
    setSosModalData(null);

    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else if (sampleName) {
        formData.append('sample_name', sampleName);
      } else {
        formData.append('sample_name', 'busy_safe_street.jpg');
      }
      formData.append('hour', hour);
      formData.append('street_name', 'Tumakuru Safe Urban Corridor');

      const res = await fetch('/api/safety/analyze-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.status === 'success') {
        setUploadData(data);
        setViewMode('annotated');
      } else {
        console.error('Safety inference error:', data.message);
      }
    } catch (e) {
      console.error('Failed to run safety inference:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      runImageSafetyInference({ file });
    }
  };

  // 5. Trigger SOS Emergency Patrol Dispatch
  const handleTriggerSos = async () => {
    setIsDispatchingSos(true);
    try {
      const corrName = activeMode === 'upload' ? 'Tumakuru Urban Corridor' : (corridorData?.corridor?.name || 'SIT Tumkur Corridor');
      const res = await fetch('/api/safety/sos-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridor_name: corrName,
          lat: 13.3276,
          lng: 77.1259
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

  // Active dataset
  const activeData = activeMode === 'upload' ? uploadData : corridorData;
  const assessment = activeData?.safety_assessment;
  const perception = activeData?.perception_metrics;
  const emergencies = activeData?.emergency_actions;

  const score = assessment?.safewalk_score || 75;
  const scoreColor = assessment?.badge_color || '#10b981';

  return (
    <main className="safety-container">
      {/* Top Header */}
      <section className="dashboard-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            <h1 className="page-title" style={{ margin: 0 }}>WOMEN'S SOLO TRAVEL & NIGHT SAFETY AI</h1>
            <span className="badge-live" style={{ background: 'rgba(236, 72, 153, 0.15)', color: 'var(--safety-pink)', border: '1px solid rgba(236, 72, 153, 0.4)' }}>
              SAFEWALK v2.0
            </span>
          </div>
          <p className="page-desc" style={{ margin: 0 }}>
            Perceives natural surveillance ("Eyes on the Street"), active vehicular traffic flow, and ambient lighting to assess roadway vulnerability and empower women traveling or walking solo.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="safety-tabs">
          <button 
            onClick={() => setActiveMode('upload')}
            className={`safety-tab-btn ${activeMode === 'upload' ? 'active' : ''}`}
          >
            <span>📸</span> Upload Street Photo & AI Perception
          </button>
          <button 
            onClick={() => setActiveMode('corridor')}
            className={`safety-tab-btn ${activeMode === 'corridor' ? 'active' : ''}`}
          >
            <span>📡</span> Tumakuru Monitored Safe Corridors
          </button>
        </div>
      </section>

      {/* Hero SafeWalk Index Score Banner */}
      <section className="safety-score-banner">
        <div className="score-circle-wrapper">
          <div className="score-circle" style={{ borderColor: scoreColor, boxShadow: `0 0 25px ${scoreColor}55` }}>
            <span className="score-num" style={{ color: scoreColor }}>{score}</span>
            <span className="score-label">SafeWalk</span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 900, color: scoreColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {assessment?.badge || 'EVALUATING SAFEWALK INDEX...'}
              </span>
            </div>
            <div style={{ fontSize: '0.92rem', color: 'var(--text-pure)', fontWeight: 600, maxWidth: '750px', lineHeight: 1.5 }}>
              {assessment?.verdict || 'Analyzing natural surveillance and traffic flow to ensure safe solo travel.'}
            </div>
          </div>
        </div>

        {/* Emergency SOS Panic Button */}
        <div>
          <button 
            onClick={handleTriggerSos}
            disabled={isDispatchingSos}
            className="sos-panic-btn"
          >
            <span>🚨</span>
            {isDispatchingSos ? 'Dispatching Patrol...' : '1-CLICK POLICE SOS (PINK PATROL)'}
          </button>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.4rem' }}>
            Connected to Dial 112 & Tumakuru City Police
          </div>
        </div>
      </section>

      {/* SOS Emergency Dispatch Modal */}
      {sosModalData && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '2px solid #ef4444', borderRadius: 'var(--radius-lg)', padding: '1.25rem', boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '1.3rem' }}>🚨</span>
                <span style={{ fontWeight: 900, color: '#fff', fontSize: '1rem', textTransform: 'uppercase' }}>
                  EMERGENCY DISPATCH INITIATED: {sosModalData.dispatch_id}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.9)', lineHeight: 1.5 }}>
                {sosModalData.message}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem', marginTop: '0.8rem', fontSize: '0.75rem', background: 'rgba(0, 0, 0, 0.4)', padding: '0.75rem', borderRadius: '6px' }}>
                <div><strong>Assigned Unit:</strong> <span style={{ color: 'var(--neon-cyan)' }}>{sosModalData.unit_assigned}</span></div>
                <div><strong>Estimated Arrival:</strong> <span style={{ color: '#10b981' }}>{sosModalData.eta_mins} Minutes</span></div>
                <div><strong>Officer in Charge:</strong> {sosModalData.officer_in_charge}</div>
                <div><strong>Vehicle:</strong> {sosModalData.patrol_vehicle}</div>
              </div>
            </div>
            <button onClick={() => setSosModalData(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}

      {/* Upload Mode Controls Deck */}
      {activeMode === 'upload' && (
        <section className="safety-upload-deck">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Quick Test Scenarios:
              </span>
              <button 
                onClick={() => {
                  setSelectedFile(null);
                  runImageSafetyInference({ sampleName: 'busy_safe_street.jpg', hour: 19 });
                }}
                className="safety-pill"
              >
                <span>🟢</span> Busy Safe Street (High Natural Surveillance)
              </button>
              <button 
                onClick={() => {
                  setSelectedFile(null);
                  runImageSafetyInference({ sampleName: 'deserted_night_street.jpg', hour: 23 });
                }}
                className="safety-pill"
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
              >
                <span>🔴</span> Dark Deserted Night Alley (High Vulnerability)
              </button>
            </div>

            {/* Time of Day Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Simulated Hour:</span>
              <span className="mono" style={{ color: 'var(--neon-cyan)', fontWeight: 800, minWidth: '60px' }}>
                {simulatedHour}:00 hrs
              </span>
              <input 
                type="range"
                min="0"
                max="23"
                value={simulatedHour}
                onChange={(e) => {
                  const hr = parseInt(e.target.value);
                  setSimulatedHour(hr);
                  if (activeMode === 'upload') {
                    runImageSafetyInference({ file: selectedFile, hour: hr });
                  }
                }}
                style={{ width: '130px', accentColor: 'var(--safety-pink)' }}
              />
            </div>
          </div>

          {/* Drag & Drop File Input */}
          <div 
            className="safety-dropzone" 
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*" 
              style={{ display: 'none' }} 
            />
            <div style={{ fontSize: '2rem' }}>📂</div>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-pure)' }}>
              {selectedFile ? `Selected: ${selectedFile.name}` : 'Click to Upload Any Street Photo to Evaluate Women\'s Solo Walking Safety'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Detects pedestrians, passing vehicle density, and calculates darkness/shadow ratios using YOLOv8
            </div>
          </div>
        </section>
      )}

      {/* Corridor Mode Controls Deck */}
      {activeMode === 'corridor' && (
        <section className="safety-upload-deck">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Select Monitored Corridor:
              </span>
              <select 
                value={selectedCorridorId} 
                onChange={(e) => setSelectedCorridorId(e.target.value)}
                className="flow-select"
                style={{ minWidth: '320px' }}
              >
                {corridors.map(c => (
                  <option key={c.id} value={c.id}>
                    📍 {c.name} (Base: {c.baseline_safety}%)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Simulated Hour of Day:</span>
              <span className="mono" style={{ color: 'var(--neon-cyan)', fontWeight: 800 }}>
                {simulatedHour}:00 hrs
              </span>
              <input 
                type="range"
                min="0"
                max="23"
                value={simulatedHour}
                onChange={(e) => setSimulatedHour(parseInt(e.target.value))}
                style={{ width: '130px', accentColor: 'var(--safety-pink)' }}
              />
            </div>
          </div>
        </section>
      )}

      {/* KPI Ribbon: 4 Core Pillars of Street Safety */}
      <section className="kpi-ribbon">
        <div className="kpi-card">
          <div className="kpi-icon">👥</div>
          <div className="kpi-info">
            <span className="kpi-label">Natural Surveillance</span>
            <span className="kpi-value" style={{ color: 'var(--neon-cyan)' }}>
              {perception ? `${perception.pedestrians_detected} Pedestrians` : '--'}
            </span>
            <span className="kpi-sub">
              {perception ? perception.natural_surveillance_level : 'Eyes on the Street'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">🚗</div>
          <div className="kpi-info">
            <span className="kpi-label">Active Vehicular Traffic</span>
            <span className="kpi-value" style={{ color: '#00f5ff' }}>
              {perception ? `${perception.vehicles_detected} Vehicles` : '--'}
            </span>
            <span className="kpi-sub">
              {perception ? `${perception.traffic_flow_level} Flow Deterrence` : 'Passing Transit'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">💡</div>
          <div className="kpi-info">
            <span className="kpi-label">Ambient Lighting</span>
            <span className="kpi-value" style={{ color: perception?.ambient_illumination?.mean_luminance < 60 ? '#ef4444' : 'var(--neon-emerald)' }}>
              {perception?.ambient_illumination?.mean_luminance ? `${perception.ambient_illumination.mean_luminance}/255` : 'Active Lighting'}
            </span>
            <span className="kpi-sub">
              {perception?.ambient_illumination?.quality?.replace('_', ' ') || 'Streetlight Coverage'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">
            {assessment?.solo_walking_recommended ? '✅' : '⚠️'}
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Solo Walking Recommendation</span>
            <span className="kpi-value" style={{ color: assessment?.solo_walking_recommended ? '#10b981' : '#ef4444' }}>
              {assessment?.solo_walking_recommended ? 'RECOMMENDED' : 'NOT ADVISED'}
            </span>
            <span className="kpi-sub" style={{ color: assessment?.solo_walking_recommended ? '#10b981' : '#ef4444' }}>
              {assessment?.solo_walking_recommended ? 'Optimal Security Presence' : 'High Isolation Vulnerability'}
            </span>
          </div>
        </div>
      </section>

      {/* Computer Vision Perception Stage (When in Upload Mode) */}
      {activeMode === 'upload' && (
        <section className="vision-stage-wrapper">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-pure)', margin: 0, textTransform: 'uppercase' }}>
                👁️ AI Safety Vision Perception (YOLO Pedestrians & Lighting Analysis)
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Cyan/Yellow Boxes: Pedestrians (Natural Guardianship) • Orange Boxes: Active Passing Vehicles • Top Cyber HUD: Instant Safety Diagnostics
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => setViewMode('annotated')}
                className={`safety-pill ${viewMode === 'annotated' ? 'active' : ''}`}
                style={{ background: viewMode === 'annotated' ? 'var(--safety-pink)' : 'transparent', color: viewMode === 'annotated' ? '#fff' : 'var(--text-secondary)' }}
              >
                🎯 AI Annotated View
              </button>
              <button 
                onClick={() => setViewMode('original')}
                className={`safety-pill ${viewMode === 'original' ? 'active' : ''}`}
                style={{ background: viewMode === 'original' ? 'var(--safety-pink)' : 'transparent', color: viewMode === 'original' ? '#fff' : 'var(--text-secondary)' }}
              >
                🖼️ Original Photo
              </button>
            </div>
          </div>

          <div style={{ width: '100%', minHeight: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {isAnalyzing ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--safety-pink)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛡️</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Evaluating Eyes-on-the-Street & Traffic Density...</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  YOLOv8 is counting pedestrians, vehicles, and measuring darkness shadow ratios
                </div>
              </div>
            ) : uploadData ? (
              <img 
                src={viewMode === 'annotated' ? uploadData.annotated_image_url : uploadData.original_image_url} 
                alt="AI Safety Perception" 
                className="vision-image-display"
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', padding: '3rem' }}>No image loaded. Click a preset above or upload an image.</div>
            )}
          </div>
        </section>
      )}

      {/* Suggested Safe Alternative Bypass Routes */}
      {emergencies?.nearby_safe_bypasses && emergencies.nearby_safe_bypasses.length > 0 && (
        <section className="analytics-deck">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10b981', margin: '0 0 0.8rem 0', textTransform: 'uppercase' }}>
            🧭 AI Recommended Safe Alternative Routes (Illuminated with Natural Surveillance)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
            {emergencies.nearby_safe_bypasses.map((bp, idx) => (
              <div key={idx} className="bypass-card">
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-pure)', marginBottom: '0.2rem' }}>
                    {bp.route_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {bp.reason}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--neon-cyan)', marginTop: '0.4rem' }}>
                    Walking Delta: <strong>{bp.distance_delta}</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                    {bp.safety_score}%
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Safety Rating</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
