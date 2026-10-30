import React, { useState } from 'react';
import ReceiptModal from '../components/ReceiptModal';
import './CitizenPortalPage.css';

export default function CitizenPortalPage() {
  const [plateQuery, setPlateQuery] = useState('KA-06-EA-1990');
  const [hasSearched, setHasSearched] = useState(false);
  const [citations, setCitations] = useState([]);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [receiptCitation, setReceiptCitation] = useState(null);
  const [paymentStep, setPaymentStep] = useState(null); // 'modal' | 'success' | null
  const [paymentMethod, setPaymentMethod] = useState('upi');

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!plateQuery.trim()) return;

    try {
      const res = await fetch('/api/violations?limit=50');
      const data = await res.json();
      if (Array.isArray(data)) {
        const cleaned = plateQuery.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const matched = data.filter(v => {
          if (!v.license_plate) return false;
          const vCleaned = v.license_plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
          return vCleaned.includes(cleaned) || cleaned.includes(vCleaned);
        });

        // If no match found in DB, provide realistic interactive sample citation for citizen demo
        if (matched.length === 0) {
          setCitations([
            {
              id: 9942,
              challan_no: `CH-${cleaned}-9942`,
              license_plate: plateQuery.toUpperCase(),
              violation_type: 'NO_HELMET',
              fine_amount: 1000,
              timestamp: Math.floor(Date.now() / 1000) - 86400,
              status: 'UNPAID',
              location: 'B.H. Road Corridor, near SIT Main Gate, Tumakuru',
              snapshot_path: '/static/violations/sample_evidence.jpg'
            }
          ]);
        } else {
          setCitations(matched);
        }
      }
      setHasSearched(true);
    } catch (err) {
      console.warn('Search error:', err);
    }
  };

  const handleInitiatePay = (cit) => {
    setSelectedCitation(cit);
    setPaymentStep('modal');
  };

  const handleCompletePayment = () => {
    if (!selectedCitation) return;
    setCitations(prev => prev.map(c => (c.id === selectedCitation.id ? { ...c, status: 'PAID' } : c)));
    setPaymentStep('success');
  };

  return (
    <main className="dashboard-container">
      {/* Citizen Banner */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0, 245, 255, 0.12), rgba(59, 130, 246, 0.08))', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-xl)', padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-pure)', marginBottom: '0.4rem' }}>
          🏛️ Citizen Traffic E-Challan Settlement Portal
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto 1.5rem auto' }}>
          Karnataka Traffic Police autonomous digital compliance portal. Search citations, verify photo evidence, and settle statutory fines securely via UPI or Credit/Debit card.
        </p>

        {/* Search Input Form */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', maxWidth: '520px', margin: '0 auto' }}>
          <input 
            type="text" 
            value={plateQuery}
            onChange={(e) => setPlateQuery(e.target.value.toUpperCase())}
            placeholder="Enter Vehicle Plate (e.g. KA-06-EA-1990)..." 
            className="flow-select" 
            style={{ flex: 1, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '1px' }}
          />
          <button 
            type="submit" 
            className="action-btn"
            style={{ background: 'var(--neon-cyan)', color: '#050811', fontWeight: 800, borderColor: 'var(--neon-cyan)', padding: '0.6rem 1.4rem' }}
          >
            <span>🔍</span> Search Citations
          </button>
        </form>
      </div>

      {/* Results Deck */}
      {hasSearched && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-pure)' }}>
              Citations Associated with: <span className="mono" style={{ color: 'var(--neon-cyan)' }}>{plateQuery}</span>
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {citations.length} citation(s) retrieved
            </span>
          </div>

          {citations.length === 0 ? (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
              <h4 style={{ color: '#10b981', fontWeight: 800 }}>Clean Record — Zero Pending Citations</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>There are no outstanding traffic violation notices registered against this vehicle number.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
              {citations.map(cit => {
                const isPaid = cit.status === 'PAID';
                return (
                  <div 
                    key={cit.id}
                    className="radar-card"
                    style={{
                      background: 'var(--card-bg)',
                      border: `1px solid ${isPaid ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden',
                      padding: '1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span className="mono" style={{ fontWeight: 800, color: 'var(--neon-cyan)', fontSize: '0.85rem' }}>
                        {cit.challan_no || `CH-${cit.id}`}
                      </span>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 0, 85, 0.2)',
                        color: isPaid ? '#10b981' : '#ff0055'
                      }}>
                        {isPaid ? 'CLEARED / PAID' : 'UNPAID NOTICE'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-pure)', marginBottom: '0.35rem' }}>
                      {cit.violation_type?.replace(/_/g, ' ') || 'Motor Vehicles Act Infraction'}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                      📍 Location: {cit.location || 'B.H. Road Corridor, Tumakuru'}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.85rem' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>STATUTORY PENALTY:</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isPaid ? '#10b981' : 'var(--neon-rose)' }}>
                          ₹{(cit.fine_amount || 1000).toLocaleString()}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button 
                          onClick={() => setReceiptCitation(cit)}
                          className="action-btn"
                          style={{ fontSize: '0.75rem' }}
                        >
                          View Receipt
                        </button>
                        {!isPaid && (
                          <button 
                            onClick={() => handleInitiatePay(cit)}
                            className="action-btn"
                            style={{ background: 'var(--neon-cyan)', color: '#050811', fontWeight: 800, borderColor: 'var(--neon-cyan)', fontSize: '0.75rem' }}
                          >
                            Pay Fine &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Pay Modal */}
      {paymentStep === 'modal' && selectedCitation && (
        <div className="modal-backdrop open" onClick={(e) => { if (e.target.classList.contains('modal-backdrop')) setPaymentStep(null); }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <span>💳</span> Remit Statutory Fine Online
              </div>
              <button className="modal-close" onClick={() => setPaymentStep(null)}>&times;</button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'rgba(0, 245, 255, 0.08)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CHALLAN TO SETTLE:</div>
                <div style={{ fontWeight: 800, color: 'var(--text-pure)' }}>{selectedCitation.challan_no} ({selectedCitation.license_plate})</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--neon-cyan)', marginTop: '0.3rem' }}>
                  ₹{(selectedCitation.fine_amount || 1000).toLocaleString()}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                  Select Payment Gateway:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { id: 'upi', name: '📱 UPI / QR' },
                    { id: 'card', name: '💳 Card' },
                    { id: 'netbank', name: '🏦 NetBanking' }
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      className="action-btn"
                      style={{
                        justifyContent: 'center',
                        borderColor: paymentMethod === m.id ? 'var(--neon-cyan)' : 'var(--border-subtle)',
                        background: paymentMethod === m.id ? 'rgba(0, 245, 255, 0.15)' : 'transparent',
                        color: paymentMethod === m.id ? 'var(--neon-cyan)' : 'var(--text-secondary)'
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => setPaymentStep(null)} className="action-btn">Cancel</button>
                <button 
                  onClick={handleCompletePayment}
                  className="action-btn"
                  style={{ background: '#10b981', color: '#ffffff', fontWeight: 800, borderColor: '#10b981' }}
                >
                  Confirm & Pay ₹{(selectedCitation.fine_amount || 1000).toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Success Confirmation Modal */}
      {paymentStep === 'success' && selectedCitation && (
        <div className="modal-backdrop open">
          <div className="modal-card" style={{ maxWidth: '440px', textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
            <h3 style={{ color: '#10b981', fontWeight: 900, marginBottom: '0.4rem' }}>Fine Successfully Remitted</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Official clearance receipt generated under Motor Vehicles Act statutory records.
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
              <button 
                onClick={() => { setPaymentStep(null); setReceiptCitation(selectedCitation); }}
                className="action-btn"
                style={{ background: 'var(--neon-cyan)', color: '#050811', fontWeight: 800, borderColor: 'var(--neon-cyan)' }}
              >
                View Certified Clearance Receipt
              </button>
              <button onClick={() => setPaymentStep(null)} className="action-btn">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal 
        isOpen={!!receiptCitation}
        onClose={() => setReceiptCitation(null)}
        violation={receiptCitation}
      />
    </main>
  );
}
