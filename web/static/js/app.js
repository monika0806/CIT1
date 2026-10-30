/**
 * OmniTraffic AI - Real-Time Dashboard Client Controller
 * Dynamically binds HUD telemetry, live violation feed, classification charts, and feature toggles.
 */

document.addEventListener('DOMContentLoaded', () => {
    // KPI Elements
    const kpiVehicles = document.getElementById('kpi-vehicles');
    const kpiCounted = document.getElementById('kpi-counted');
    const kpiDensity = document.getElementById('kpi-density');
    const kpiLos = document.getElementById('kpi-los');
    const kpiViolations = document.getElementById('kpi-violations');
    const kpiFps = document.getElementById('kpi-fps');

    // Controls
    const toggleBoxes = document.getElementById('toggle-boxes');
    const toggleHeatmap = document.getElementById('toggle-heatmap');
    const toggleTripwire = document.getElementById('toggle-tripwire');
    const toggleTracks = document.getElementById('toggle-tracks');
    const toggleViolations = document.getElementById('toggle-violations');
    const directionSelect = document.getElementById('direction-select');
    const sourceSelect = document.getElementById('source-select');
    const videoUpload = document.getElementById('video-upload');
    const resetBtn = document.getElementById('reset-btn');

    // Feeds & Breakdown
    const violationsContainer = document.getElementById('violations-container');
    const classBars = {
        car: { fill: document.getElementById('fill-car'), val: document.getElementById('val-car') },
        motorcycle: { fill: document.getElementById('fill-motorcycle'), val: document.getElementById('val-motorcycle') },
        bus: { fill: document.getElementById('fill-bus'), val: document.getElementById('val-bus') },
        truck: { fill: document.getElementById('fill-truck'), val: document.getElementById('val-truck') },
        bicycle: { fill: document.getElementById('fill-bicycle'), val: document.getElementById('val-bicycle') },
        pedestrian: { fill: document.getElementById('fill-person'), val: document.getElementById('val-person') },
        person: { fill: document.getElementById('fill-person'), val: document.getElementById('val-person') },
        rider: { fill: document.getElementById('fill-motorcycle'), val: document.getElementById('val-motorcycle') }
    };

    // Toggle Handler
    function setupToggle(button, featureName) {
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

    // Change Direction
    directionSelect.addEventListener('change', async (e) => {
        const dir = e.target.value;
        await fetch('/api/set_direction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: dir })
        });
    });

    // Select Video Source
    sourceSelect.addEventListener('change', async (e) => {
        const val = e.target.value;
        if (val === 'upload') {
            videoUpload.click();
            return;
        }
        await fetch('/api/select_source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: val })
        });
    });

    // Upload Video
    videoUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.status === 'success') {
                const opt = document.createElement('option');
                opt.value = `upload:${data.filename}`;
                opt.textContent = `📁 ${data.filename}`;
                opt.selected = true;
                sourceSelect.appendChild(opt);
            }
        } catch (err) {
            console.error("Upload error:", err);
        }
    });

    // Reset Counts
    resetBtn.addEventListener('click', async () => {
        await fetch('/api/reset_counts', { method: 'POST' });
        if (kpiCounted) kpiCounted.textContent = '0 (↓0 ↑0)';
        const standardCategories = ['car', 'motorcycle', 'bus', 'truck', 'bicycle', 'pedestrian'];
        for (const cat of standardCategories) {
            if (classBars[cat]) {
                classBars[cat].fill.style.width = '0%';
                classBars[cat].val.textContent = '0 (0%)';
            }
        }
    });

    // Telemetry Poller
    async function updateTelemetry() {
        try {
            const res = await fetch('/api/telemetry');
            if (!res.ok) return;
            const data = await res.json();
            if (!data || Object.keys(data).length === 0) return;

            // KPI updates
            const visible = data.classification_visible || {};
            const pedCount = visible['pedestrian'] || visible['person'] || 0;
            const vehCount = data.vehicle_count_visible || 0;
            const totalActive = Math.max(0, Object.values(visible).reduce((a, b) => a + b, 0));

            if (kpiVehicles) {
                if (vehCount === 0 && pedCount > 0) {
                    kpiVehicles.textContent = `${pedCount} Pedestrians`;
                } else if (pedCount > 0) {
                    kpiVehicles.textContent = `${totalActive} (${vehCount}V / ${pedCount}P)`;
                } else {
                    kpiVehicles.textContent = `${vehCount}`;
                }
            }
            if (kpiCounted) kpiCounted.textContent = `${data.total_counted ?? 0} (↓${data.in_count ?? 0} ↑${data.out_count ?? 0})`;
            if (kpiFps) kpiFps.textContent = `${data.fps ?? 0} FPS`;

            if (data.density) {
                if (kpiDensity) kpiDensity.textContent = `${data.density.congestion_pct}%`;
                if (kpiLos) kpiLos.textContent = `LOS ${data.density.level_of_service} (${data.density.status})`;
            }

            // Real-Time Classification Bars: fully reset all categories every frame!
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

    // Violation Feed Poller
    async function updateViolations() {
        try {
            const res = await fetch('/api/violations?limit=15');
            if (!res.ok) return;
            const violations = await res.json();
            
            if (kpiViolations) {
                kpiViolations.textContent = violations.length;
            }

            if (!violations || violations.length === 0) {
                violationsContainer.innerHTML = `
                    <div class="empty-state">
                        <span style="font-size: 2rem;">🛡️</span>
                        <p>No traffic violations detected yet.<br>Monitoring active lanes in real-time.</p>
                    </div>
                `;
                return;
            }

            violationsContainer.innerHTML = violations.map(v => {
                let badgeClass = 'badge-wrong';
                if (v.violation_type === 'NO_HELMET') badgeClass = 'badge-helmet';
                else if (v.violation_type === 'TRIPLE_RIDING') badgeClass = 'badge-triple';

                return `
                    <div class="violation-item">
                        <img class="violation-thumb" src="${v.snapshot_path}" alt="Violation" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'72\\' height=\\'72\\'><rect width=\\'72\\' height=\\'72\\' fill=\\'%23111\\'/><text x=\\'36\\' y=\\'40\\' fill=\\'%23555\\' font-size=\\'10\\' text-anchor=\\'middle\\'>NO IMAGE</text></svg>'">
                        <div class="violation-details">
                            <span class="violation-badge ${badgeClass}">${v.violation_type.replace('_', ' ')}</span>
                            <div class="plate-tag">
                                <span>🚘</span> ${v.license_plate}
                            </div>
                            <div class="challan-no">
                                ${v.challan_number || 'CHALLAN PENDING'} • ${v.timestamp || ''}
                            </div>
                            <div class="fine-amount">
                                Fine: ₹${v.fine_amount ? v.fine_amount.toLocaleString() : '1,000'}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (err) {
            // Silently retry
        }
    }

    // Polling intervals
    setInterval(updateTelemetry, 400);
    setInterval(updateViolations, 1500);
    updateTelemetry();
    updateViolations();
});
