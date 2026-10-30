# 🚦 OmniTraffic AI — Unified Smart Traffic & Law Enforcement System

> A state-of-the-art intelligent traffic analytics and automated law enforcement platform synthesized and evolved from:
> - **[Smart-Traffic-Management-System](https://github.com/OfficialAndre/Smart-Traffic-Management-System)**
> - **[Intelligent-Traffic-Management-System](https://github.com/tanveer-builds/Intelligent-Traffic-Management-System)**
> - **[RoadX-traffic-enforcement](https://github.com/i-am-Ankush/RoadX-traffic-enforcement)**

---

## 🌟 Key Capabilities & Features

OmniTraffic AI brings together computer vision, deep learning, and automated traffic law enforcement into a single modular architecture:

| # | Feature | Technology / Methodology | Output |
|---|---|---|---|
| **1** | **Vehicle Detection** | YOLOv8 COCO Deep Learning Engine | Real-time localization with tight bounding boxes |
| **2** | **Vehicle Counting** | Bidirectional Virtual Tripwire + Hungarian Tracker | Cumulative In-count, Out-count, and Active in-frame counts |
| **3** | **Classification** | Multi-class Object Categorization | Cars, Motorcycles, Buses, Trucks, Bicycles, Pedestrians |
| **4** | **Traffic Density & Heatmaps** | Road Capacity Level of Service (LOS A–F) + 2D Gaussian Diffusion | Live Congestion %, LOS status, and Thermal Density Heatmap |
| **5** | **Helmet Detection** | Custom-trained YOLO Safety Model (`helmet_best.pt`) | Flags riders without protective helmets (`NO_HELMET`) |
| **6** | **Triple Riding** | 2D Spatial Overlap & Containment Geometry | Flags two-wheelers carrying ≥ 3 occupants (`TRIPLE_RIDING`) |
| **7** | **Number Plate OCR** | YOLO Plate Detector + Haar Cascade + EasyOCR + State Regex Correction | Indian & standard plate text parsing with typo autocorrection |
| **8** | **Wrong-Way Driving** | Motion Vector Displacement & Lane Orientation Analysis | Flags vehicles driving against the legal traffic flow (`WRONG_WAY`) |

---

## 🏗️ Architecture & Project Structure

```
CIT1/
├── models/
│   ├── yolov8n.pt                        # Primary COCO Vehicle & Pedestrian Detector
│   ├── helmet_best.pt                    # Specialized Safety Model (Helmet, No-Helmet, Rider, Plate)
│   ├── accident_best.pt                  # Accident Detection Model
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
│   ├── violation_engine.py               # Incident Debouncing, Snapshot Generation, & E-Challans
│   └── pipeline.py                       # Unified Master Perception & Analytics Pipeline
│
├── database/
│   ├── db.py                             # Zero-config SQLite Database (Vehicles, Density, Violations, E-Challans)
│   └── __init__.py
│
├── web/
│   ├── app.py                            # Flask Real-time Video Streaming Server & REST API
│   ├── templates/
│   │   └── index.html                    # Modern Dark-Mode Glassmorphism Command Center Dashboard
│   └── static/
│       ├── css/dashboard.css             # Tailored UI styling, glowing accents, and responsiveness
│       ├── js/app.js                     # Real-time WebSocket/SSE-like polling and interactive control bindings
│       └── violations/                   # Auto-captured incident evidence snapshots
│
├── sample_data/
│   └── traffic.mp4                       # High-definition sample traffic surveillance video
│
├── run.py                                # Master entry point (Web Dashboard or CLI Headless Mode)
└── requirements.txt                      # Project dependencies
```

---

## 🚀 Quick Start Guide

### 1. Requirements
- Python 3.9+
- macOS, Linux, or Windows

### 2. Run the Interactive Web Command Center
Launch the dashboard with one command:
```bash
python3 run.py
```
Open your browser at:
👉 **`http://127.0.0.1:5000`**

### 3. Run Headless CLI Video Processing
To process a video file and generate an annotated output video with all detections, heatmaps, counts, and violation boxes:
```bash
# Basic processing
python3 run.py --cli --video sample_data/traffic.mp4 --output results.mp4

# With thermal density heatmap enabled
python3 run.py --cli --video sample_data/traffic.mp4 --output results_heatmap.mp4 --heatmap

# For reverse flow or split highways
python3 run.py --cli --video sample_data/traffic.mp4 --direction bidirectional_split
```

---

## 📊 Automated E-Challan & Database System

OmniTraffic AI automatically stores traffic telemetry and violation records in a local SQLite database (`traffic_system.db`).

Each detected violation automatically generates:
1. **Violation Snapshot:** A cropped evidence image saved to `web/static/violations/`
2. **License Plate Record:** Detected plate string with OCR confidence score
3. **Automated E-Challan:** Assigned unique Challan ID with fine schedule:
   - `NO_HELMET`: ₹1,000
   - `TRIPLE_RIDING`: ₹1,500
   - `WRONG_WAY`: ₹2,000
4. **Debounce Logic:** Prevents duplicate fines for the same vehicle across consecutive frames.

---

## 🌐 REST API Endpoints

- `GET /video_feed` — MJPEG streaming endpoint for low-latency live camera/video feeds
- `GET /api/telemetry` — Live JSON telemetry (counts, active vehicles, LOS, density %, FPS)
- `GET /api/violations?limit=25` — List recent violations with snapshot URLs and E-Challan IDs
- `GET /api/stats` — High-level traffic statistics and historical violation breakdowns
- `POST /api/toggle` — Toggle live overlays (`show_boxes`, `show_heatmap`, `show_tripwire`, `show_tracks`, `show_violations`)
- `POST /api/select_source` — Switch video source (`sample1`, `sample2`, `webcam`, uploaded video)
- `POST /api/upload` — Upload custom surveillance footage
- `POST /api/reset_counts` — Reset tripwire counters and trajectory memories
