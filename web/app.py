"""
OmniTraffic AI - Web Application & Command Center
Flask web server with real-time MJPEG stream, REST API, and WebSocket/SSE telemetry.
"""

import os
import cv2
import time
import json
from flask import Flask, render_template, Response, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from core.pipeline import MasterTrafficPipeline
from core.map_simulator import sit_simulator
from database.db import (
    get_recent_violations, get_statistics, get_challan_details,
    search_challans, pay_challan, get_connection
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
SAMPLE_FOLDER = os.path.join(BASE_DIR, "sample_data")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "web", "templates"),
    static_folder=os.path.join(BASE_DIR, "web", "static")
)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024 # 200MB max upload

# Global Master Pipeline Instance configured for two-way divided traffic flow
pipeline = MasterTrafficPipeline(expected_direction="bidirectional_split")

# Video stream state
video_source_path = os.path.join(SAMPLE_FOLDER, "traffic.mp4")
current_telemetry = {}
is_paused = False

active_camera_info = {
    "name": "SIT Main Gate (BH Road Corridor)",
    "lat": 13.3276,
    "lng": 77.1259,
    "active": True
}

def generate_frames():
    global video_source_path, current_telemetry, is_paused, active_camera_info
    while True:
        current_source = video_source_path
        cap = cv2.VideoCapture(current_source)
        if not cap.isOpened():
            time.sleep(1)
            continue
            
        while cap.isOpened():
            if video_source_path != current_source:
                # Video source changed, immediately switch
                break
                
            if is_paused:
                time.sleep(0.1)
                continue
                
            ret, frame = cap.read()
            if not ret or frame is None:
                # Loop video when reaching end
                break
                
            # Proportional resize for portrait or landscape videos
            h, w = frame.shape[:2]
            max_dim = 1280
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
                
            annotated_frame, telemetry = pipeline.process_frame(frame)
            telemetry["location"] = active_camera_info
            current_telemetry = telemetry
            
            # Map video detection volume directly into SIT Tumkur GIS map simulator
            active_count = telemetry.get("vehicle_count_visible", 0)
            sit_simulator.inject_live_camera_feed(
                active_camera_info["lat"],
                active_camera_info["lng"],
                active_camera_info["name"],
                active_count
            )
            
            # Encode frame to JPEG
            ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ret:
                continue
                
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n\r\n')
                   
            # Throttle to maintain realistic FPS
            time.sleep(0.02)
            
        cap.release()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/officer")
def officer_dashboard():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT e.*, v.snapshot_path, v.vehicle_type, v.confidence, v.timestamp as violation_time
            FROM echallans e
            JOIN violations v ON e.violation_id = v.id
            ORDER BY e.id DESC
        """)
        challans = [dict(r) for r in cursor.fetchall()]
        conn.close()
    except Exception as e:
        print(f"[Error fetching officer challans]: {e}")
        challans = []
        
    total_challans = len(challans)
    paid_count = sum(1 for c in challans if c.get("status") == "PAID")
    pending_count = total_challans - paid_count
    total_revenue = sum(float(c.get("fine_amount") or 0) for c in challans)
    
    return render_template(
        "officer.html",
        challans=challans,
        total_challans=total_challans,
        paid_count=paid_count,
        pending_count=pending_count,
        total_revenue=total_revenue
    )

@app.route("/citizen")
def citizen_dashboard():
    q = request.args.get("q", "").strip()
    if q:
        if q.upper() == "ALL":
            challans = search_challans("")
        else:
            challans = search_challans(q)
    else:
        # Show recent challans by default so citizens immediately see citations
        challans = search_challans("")[:15]
        
    return render_template("citizen.html", challans=challans, query=q)

@app.route("/map")
def traffic_map_dashboard():
    """Renders the GIS Congestion Heatmap & Predictive Traffic Hub for SIT Tumkur."""
    return render_template("map.html")

@app.route("/api/map/telemetry")
def api_map_telemetry():
    """Returns real-time simulated telemetry, node intensities, and heatmap points."""
    return jsonify(sit_simulator.get_full_telemetry())

@app.route("/api/map/predict")
def api_map_predict():
    """Returns predictive forecasts (15m, 30m, 60m) and AI traffic advisories."""
    return jsonify(sit_simulator.predict_congestion())

@app.route("/api/map/scenario", methods=["POST"])
def api_map_scenario():
    """Dynamically adjusts simulation scenario, weather, and time of day."""
    data = request.json or {}
    scenario = data.get("scenario")
    if scenario:
        sit_simulator.set_scenario(scenario)
    if "hour" in data:
        hour_val = data.get("hour")
        sit_simulator.time_override_hour = int(hour_val) if hour_val is not None and hour_val != "" else None
    if "weather" in data:
        sit_simulator.weather = data.get("weather", "clear")
    sit_simulator.update()
    return jsonify({"status": "success", "telemetry": sit_simulator.get_full_telemetry()})

@app.route("/api/map/reset", methods=["POST"])
def api_map_reset():
    """Resets simulator to baseline state."""
    sit_simulator.scenario = "college_rush"
    sit_simulator.time_override_hour = None
    sit_simulator.weather = "clear"
    sit_simulator._initialize_state()
    sit_simulator.update()
    return jsonify({"status": "success"})

@app.route("/receipt/<identifier>")
def view_receipt(identifier):
    challan = get_challan_details(identifier)
    if not challan:
        challan = {
            "id": identifier,
            "challan_number": f"ECH-20261030-{identifier}",
            "license_plate": "DL8CAF5030",
            "vehicle_type": "car",
            "violation_type": "WRONG_WAY",
            "fine_amount": 2000.0,
            "status": "ISSUED",
            "issued_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "snapshot_path": "/static/violations/default.jpg",
            "confidence": 0.984
        }
    return render_template("receipt.html", challan=challan)

@app.route("/api/pay_challan", methods=["POST"])
def api_pay_challan():
    data = request.json or {}
    challan_id = data.get("challan_id")
    if not challan_id:
        return jsonify({"status": "error", "message": "Missing challan_id"}), 400
    success, tx_ref = pay_challan(challan_id)
    if success:
        return jsonify({"status": "success", "transaction_ref": tx_ref})
    return jsonify({"status": "error", "message": "Failed to update challan payment"}), 500

@app.route("/video_feed")
def video_feed():
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/api/telemetry")
def get_telemetry():
    return jsonify(current_telemetry)

@app.route("/api/violations")
def api_violations():
    limit = request.args.get("limit", default=25, type=int)
    violations = get_recent_violations(limit=limit)
    return jsonify(violations)

@app.route("/api/stats")
def api_stats():
    stats = get_statistics()
    return jsonify(stats)

@app.route("/api/export_csv")
def export_csv():
    import io, csv
    from flask import make_response
    from database.db import get_connection
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT v.id, e.challan_number, v.timestamp, v.violation_type, v.vehicle_type, v.license_plate, e.fine_amount, e.status
            FROM violations v
            LEFT JOIN echallans e ON v.id = e.violation_id
            ORDER BY v.id DESC
        """)
        rows = cursor.fetchall()
        conn.close()
        
        si = io.StringIO()
        cw = csv.writer(si)
        cw.writerow(["Record ID", "Challan Number", "Timestamp", "Violation Type", "Vehicle Type", "License Plate", "Fine (INR)", "Status"])
        for r in rows:
            cw.writerow(list(r))
            
        output = make_response(si.getvalue())
        output.headers["Content-Disposition"] = "attachment; filename=echallan_report.csv"
        output.headers["Content-type"] = "text/csv"
        return output
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/clear_violations", methods=["POST"])
def clear_violations():
    import glob
    from database.db import get_connection
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("DELETE FROM violations")
        c.execute("DELETE FROM echallans")
        conn.commit()
        conn.close()
        for f in glob.glob(os.path.join(BASE_DIR, "web", "static", "violations", "*")):
            try: os.remove(f)
            except: pass
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/toggle", methods=["POST"])
def toggle_feature():
    data = request.json or {}
    feature = data.get("feature")
    val = data.get("value")
    
    if hasattr(pipeline, feature):
        setattr(pipeline, feature, val)
        return jsonify({"status": "success", "feature": feature, "value": val})
    return jsonify({"status": "error", "message": f"Feature {feature} not found"}), 400

@app.route("/api/set_direction", methods=["POST"])
def set_direction():
    data = request.json or {}
    direction = data.get("direction", "down")
    pipeline.wrong_way_analyzer.expected_direction = direction
    return jsonify({"status": "success", "expected_direction": direction})

@app.route("/api/select_source", methods=["POST"])
def select_source():
    global video_source_path, current_telemetry
    data = request.json or {}
    source = data.get("source", "sample1")
    
    if source == "sample1":
        video_source_path = os.path.join(SAMPLE_FOLDER, "traffic.mp4")
    elif source == "sample2":
        path2 = os.path.join(BASE_DIR, "repos", "Smart-Traffic-Management-System", "video", "traffic2.mp4")
        if os.path.exists(path2):
            video_source_path = path2
    elif source == "webcam":
        video_source_path = 0
    elif source.startswith("upload:"):
        filename = source.split(":", 1)[1]
        upload_path = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(upload_path):
            video_source_path = upload_path
            
    # Reset tripwire counts and telemetry for clean analysis of new source
    pipeline.counter.reset()
    pipeline.wrong_way_analyzer.reset()
    current_telemetry.clear()
    return jsonify({"status": "success", "source": str(video_source_path)})

@app.route("/routes")
def routes_dashboard():
    """Renders the Congestion-Aware AI Route Planner Dashboard."""
    return render_template("routes.html")

@app.route("/api/routes/nodes")
def api_routes_nodes():
    """Returns available road junctions for route selection."""
    return jsonify(sit_simulator.get_routing_nodes())

@app.route("/api/routes/plan", methods=["GET", "POST"])
def api_routes_plan():
    """Plans optimal route and alternative bypasses based on live traffic volume."""
    if request.method == "POST":
        data = request.json or {}
        origin = data.get("origin", "J3")
        destination = data.get("destination", "J1")
    else:
        origin = request.args.get("origin", "J3")
        destination = request.args.get("destination", "J1")
        
    result = sit_simulator.find_smart_routes(origin, destination)
    return jsonify(result)

@app.route("/api/camera/location", methods=["GET", "POST"])
def api_camera_location():
    """Gets or updates live camera location."""
    global active_camera_info
    if request.method == "POST":
        data = request.json or {}
        if "lat" in data and "lng" in data:
            active_camera_info["lat"] = float(data["lat"])
            active_camera_info["lng"] = float(data["lng"])
        if "name" in data:
            active_camera_info["name"] = data["name"]
        sit_simulator.inject_live_camera_feed(
            active_camera_info["lat"],
            active_camera_info["lng"],
            active_camera_info["name"],
            current_telemetry.get("vehicle_count_visible", 0)
        )
    return jsonify(active_camera_info)

@app.route("/api/upload", methods=["POST"])
def upload_file():
    global video_source_path, current_telemetry, active_camera_info
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
        
    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)
    
    # Retrieve Latitude & Longitude & Location Name
    lat = request.form.get("lat")
    lng = request.form.get("lng")
    loc_name = request.form.get("location_name") or f"Camera Feed: {filename}"
    
    try:
        lat = float(lat) if lat else 13.3276
        lng = float(lng) if lng else 77.1259
    except ValueError:
        lat, lng = 13.3276, 77.1259
        
    active_camera_info = {
        "name": loc_name,
        "lat": lat,
        "lng": lng,
        "active": True
    }
    
    video_source_path = save_path
    pipeline.counter.reset()
    pipeline.wrong_way_analyzer.reset()
    current_telemetry.clear()
    
    # Immediately inject into GIS simulator
    sit_simulator.inject_live_camera_feed(lat, lng, loc_name, active_vehicles=0)
    
    return jsonify({
        "status": "success",
        "filename": filename,
        "path": save_path,
        "location": active_camera_info
    })

@app.route("/api/reset_counts", methods=["POST"])
def reset_counts():
    global current_telemetry
    pipeline.counter.reset()
    pipeline.wrong_way_analyzer.reset()
    current_telemetry.clear()
    return jsonify({"status": "success"})

if __name__ == "__main__":
    print("\n=======================================================")
    print(" 🚀 OmniTraffic AI Command Center is Live!")
    print(" 🌐 Access Dashboard at: http://127.0.0.1:5000")
    print("=======================================================\n")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
