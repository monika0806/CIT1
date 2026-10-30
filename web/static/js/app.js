/**
 * OMNITRAFFIC AI — COMMAND CENTER CLIENT CONTROLLER
 * Ultra-Responsive Real-Time Telemetry, Audio Synthesizer, Modal Viewer, and UI State Management
 */

document.addEventListener('DOMContentLoaded', () => {
    // KPI Elements
    const kpiVehicles = document.getElementById('kpi-vehicles');
    const chipVehCount = document.getElementById('chip-veh-count');
    const chipPedCount = document.getElementById('chip-ped-count');
    const kpiCounted = document.getElementById('kpi-counted');
    const kpiInCount = document.getElementById('kpi-in-count');
    const kpiOutCount = document.getElementById('kpi-out-count');
    const kpiDensity = document.getElementById('kpi-density');
    const kpiLos = document.getElementById('kpi-los');
    const kpiViolations = document.getElementById('kpi-violations');
    const kpiRevenue = document.getElementById('kpi-revenue');
    const engineFps = document.getElementById('engine-fps');
    const systemClock = document.getElementById('system-clock');
    const violBadgeCount = document.getElementById('viol-badge-count');

    // Video Enclosure & Controls
    const videoFrameWrap = document.getElementById('video-frame-wrap');
    const mainVideo = document.getElementById('main-video');
    const snapshotBtn = document.getElementById('snapshot-btn');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const camTitle = document.getElementById('cam-title');

    // Ribbon Toggles
    const toggleBoxes = document.getElementById('toggle-boxes');
    const toggleHeatmap = document.getElementById('toggle-heatmap');
    const toggleTripwire = document.getElementById('toggle-tripwire');
    const toggleTracks = document.getElementById('toggle-tracks');
    const toggleViolations = document.getElementById('toggle-violations');
    const directionSelect = document.getElementById('direction-select');

    // Source Selection
    const sourceChips = document.querySelectorAll('.source-chip');
    const uploadTrigger = document.getElementById('upload-trigger');
    const videoUpload = document.getElementById('video-upload');

    // Global Actions
    const resetBtn = document.getElementById('reset-btn');
    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    const audioIcon = document.getElementById('audio-icon');
    const audioText = document.getElementById('audio-text');
    const clearViolationsBtn = document.getElementById('clear-violations-btn');

    // Modal Elements
    const evidenceModal = document.getElementById('evidence-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalImg = document.getElementById('modal-img');
    const modalBadge = document.getElementById('modal-badge');
    const modalChallan = document.getElementById('modal-challan');
    const modalPlate = document.getElementById('modal-plate');
    const modalViolation = document.getElementById('modal-violation');
    const modalFine = document.getElementById('modal-fine');
    const modalTime = document.getElementById('modal-time');

    // Feeds & Classification Bars
    const violationsContainer = document.getElementById('violations-container');
    const classBars = {
        car: { fill: document.getElementById('fill-car'), val: document.getElementById('val-car') },
        motorcycle: { fill: document.getElementById('fill-motorcycle'), val: document.getElementById('val-motorcycle') },
        bus: { fill: document.getElementById('fill-bus'), val: document.getElementById('val-bus') },
        truck: { fill: document.getElementById('fill-truck'), val: document.getElementById('val-truck') },
        bicycle: { fill: document.getElementById('fill-bicycle'), val: document.getElementById('val-bicycle') },
        pedestrian: { fill: document.getElementById('fill-person'), val: document.getElementById('val-person') },
        person: { fill: document.getElementById('fill-person'), val: document.getElementById('val-person') }
    };

    // State
    let audioEnabled = true;
    let knownViolationIds = new Set();
    let currentViolationsData = [];

    // =========================================================================
    // DIGITAL CLOCK
    // =========================================================================
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        if (systemClock) systemClock.textContent = timeStr;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // =========================================================================
    // AUDIO SYNTHESIZER (Pure Web Audio API - Zero External MP3)
    // =========================================================================
    let audioCtx = null;
    function playAlertPing() {
        if (!audioEnabled) return;
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.25);

            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.25);
        } catch (e) {
            // Audio policy blocked
        }
    }

    if (audioToggleBtn) {
        audioToggleBtn.addEventListener('click', () => {
            audioEnabled = !audioEnabled;
            if (audioEnabled) {
                audioIcon.textContent = '🔔';
                audioText.textContent = 'Audio On';
                audioToggleBtn.style.color = 'var(--text-primary)';
                playAlertPing();
            } else {
                audioIcon.textContent = '🔕';
                audioText.textContent = 'Muted';
                audioToggleBtn.style.color = 'var(--text-muted)';
            }
        });
    }

    // =========================================================================
    // THEME SWITCHER CONTROLLER (Dark / Light Theme Persistence)
    // =========================================================================
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');

    function syncThemeUI(theme) {
        if (!themeIcon || !themeText) return;
        if (theme === 'light') {
            themeIcon.textContent = '🌙';
            themeText.textContent = 'Dark Mode';
        } else {
            themeIcon.textContent = '☀️';
            themeText.textContent = 'Light Mode';
        }
    }

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    syncThemeUI(currentTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const active = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = active === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('omnitraffic_theme', next);
            syncThemeUI(next);
        });
    }

    // =========================================================================
    // FEATURE TOGGLES
    // =========================================================================
    function setupToggle(button, featureName) {
        if (!button) return;
        button.addEventListener('click', async () => {
            const isActive = button.classList.contains('active');
            const nextState = !isActive;
            try {
                const res = await fetch('/api/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ feature: featureName, value: nextState })
                });
                if (res.ok) {
                    button.classList.toggle('active', nextState);
                }
            } catch (err) {
                console.error("Error toggling feature:", err);
            }
        });
    }

    setupToggle(toggleBoxes, 'show_boxes');
    setupToggle(toggleHeatmap, 'show_heatmap');
    setupToggle(toggleTripwire, 'show_tripwire');
    setupToggle(toggleTracks, 'show_tracks');
    setupToggle(toggleViolations, 'show_violations');

    // Road Flow Direction
    if (directionSelect) {
        directionSelect.addEventListener('change', async (e) => {
            await fetch('/api/set_direction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction: e.target.value })
            });
        });
    }

    // =========================================================================
    // SOURCE SELECTION CHIPS
    // =========================================================================
    sourceChips.forEach(chip => {
        chip.addEventListener('click', async () => {
            const src = chip.dataset.src;
            if (!src) return; // Upload chip has distinct handler

            sourceChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            if (camTitle) {
                camTitle.textContent = chip.textContent.trim().toUpperCase();
            }

            await fetch('/api/select_source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: src })
            });
            resetLocalCounts();
        });
    });

    // =========================================================================
    // VIDEO UPLOAD WITH GIS LOCATION TAGGING & GPS AUTO CAPTURE
    // =========================================================================
    const uploadModal = document.getElementById('upload-modal');
    const uploadModalClose = document.getElementById('upload-modal-close');
    const uploadCancelBtn = document.getElementById('upload-cancel-btn');
    const uploadDropzone = document.getElementById('upload-dropzone');
    const dropzoneText = document.getElementById('dropzone-text');
    const videoFileInput = document.getElementById('video-file-input');
    const btnAutoGps = document.getElementById('btn-auto-gps');
    const locationPresetSelect = document.getElementById('location-preset-select');
    const uploadCameraAddress = document.getElementById('upload-camera-address');
    const cameraLat = document.getElementById('camera-lat');
    const cameraLng = document.getElementById('camera-lng');
    const cameraNameInput = document.getElementById('camera-name-input');
    const uploadSubmitBtn = document.getElementById('upload-submit-btn');
    const camLocationBadge = document.getElementById('cam-location-badge');
    const camLocationLabel = document.getElementById('cam-location-label');

    let selectedUploadFile = null;

    if (uploadTrigger && uploadModal) {
        uploadTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadModal.classList.add('open', 'active');
        });

        const closeUploadModal = () => {
            uploadModal.classList.remove('open', 'active');
        };
        if (uploadModalClose) uploadModalClose.addEventListener('click', closeUploadModal);
        if (uploadCancelBtn) uploadCancelBtn.addEventListener('click', closeUploadModal);
        uploadModal.addEventListener('click', (e) => {
            if (e.target === uploadModal) closeUploadModal();
        });

        // Dropzone interactions
        if (uploadDropzone && videoFileInput) {
            uploadDropzone.addEventListener('click', () => videoFileInput.click());
            
            uploadDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadDropzone.style.borderColor = 'var(--neon-cyan)';
                uploadDropzone.style.background = 'rgba(0, 245, 255, 0.08)';
            });

            uploadDropzone.addEventListener('dragleave', () => {
                uploadDropzone.style.borderColor = 'var(--border-subtle)';
                uploadDropzone.style.background = 'var(--chip-bg)';
            });

            uploadDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadDropzone.style.borderColor = 'var(--border-subtle)';
                uploadDropzone.style.background = 'var(--chip-bg)';
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    selectedUploadFile = e.dataTransfer.files[0];
                    updateDropzoneDisplay(selectedUploadFile);
                }
            });

            videoFileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    selectedUploadFile = e.target.files[0];
                    updateDropzoneDisplay(selectedUploadFile);
                }
            });
        }

        function updateDropzoneDisplay(file) {
            if (!file) return;
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            if (dropzoneText) {
                dropzoneText.innerHTML = `<strong>✅ ${file.name}</strong> (${sizeMb} MB) <br><small style="color: var(--neon-cyan);">Ready to deploy</small>`;
            }
        }

        // Location Preset Dropdown selection
        if (locationPresetSelect) {
            locationPresetSelect.addEventListener('change', () => {
                const opt = locationPresetSelect.selectedOptions[0];
                if (opt && opt.dataset.lat && opt.dataset.lng) {
                    if (cameraLat) cameraLat.value = opt.dataset.lat;
                    if (cameraLng) cameraLng.value = opt.dataset.lng;
                    if (cameraNameInput && opt.dataset.name) cameraNameInput.value = opt.dataset.name;
                    if (uploadCameraAddress && opt.dataset.address) uploadCameraAddress.value = opt.dataset.address;
                }
            });
        }

        // Auto GPS Detection via HTML5 Geolocation API
        if (btnAutoGps) {
            btnAutoGps.addEventListener('click', () => {
                if (!navigator.geolocation) {
                    alert("Geolocation is not supported by your browser.");
                    return;
                }
                btnAutoGps.innerHTML = '<span>⏳</span> Locating...';
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude.toFixed(6);
                        const lng = position.coords.longitude.toFixed(6);
                        if (cameraLat) cameraLat.value = lat;
                        if (cameraLng) cameraLng.value = lng;
                        if (cameraNameInput) cameraNameInput.value = `Auto GPS Feed (${lat}, ${lng})`;
                        if (uploadCameraAddress) uploadCameraAddress.value = `User Auto-GPS Site [${lat}, ${lng}]`;
                        if (locationPresetSelect) locationPresetSelect.value = 'custom';
                        btnAutoGps.innerHTML = '<span>✅</span> GPS Locked';
                        setTimeout(() => { btnAutoGps.innerHTML = '<span>📍</span> Auto-Detect GPS'; }, 2500);
                    },
                    (error) => {
                        console.warn("GPS error:", error);
                        alert("Could not retrieve current location. Using SIT Tumkur default coordinates.");
                        btnAutoGps.innerHTML = '<span>📍</span> Auto-Detect GPS';
                    },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            });
        }

        // Deploy & Stream Feed Submission
        if (uploadSubmitBtn) {
            uploadSubmitBtn.addEventListener('click', async () => {
                if (!selectedUploadFile) {
                    alert("Please select a video file first.");
                    return;
                }

                const formData = new FormData();
                formData.append('file', selectedUploadFile);
                formData.append('lat', cameraLat ? cameraLat.value : '13.3276');
                formData.append('lng', cameraLng ? cameraLng.value : '77.1259');
                formData.append('location_name', cameraNameInput ? cameraNameInput.value : 'Surveillance Feed');
                formData.append('address', uploadCameraAddress ? uploadCameraAddress.value : 'SIT Campus Arterial, Tumakuru');

                uploadSubmitBtn.innerHTML = '<span>⏳</span> Deploying Stream...';
                uploadSubmitBtn.disabled = true;

                try {
                    const res = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        closeUploadModal();
                        sourceChips.forEach(c => c.classList.remove('active'));
                        uploadTrigger.classList.add('active');

                        if (camTitle) {
                            camTitle.textContent = `📁 ${data.filename.toUpperCase()}`;
                        }
                        if (data.location) {
                            const addrShort = data.location.address ? data.location.address.split(',')[0] : data.location.name;
                            if (camLocationLabel) {
                                camLocationLabel.textContent = `${addrShort} (${Number(data.location.lat).toFixed(4)}, ${Number(data.location.lng).toFixed(4)})`;
                            }
                            if (camLocationBadge) {
                                camLocationBadge.title = `Mapped Site: ${data.location.address || data.location.name} [${data.location.lat}, ${data.location.lng}]`;
                                camLocationBadge.style.display = 'inline-flex';
                            }
                        }
                        resetLocalCounts();
                    } else {
                        alert(data.error || "Failed to upload video.");
                    }
                } catch (err) {
                    console.error("Upload error:", err);
                    alert("Network error during upload.");
                } finally {
                    uploadSubmitBtn.innerHTML = '<span>⬆️</span> Deploy & Stream Feed';
                    uploadSubmitBtn.disabled = false;
                }
            });
        }
    }

    // =========================================================================
    // DEDICATED LOCATION, ADDRESS & GPS EDIT MODAL CONTROLLER
    // =========================================================================
    const btnEditFeedLoc = document.getElementById('btn-edit-feed-loc');
    const locationEditModal = document.getElementById('location-edit-modal');
    const locationModalClose = document.getElementById('location-modal-close');
    const locationModalCancel = document.getElementById('location-modal-cancel');
    const locationModalSave = document.getElementById('location-modal-save');
    const editPresetSelect = document.getElementById('edit-preset-select');
    const editCameraAddress = document.getElementById('edit-camera-address');
    const editCameraLat = document.getElementById('edit-camera-lat');
    const editCameraLng = document.getElementById('edit-camera-lng');
    const editCameraName = document.getElementById('edit-camera-name');
    const btnEditAutoGps = document.getElementById('btn-edit-auto-gps');

    let pickerMap = null;
    let pickerMarker = null;

    function openLocationModal() {
        if (!locationEditModal) return;
        locationEditModal.classList.add('open', 'active');
        
        // Fetch current active camera settings to populate modal
        fetch('/api/camera/location')
            .then(res => res.json())
            .then(data => {
                if (data) {
                    if (editCameraAddress && data.address) editCameraAddress.value = data.address;
                    if (editCameraLat && data.lat) editCameraLat.value = data.lat;
                    if (editCameraLng && data.lng) editCameraLng.value = data.lng;
                    if (editCameraName && data.name) editCameraName.value = data.name;
                    initOrUpdatePickerMap(parseFloat(data.lat) || 13.3276, parseFloat(data.lng) || 77.1259);
                }
            })
            .catch(() => {
                const lat = parseFloat(editCameraLat ? editCameraLat.value : 13.3276);
                const lng = parseFloat(editCameraLng ? editCameraLng.value : 77.1259);
                initOrUpdatePickerMap(lat, lng);
            });
    }

    function closeLocationModal() {
        if (locationEditModal) locationEditModal.classList.remove('open', 'active');
    }

    function initOrUpdatePickerMap(lat, lng) {
        if (typeof L === 'undefined') return;
        const mapContainer = document.getElementById('picker-mini-map');
        if (!mapContainer) return;

        setTimeout(() => {
            if (!pickerMap) {
                pickerMap = L.map('picker-mini-map', {
                    center: [lat, lng],
                    zoom: 15,
                    attributionControl: false
                });

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19
                }).addTo(pickerMap);

                pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMap);

                pickerMarker.on('dragend', function (e) {
                    const pos = e.target.getLatLng();
                    if (editCameraLat) editCameraLat.value = pos.lat.toFixed(6);
                    if (editCameraLng) editCameraLng.value = pos.lng.toFixed(6);
                    if (editPresetSelect) editPresetSelect.value = 'custom';
                });

                pickerMap.on('click', function (e) {
                    pickerMarker.setLatLng(e.latlng);
                    if (editCameraLat) editCameraLat.value = e.latlng.lat.toFixed(6);
                    if (editCameraLng) editCameraLng.value = e.latlng.lng.toFixed(6);
                    if (editPresetSelect) editPresetSelect.value = 'custom';
                });
            } else {
                pickerMap.invalidateSize();
                pickerMap.setView([lat, lng], 15);
                if (pickerMarker) pickerMarker.setLatLng([lat, lng]);
            }
        }, 150);
    }

    if (camLocationBadge) {
        camLocationBadge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openLocationModal();
        });
    }

    if (btnEditFeedLoc) {
        btnEditFeedLoc.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openLocationModal();
        });
    }

    if (locationModalClose) locationModalClose.addEventListener('click', closeLocationModal);
    if (locationModalCancel) locationModalCancel.addEventListener('click', closeLocationModal);
    if (locationEditModal) {
        locationEditModal.addEventListener('click', (e) => {
            if (e.target === locationEditModal) closeLocationModal();
        });
    }

    // Preset selection in Edit Modal
    if (editPresetSelect) {
        editPresetSelect.addEventListener('change', () => {
            const opt = editPresetSelect.selectedOptions[0];
            if (opt && opt.dataset.lat && opt.dataset.lng) {
                const lat = parseFloat(opt.dataset.lat);
                const lng = parseFloat(opt.dataset.lng);
                if (editCameraLat) editCameraLat.value = lat.toFixed(6);
                if (editCameraLng) editCameraLng.value = lng.toFixed(6);
                if (editCameraAddress && opt.dataset.address) editCameraAddress.value = opt.dataset.address;
                if (editCameraName && opt.dataset.name) editCameraName.value = opt.dataset.name;
                initOrUpdatePickerMap(lat, lng);
            }
        });
    }

    // Auto GPS in Edit Modal
    if (btnEditAutoGps) {
        btnEditAutoGps.addEventListener('click', () => {
            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser.");
                return;
            }
            btnEditAutoGps.innerHTML = '<span>⏳</span> Locating...';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    if (editCameraLat) editCameraLat.value = lat.toFixed(6);
                    if (editCameraLng) editCameraLng.value = lng.toFixed(6);
                    if (editPresetSelect) editPresetSelect.value = 'custom';
                    if (editCameraAddress) editCameraAddress.value = `Auto GPS Coordinate Site (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                    btnEditAutoGps.innerHTML = '<span>✅</span> GPS Locked';
                    initOrUpdatePickerMap(lat, lng);
                    setTimeout(() => { btnEditAutoGps.innerHTML = '<span>📍</span> Auto-Detect GPS'; }, 2500);
                },
                (err) => {
                    console.warn("GPS error:", err);
                    alert("Could not retrieve GPS fix. You can click anywhere on the mini map to place the camera pin.");
                    btnEditAutoGps.innerHTML = '<span>📍</span> Auto-Detect GPS';
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        });
    }

    // Save Location, Address & Coordinates
    if (locationModalSave) {
        locationModalSave.addEventListener('click', async () => {
            const lat = parseFloat(editCameraLat ? editCameraLat.value : 13.3276) || 13.3276;
            const lng = parseFloat(editCameraLng ? editCameraLng.value : 77.1259) || 77.1259;
            const name = (editCameraName ? editCameraName.value : '') || 'Surveillance Feed';
            const address = (editCameraAddress ? editCameraAddress.value : '') || 'SIT Tumkur Corridor';

            locationModalSave.innerHTML = '<span>⏳</span> Mapping Internally...';
            locationModalSave.disabled = true;

            try {
                const res = await fetch('/api/camera/location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat, lng, name, address })
                });
                const data = await res.json();
                if (data) {
                    if (camLocationLabel) {
                        const addrShort = (data.address || address).split(',')[0];
                        camLocationLabel.textContent = `${addrShort} (${Number(data.lat).toFixed(4)}, ${Number(data.lng).toFixed(4)})`;
                    }
                    if (camLocationBadge) {
                        camLocationBadge.title = `Mapped Site: ${data.address || address} [${data.lat}, ${data.lng}]`;
                    }
                    if (camTitle && data.name) {
                        camTitle.textContent = data.name.toUpperCase();
                    }
                    closeLocationModal();
                }
            } catch (err) {
                console.error("Failed to update camera location:", err);
                alert("Failed to map camera location to traffic network.");
            } finally {
                locationModalSave.innerHTML = '<span>💾</span> Save & Map Location Internally';
                locationModalSave.disabled = false;
            }
        });
    }

    // =========================================================================
    // SNAPSHOT CAPTURE & FULLSCREEN
    // =========================================================================
    if (snapshotBtn && mainVideo) {
        snapshotBtn.addEventListener('click', () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = mainVideo.naturalWidth || mainVideo.clientWidth || 1280;
                canvas.height = mainVideo.naturalHeight || mainVideo.clientHeight || 720;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);

                const link = document.createElement('a');
                link.download = `OmniTraffic_Snapshot_${Date.now()}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.95);
                link.click();
            } catch (e) {
                console.warn("Snapshot capture handled via stream");
            }
        });
    }

    if (fullscreenBtn && videoFrameWrap) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                videoFrameWrap.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen().catch(err => console.log(err));
            }
        });
    }

    // =========================================================================
    // TABS (VIOLATIONS VS CLASSIFICATION)
    // =========================================================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetTab);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // =========================================================================
    // CLEAR & RESET STATE
    // =========================================================================
    function resetLocalCounts() {
        if (kpiVehicles) kpiVehicles.textContent = '0';
        if (chipVehCount) chipVehCount.textContent = '0';
        if (chipPedCount) chipPedCount.textContent = '0';
        if (kpiCounted) kpiCounted.textContent = '0';
        if (kpiInCount) kpiInCount.textContent = '0';
        if (kpiOutCount) kpiOutCount.textContent = '0';
        if (kpiDensity) kpiDensity.textContent = '0%';
        if (kpiLos) kpiLos.textContent = 'LOS A • Free Flow';

        const categories = ['car', 'motorcycle', 'bus', 'truck', 'bicycle', 'pedestrian'];
        for (const cat of categories) {
            if (classBars[cat]) {
                classBars[cat].fill.style.width = '0%';
                classBars[cat].val.textContent = '0 (0%)';
            }
        }
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            await fetch('/api/reset_counts', { method: 'POST' });
            resetLocalCounts();
        });
    }

    if (clearViolationsBtn) {
        clearViolationsBtn.addEventListener('click', async () => {
            await fetch('/api/clear_violations', { method: 'POST' });
            knownViolationIds.clear();
            currentViolationsData = [];
            if (kpiViolations) kpiViolations.textContent = '0';
            if (kpiRevenue) kpiRevenue.textContent = '₹0';
            if (violBadgeCount) violBadgeCount.textContent = '0';
            renderViolations([]);
        });
    }

    // =========================================================================
    // TELEMETRY POLLER (FPS, DENSITY, CLASSIFICATION, VEHICLES)
    // =========================================================================
    async function updateTelemetry() {
        try {
            const res = await fetch('/api/telemetry');
            if (!res.ok) return;
            const data = await res.json();
            if (!data || Object.keys(data).length === 0) return;

            // Engine FPS
            if (engineFps) engineFps.textContent = `${data.fps ?? 0} FPS`;

            // Active Entities & Split
            const visible = data.classification_visible || {};
            const pedCount = visible['pedestrian'] || visible['person'] || 0;
            const vehCount = data.vehicle_count_visible || 0;
            const totalActive = Math.max(0, Object.values(visible).reduce((a, b) => a + b, 0));

            if (kpiVehicles) {
                if (vehCount === 0 && pedCount > 0) {
                    kpiVehicles.textContent = `${pedCount}`;
                } else {
                    kpiVehicles.textContent = `${totalActive}`;
                }
            }
            if (chipVehCount) chipVehCount.textContent = vehCount;
            if (chipPedCount) chipPedCount.textContent = pedCount;

            // Tripwire Bidirectional
            if (kpiCounted) kpiCounted.textContent = data.total_counted ?? 0;
            if (kpiInCount) kpiInCount.textContent = data.in_count ?? 0;
            if (kpiOutCount) kpiOutCount.textContent = data.out_count ?? 0;

            // Density & Level of Service
            if (data.density) {
                if (kpiDensity) kpiDensity.textContent = `${data.density.congestion_pct}%`;
                if (kpiLos) {
                    const los = data.density.level_of_service;
                    const status = data.density.status;
                    kpiLos.textContent = `LOS ${los} • ${status}`;

                    // Dynamic Color Coding
                    if (los === 'A' || los === 'B') {
                        kpiLos.style.color = 'var(--neon-emerald)';
                        kpiLos.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                        kpiLos.style.background = 'rgba(16, 185, 129, 0.12)';
                    } else if (los === 'C' || los === 'D') {
                        kpiLos.style.color = 'var(--neon-amber)';
                        kpiLos.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                        kpiLos.style.background = 'rgba(245, 158, 11, 0.12)';
                    } else {
                        kpiLos.style.color = 'var(--neon-rose)';
                        kpiLos.style.borderColor = 'rgba(255, 0, 85, 0.4)';
                        kpiLos.style.background = 'rgba(255, 0, 85, 0.12)';
                    }
                }
            }

            // Classification Radar Bars (Fully reset every frame!)
            const totalVis = Math.max(1, totalActive);
            const standardCategories = ['car', 'motorcycle', 'bus', 'truck', 'bicycle', 'pedestrian'];

            for (const cat of standardCategories) {
                const count = visible[cat] || (cat === 'pedestrian' ? (visible['person'] || 0) : 0);
                const pct = totalActive > 0 ? Math.round((count / totalVis) * 100) : 0;
                if (classBars[cat]) {
                    classBars[cat].fill.style.width = `${pct}%`;
                    classBars[cat].val.textContent = `${count} (${pct}%)`;
                }
            }

        } catch (err) {
            // Silently retry
        }
    }

    // =========================================================================
    // VIOLATION & E-CHALLAN FEED POLLER
    // =========================================================================
    async function updateViolations() {
        try {
            const res = await fetch('/api/violations?limit=25');
            if (!res.ok) return;
            const violations = await res.json();
            currentViolationsData = violations || [];

            // Total Violations & Revenue Calculation
            const count = violations.length;
            if (kpiViolations) kpiViolations.textContent = count;
            if (violBadgeCount) violBadgeCount.textContent = count;

            const totalRevenue = violations.reduce((acc, v) => acc + (v.fine_amount || 1000), 0);
            if (kpiRevenue) kpiRevenue.textContent = `₹${totalRevenue.toLocaleString()}`;

            // Check if any new violations arrived to trigger audio ping
            let isNewViolation = false;
            violations.forEach(v => {
                if (v.id && !knownViolationIds.has(v.id)) {
                    knownViolationIds.add(v.id);
                    isNewViolation = true;
                }
            });

            if (isNewViolation && knownViolationIds.size > 1) {
                playAlertPing();
            }

            renderViolations(violations);

        } catch (err) {
            // Silently retry
        }
    }

    function renderViolations(violations) {
        if (!violationsContainer) return;

        if (!violations || violations.length === 0) {
            violationsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-shield">🛡️</div>
                    <h4>All Clear — No Violations</h4>
                    <p>Active surveillance monitoring two-wheelers, wrong-way traffic, and road occupancy in real-time.</p>
                </div>
            `;
            return;
        }

        violationsContainer.innerHTML = violations.map(v => {
            let badgeClass = 'tag-wrong';
            let borderColor = 'var(--neon-rose)';
            if (v.violation_type === 'NO_HELMET') {
                badgeClass = 'tag-helmet';
                borderColor = '#ff3366';
            } else if (v.violation_type === 'TRIPLE_RIDING') {
                badgeClass = 'tag-triple';
                borderColor = '#f59e0b';
            }

            const plate = v.license_plate || `TRACK-${v.track_id || 'NA'}`;
            const fine = v.fine_amount ? `₹${v.fine_amount.toLocaleString()}` : '₹1,000';

            return `
                <div class="violation-card-item" data-id="${v.id}" style="--card-border-color: ${borderColor};">
                    <div class="violation-thumb-box">
                        <img src="${v.snapshot_path}" alt="Infraction Snapshot" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'76\\' height=\\'76\\'><rect width=\\'76\\' height=\\'76\\' fill=\\'%23111\\'/><text x=\\'38\\' y=\\'42\\' fill=\\'%23555\\' font-size=\\'10\\' text-anchor=\\'middle\\'>NO IMAGE</text></svg>'">
                    </div>
                    <div class="violation-meta">
                        <span class="violation-tag ${badgeClass}">${(v.violation_type || 'VIOLATION').replace('_', ' ')}</span>
                        <div class="plate-row">
                            <span>🚘</span> ${plate}
                        </div>
                        <div class="challan-id-row">
                            ${v.challan_number || 'CHALLAN PENDING'} • ${v.timestamp || ''}
                        </div>
                        <div class="fine-row">
                            <span>Fine: ${fine}</span>
                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                <a href="/receipt/${v.id || v.challan_number}" target="_blank" onclick="event.stopPropagation();" style="font-size: 0.68rem; font-weight: 700; color: var(--neon-cyan); text-decoration: none; background: rgba(0, 245, 255, 0.12); padding: 0.15rem 0.45rem; border-radius: 4px; border: 1px solid var(--border-glow);">
                                    🖨️ Receipt
                                </a>
                                <span style="font-size: 0.68rem; color: var(--text-muted);">Inspect ➔</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach click listeners to open detailed Modal
        document.querySelectorAll('.violation-card-item').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id, 10);
                const viol = currentViolationsData.find(x => x.id === id);
                if (viol) openEvidenceModal(viol);
            });
        });
    }

    // =========================================================================
    // MODAL POPUP HANDLER
    // =========================================================================
    function openEvidenceModal(v) {
        if (!evidenceModal) return;

        modalImg.src = v.snapshot_path;
        modalBadge.textContent = (v.violation_type || 'VIOLATION').replace('_', ' ');
        modalChallan.textContent = v.challan_number || `ECH-${v.id}`;
        modalPlate.textContent = v.license_plate || `TRACK-${v.track_id || 'NA'}`;
        modalViolation.textContent = `${v.vehicle_type ? v.vehicle_type.toUpperCase() : 'VEHICLE'} — ${(v.violation_type || 'TRAFFIC VIOLATION').replace('_', ' ')}`;
        modalFine.textContent = v.fine_amount ? `₹${v.fine_amount.toLocaleString()}` : '₹1,000';
        modalTime.textContent = v.timestamp || new Date().toLocaleString();

        const recLink = document.getElementById('modal-receipt-link');
        if (recLink) {
            recLink.href = `/receipt/${v.id || v.challan_number}`;
        }

        evidenceModal.classList.add('open');
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            evidenceModal.classList.remove('open');
        });
    }

    if (evidenceModal) {
        evidenceModal.addEventListener('click', (e) => {
            if (e.target === evidenceModal) {
                evidenceModal.classList.remove('open');
            }
        });
    }

    // =========================================================================
    // POLLING TIMERS
    // =========================================================================
    setInterval(updateTelemetry, 350);
    setInterval(updateViolations, 1400);
    updateTelemetry();
    updateViolations();
});
