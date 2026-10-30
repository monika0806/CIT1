import React, { useState, useEffect } from 'react';
import EvidenceModal from '../components/EvidenceModal';
import ReceiptModal from '../components/ReceiptModal';
import './OfficerPortalPage.css';

export default function OfficerPortalPage() {
  // Officer Authentication State
  const [authOfficer, setAuthOfficer] = useState(() => {
    try {
      const saved = sessionStorage.getItem('officer_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [auditNotification, setAuditNotification] = useState('');

  // Dashboard State
  const [violations, setViolations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [receiptViolation, setReceiptViolation] = useState(null);

  useEffect(() => {
    if (authOfficer) {
      fetchViolations();
    }
  }, [authOfficer]);

  const fetchViolations = async () => {
    try {
      const res = await fetch('/api/violations?limit=50');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setViolations(data);
    } catch (e) {
      console.warn('Could not load officer violations:', e);
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError('Please enter both Badge ID / Username and Password.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/officer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.status === 'success') {
        setAuthOfficer(data.officer);
        sessionStorage.setItem('officer_session', JSON.stringify(data.officer));
        fetchViolations();
      } else {
        setLoginError(data.message || 'Access Denied: Invalid Badge ID or Password.');
      }
    } catch (err) {
      // Local fallback in case of network issues
      if (username.toLowerCase() === 'officer' && password === 'police123') {
        const demo = {
          name: 'PSI Rajeshwari K.',
          badge_id: 'TK-PSI-409',
          rank: 'Police Sub-Inspector',
          station: 'Tumakuru South Traffic Division',
          role: 'ENFORCEMENT_OFFICER'
        };
        setAuthOfficer(demo);
        sessionStorage.setItem('officer_session', JSON.stringify(demo));
        fetchViolations();
      } else {
        setLoginError('Server error while authenticating. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAuthOfficer(null);
    sessionStorage.removeItem('officer_session');
    setUsername('');
    setPassword('');
  };

  const handleQuickDemoFill = (usr, pwd) => {
    setUsername(usr);
    setPassword(pwd);
    setLoginError('');
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/violations/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          officer_name: authOfficer ? `${authOfficer.rank} ${authOfficer.name} (${authOfficer.badge_id})` : 'Authorized Officer'
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setViolations(prev => prev.map(v => (v.id === id ? { ...v, status: newStatus } : v)));
        setAuditNotification(`✅ Citation #${id} marked as ${newStatus} by ${authOfficer?.name || 'Officer'}`);
        setTimeout(() => setAuditNotification(''), 4500);
      }
    } catch (e) {
      console.error('Error updating violation status:', e);
      setViolations(prev => prev.map(v => (v.id === id ? { ...v, status: newStatus } : v)));
    }
  };

  // If not logged in, show the secure Officer Login Gate
  if (!authOfficer) {
    return (
      <main className="officer-login-screen">
        <div className="officer-login-card">
          <div className="officer-emblem-wrap">
            <div className="officer-emblem-halo"></div>
            <div className="officer-emblem-icon">👮</div>
          </div>

          <div className="officer-login-header">
            <span className="badge-police-gold">KARNATAKA STATE POLICE • TUMAKURU</span>
            <h1 className="officer-login-title">OFFICER COMMAND & ENFORCEMENT PORTAL</h1>
            <p className="officer-login-subtitle">
              Restricted Law Enforcement System. Authorized Traffic Police personnel only. All access is auditable and logged with Badge ID.
            </p>
          </div>

          {loginError && (
            <div className="officer-login-error">
              <span>⚠️</span>
              <div>{loginError}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="officer-login-form">
            <div className="form-group">
              <label className="form-label">OFFICER USERNAME / BADGE ID</label>
              <div className="input-with-icon">
                <span className="input-icon">👤</span>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. officer, inspector, or TK-PSI-409"
                  className="login-input"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">DEPARTMENT PASSWORD</label>
              <div className="input-with-icon">
                <span className="input-icon">🔒</span>
                <input 
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter enforcement password"
                  className="login-input"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="toggle-pwd-btn"
                >
                  {showPassword ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoggingIn}
              className="btn-officer-login"
            >
              {isLoggingIn ? 'Verifying Credentials...' : '🛡️ Authorize & Enter Officer Portal'}
            </button>
          </form>

          {/* Demo Credentials Quick-Fill Helpers */}
          <div className="officer-demo-accounts">
            <div className="demo-accounts-label">Quick-Fill Authorized Test Credentials:</div>
            <div className="demo-pills-row">
              <button 
                type="button" 
                onClick={() => handleQuickDemoFill('officer', 'police123')}
                className="demo-account-pill"
              >
                👮 <strong>PSI Rajeshwari</strong> (officer / police123)
              </button>
              <button 
                type="button" 
                onClick={() => handleQuickDemoFill('inspector', 'tumakuru123')}
                className="demo-account-pill"
              >
                🛡️ <strong>CI Mohan Kumar</strong> (inspector / tumakuru123)
              </button>
              <button 
                type="button" 
                onClick={() => handleQuickDemoFill('admin', 'police@tumakuru')}
                className="demo-account-pill"
              >
                ⭐ <strong>ACP Command</strong> (admin / police@tumakuru)
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Filtered dataset
  const filteredViolations = violations.filter(v => {
    const matchesSearch = !searchQuery || 
      (v.license_plate && v.license_plate.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (v.challan_no && v.challan_no.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || (v.status || 'PENDING') === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = violations.reduce((acc, v) => acc + (v.fine_amount || 1000), 0);
  const pendingCount = violations.filter(v => !v.status || v.status === 'PENDING').length;
  const approvedCount = violations.filter(v => v.status === 'APPROVED').length;

  return (
    <main className="dashboard-container">
      {/* Authorized Officer Session Header Bar */}
      <section className="officer-session-bar">
        <div className="officer-profile-info">
          <div className="officer-avatar-badge">👮</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1rem', color: '#fff' }}>
                {authOfficer.rank} {authOfficer.name}
              </strong>
              <span className="officer-badge-number">{authOfficer.badge_id}</span>
              <span className="officer-live-status">● AUTHORIZED ENFORCEMENT ACTIVE</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {authOfficer.station} • Tumakuru City Police Department
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            onClick={fetchViolations} 
            className="action-btn"
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
          >
            🔄 Sync Citations
          </button>
          <button 
            onClick={handleLogout} 
            className="btn-officer-logout"
          >
            🔒 Sign Out
          </button>
        </div>
      </section>

      {/* Audit Notification Toast */}
      {auditNotification && (
        <div className="officer-audit-toast">
          <span>{auditNotification}</span>
        </div>
      )}

      {/* Officer Command KPIs */}
      <section className="kpi-ribbon">
        <div className="kpi-card accent-cyan">
          <div className="kpi-icon">👮</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{violations.length}</div>
            <div className="kpi-label">Recorded Infractions</div>
          </div>
        </div>

        <div className="kpi-card accent-amber">
          <div className="kpi-icon">⏳</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{pendingCount}</div>
            <div className="kpi-label">Pending Officer Audit</div>
          </div>
        </div>

        <div className="kpi-card accent-emerald">
          <div className="kpi-icon">✅</div>
          <div className="kpi-content">
            <div className="kpi-val mono">{approvedCount}</div>
            <div className="kpi-label">Approved Legal Citations</div>
          </div>
        </div>

        <div className="kpi-card accent-rose">
          <div className="kpi-icon">💰</div>
          <div className="kpi-content">
            <div className="kpi-val mono">₹{totalRevenue.toLocaleString()}</div>
            <div className="kpi-label">Statutory Fine Revenue</div>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'var(--card-bg)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.6rem', flex: 1, minWidth: '280px', maxWidth: '480px' }}>
          <input 
            type="text" 
            placeholder="Search vehicle number plate or challan ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flow-select" 
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter Status:</span>
          {['ALL', 'PENDING', 'APPROVED', 'WAIVED'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className="action-btn"
              style={{
                fontSize: '0.72rem',
                padding: '0.3rem 0.65rem',
                borderColor: statusFilter === st ? 'var(--neon-cyan)' : 'var(--border-subtle)',
                background: statusFilter === st ? 'rgba(0, 245, 255, 0.12)' : 'transparent',
                color: statusFilter === st ? 'var(--neon-cyan)' : 'var(--text-secondary)'
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Enforcement Ledger Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', minWidth: '800px' }}>
          <thead>
            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.85rem 1rem' }}>EVIDENCE</th>
              <th style={{ padding: '0.85rem 1rem' }}>CHALLAN ID</th>
              <th style={{ padding: '0.85rem 1rem' }}>VEHICLE NUMBER</th>
              <th style={{ padding: '0.85rem 1rem' }}>INFRACTION TYPE</th>
              <th style={{ padding: '0.85rem 1rem' }}>STATUTORY FINE</th>
              <th style={{ padding: '0.85rem 1rem' }}>DATE / TIME</th>
              <th style={{ padding: '0.85rem 1rem' }}>AUDIT STATUS</th>
              <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>OFFICER ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredViolations.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No violation records matching filter criteria.
                </td>
              </tr>
            ) : (
              filteredViolations.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <img 
                      src={v.snapshot_path || ''} 
                      alt="Thumbnail" 
                      onClick={() => setSelectedViolation(v)}
                      style={{ width: '56px', height: '36px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                      onError={(e) => { e.target.src = '/static/violations/sample_parking_viol.jpg'; }}
                    />
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--neon-cyan)', fontWeight: 700 }}>
                    {v.challan_no || v.challan_number || `CH-${v.id}`}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 800 }}>
                    <span className="plate-highlight" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
                      {v.license_plate || 'KA-06-UNIDENTIFIED'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {v.violation_type?.replace(/_/g, ' ') || 'Traffic Infraction'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--neon-emerald)' }}>
                    ₹{(v.fine_amount || 1000).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                    {v.timestamp ? new Date(v.timestamp * 1000).toLocaleDateString() : 'Today'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      background: v.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : (v.status === 'WAIVED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                      color: v.status === 'APPROVED' ? '#10b981' : (v.status === 'WAIVED' ? '#ef4444' : '#f59e0b'),
                      border: `1px solid ${v.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.4)' : (v.status === 'WAIVED' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)')}`
                    }}>
                      {v.status || 'PENDING'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button 
                        onClick={() => handleUpdateStatus(v.id, 'APPROVED')}
                        className="action-btn"
                        style={{ 
                          padding: '0.25rem 0.55rem', 
                          fontSize: '0.7rem', 
                          color: '#10b981', 
                          borderColor: 'rgba(16, 185, 129, 0.4)',
                          background: v.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                          fontWeight: 700
                        }}
                        title="Approve Citation"
                      >
                        ✓ Approve
                      </button>
                      <button 
                        onClick={() => handleUpdateStatus(v.id, 'WAIVED')}
                        className="action-btn"
                        style={{ 
                          padding: '0.25rem 0.55rem', 
                          fontSize: '0.7rem', 
                          color: '#f59e0b', 
                          borderColor: 'rgba(245, 158, 11, 0.4)',
                          background: v.status === 'WAIVED' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                          fontWeight: 700
                        }}
                        title="Waive Violation"
                      >
                        ✕ Waive
                      </button>
                      <button 
                        onClick={() => setReceiptViolation(v)}
                        className="action-btn"
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                        title="View Official Receipt"
                      >
                        Receipt
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
