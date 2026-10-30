import React, { useState, useEffect, useRef } from 'react';
import './NarrowStreetParkingPage.css';

export default function NarrowStreetParkingPage() {
  const [activeMode, setActiveMode] = useState('upload'); // 'upload' or 'camera'
  const [streets, setStreets] = useState([]);
  const [selectedStreetId, setSelectedStreetId] = useState('NST-01');
  
  // Camera live stream audit state
  const [cameraAuditData, setCameraAuditData] = useState(null);
  
  // Image upload & model inference state
  const [uploadAuditData, setUploadAuditData] = useState(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [selectedLegalSide, setSelectedLegalSide] = useState('LEFT');
  const [inputRoadWidth, setInputRoadWidth] = useState(6.4);
  const [imageViewMode, setImageViewMode] = useState('annotated'); // 'annotated' or 'original'
  const fileInputRef = useRef(null);

  // E-Challan Issuance state
  const [challanResult, setChallanResult] = useState(null);
  const [isIssuing, setIsIssuing] = useState(false);

  // 1. Fetch all monitored narrow streets on mount
  useEffect(() => {
    fetch('/api/parking/streets')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setStreets(data);
          setSelectedStreetId(data[0].id);
        }
      })
      .catch(e => console.warn('Could not load parking streets:', e));
  }, []);

  // 2. Poll camera audit data when in 'camera' mode
  const fetchCameraAudit = async (streetId) => {
    try {
      const res = await fetch(`/api/parking/analyze?street_id=${streetId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success') {
        setCameraAuditData(data);
      }
    } catch (e) {
      console.warn('Error fetching camera audit:', e);
    }
  };

  useEffect(() => {
    if (activeMode !== 'camera' || !selectedStreetId) return;
    fetchCameraAudit(selectedStreetId);
    const interval = setInterval(() => {
      fetchCameraAudit(selectedStreetId);
    }, 3500);
    return () => clearInterval(interval);
  }, [selectedStreetId, activeMode]);

  // 3. Auto-run model on default sample image when opening upload mode
  useEffect(() => {
    if (activeMode === 'upload' && !uploadAuditData && !isAnalyzingImage) {
      runImageInference({ sampleName: 'narrow_street_sample.jpg' });
    }
  }, [activeMode]);

  // 4. Run YOLO model inference on uploaded image or sample
  const runImageInference = async ({ file = null, sampleName = null, legalSide = selectedLegalSide, roadWidth = inputRoadWidth }) => {
    setIsAnalyzingImage(true);
    setChallanResult(null);

    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else if (sampleName) {
        formData.append('sample_name', sampleName);
      } else {
        formData.append('sample_name', 'narrow_street_sample.jpg');
      }
      formData.append('legal_side', legalSide);
      formData.append('nominal_width_m', roadWidth);
      formData.append('street_name', 'Tumakuru Urban Narrow Corridor');

      const res = await fetch('/api/parking/upload-image', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.status === 'success') {
        setUploadAuditData(data);
        setImageViewMode('annotated');
      } else {
        console.error('Inference error:', data.message);
      }
    } catch (e) {
      console.error('Failed to run image inference:', e);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Handle local file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      runImageInference({ file });
    }
  };

  // 5. Handle manual policy override for camera mode
  const handlePolicyChange = async (side) => {
    if (activeMode === 'upload') {
      setSelectedLegalSide(side);
      runImageInference({ file: selectedImageFile, legalSide: side });
      return;
    }

    try {
      await fetch('/api/parking/rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street_id: selectedStreetId,
          side: side
        })
      });
      fetchCameraAudit(selectedStreetId);
    } catch (e) {
      console.error('Error changing rule:', e);
    }
  };

  // 6. Issue all pending e-challans
  const handleIssueAllChallans = async () => {
    setIsIssuing(true);
    const violatingVehicles = vehicles.filter(v => v.is_violating);
    try {
      const res = await fetch('/api/parking/issue-challans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          street_id: selectedStreetId,
          street_name: street?.name || 'Tumakuru Urban Narrow Corridor',
          vehicles: violatingVehicles
        })
      });
      const data = await res.json();
      setChallanResult(data);

      const challanMap = {};
      (data.challans || []).forEach(ch => {
        challanMap[ch.plate] = ch.challan_number;
        if (ch.vehicle_id) challanMap[ch.vehicle_id] = ch.challan_number;
      });

      const updateVehList = (list) => (list || []).map(v => {
        if (v.is_violating) {
          return {
            ...v,
            challan_issued: true,
            challan_number: challanMap[v.plate] || challanMap[v.id] || `CH-TK-${Date.now()}`,
            dispatch_status: 'DISPATCHED_TO_RTO'
          };
        }
        return v;
      });

      if (activeMode === 'upload' && uploadAuditData) {
        setUploadAuditData(prev => ({
          ...prev,
          parked_vehicles: updateVehList(prev.parked_vehicles),
          carriageway_clearance: {
            ...prev.carriageway_clearance,
            alert_desc: `Law enforcement dispatched: ${data.issued_count} E-Challans logged and transmitted to Tumakuru City Police Officer Portal.`,
            enforcement_dispatched: true
          }
        }));
      } else if (activeMode === 'camera') {
        if (cameraAuditData) {
          setCameraAuditData(prev => ({
            ...prev,
            parked_vehicles: updateVehList(prev.parked_vehicles),
            carriageway_clearance: {
              ...prev.carriageway_clearance,
              alert_desc: `Law enforcement dispatched: ${data.issued_count} E-Challans logged and transmitted to Tumakuru City Police Officer Portal.`,
              enforcement_dispatched: true
            }
          }));
        }
      }
    } catch (e) {
      console.error('Error issuing challans:', e);
    } finally {
      setIsIssuing(false);
    }
  };

  const handleDispatchSingle = async (veh) => {
    try {
      const res = await fetch('/api/parking/dispatch-single-challan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: veh.plate,
          type: veh.type || veh.model,
          fine_amount: veh.fine_amount || 1000,
          side: veh.side,
          confidence: veh.confidence,
          street_name: street?.name || 'Tumakuru Urban Narrow Corridor'
        })
      });
      const data = await res.json();
      
      const markSingle = (list) => (list || []).map(v => {
        if (v.id === veh.id || v.plate === veh.plate) {
          return {
            ...v,
            challan_issued: true,
            challan_number: data.challan_number,
            dispatch_status: 'DISPATCHED_TO_RTO'
          };
        }
        return v;
      });

      if (activeMode === 'upload') {
        setUploadAuditData(prev => ({ ...prev, parked_vehicles: markSingle(prev.parked_vehicles) }));
      } else {
        setCameraAuditData(prev => ({ ...prev, parked_vehicles: markSingle(prev.parked_vehicles) }));
      }

      setChallanResult({
        status: 'success',
        issued_count: 1,
        total_fine_amount: data.fine_amount || 1000,
        challans: [data]
      });
    } catch (e) {
      console.error('Single dispatch error:', e);
    }
  };

  // Active dataset depending on mode
  const currentAudit = activeMode === 'upload' ? uploadAuditData : cameraAuditData;
  const street = currentAudit?.street;
  const policy = activeMode === 'upload' 
    ? { legal_side: selectedLegalSide, prohibited_side: selectedLegalSide === 'LEFT' ? 'RIGHT' : 'LEFT', rule_summary: `Single-Side Rule: Designated ${selectedLegalSide} Curb Only` }
    : currentAudit?.parking_policy;
  const clearance = currentAudit?.carriageway_clearance;
  const summary = currentAudit?.audit_summary;
  const vehicles = currentAudit?.parked_vehicles || [];

  const leftVehicles = vehicles.filter(v => v.side === 'LEFT');
  const rightVehicles = vehicles.filter(v => v.side === 'RIGHT');

  return (
    <main className="parking-container">
      {/* Top Header */}
      <section className="dashboard-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🅿️</span>
            <h1 className="page-title" style={{ margin: 0 }}>NARROW STREET BILATERAL PARKING AI</h1>
            <span className="badge-live" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--neon-amber)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
              AUTONOMOUS CURB AUDITOR
            </span>
          </div>
          <p className="page-desc" style={{ margin: 0 }}>
            Upload any street parking photo or stream from nearest camera beacon. YOLO AI detects vehicles on both curbs, flags wrong-side parking, and prevents emergency passage blockades.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="mode-tabs-container">
          <button 
            onClick={() => setActiveMode('upload')}
            className={`mode-tab-btn ${activeMode === 'upload' ? 'active' : ''}`}
          >
            <span>📸</span> Upload Road Image & Run AI
          </button>
          <button 
            onClick={() => setActiveMode('camera')}
            className={`mode-tab-btn ${activeMode === 'camera' ? 'active' : ''}`}
          >
            <span>📡</span> Live Nearest Camera Beacon
          </button>
        </div>
      </section>

      {/* Upload & Model Inference Control Deck (When in Upload Mode) */}
      {activeMode === 'upload' && (
        <section className="upload-deck">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Quick Test Samples:
              </span>
              <button 
                onClick={() => {
                  setSelectedImageFile(null);
                  runImageInference({ sampleName: 'narrow_street_sample.jpg' });
                }}
                className="sample-preset-pill"
              >
                <span>📸</span> Narrow Street Bilateral Parking (Indian Market Road)
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Road Width:</span>
                <input 
                  type="number" 
                  step="0.1" 
                  min="4.0" 
                  max="14.0"
                  value={inputRoadWidth}
                  onChange={(e) => setInputRoadWidth(parseFloat(e.target.value) || 6.4)}
                  style={{ width: '65px', padding: '0.3rem 0.5rem', background: '#0a0f1a', border: '1px solid var(--border-subtle)', color: 'var(--text-pure)', borderRadius: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>m</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Legal Curb:</span>
                <button 
                  onClick={() => handlePolicyChange('LEFT')}
                  className={`rule-pill ${selectedLegalSide === 'LEFT' ? 'active' : ''}`}
                  style={{ padding: '0.3rem 0.7rem' }}
                >
                  🟢 Left Curb Legal
                </button>
                <button 
                  onClick={() => handlePolicyChange('RIGHT')}
                  className={`rule-pill ${selectedLegalSide === 'RIGHT' ? 'active' : ''}`}
                  style={{ padding: '0.3rem 0.7rem' }}
                >
                  🟢 Right Curb Legal
                </button>
              </div>
            </div>
          </div>

          {/* Drag & Drop File Input */}
          <div 
            className="dropzone-box" 
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              style={{ display: 'none' }} 
            />
            <div style={{ fontSize: '1.8rem' }}>📂</div>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-pure)' }}>
              {selectedImageFile ? `Selected: ${selectedImageFile.name}` : 'Click to Upload Any Street Parking Photo (or Drop Image Here)'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Supports JPG, PNG, WEBP • Automatically detects cars, motorcycles, autos, and flags wrong-side parking
            </div>
          </div>
        </section>
      )}

      {/* KPI Status Ribbon */}
      <section className="kpi-ribbon">
        <div className="kpi-card">
          <div className="kpi-icon">🛣️</div>
          <div className="kpi-info">
            <span className="kpi-label">Road Nominal Width</span>
            <span className="kpi-value">{clearance ? `${clearance.nominal_width_m}m` : `${inputRoadWidth}m`}</span>
            <span className="kpi-sub mono">{street ? street.name : 'Narrow Urban Corridor'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">🎯</div>
          <div className="kpi-info">
            <span className="kpi-label">Vehicles Detected by YOLO</span>
            <span className="kpi-value" style={{ color: 'var(--neon-cyan)' }}>
              {summary ? `${summary.total_detected || summary.total_parked} Total` : '--'}
            </span>
            <span className="kpi-sub mono">
              {summary ? `🟢 ${summary.legal_count} Legal • 🔴 ${summary.violating_count} Wrong-Side` : 'AI Inference'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">⚖️</div>
          <div className="kpi-info">
            <span className="kpi-label">Designated Permitted Curb</span>
            <span className="kpi-value" style={{ color: 'var(--neon-emerald)' }}>
              {policy ? `${policy.legal_side} CURB` : 'LEFT CURB'}
            </span>
            <span className="kpi-sub">
              {policy ? policy.rule_summary : 'Single-side mandate'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">
            {clearance?.emergency_accessible ? '🚑' : '🚨'}
          </div>
          <div className="kpi-info">
            <span className="kpi-label">Passing Carriageway Clearance</span>
            <span className="kpi-value" style={{ color: clearance?.emergency_accessible ? 'var(--neon-emerald)' : '#ef4444' }}>
              {clearance ? `${clearance.effective_clearance_m}m` : '--'}
            </span>
            <span className="kpi-sub" style={{ color: clearance?.emergency_accessible ? 'var(--text-muted)' : '#ef4444' }}>
              {clearance?.emergency_accessible ? '✅ Fire/Ambulance Passable' : '❌ Emergency Access Blocked!'}
            </span>
          </div>
        </div>
      </section>

      {/* Emergency Bilateral Gridlock Alert Banner */}
      {clearance && clearance.severity === 'CRITICAL_BOTTLENECK' && (
        <section className="bilateral-alert-banner">
          <div style={{ fontSize: '2rem' }}>🚨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', textTransform: 'uppercase' }}>
              {clearance.alert_headline}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.85)', marginTop: '0.2rem' }}>
              {clearance.alert_desc}
            </div>
          </div>
          <button 
            onClick={handleIssueAllChallans}
            disabled={isIssuing || vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0}
            className="action-btn"
            style={{ 
              background: vehicles.some(v => v.is_violating && v.challan_issued) && vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0 ? '#10b981' : '#ef4444', 
              color: '#fff', 
              borderColor: vehicles.some(v => v.is_violating && v.challan_issued) && vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0 ? '#10b981' : '#ef4444', 
              fontWeight: 800 
            }}
          >
            {isIssuing 
              ? 'Issuing E-Challans...' 
              : vehicles.some(v => v.is_violating && v.challan_issued) && vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0
                ? '✅ All E-Challans Dispatched'
                : `⚡ Issue Auto E-Challans (₹1,000 × ${vehicles.filter(v => v.is_violating && !v.challan_issued).length || 6})`
            }
          </button>
        </section>
      )}

      {/* Challan Issuance Confirmation Modal / Toast */}
      {challanResult && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', margin: '0.75rem 0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🚔</span>
              <strong style={{ color: '#10b981', fontSize: '0.95rem' }}>
                Successfully Dispatched {challanResult.issued_count} E-Challans to Police Portal!
              </strong>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Total ₹{challanResult.total_fine_amount} recorded in SQLite database. Vehicles marked as dispatched.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a 
              href="/officer" 
              className="action-btn"
              style={{ background: 'var(--neon-cyan)', color: '#050811', textDecoration: 'none', fontWeight: 800, fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
            >
              👮 Review in Officer Portal →
            </a>
            <button onClick={() => setChallanResult(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
        </div>
      )}

      {/* MAIN STAGE: Upload Annotated Vision View vs Top-Down Camera Simulation */}
      {activeMode === 'upload' ? (
        <section className="annotated-vision-stage">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-pure)', margin: 0, textTransform: 'uppercase' }}>
                👁️ AI Computer Vision Perception Stage (YOLOv8 Detection & Curb Clustering)
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Green Bounding Box: Legal Curb ({selectedLegalSide}) • Red Bounding Box: Prohibited Curb Violation ({selectedLegalSide === 'LEFT' ? 'RIGHT' : 'LEFT'}) • Yellow Dashed Line: Center Carriageway Divider
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button 
                onClick={() => setImageViewMode('annotated')}
                className={`rule-pill ${imageViewMode === 'annotated' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.8rem' }}
              >
                🎯 AI Annotated View
              </button>
              <button 
                onClick={() => setImageViewMode('original')}
                className={`rule-pill ${imageViewMode === 'original' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.8rem' }}
              >
                🖼️ Original Photo
              </button>
            </div>
          </div>

          <div className="annotated-img-wrapper">
            {isAnalyzingImage ? (
              <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--neon-cyan)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚡</div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Running YOLOv8 Vehicle Perception & Curb Demarcation...</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  Detecting cars, two-wheelers, calculating lateral road coordinates and carriageway squeezing
                </div>
              </div>
            ) : uploadAuditData ? (
              <img 
                src={imageViewMode === 'annotated' ? uploadAuditData.annotated_image_url : uploadAuditData.original_image_url} 
                alt="AI Parking Audit Perception"
                className="annotated-img-display"
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                No image analyzed yet. Click a preset above or upload an image.
              </div>
            )}
          </div>
        </section>
      ) : (
        /* Camera Beacon Top-Down Stage */
        <section className="roadway-stage">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-pure)', margin: 0, textTransform: 'uppercase' }}>
                🚗 Street Spatial Demarcation & Carriageway Squeeze
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Nearest Camera Perspective Beacon: {street?.nearest_camera?.name || 'CAM-01'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px' }}></span>
                Legal Side ({policy?.legal_side})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px' }}></span>
                Prohibited Side ({policy?.prohibited_side})
              </span>
            </div>
          </div>

          <div className="street-cross-section">
            {/* Left Curb Zone */}
            <div className={`curb-zone ${policy?.legal_side === 'LEFT' ? 'legal-side' : 'prohibited-side'}`}>
              <div className="curb-header">
                <span style={{ fontWeight: 800, fontSize: '0.8rem', color: policy?.legal_side === 'LEFT' ? '#10b981' : '#ef4444' }}>
                  LEFT CURB
                </span>
                <span className={`curb-tag ${policy?.legal_side === 'LEFT' ? 'legal' : 'illegal'}`}>
                  {policy?.legal_side === 'LEFT' ? 'DESIGNATED PARKING' : 'PROHIBITED NO-PARKING'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
                {leftVehicles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    No vehicles parked on left curb
                  </div>
                ) : (
                  leftVehicles.map((v, idx) => (
                    <div key={v.id || idx} className={`vehicle-park-card ${v.is_violating ? 'violating' : 'legal'}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span className="veh-plate">{v.plate}</span>
                        <span className={`veh-status-badge ${v.is_violating ? 'illegal' : 'legal'}`}>
                          {v.is_violating ? 'VIOLATION' : 'LEGAL'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {v.model} • Dwell: {v.dwell_mins}m
                      </div>
                      {v.is_violating && (
                        <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: '0.2rem', fontWeight: 600 }}>
                          Fine: ₹{v.fine_amount} (Wrong-Side Obstruction)
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Center Passing Carriageway */}
            <div className="center-carriageway">
              <div className="road-center-line"></div>

              <div className="carriageway-stats">
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Passing Carriageway Clearance
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: clearance?.emergency_accessible ? 'var(--neon-emerald)' : '#ef4444', margin: '0.3rem 0' }}>
                  {clearance?.effective_clearance_m}m
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Nominal: {clearance?.nominal_width_m}m • Squeezed: {clearance?.obstruction_percentage}%
                </div>

                <div className="clearance-gauge">
                  <div 
                    className="clearance-fill" 
                    style={{ 
                      width: `${clearance?.clearance_percentage || 50}%`,
                      backgroundColor: clearance?.emergency_accessible ? '#10b981' : '#ef4444'
                    }}
                  />
                </div>

                <div style={{ marginTop: '0.8rem', padding: '0.45rem', borderRadius: '4px', background: clearance?.emergency_accessible ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.15)', fontSize: '0.7rem', fontWeight: 700, color: clearance?.emergency_accessible ? '#10b981' : '#ef4444' }}>
                  {clearance?.emergency_accessible 
                    ? '✅ Emergency Vehicles (Ambulance/Fire) Can Pass' 
                    : '🚨 CRITICAL: Fire Engine / Ambulance BLOCKED!'}
                </div>
              </div>
            </div>

            {/* Right Curb Zone */}
            <div className={`curb-zone ${policy?.legal_side === 'RIGHT' ? 'legal-side' : 'prohibited-side'}`}>
              <div className="curb-header">
                <span style={{ fontWeight: 800, fontSize: '0.8rem', color: policy?.legal_side === 'RIGHT' ? '#10b981' : '#ef4444' }}>
                  RIGHT CURB
                </span>
                <span className={`curb-tag ${policy?.legal_side === 'RIGHT' ? 'legal' : 'illegal'}`}>
                  {policy?.legal_side === 'RIGHT' ? 'DESIGNATED PARKING' : 'PROHIBITED NO-PARKING'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
                {rightVehicles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    No vehicles parked on right curb
                  </div>
                ) : (
                  rightVehicles.map((v, idx) => (
                    <div key={v.id || idx} className={`vehicle-park-card ${v.is_violating ? 'violating' : 'legal'}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <span className="veh-plate">{v.plate}</span>
                        <span className={`veh-status-badge ${v.is_violating ? 'illegal' : 'legal'}`}>
                          {v.is_violating ? 'VIOLATION' : 'LEGAL'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {v.model} • Dwell: {v.dwell_mins}m
                      </div>
                      {v.is_violating && (
                        <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: '0.2rem', fontWeight: 600 }}>
                          Fine: ₹{v.fine_amount} (Wrong-Side Obstruction)
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Detailed Vehicles Audit & E-Challan Table */}
      <section className="analytics-deck">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-pure)', margin: 0, textTransform: 'uppercase' }}>
              📋 AI Vehicle Detection Registry & Curb Evidence
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Total Detected: {vehicles.length} Vehicles • Violations: {vehicles.filter(v => v.is_violating).length} (₹1,000 Fine Each)
            </span>
          </div>

          <button 
            onClick={handleIssueAllChallans}
            disabled={isIssuing || vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0}
            className="action-btn"
            style={{ 
              background: vehicles.some(v => v.is_violating && v.challan_issued) && vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0 ? '#10b981' : 'var(--neon-cyan)', 
              color: '#050811', 
              borderColor: vehicles.some(v => v.is_violating && v.challan_issued) && vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0 ? '#10b981' : 'var(--neon-cyan)', 
              fontWeight: 800 
            }}
          >
            <span>⚡</span> 
            {isIssuing 
              ? 'Dispatching E-Challans...' 
              : vehicles.some(v => v.is_violating && v.challan_issued) && vehicles.filter(v => v.is_violating && !v.challan_issued).length === 0
                ? '✅ All Wrong-Side E-Challans Dispatched'
                : `Dispatch All Wrong-Side E-Challans (${vehicles.filter(v => v.is_violating && !v.challan_issued).length || 6})`
            }
          </button>
        </div>

        <table className="parking-audit-table">
          <thead>
            <tr>
              <th>Vehicle ID</th>
              <th>License Plate</th>
              <th>Vehicle Class</th>
              <th>Parked Curb Side</th>
              <th>Dwell / Detection</th>
              <th>Compliance Status</th>
              <th>Violation Penalty</th>
              <th>Audit Reason</th>
              <th style={{ textAlign: 'right' }}>Enforcement Action</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, idx) => (
              <tr key={v.id || idx}>
                <td className="mono">{v.id}</td>
                <td><strong className="mono" style={{ color: 'var(--neon-cyan)' }}>{v.plate}</strong></td>
                <td>{v.model || v.type}</td>
                <td>
                  <span style={{ fontWeight: 800, color: v.side === policy?.legal_side ? '#10b981' : '#ef4444' }}>
                    {v.side} CURB
                  </span>
                </td>
                <td className="mono">{v.dwell_mins ? `${v.dwell_mins} mins` : `${(v.confidence * 100).toFixed(0)}% conf`}</td>
                <td>
                  <span className={`veh-status-badge ${v.challan_issued ? 'legal' : (v.is_violating ? 'illegal' : 'legal')}`} style={{ background: v.challan_issued ? 'rgba(0, 245, 255, 0.15)' : undefined, color: v.challan_issued ? 'var(--neon-cyan)' : undefined, borderColor: v.challan_issued ? 'var(--neon-cyan)' : undefined }}>
                    {v.challan_issued ? '🚨 E-CHALLAN DISPATCHED' : (v.is_violating ? 'WRONG-SIDE PARKING' : 'LEGAL (PERMITTED)')}
                  </span>
                </td>
                <td className="mono" style={{ fontWeight: 800, color: v.is_violating ? '#ef4444' : '#10b981' }}>
                  {v.is_violating ? `₹${v.fine_amount || 1000}` : '₹0'}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                  {v.challan_number ? (
                    <span style={{ color: 'var(--neon-cyan)', fontFamily: 'monospace', fontWeight: 700 }}>
                      Challan #{v.challan_number} (Logged in SQLite)
                    </span>
                  ) : v.violation_reason}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {v.challan_issued ? (
                    <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 800, background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      SENT TO RTO
                    </span>
                  ) : v.is_violating ? (
                    <button 
                      onClick={() => handleDispatchSingle(v)}
                      className="action-btn"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', color: '#ef4444', borderColor: '#ef4444', fontWeight: 700 }}
                    >
                      ⚡ Dispatch
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Legal
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
