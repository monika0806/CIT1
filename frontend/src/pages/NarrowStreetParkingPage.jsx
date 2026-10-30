import React, { useState, useEffect } from 'react';
import './NarrowStreetParkingPage.css';

export default function NarrowStreetParkingPage() {
  const [streets, setStreets] = useState([]);
  const [selectedStreetId, setSelectedStreetId] = useState('NST-01');
  const [auditData, setAuditData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [challanResult, setChallanResult] = useState(null);
  const [isIssuing, setIsIssuing] = useState(false);

  // 1. Fetch all monitored narrow streets
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

  // 2. Poll audit data for selected street
  const fetchAudit = async (streetId) => {
    try {
      const res = await fetch(`/api/parking/analyze?street_id=${streetId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success') {
        setAuditData(data);
      }
    } catch (e) {
      console.warn('Error fetching parking audit:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedStreetId) return;
    setIsLoading(true);
    fetchAudit(selectedStreetId);

    const interval = setInterval(() => {
      fetchAudit(selectedStreetId);
    }, 3500);

    return () => clearInterval(interval);
  }, [selectedStreetId]);

  // 3. Handle manual policy override
  const handlePolicyChange = async (side) => {
    try {
      await fetch('/api/parking/rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street_id: selectedStreetId,
          side: side // "LEFT", "RIGHT", or null (reset to policy)
        })
      });
      fetchAudit(selectedStreetId);
    } catch (e) {
      console.error('Error changing rule:', e);
    }
  };

  // 4. Issue all pending e-challans
  const handleIssueAllChallans = async () => {
    setIsIssuing(true);
    try {
      const res = await fetch('/api/parking/issue-challans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ street_id: selectedStreetId })
      });
      const data = await res.json();
      setChallanResult(data);
      fetchAudit(selectedStreetId);
    } catch (e) {
      console.error('Error issuing challans:', e);
    } finally {
      setIsIssuing(false);
    }
  };

  const street = auditData?.street;
  const policy = auditData?.parking_policy;
  const clearance = auditData?.carriageway_clearance;
  const summary = auditData?.audit_summary;
  const vehicles = auditData?.parked_vehicles || [];

  const leftVehicles = vehicles.filter(v => v.side === 'LEFT');
  const rightVehicles = vehicles.filter(v => v.side === 'RIGHT');

  return (
    <main className="parking-container">
      {/* Top Header & Context */}
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
            Analyzes narrow urban corridors from the nearest camera beacon to enforce single-side parking mandates and prevent emergency passage gridlock.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <select 
            value={selectedStreetId} 
            onChange={(e) => setSelectedStreetId(e.target.value)}
            className="flow-select"
            style={{ minWidth: '280px' }}
          >
            {streets.map(s => (
              <option key={s.id} value={s.id}>
                📍 {s.name} ({s.nominal_width_m}m)
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* KPI Status Ribbon */}
      <section className="kpi-ribbon">
        <div className="kpi-card">
          <div className="kpi-icon">🛣️</div>
          <div className="kpi-info">
            <span className="kpi-label">Road Nominal Width</span>
            <span className="kpi-value">{clearance ? `${clearance.nominal_width_m}m` : '--'}</span>
            <span className="kpi-sub mono">{street ? street.corridor : 'Corridor'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">📷</div>
          <div className="kpi-info">
            <span className="kpi-label">Nearest Camera Beacon</span>
            <span className="kpi-value" style={{ fontSize: '1.1rem' }}>
              {street?.nearest_camera ? street.nearest_camera.id : 'CAM-01'}
            </span>
            <span className="kpi-sub mono">
              {street?.nearest_camera ? `${street.nearest_camera.lat.toFixed(4)}, ${street.nearest_camera.lng.toFixed(4)}` : 'SIT Beacon'}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">⚖️</div>
          <div className="kpi-info">
            <span className="kpi-label">Designated Legal Curb</span>
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
            <span className="kpi-label">Carriageway Clearance</span>
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
            disabled={isIssuing}
            className="action-btn"
            style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444', fontWeight: 800 }}
          >
            {isIssuing ? 'Issuing E-Challans...' : '⚡ Issue Auto E-Challans (₹1,000)'}
          </button>
        </section>
      )}

      {/* Challan Issuance Confirmation Modal / Toast */}
      {challanResult && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ color: '#10b981' }}>✅ Successfully Issued {challanResult.issued_count} E-Challans:</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
              Total ₹{challanResult.total_fine_amount} fine recorded in SQLite database.
            </span>
          </div>
          <button onClick={() => setChallanResult(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* Policy Override & Rule Control Bar */}
      <section className="rule-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Municipal Side Rule Control:
          </span>
          <div className="rule-pill-group">
            <button 
              onClick={() => handlePolicyChange(null)}
              className={`rule-pill ${!street?.manual_side_override ? 'active' : ''}`}
            >
              📅 Auto (Policy / Odd-Even)
            </button>
            <button 
              onClick={() => handlePolicyChange('LEFT')}
              className={`rule-pill ${policy?.legal_side === 'LEFT' && street?.manual_side_override === 'LEFT' ? 'active' : ''}`}
            >
              🟢 Force Left Curb Legal
            </button>
            <button 
              onClick={() => handlePolicyChange('RIGHT')}
              className={`rule-pill ${policy?.legal_side === 'RIGHT' && street?.manual_side_override === 'RIGHT' ? 'active' : ''}`}
            >
              🟢 Force Right Curb Legal
            </button>
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Compliance Rate: </span>
          <strong style={{ color: 'var(--neon-cyan)' }}>{summary?.compliance_rate || '--'}</strong>
          <span style={{ margin: '0 0.5rem' }}>•</span>
          <span>Violations: </span>
          <strong style={{ color: '#ef4444' }}>{summary?.violating_count || 0} Vehicles</strong>
        </div>
      </section>

      {/* Main Roadway Interactive Cross-Section Stage */}
      <section className="roadway-stage">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-pure)', margin: 0, textTransform: 'uppercase' }}>
              🚗 Street Spatial Demarcation & Carriageway Squeeze
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Nearest Camera Perspective Beacon: {street?.nearest_camera?.name}
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

        {/* 3-Column Top-Down Roadway Cross-Section */}
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

          {/* Center Carriageway (Passing Lane) */}
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

      {/* Detailed Vehicles Audit & E-Challan Table */}
      <section className="analytics-deck">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-pure)', margin: 0, textTransform: 'uppercase' }}>
            📋 Live Curb Vehicles Audit & E-Challan Registry
          </h3>
          <button 
            onClick={handleIssueAllChallans}
            disabled={isIssuing || summary?.violating_count === 0}
            className="action-btn"
            style={{ 
              background: 'var(--neon-cyan)', 
              color: '#050811', 
              borderColor: 'var(--neon-cyan)', 
              fontWeight: 800 
            }}
          >
            <span>⚡</span> Dispatch All Wrong-Side E-Challans
          </button>
        </div>

        <table className="parking-audit-table">
          <thead>
            <tr>
              <th>Vehicle ID</th>
              <th>License Plate</th>
              <th>Model / Type</th>
              <th>Parked Curb Side</th>
              <th>Dwell Time</th>
              <th>Compliance Status</th>
              <th>Violation Penalty</th>
              <th>Audit Reason</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, idx) => (
              <tr key={v.id || idx}>
                <td className="mono">{v.id}</td>
                <td><strong className="mono" style={{ color: 'var(--neon-cyan)' }}>{v.plate}</strong></td>
                <td>{v.model}</td>
                <td>
                  <span style={{ fontWeight: 800, color: v.side === policy?.legal_side ? '#10b981' : '#ef4444' }}>
                    {v.side} CURB
                  </span>
                </td>
                <td className="mono">{v.dwell_mins} mins</td>
                <td>
                  <span className={`veh-status-badge ${v.is_violating ? 'illegal' : 'legal'}`}>
                    {v.is_violating ? 'WRONG-SIDE PARKING' : 'LEGAL (PERMITTED)'}
                  </span>
                </td>
                <td className="mono" style={{ fontWeight: 800, color: v.is_violating ? '#ef4444' : '#10b981' }}>
                  {v.is_violating ? `₹${v.fine_amount}` : '₹0'}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                  {v.violation_reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
