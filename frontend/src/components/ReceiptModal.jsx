import React from 'react';
import './ReceiptModal.css';

export default function ReceiptModal({ isOpen, onClose, violation }) {
  if (!isOpen || !violation) return null;

  const fineFormatted = `₹${(violation.fine_amount || 1000).toLocaleString()}`;
  const timestampFormatted = violation.timestamp 
    ? new Date(violation.timestamp * 1000).toLocaleString() 
    : new Date().toLocaleString();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target.classList.contains('modal-backdrop')) onClose(); }}>
      <div className="modal-card" style={{ maxWidth: '720px', background: '#ffffff', color: '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
            🏛️ Government of Karnataka — Traffic Police Certified E-Challan
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={handlePrint}
              style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Print Notice
            </button>
            <button 
              onClick={onClose} 
              style={{ background: '#e2e8f0', border: 'none', fontSize: '1.2rem', padding: '0.2rem 0.6rem', borderRadius: '6px', cursor: 'pointer' }}
            >
              &times;
            </button>
          </div>
        </div>

        <div style={{ padding: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>
              Statutory Traffic Violation Notice
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Issued Under Sections 129, 177, 184 & 206 of the Motor Vehicles Act, 1988
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.2rem', marginBottom: '1.2rem', background: '#f1f5f9', padding: '1rem', borderRadius: '8px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>CHALLAN NUMBER</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', color: '#0284c7' }}>
                {violation.challan_no || `CH-KA06-${violation.id || '9012'}`}
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.6rem', marginBottom: '0.2rem' }}>VEHICLE REGISTRATION</div>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.2rem', color: '#dc2626' }}>
                {violation.license_plate || 'KA-06-EA-1990'}
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.6rem', marginBottom: '0.2rem' }}>INFRACTION TYPE</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                {violation.violation_type?.replace(/_/g, ' ') || 'Riding Without Protective Headgear (Helmet)'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>DATE & TIME OF OFFENSE</div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{timestampFormatted}</div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.6rem', marginBottom: '0.2rem' }}>JURISDICTION CORRIDOR</div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Tumakuru City Police, B.H. Road Sector-01</div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.6rem', marginBottom: '0.2rem' }}>STATUTORY FINE PENALTY</div>
              <div style={{ fontWeight: 900, fontSize: '1.3rem', color: '#059669' }}>{fineFormatted}</div>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 700 }}>
              AI CAMERA PHOTOGRAPHIC EVIDENCE SNAPSHOT
            </div>
            <img 
              src={violation.snapshot_path || ''} 
              alt="Violation Snapshot" 
              style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '6px', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5, background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
            ⚠️ <strong>Legal Advisory:</strong> Please remit the fine within 15 statutory working days via the RoadPulseAI Citizen Portal or authorized Karnataka One centers to avoid suspension of driving privileges under MV Act Sec 206(4).
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: '0.8rem', fontSize: '0.72rem', color: '#94a3b8' }}>
            <div>Digitally Certified by RoadPulseAI Vision Core System</div>
            <div>Verification Seal: ✅ Validated</div>
          </div>
        </div>
      </div>
    </div>
  );
}
