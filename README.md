# 🚦 RoadPulseAI — Intelligent Traffic Intelligence & Law Enforcement Platform

> A state-of-the-art intelligent traffic analytics, predictive congestion routing, and automated law enforcement platform built with a modern **React (Vite) + Python (Flask)** tech stack.

---

## 🌟 Key Capabilities & Features

RoadPulseAI brings together computer vision, deep learning, GIS spatial simulation, and automated traffic law enforcement into a single modular architecture:

| # | Feature | Technology / Methodology | Output |
|---|---|---|---|
| **1** | **Vehicle Detection** | YOLOv8 Deep Learning Engine | Real-time localization with tight bounding boxes |
| **2** | **Vehicle Counting** | Bidirectional Virtual Tripwire + Hungarian Tracker | Cumulative In-count, Out-count, and Active in-frame counts |
| **3** | **Classification** | Multi-class Object Categorization | Cars, Motorcycles, Buses, Trucks, Bicycles, Pedestrians |
| **4** | **Traffic Density & Heatmaps** | Road Capacity Level of Service (LOS A–F) + 2D Gaussian Diffusion | Live Congestion %, LOS status, and Thermal Density Heatmap |
| **5** | **Helmet Detection** | Custom-trained YOLO Safety Model (`helmet_best.pt`) | Flags riders without protective helmets (`NO_HELMET`) |
| **6** | **Triple Riding** | 2D Spatial Overlap & Containment Geometry | Flags two-wheelers carrying ≥ 3 occupants (`TRIPLE_RIDING`) |
| **7** | **Number Plate OCR** | YOLO Plate Detector + Haar Cascade + EasyOCR + State Regex Correction | Indian & standard plate text parsing with typo autocorrection |
| **8** | **Wrong-Way Driving** | Motion Vector Displacement & Lane Orientation Analysis | Flags vehicles driving against the legal traffic flow (`WRONG_WAY`) |
| **9** | **GIS Heatmap & Simulation** | Interactive Leaflet GIS of SIT Tumkur with live camera radar beacon | Green (<35%), Orange (35-65%), Red (>65%) congestion mapping |
| **10** | **AI Route Planner** | Dijkstra & Congestion-Aware Multi-Route Optimizer | Real-time fastest route vs bypass routing with travel time estimates |
| **11** | **Officer Portal** | Review dashboard for recorded citations | Pending audit verification, status updates, and fine revenue KPIs |
| **12** | **Citizen Portal** | Public challan search & simulated payment hub | Plate lookup, certified legal citations, and multi-gateway checkout |

---

## 🏗️ Architecture & Project Structure

```
CIT1/
├── frontend/                             # Modern React SPA (Vite + React Router + Vanilla CSS)
│   ├── src/
│   │   ├── components/                   # Navbar, modals (Location, Upload, Evidence, Receipt)
│   │   ├── pages/                        # Live HUD, GIS Map, Route Planner, Officer & Citizen Portals
│   │   ├── App.jsx                       # Client-side routing tree
│   │   ├── index.css                     # Glassmorphic cyberpunk design token system
│   │   └── main.jsx                      # React 18 bootstrap
│   ├── vite.config.js                    # Dev proxy to Flask (:5000) & build target to web/dist
│   └── package.json
│
├── web/
│   ├── app.py                            # Flask Real-time Video Streaming Server, REST API & SPA Host
│   ├── dist/                             # Compiled production React bundle
│   └── static/
│       └── violations/                   # Auto-captured incident evidence snapshots
│
├── models/
│   ├── yolov8n.pt                        # Primary Vehicle & Pedestrian Detector
│   ├── helmet_best.pt                    # Specialized Safety Model (Helmet, No-Helmet, Rider, Plate)
│   └── haarcascade_russian_plate_number.xml # Secondary Plate Localization Cascade
│
├── core/
│   ├── detector.py                       # Multi-Model Detection & Perception Pipeline
│   ├── tracker.py                        # Self-contained SciPy Hungarian Multi-Object Tracker
│   ├── counter.py                        # Bidirectional Tripwire Vehicle Counter
│   ├── density_analyzer.py               # Traffic Volume, LOS Index, & Gaussian Heatmap Generator
│   ├── helmet_analyzer.py                # Rider-Helmet Spatial Association Engine
│   ├── triple_riding_analyzer.py         # Multi-occupant Motorcycle Violation Detector
│   ├── wrong_way_analyzer.py             # Trajectory Displacement & Direction Enforcement
│   ├── license_plate_ocr.py              # License Plate Preprocessing, EasyOCR, & Regex Autocorrection
│   ├── map_simulator.py                  # SIT Tumkur GIS Simulator & Congestion Routing Engine
│   ├── violation_engine.py               # Incident Debouncing, Snapshot Generation, & E-Challans
│   └── pipeline.py                       # Unified Master Perception & Analytics Pipeline
│
├── database/
│   └── db.py                             # SQLite Database (Vehicles, Density, Violations, E-Challans)
│
├── sample_data/
│   └── traffic.mp4                       # Sample surveillance video footage
│
├── run.py                                # Master entry point (Web Dashboard or CLI Headless Mode)
└── requirements.txt                      # Python dependencies
```

---

## 🚀 Quick Start Guide

### 1. Requirements
- Python 3.9+
- Node.js 18+ & npm

### 2. Run the Full-Stack Application
Launch the Flask backend and built React SPA with:
```bash
python3 run.py
```
Open your browser at:
👉 **`http://127.0.0.1:5000`**

### 3. Frontend Development Server (Optional)
If modifying the React frontend:
```bash
cd frontend
npm run dev
```
Open Vite dev server at **`http://localhost:5173`** (automatically proxies API requests to Flask on `:5000`).

To rebuild the production bundle:
```bash
cd frontend
npm run build
```

---

## 📊 Automated E-Challan & Database System

RoadPulseAI automatically stores traffic telemetry and violation records in a local SQLite database (`traffic_system.db`).

Each detected violation automatically generates:
1. **Violation Snapshot:** A cropped evidence image saved to `web/static/violations/`
2. **License Plate Record:** Detected plate string with OCR confidence score
3. **Automated E-Challan:** Assigned unique Challan ID with statutory fine schedule:
   - `NO_HELMET`: ₹1,000 (Sec 129 IMVA)
   - `TRIPLE_RIDING`: ₹1,500 (Sec 128 IMVA)
   - `WRONG_WAY`: ₹2,000 (Sec 184 IMVA)
4. **Debounce Logic:** Prevents duplicate fines for the same vehicle across consecutive frames.

---

## 🌐 REST API Endpoints

- `GET /video_feed` — MJPEG streaming endpoint for low-latency live camera/video feeds
- `GET /api/telemetry` — Live JSON telemetry (counts, active vehicles, LOS, density %, FPS)
- `GET /api/violations?limit=25` — List recent violations with snapshot URLs and E-Challan IDs
- `POST /api/violations/<id>/status` — Update violation audit status (APPROVED / WAIVED)
- `GET /api/camera/location` / `POST /api/camera/location` — Get or update camera GPS location & address
- `GET /api/map/telemetry` — Real-time GIS corridor intensities and node congestion
- `POST /api/map/scenario` — Switch simulation conditions (weather, hour, traffic rush)
- `GET /api/routes/nodes` — List road junctions in the network
- `POST /api/routes/plan` — Plan optimal congestion-aware route vs direct and bypass options
- `POST /api/upload` — Upload video with address, coordinates, and feed title
- `POST /api/pay_challan` — Process simulated citizen fine settlement
