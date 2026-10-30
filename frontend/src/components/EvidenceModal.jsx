import React from 'react';
import './EvidenceModal.css';

export default function EvidenceModal({ isOpen, onClose, violation, onOpenReceipt }) {
  if (!isOpen || !violation) return null;

  const fineFormatted = `₹${(violation.fine_amount || 1000).toLocaleString()}`;
  const timestampFormatted = violation.timestamp 
    ? new Date(violation.timestamp * 1000).toLocaleString() 
    : new Date().toLocaleString();

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target.classList.contains('modal-backdrop')) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title">
            <span>📑</span> Official E-Challan Evidence Notice
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="modal-img-wrap">
            <img 
              src={violation.snapshot_path || ''} 
              alt="Evidence Snapshot" 
              onError={(e) => { 
                e.currentTarget.onerror = null; 
                e.currentTarget.src = '/static/images/placeholder.jpg'; 
              }}
            />
          </div>

          <div className="modal-info-col">
            <div className="challan-badge">
              {violation.violation_type?.replace(/_/g, ' ') || 'VIOLATION'}
            </div>

            <div className="info-row">
              <span className="info-k">Challan No:</span>
              <span className="info-v mono">{violation.challan_no || `CH-${violation.id}`}</span>
            </div>

            <div className="info-row">
              <span className="info-k">License Plate:</span>
              <span className="info-v mono plate-highlight">{violation.license_plate || 'KA-06-UNIDENTIFIED'}</span>
            </div>

            <div className="info-row">
              <span className="info-k">Infraction Type:</span>
              <span className="info-v">{violation.violation_type?.replace(/_/g, ' ') || 'Traffic Non-Compliance'}</span>
            </div>

            <div className="info-row">
              <span className="info-k">Statutory Penalty:</span>
              <span className="info-v fine">{fineFormatted}</span>
            </div>

            <div className="info-row">
              <span className="info-k">Detection Time:</span>
              <span className="info-v">{timestampFormatted}</span>
            </div>

            <div className="info-row">
              <span className="info-k">Statute Code:</span>
              <span className="info-v code-statute">MV Act Sec 129 / 177 / 184</span>
            </div>

            <button 
              type="button" 
              onClick={() => { onClose(); onOpenReceipt(violation); }} 
              className="modal-print-btn"
              style={{ cursor: 'pointer', border: 'none', width: '100%' }}
            >
              <span>🖨️</span> Open Legal Certified Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
