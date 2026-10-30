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
from database.db import get_recent_violations, get_statistics

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
SAMPLE_FOLDER = os.path.join(BASE_DIR, "sample_data")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "web", "templates"),
    static_folder=os.path.join(BASE_DIR, "web", "static")
)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024 # 200MB max upload

# Global Master Pipeline Instance
pipeline = MasterTrafficPipeline()

# Video stream state
video_source_path = os.path.join(SAMPLE_FOLDER, "traffic.mp4")
current_telemetry = {}
is_paused = False

def generate_frames():
    global video_source_path, current_telemetry, is_paused
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
            current_telemetry = telemetry
            
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

@app.route("/api/upload", methods=["POST"])
def upload_file():
    global video_source_path, current_telemetry
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
        
    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)
    
    video_source_path = save_path
    pipeline.counter.reset()
    pipeline.wrong_way_analyzer.reset()
    current_telemetry.clear()
    return jsonify({"status": "success", "filename": filename, "path": save_path})

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
