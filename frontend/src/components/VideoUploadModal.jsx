import React, { useState, useRef } from 'react';
import './VideoUploadModal.css';

const PRESETS = [
  { id: 'custom', name: '-- Choose Location Preset or Enter GPS --' },
  { id: 'J1', name: '🏫 SIT Main Gate (BH Road Arterial)', lat: 13.3276, lng: 77.1259, address: 'B.H. Road, SIT Campus Main Entrance, Tumakuru, Karnataka 572103', feedName: 'SIT Main Gate CCTV 01' },
  { id: 'J3', name: '🛣️ Batawadi Junction (NH-48 Feeder / Toll link)', lat: 13.3342, lng: 77.1352, address: 'Batawadi Toll Link & NH-48 Express Feeder, Tumakuru, Karnataka', feedName: 'Batawadi Toll Link CCTV' },
  { id: 'J4', name: '🏢 SIT Back Gate & Engineering Hostel Zone', lat: 13.3238, lng: 77.1285, address: 'SIT Back Gate & Engineering Hostel Zone Road, Tumakuru, Karnataka', feedName: 'SIT Back Gate CCTV' },
  { id: 'J2', name: '🏘️ Gandhi Nagar / SIT 2nd Cross Commercial', lat: 13.3308, lng: 77.1228, address: 'Gandhi Nagar Main Commercial Street, SIT 2nd Cross, Tumakuru', feedName: 'Gandhi Nagar Commercial CCTV' },
  { id: 'J5', name: '🛕 Kyathsandra Road / Siddaganga Math Access', lat: 13.3182, lng: 77.1425, address: 'Kyathsandra Road, Siddaganga Math Access Arterial, Tumakuru', feedName: 'Kyathsandra Math Access CCTV' },
  { id: 'J6', name: '⭕ SS Puram / Ashoka Road Roundabout', lat: 13.3355, lng: 77.1165, address: 'SS Puram Circle, Ashoka Road Roundabout, Tumakuru', feedName: 'SS Puram Roundabout CCTV' },
  { id: 'J7', name: '🚆 Tumakuru Central Railway Corridor', lat: 13.3392, lng: 77.1085, address: 'Station Road, Tumakuru Central Railway Corridor, Tumakuru', feedName: 'Railway Station Corridor CCTV' },
  { id: 'J8', name: '🏛️ Town Hall Municipal Circle (City Core)', lat: 13.3420, lng: 77.1020, address: 'Town Hall Circle, B.H. Road City Core, Tumakuru', feedName: 'Town Hall Circle CCTV' }
];

export default function VideoUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [address, setAddress] = useState('B.H. Road, SIT Campus Main Entrance, Tumakuru, Karnataka 572103');
  const [lat, setLat] = useState('13.3276');
  const [lng, setLng] = useState('77.1259');
  const [feedName, setFeedName] = useState('SIT Main Gate CCTV 01');
  const [selectedPreset, setSelectedPreset] = useState('J1');
  const [isUploading, setIsUploading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('📍 Auto-Detect GPS');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handlePresetChange = (e) => {
    const val = e.target.value;
    setSelectedPreset(val);
    const found = PRESETS.find(p => p.id === val);
    if (found && found.lat) {
      setLat(String(found.lat));
      setLng(String(found.lng));
      setAddress(found.address);
      if (found.feedName) setFeedName(found.feedName);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleAutoGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setGpsStatus('⏳ Locating...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gLat = pos.coords.latitude.toFixed(6);
        const gLng = pos.coords.longitude.toFixed(6);
        setLat(gLat);
        setLng(gLng);
        setSelectedPreset('custom');
        setFeedName(`Auto GPS Feed (${gLat}, ${gLng})`);
        setAddress(`User Auto-GPS Site [${gLat}, ${gLng}], Tumakuru`);
        setGpsStatus('✅ GPS Locked');
        setTimeout(() => setGpsStatus('📍 Auto-Detect GPS'), 2500);
      },
      (err) => {
        console.warn('GPS error:', err);
        alert('Could not retrieve current location.');
        setGpsStatus('📍 Auto-Detect GPS');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      alert('Please select a video file first.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('lat', lat || '13.3276');
    formData.append('lng', lng || '77.1259');
    formData.append('location_name', feedName || 'Surveillance Feed');
    formData.append('address', address || 'SIT Campus Arterial, Tumakuru');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (onUploadSuccess) onUploadSuccess(data);
        onClose();
      } else {
        alert(data.error || 'Failed to upload video.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Network error during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target.classList.contains('modal-backdrop')) onClose(); }}>
      <div className="modal-card" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <span>📡</span> Deploy Video Feed with GIS Location Tag
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', padding: '1.25rem' }}>
          {/* File Picker Dropzone */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-pure)', display: 'block', marginBottom: '0.4rem' }}>
              1. Select Surveillance Video File:
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? 'var(--neon-cyan)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragging ? 'rgba(0, 245, 255, 0.08)' : 'var(--chip-bg)',
                transition: 'var(--transition-fast)'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>📹</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {selectedFile ? (
                  <>
                    <strong style={{ color: 'var(--neon-emerald)' }}>✅ {selectedFile.name}</strong> ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                    <br /><small style={{ color: 'var(--neon-cyan)' }}>Ready to deploy to AI Pipeline</small>
                  </>
                ) : (
                  'Click to Browse or Drag & Drop Video File (.mp4, .avi, .mov)'
                )}
              </div>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="video/*" 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
              />
            </div>
          </div>

          {/* Location Selector & GPS Auto Capture */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-pure)' }}>
                2. GIS Location & Intersection Coordinates:
              </label>
              <button 
                type="button" 
                onClick={handleAutoGps}
                className="action-btn" 
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', color: 'var(--neon-cyan)', borderColor: 'var(--neon-cyan)' }}
              >
                {gpsStatus}
              </button>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <select 
                value={selectedPreset} 
                onChange={handlePresetChange}
                className="flow-select" 
                style={{ width: '100%' }}
              >
                {PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Location Address (User Uploaded) */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                Location Address (Street / Landmark / Area):
              </label>
              <input 
                type="text" 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="flow-select" 
                style={{ width: '100%' }} 
                placeholder="e.g. B.H. Road, SIT Campus Main Gate, Tumakuru"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Latitude (Decimals):
                </label>
                <input 
                  type="number" 
                  step="0.000001" 
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="flow-select" 
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                  Longitude (Decimals):
                </label>
                <input 
                  type="number" 
                  step="0.000001" 
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="flow-select" 
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                Surveillance Camera Name / Identifier:
              </label>
              <input 
                type="text" 
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                className="flow-select" 
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'rgba(0, 245, 255, 0.08)', borderLeft: '3px solid var(--neon-cyan)', padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
            ℹ️ Real-time video detection vehicle volume will be mapped automatically to this <strong>Address & GPS Location</strong> on the RoadPulseAI GIS Heatmap and AI Route Planner.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="action-btn">Cancel</button>
            <button 
              type="button" 
              onClick={handleSubmit}
              disabled={isUploading}
              className="action-btn" 
              style={{ background: 'var(--neon-cyan)', color: '#050811', fontWeight: 800, borderColor: 'var(--neon-cyan)' }}
            >
              <span>⬆️</span> {isUploading ? 'Deploying Stream...' : 'Deploy & Stream Feed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
