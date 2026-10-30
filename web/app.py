"""
RoadPulseAI - Intelligent Traffic Intelligence & Law Enforcement Platform
Flask web server with real-time MJPEG stream, REST API, and WebSocket/SSE telemetry.
"""

import os
import cv2
import time
import json
import random
from datetime import datetime
from flask import Flask, render_template, Response, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from core.pipeline import MasterTrafficPipeline
from core.map_simulator import sit_simulator
from core.parking_analyzer import narrow_street_analyzer
from core.safety_analyzer import women_safety_analyzer
from database.db import (
    get_recent_violations, get_statistics, get_challan_details,
    search_challans, pay_challan, get_connection, log_sos_dispatch,
    log_violation
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
SAMPLE_FOLDER = os.path.join(BASE_DIR, "sample_data")
DIST_DIR = os.path.join(BASE_DIR, "web", "dist")
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

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS,PUT,DELETE"
    return response

# Global Master Pipeline Instance configured for two-way divided traffic flow
pipeline = MasterTrafficPipeline(expected_direction="bidirectional_split")

# Video stream state
video_source_path = os.path.join(SAMPLE_FOLDER, "traffic.mp4")
current_telemetry = {}
is_paused = False

active_camera_info = {
    "name": "CAM-01: HIGHWAY ARTERIAL",
    "address": "B.H. Road, SIT Campus Main Entrance, Tumakuru, Karnataka 572103",
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
                active_count,
                address=active_camera_info.get("address")
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



@app.route("/legacy/officer")
def legacy_officer_dashboard():
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

@app.route("/legacy/citizen")
def legacy_citizen_dashboard():
    q = request.args.get("q", "").strip()
    if q:
        challans = search_challans("") if q.upper() == "ALL" else search_challans(q)
    else:
        challans = search_challans("")[:15]
    return render_template("citizen.html", challans=challans, query=q)

@app.route("/legacy/map")
def legacy_traffic_map_dashboard():
    return render_template("map.html")

@app.route("/legacy/routes")
def legacy_routes_dashboard():
    return render_template("routes.html")

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
    for v in violations:
        if "challan_no" not in v and "challan_number" in v:
            v["challan_no"] = v["challan_number"]
        if "fine_amount" not in v or v["fine_amount"] is None:
            v["fine_amount"] = 1000.0
    return jsonify(violations)

@app.route("/api/violations/<int:viol_id>/status", methods=["POST"])
def api_update_violation_status(viol_id):
    data = request.json or {}
    new_status = data.get("status", "APPROVED")
    officer_name = data.get("officer_name") or "Authorized Traffic Officer"
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE violations SET status = ? WHERE id = ?", (new_status, viol_id))
        cursor.execute("UPDATE echallans SET status = ? WHERE violation_id = ?", (new_status, viol_id))
        conn.commit()
        conn.close()
        return jsonify({
            "status": "success", 
            "id": viol_id, 
            "new_status": new_status,
            "reviewed_by": officer_name
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# -------------------------------------------------------------
# Officer Command Portal Authentication & Session API
# -------------------------------------------------------------
OFFICER_CREDENTIALS = {
    "officer": {
        "password": "police123",
        "name": "PSI Rajeshwari K.",
        "badge_id": "TK-PSI-409",
        "rank": "Police Sub-Inspector",
        "station": "Tumakuru South Traffic Division",
        "role": "ENFORCEMENT_OFFICER"
    },
    "inspector": {
        "password": "tumakuru123",
        "name": "Circle Inspector Mohan Kumar",
        "badge_id": "TK-CI-102",
        "rank": "Circle Inspector of Police",
        "station": "Tumakuru City Traffic Sub-Division",
        "role": "CIRCLE_INSPECTOR"
    },
    "admin": {
        "password": "police@tumakuru",
        "name": "ACP Traffic Enforcement Command",
        "badge_id": "TK-ACP-01",
        "rank": "Assistant Commissioner of Police",
        "station": "Tumakuru District Police HQ",
        "role": "SUPER_ADMIN"
    }
}

@app.route("/api/officer/login", methods=["POST"])
def api_officer_login():
    """Authenticates law enforcement officer credentials."""
    data = request.json or {}
    username = (data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if username in OFFICER_CREDENTIALS and OFFICER_CREDENTIALS[username]["password"] == password:
        officer = OFFICER_CREDENTIALS[username].copy()
        officer.pop("password")
        token = f"AUTH-TK-{username}-{int(time.time()*1000)}"
        return jsonify({
            "status": "success",
            "message": f"Welcome, {officer['name']}. Officer session established.",
            "token": token,
            "officer": officer
        })
    
    return jsonify({
        "status": "error",
        "message": "Access Denied: Invalid Officer Badge ID / Username or Password."
    }), 401

@app.route("/api/officer/verify", methods=["POST"])
def api_officer_verify():
    """Verifies that an officer session token is valid."""
    data = request.json or {}
    token = data.get("token") or ""
    if token.startswith("AUTH-TK-"):
        parts = token.split("-")
        if len(parts) >= 3 and parts[2] in OFFICER_CREDENTIALS:
            officer = OFFICER_CREDENTIALS[parts[2]].copy()
            officer.pop("password")
            return jsonify({"status": "success", "valid": True, "officer": officer})
    return jsonify({"status": "error", "valid": False}), 401

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
        path2 = os.path.join(SAMPLE_FOLDER, "traffic2.mp4")
        if os.path.exists(path2):
            video_source_path = path2
        else:
            video_source_path = os.path.join(SAMPLE_FOLDER, "traffic.mp4")
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
    """Gets or updates live camera location, address, and coordinates."""
    global active_camera_info
    if request.method == "POST":
        data = request.json or {}
        if "lat" in data and "lng" in data:
            try:
                active_camera_info["lat"] = float(data["lat"])
                active_camera_info["lng"] = float(data["lng"])
            except (ValueError, TypeError):
                pass
        if "name" in data and data["name"]:
            active_camera_info["name"] = data["name"].strip()
        if "address" in data and data["address"]:
            active_camera_info["address"] = data["address"].strip()
            
        sit_simulator.inject_live_camera_feed(
            active_camera_info["lat"],
            active_camera_info["lng"],
            active_camera_info["name"],
            current_telemetry.get("vehicle_count_visible", 0),
            address=active_camera_info.get("address")
        )
    return jsonify(active_camera_info)

@app.route("/api/parking/streets")
def api_parking_streets():
    """Returns list of monitored narrow streets with their designated rules."""
    return jsonify(narrow_street_analyzer.get_all_streets())

@app.route("/api/parking/analyze")
def api_parking_analyze():
    """
    Analyzes narrow-street bilateral parking from the nearest camera beacon.
    Identifies which curb is legal vs prohibited and checks for carriageway blockage.
    """
    street_id = request.args.get("street_id")
    lat = request.args.get("lat")
    lng = request.args.get("lng")
    
    camera_lat = float(lat) if lat else active_camera_info.get("lat")
    camera_lng = float(lng) if lng else active_camera_info.get("lng")
    
    analysis = narrow_street_analyzer.analyze_street_parking(
        street_id=street_id or "NST-01",
        camera_lat=camera_lat,
        camera_lng=camera_lng
    )
    return jsonify(analysis)

@app.route("/api/parking/rule", methods=["POST"])
def api_parking_rule():
    """Updates manual override for designated legal parking side ('LEFT', 'RIGHT', or null)."""
    data = request.json or {}
    street_id = data.get("street_id", "NST-01")
    side = data.get("side") # "LEFT", "RIGHT", or None
    success = narrow_street_analyzer.set_manual_override(street_id, side)
    return jsonify({"status": "success" if success else "error", "street_id": street_id, "side": side})

@app.route("/api/parking/issue-challans", methods=["POST"])
def api_parking_issue_challans():
    """Issues e-challans for all vehicles parked on the prohibited side of a narrow street."""
    data = request.json or {}
    street_id = data.get("street_id", "NST-01")
    street_name = data.get("street_name") or "Tumakuru Urban Narrow Corridor"
    vehicles_data = data.get("vehicles")

    if vehicles_data and isinstance(vehicles_data, list):
        issued_challans = []
        for veh in vehicles_data:
            if not veh.get("is_violating"):
                continue
            plate = veh.get("plate") or "KA-06-UNKNOWN"
            vtype = veh.get("type") or veh.get("model") or "car"
            fine = float(veh.get("fine_amount") or 1000.0)
            curb_side = veh.get("side") or "RIGHT"
            viol_id, challan_no = log_violation(
                track_id=None,
                violation_type="ILLEGAL_SIDE_PARKING",
                vehicle_type=vtype,
                license_plate=plate,
                confidence=float(veh.get("confidence") or 0.94),
                snapshot_path=veh.get("crop_url") or "/static/violations/sample_parking_viol.jpg"
            )
            issued_challans.append({
                "vehicle_id": veh.get("id"),
                "plate": plate,
                "challan_number": challan_no,
                "violation_id": viol_id,
                "fine_amount": fine,
                "curb_side": curb_side,
                "status": "ISSUED",
                "street_name": street_name
            })
        return jsonify({
            "status": "success",
            "street_id": street_id,
            "street_name": street_name,
            "issued_count": len(issued_challans),
            "total_fine_amount": sum(c["fine_amount"] for c in issued_challans),
            "challans": issued_challans
        })

    result = narrow_street_analyzer.issue_challan_for_violating_vehicles(street_id)
    return jsonify(result)

@app.route("/api/parking/dispatch-single-challan", methods=["POST"])
def api_parking_dispatch_single_challan():
    """Issues an e-challan for a single violating vehicle."""
    data = request.json or {}
    plate = data.get("plate") or "KA-06-UNKNOWN"
    vtype = data.get("type") or data.get("model") or "car"
    fine = float(data.get("fine_amount") or 1000.0)
    street_name = data.get("street_name") or "Tumakuru Urban Narrow Corridor"
    curb_side = data.get("side") or "RIGHT"

    viol_id, challan_no = log_violation(
        track_id=None,
        violation_type="ILLEGAL_SIDE_PARKING",
        vehicle_type=vtype,
        license_plate=plate,
        confidence=float(data.get("confidence") or 0.95),
        snapshot_path=data.get("crop_url") or "/static/violations/sample_parking_viol.jpg"
    )

    return jsonify({
        "status": "success",
        "challan_number": challan_no,
        "violation_id": viol_id,
        "plate": plate,
        "fine_amount": fine,
        "curb_side": curb_side,
        "street_name": street_name
    })


@app.route("/api/parking/upload-image", methods=["POST"])
def api_parking_upload_image():
    """
    Accepts an uploaded road/street image (or preset sample) and runs YOLOv8
    to detect parked vehicles, classify left vs right curbs, and flag wrong-side parking.
    """
    legal_side = request.form.get("legal_side") or (request.json.get("legal_side") if request.is_json else None) or "LEFT"
    nominal_width_m = float(request.form.get("nominal_width_m") or (request.json.get("nominal_width_m") if request.is_json else None) or 6.4)
    street_name = request.form.get("street_name") or (request.json.get("street_name") if request.is_json else None) or "Uploaded Narrow Corridor"
    sample_name = request.form.get("sample_name") or (request.json.get("sample_name") if request.is_json else None)
    
    if "file" in request.files and request.files["file"].filename != "":
        file = request.files["file"]
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], f"parking_{int(time.time()*1000)}_{filename}")
        file.save(save_path)
    elif sample_name:
        sample_path = os.path.join(BASE_DIR, "web", "static", "parking_samples", secure_filename(sample_name))
        if not os.path.exists(sample_path):
            sample_path = os.path.join(BASE_DIR, "sample_data", secure_filename(sample_name))
        if not os.path.exists(sample_path):
            return jsonify({"status": "error", "message": f"Sample image {sample_name} not found"}), 404
        save_path = sample_path
    else:
        # Fallback to default preset sample
        default_sample = os.path.join(BASE_DIR, "web", "static", "parking_samples", "narrow_street_sample.jpg")
        if os.path.exists(default_sample):
            save_path = default_sample
        else:
            return jsonify({"status": "error", "message": "No image file provided"}), 400

    try:
        result = narrow_street_analyzer.analyze_uploaded_image(
            image_path=save_path,
            legal_side=legal_side,
            nominal_width_m=nominal_width_m,
            street_name=street_name
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# -------------------------------------------------------------
# Women's Solo Travel & Road Safety Perception (SafeWalk AI)
# -------------------------------------------------------------
@app.route("/api/safety/corridors")
def api_safety_corridors():
    """Returns list of monitored street corridors with lighting & safety baseline data."""
    return jsonify(women_safety_analyzer.get_monitored_corridors())

@app.route("/api/safety/tumkur-streets", methods=["GET"])
def api_safety_tumkur_streets():
    """
    Simulates and returns live safety & risk rates for every monitored street in Tumakuru.
    Updates dynamically every 2-3 minutes, calculating risk rates from pedestrian density,
    traffic flow, and lighting without requiring manual image uploads.
    """
    hour_val = request.args.get("hour")
    force_refresh = request.args.get("refresh", "false").lower() in ["true", "1", "yes"]
    try:
        hour = int(hour_val) if hour_val is not None and hour_val != "" else datetime.now().hour
    except (ValueError, TypeError):
        hour = datetime.now().hour
        
    result = women_safety_analyzer.simulate_all_tumkur_streets(
        simulated_hour=hour,
        force_refresh=force_refresh
    )
    return jsonify(result)

@app.route("/api/safety/landmarks", methods=["GET"])
def api_safety_landmarks():
    """Returns list of selectable Tumakuru landmarks & hubs for walking route planning."""
    return jsonify(women_safety_analyzer.get_safety_landmarks())

@app.route("/api/safety/plan-safe-route", methods=["GET", "POST"])
def api_safety_plan_safe_route():
    """
    Plans and compares the direct walking path vs. AI SafeLit recommended route
    between a given source and destination in Tumakuru, assessing risk rates, dark spots,
    and streetlight illumination.
    """
    if request.method == "POST" and request.is_json:
        source = request.json.get("source", "LM-01")
        dest = request.json.get("destination", "LM-02")
        hour_val = request.json.get("hour")
    else:
        source = request.args.get("source") or request.form.get("source") or "LM-01"
        dest = request.args.get("destination") or request.form.get("destination") or "LM-02"
        hour_val = request.args.get("hour") or request.form.get("hour")

    try:
        hour = int(hour_val) if hour_val is not None and hour_val != "" else datetime.now().hour
    except (ValueError, TypeError):
        hour = datetime.now().hour

    result = women_safety_analyzer.plan_safe_walking_route(
        origin_query=source,
        dest_query=dest,
        simulated_hour=hour
    )
    return jsonify(result)

@app.route("/api/safety/audit")
def api_safety_audit():
    """Evaluates safety score of a monitored corridor based on time and simulation parameters."""
    corridor_id = request.args.get("corridor_id", "COR-01")
    hour_val = request.args.get("hour")
    try:
        hour = int(hour_val) if hour_val is not None and hour_val != "" else datetime.now().hour
    except (ValueError, TypeError):
        hour = datetime.now().hour
    result = women_safety_analyzer.audit_corridor_by_id(corridor_id, simulated_hour=hour)
    return jsonify(result)

@app.route("/api/safety/analyze-image", methods=["POST"])
def api_safety_analyze_image():
    """
    Accepts an uploaded image or sample street photo, detects pedestrians and vehicles via YOLO,
    computes ambient illumination & darkness, and returns the Women's SafeWalk Index + annotated visual.
    """
    hour_val = request.form.get("hour") or (request.json.get("hour") if request.is_json else None)
    try:
        hour = int(hour_val) if hour_val is not None and hour_val != "" else datetime.now().hour
    except (ValueError, TypeError):
        hour = datetime.now().hour
    street_name = request.form.get("street_name") or (request.json.get("street_name") if request.is_json else None) or "Tumakuru Urban Corridor"
    sample_name = request.form.get("sample_name") or (request.json.get("sample_name") if request.is_json else None)
    
    if "file" in request.files and request.files["file"].filename != "":
        file = request.files["file"]
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], f"safety_{int(time.time()*1000)}_{filename}")
        file.save(save_path)
    elif sample_name:
        sample_path = os.path.join(BASE_DIR, "web", "static", "safety_samples", secure_filename(sample_name))
        if not os.path.exists(sample_path):
            sample_path = os.path.join(BASE_DIR, "sample_data", secure_filename(sample_name))
        if not os.path.exists(sample_path):
            return jsonify({"status": "error", "message": f"Sample image {sample_name} not found"}), 404
        save_path = sample_path
    else:
        # Default sample: quiet/empty night street with low pedestrian density
        default_sample = os.path.join(BASE_DIR, "web", "static", "safety_samples", "empty_road_safety.jpg")
        if not os.path.exists(default_sample):
            default_sample = os.path.join(BASE_DIR, "sample_data", "empty_road_safety.jpg")
        if os.path.exists(default_sample):
            save_path = default_sample
        else:
            return jsonify({"status": "error", "message": "No image provided"}), 400

    try:
        result = women_safety_analyzer.analyze_uploaded_image(
            image_path=save_path,
            hour_of_day=hour,
            street_name=street_name
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/safety/sos-dispatch", methods=["GET", "POST"])
def api_safety_sos_dispatch():
    """Simulates immediate police patrol unit (Tumakuru Pink Patrol) dispatch for women in danger."""
    data = {}
    if request.is_json:
        data = request.json or {}
    elif request.form:
        data = request.form.to_dict()
    elif request.args:
        data = request.args.to_dict()

    corridor_name = data.get("corridor_name") or data.get("name") or "SIT Tumakuru Safe Corridor"
    try:
        lat = float(data.get("lat", 13.3276))
        lng = float(data.get("lng", 77.1259))
    except (ValueError, TypeError):
        lat, lng = 13.3276, 77.1259
    
    dispatch_id = f"SOS-TK-{int(time.time()*1000)}"
    unit_assigned = "Tumakuru Pink Patrol Unit #02"
    patrol_vehicle = "Mahindra Bolero Emergency Response (KA-06-G-1102)"
    officer_in_charge = "PSI Rajeshwari K. / ASI Shailaja M. (Tumakuru South Police)"
    eta_mins = random.randint(2, 4)

    # Persist in DB
    log_sos_dispatch(
        dispatch_id=dispatch_id,
        corridor=corridor_name,
        lat=lat,
        lng=lng,
        unit_assigned=unit_assigned,
        patrol_vehicle=patrol_vehicle,
        officer_in_charge=officer_in_charge,
        eta_mins=eta_mins
    )

    return jsonify({
        "status": "success",
        "dispatch_id": dispatch_id,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "unit_assigned": unit_assigned,
        "eta_mins": eta_mins,
        "eta_seconds": eta_mins * 60,
        "patrol_vehicle": patrol_vehicle,
        "officer_in_charge": officer_in_charge,
        "contact_helpline": "Dial 112 / 1091",
        "corridor": corridor_name,
        "location": {
            "corridor": corridor_name,
            "lat": lat,
            "lng": lng
        },
        "message": f"Emergency Pink Patrol unit dispatched to {corridor_name}. High-priority siren and live GPS telemetry activated."
    })

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
    
    # Retrieve Latitude & Longitude & Location Name & Address
    lat = request.form.get("lat")
    lng = request.form.get("lng")
    loc_name = request.form.get("location_name") or f"Camera Feed: {filename}"
    address = request.form.get("address") or request.form.get("location_address") or "Custom Surveillance Site, Tumakuru"
    
    try:
        lat = float(lat) if lat else 13.3276
        lng = float(lng) if lng else 77.1259
    except ValueError:
        lat, lng = 13.3276, 77.1259
        
    active_camera_info = {
        "name": loc_name,
        "address": address,
        "lat": lat,
        "lng": lng,
        "active": True
    }
    
    video_source_path = save_path
    pipeline.counter.reset()
    pipeline.wrong_way_analyzer.reset()
    current_telemetry.clear()
    
    # Immediately inject into GIS simulator with address
    sit_simulator.inject_live_camera_feed(lat, lng, loc_name, active_vehicles=0, address=address)
    
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
    current_telemetry = {
        "fps": round(pipeline.fps, 1),
        "frame_number": pipeline.frame_count,
        "vehicle_count_visible": 0,
        "total_counted": 0,
        "in_count": 0,
        "out_count": 0,
        "classification_visible": {},
        "classification_cumulative": {
            "in": {},
            "out": {}
        },
        "density": {
            "congestion_pct": 0.0,
            "level_of_service": "A",
            "status": "Free Flow"
        },
        "active_violations": [],
        "location": active_camera_info
    }
    return jsonify({"status": "success", "telemetry": current_telemetry})

# -------------------------------------------------------------
# SPA React Frontend & Static File Servicing
# -------------------------------------------------------------
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    # Guard API, video feed, and uploaded static files from SPA catch-all
    if path.startswith("api/") or path == "video_feed" or path.startswith("static/") or path.startswith("receipt/"):
        return jsonify({"error": "Resource not found"}), 404
        
    if os.path.exists(DIST_DIR):
        file_path = os.path.join(DIST_DIR, path)
        if path and os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(DIST_DIR, path)
        index_file = os.path.join(DIST_DIR, "index.html")
        if os.path.exists(index_file):
            return send_from_directory(DIST_DIR, "index.html")
            
    # Fallback to Jinja template if React dist bundle is not yet built
    return render_template("index.html")

if __name__ == "__main__":
    print("\n=======================================================")
    print(" 🚀 RoadPulseAI Command Center is Live!")
    print(" 🌐 Access Dashboard at: http://127.0.0.1:5000")
    print("=======================================================\n")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
