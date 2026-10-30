import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LocationEditModal.css';

const PRESETS = [
  { id: 'custom', name: '-- Custom Location (Type Address & Coordinates or Click Map) --' },
  { id: 'J1', name: '🏫 SIT Main Gate (BH Road Corridor)', lat: 13.3276, lng: 77.1259, address: 'B.H. Road, SIT Campus Main Entrance, Tumakuru, Karnataka 572103', feedName: 'CAM-01: HIGHWAY ARTERIAL' },
  { id: 'J3', name: '🛣️ Batawadi Junction (NH-48 Feeder)', lat: 13.3342, lng: 77.1352, address: 'Batawadi Toll Link & NH-48 Express Feeder, Tumakuru, Karnataka', feedName: 'CAM-02: BATAWADI OVERPASS' },
  { id: 'J4', name: '🏢 SIT Back Gate & Hostel Zone', lat: 13.3238, lng: 77.1285, address: 'SIT Back Gate & Engineering Hostel Zone Road, Tumakuru, Karnataka', feedName: 'CAM-03: SIT BACK GATE' },
  { id: 'J2', name: '🏘️ Gandhi Nagar / SIT 2nd Cross', lat: 13.3308, lng: 77.1228, address: 'Gandhi Nagar Main Commercial Street, SIT 2nd Cross, Tumakuru', feedName: 'CAM-04: GANDHI NAGAR' },
  { id: 'J5', name: '🛕 Kyathsandra Math Access Arterial', lat: 13.3182, lng: 77.1425, address: 'Kyathsandra Road, Siddaganga Math Access Arterial, Tumakuru', feedName: 'CAM-05: KYATHSANDRA CORRIDOR' },
  { id: 'J6', name: '⭕ SS Puram / Ashoka Roundabout', lat: 13.3355, lng: 77.1165, address: 'SS Puram Circle, Ashoka Road Roundabout, Tumakuru', feedName: 'CAM-06: SS PURAM CIRCLE' },
  { id: 'J7', name: '🚆 Tumakuru Central Railway Corridor', lat: 13.3392, lng: 77.1085, address: 'Station Road, Tumakuru Central Railway Corridor, Tumakuru', feedName: 'CAM-07: RAILWAY CORRIDOR' },
  { id: 'J8', name: '🏛️ Town Hall Municipal Circle', lat: 13.3420, lng: 77.1020, address: 'Town Hall Circle, B.H. Road City Core, Tumakuru', feedName: 'CAM-08: TOWN HALL CIRCLE' }
];

export default function LocationEditModal({ isOpen, onClose, currentLocation, onLocationUpdated }) {
  const [address, setAddress] = useState(currentLocation?.address || 'B.H. Road, SIT Campus Main Entrance, Tumakuru');
  const [lat, setLat] = useState(currentLocation?.lat || 13.3276);
  const [lng, setLng] = useState(currentLocation?.lng || 77.1259);
  const [name, setName] = useState(currentLocation?.name || 'CAM-01: HIGHWAY ARTERIAL');
  const [selectedPreset, setSelectedPreset] = useState('J1');
  const [isSaving, setIsSaving] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('📍 Auto-Detect GPS');

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (currentLocation) {
      setAddress(currentLocation.address || 'B.H. Road, SIT Campus Main Entrance, Tumakuru');
      setLat(currentLocation.lat || 13.3276);
      setLng(currentLocation.lng || 77.1259);
      setName(currentLocation.name || 'CAM-01: HIGHWAY ARTERIAL');
    }
  }, [currentLocation]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      const currentLat = parseFloat(lat) || 13.3276;
      const currentLng = parseFloat(lng) || 77.1259;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [currentLat, currentLng],
          zoom: 15,
          attributionControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        const marker = L.marker([currentLat, currentLng], { draggable: true }).addTo(map);

        marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          setLat(parseFloat(pos.lat.toFixed(6)));
          setLng(parseFloat(pos.lng.toFixed(6)));
          setSelectedPreset('custom');
        });

        map.on('click', (e) => {
          marker.setLatLng(e.latlng);
          setLat(parseFloat(e.latlng.lat.toFixed(6)));
          setLng(parseFloat(e.latlng.lng.toFixed(6)));
          setSelectedPreset('custom');
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
      } else {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([currentLat, currentLng], 15);
        if (markerRef.current) markerRef.current.setLatLng([currentLat, currentLng]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isOpen, lat, lng]);

  const handlePresetChange = (e) => {
    const val = e.target.value;
    setSelectedPreset(val);
    const found = PRESETS.find(p => p.id === val);
    if (found && found.lat && found.lng) {
      setLat(found.lat);
      setLng(found.lng);
      setAddress(found.address);
      if (found.feedName) setName(found.feedName);
      if (mapInstanceRef.current && markerRef.current) {
        mapInstanceRef.current.setView([found.lat, found.lng], 15);
        markerRef.current.setLatLng([found.lat, found.lng]);
      }
    }
  };

  const handleAutoGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setGpsStatus('⏳ Locating GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gLat = parseFloat(pos.coords.latitude.toFixed(6));
        const gLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(gLat);
        setLng(gLng);
        setSelectedPreset('custom');
        setAddress(`User Auto-GPS Location [${gLat}, ${gLng}], Tumakuru`);
        setGpsStatus('✅ GPS Locked');
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([gLat, gLng], 15);
          markerRef.current.setLatLng([gLat, gLng]);
        }
        setTimeout(() => setGpsStatus('📍 Auto-Detect GPS'), 2500);
      },
      (err) => {
        console.warn('GPS error:', err);
        alert('Could not retrieve exact GPS fix. You can click anywhere on the mini map to place coordinates.');
        setGpsStatus('📍 Auto-Detect GPS');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/camera/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          name,
          address
        })
      });
      const data = await res.json();
      if (onLocationUpdated) onLocationUpdated(data);
      onClose();
    } catch (err) {
      console.error('Failed to update location:', err);
      alert('Failed to update location on the traffic network.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target.classList.contains('modal-backdrop')) onClose(); }}>
      <div className="modal-card" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <span>📍</span> Set Surveillance Location, Address & Coordinates
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0, 245, 255, 0.08)', borderLeft: '3px solid var(--neon-cyan)', padding: '0.6rem 0.85rem', borderRadius: '4px', lineHeight: 1.45 }}>
            ℹ️ <strong>Internal Traffic Flow Mapping:</strong> Both the <strong>Location Address</strong> and <strong>Latitude & Longitude</strong> entered here will be mapped internally to the RoadPulseAI traffic engine, GIS congestion heatmap (green/orange/red thresholds), and AI route planner.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-pure)' }}>
              Quick Presets or Auto-Capture:
            </label>
            <button 
              type="button" 
              onClick={handleAutoGps}
              className="action-btn" 
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.72rem', color: 'var(--neon-cyan)', borderColor: 'var(--neon-cyan)' }}
            >
              {gpsStatus}
            </button>
          </div>

          <div>
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

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              📍 Location Address (Street / Landmark / Area):
            </label>
            <input 
              type="text" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="flow-select" 
              style={{ width: '100%' }} 
              placeholder="e.g. B.H. Road, opposite SIT Main Gate, Tumakuru"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                🌐 Latitude (Decimals):
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
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                🌐 Longitude (Decimals):
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
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              📹 Surveillance Feed Identifier / Name:
            </label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flow-select" 
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              🗺️ Visual Map Pin (Click anywhere to update coordinates):
            </label>
            <div 
              ref={mapContainerRef} 
              style={{ height: '160px', width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden', position: 'relative' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.3rem' }}>
            <button type="button" onClick={onClose} className="action-btn">Cancel</button>
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={isSaving}
              className="action-btn" 
              style={{ background: 'var(--neon-cyan)', color: '#050811', fontWeight: 800, borderColor: 'var(--neon-cyan)' }}
            >
              <span>💾</span> {isSaving ? 'Mapping Internally...' : 'Save & Map Location Internally'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
