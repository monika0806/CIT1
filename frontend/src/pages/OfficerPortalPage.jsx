import React, { useState, useEffect } from 'react';
import EvidenceModal from '../components/EvidenceModal';
import ReceiptModal from '../components/ReceiptModal';
import './OfficerPortalPage.css';

export default function OfficerPortalPage() {
  const [violations, setViolations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [receiptViolation, setReceiptViolation] = useState(null);

  useEffect(() => {
    fetchViolations();
  }, []);

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

  const handleUpdateStatus = (id, newStatus) => {
    setViolations(prev => prev.map(v => (v.id === id ? { ...v, status: newStatus } : v)));
  };

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'var(--card-bg)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', flex: 1, maxWidth: '480px' }}>
          <input 
            type="text" 
            placeholder="Search vehicle number plate or challan ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flow-select" 
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
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
                      onError={(e) => { e.target.src = '/static/images/placeholder.jpg'; }}
                    />
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: 'var(--neon-cyan)', fontWeight: 700 }}>
                    {v.challan_no || `CH-${v.id}`}
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
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      background: v.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : (v.status === 'WAIVED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                      color: v.status === 'APPROVED' ? '#10b981' : (v.status === 'WAIVED' ? '#ef4444' : '#f59e0b')
                    }}>
                      {v.status || 'PENDING'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      <button 
                        onClick={() => handleUpdateStatus(v.id, 'APPROVED')}
                        className="action-btn"
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                        title="Approve Challan"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleUpdateStatus(v.id, 'WAIVED')}
                        className="action-btn"
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                        title="Waive Violation"
                      >
                        Waive
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
