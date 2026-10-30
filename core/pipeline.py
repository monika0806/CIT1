"""
RoadPulseAI - Unified Master Pipeline
Integrates Detection, Tracking, Counting, Classification, Density Estimation,
Helmet Detection, Triple Riding, Number Plate OCR, and Wrong-Way Enforcement.
"""

import cv2
import numpy as np
import time

from core.detector import MultiModelDetector
from core.counter import VehicleCounter
from core.density_analyzer import DensityAnalyzer
from core.helmet_analyzer import HelmetAnalyzer
from core.triple_riding_analyzer import TripleRidingAnalyzer
from core.wrong_way_analyzer import WrongWayAnalyzer
from core.license_plate_ocr import LicensePlateRecognizer
from core.violation_engine import ViolationEngine

class MasterTrafficPipeline:
    def __init__(self,
                 coco_model_path="models/yolov8n.pt",
                 helmet_model_path="models/helmet_best.pt",
                 expected_direction="auto",
                 line_y_ratio=0.60):
        
        print("[Pipeline] Initializing RoadPulseAI Pipeline...")
        self.detector = MultiModelDetector(coco_model_path, helmet_model_path)
        self.counter = VehicleCounter(line_y_ratio=line_y_ratio)
        self.density_analyzer = DensityAnalyzer()
        self.helmet_analyzer = HelmetAnalyzer()
        self.triple_riding_analyzer = TripleRidingAnalyzer()
        self.wrong_way_analyzer = WrongWayAnalyzer(expected_direction=expected_direction)
        self.plate_recognizer = LicensePlateRecognizer()
        self.violation_engine = ViolationEngine()
        
        # UI & Visualization Toggle Flags
        self.show_boxes = True
        self.show_tracks = True
        self.show_heatmap = False
        self.show_tripwire = True
        self.show_violations = True
        self.show_hud = True
        
        # Performance Tracking
        self.fps = 0.0
        self.last_time = time.time()
        self.frame_count = 0
        
        print("[Pipeline] All sub-engines initialized successfully!")

    def process_frame(self, frame):
        """
        Processes a single frame through the complete multi-task perception pipeline.
        Returns:
            annotated_frame: np.ndarray (rendered frame with visuals)
            telemetry: dict with live metrics, counts, density, and violations
        """
        self.frame_count += 1
        t_now = time.time()
        dt = t_now - self.last_time
        if dt > 0:
            self.fps = 0.9 * self.fps + 0.1 * (1.0 / dt)
        self.last_time = t_now
        
        h, w = frame.shape[:2]
        
        # 1. Vehicle & Person Detection with ByteTrack Tracking
        tracked_boxes = self.detector.detect_vehicles_and_persons(frame)
        
        # 2. Specialized Helmet & Plate Detection
        helmet_plate_dets = self.detector.detect_helmets_and_plates(frame)
        
        # 3. Vehicle Counting & Classification across Virtual Line
        count_stats = self.counter.update(tracked_boxes, h)
        
        # 4. Traffic Density & Congestion Analysis
        density_stats = self.density_analyzer.analyze_density(tracked_boxes, w, h)
        
        # 5. Safety & Law Enforcement Violation Analysis
        raw_violations = []
        
        # 5a. Helmet Detection Violation
        helmet_viols = self.helmet_analyzer.analyze(tracked_boxes, helmet_plate_dets, w, h)
        raw_violations.extend(helmet_viols)
        
        # 5b. Triple Riding Detection Violation
        triple_viols = self.triple_riding_analyzer.analyze(tracked_boxes, w, h)
        raw_violations.extend(triple_viols)
        
        # 5c. Driving in Wrong Direction Violation
        wrong_way_viols = self.wrong_way_analyzer.analyze(tracked_boxes, w, h)
        raw_violations.extend(wrong_way_viols)
        
        # 6. Aggregate Violations with Plate OCR & E-Challan Logging
        plate_candidates = helmet_plate_dets.get("plates", [])
        active_violations = self.violation_engine.process_violations(
            frame, raw_violations, self.plate_recognizer, plate_candidates
        )
        
        # 7. Render Visual Annotations
        annotated = frame.copy()
        
        # 7a. Thermal Heatmap overlay (if enabled)
        if self.show_heatmap:
            annotated = self.density_analyzer.generate_heatmap_overlay(annotated, tracked_boxes, alpha=0.45)
            
        # 7b. Virtual Counting Tripwire
        if self.show_tripwire:
            line_y = count_stats["count_line_y"]
            cv2.line(annotated, (0, line_y), (w, line_y), (0, 220, 255), 2)
            cv2.putText(annotated, f"TRIPWIRE (COUNT: {count_stats['total']})", 
                        (15, line_y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 2)
                        
        # 7c. Detected Vehicles & Pedestrians
        if self.show_boxes:
            for obj in tracked_boxes:
                label = obj["label"]
                track_id = obj.get("id")
                x1, y1, x2, y2 = obj["bbox"]
                color = self.detector.class_colors.get(label, (0, 255, 0))
                
                # Check if this object currently has an active violation
                has_violation = any(v.get("track_id") == track_id for v in active_violations)
                if has_violation:
                    color = (0, 0, 255) # Intense Red for violators
                    
                # Draw bounding box
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                
                # Label tag
                tag = f"{label.upper()}"
                if track_id is not None and self.show_tracks:
                    tag += f" #{track_id}"
                tag += f" {int(obj['conf']*100)}%"
                
                # Badge background
                (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                cv2.rectangle(annotated, (x1, max(0, y1 - 20)), (x1 + tw + 6, max(0, y1)), color, -1)
                cv2.putText(annotated, tag, (x1 + 3, max(0, y1 - 5)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0) if color != (0,0,255) else (255,255,255), 1, cv2.LINE_AA)
                            
        # 7d. Violation Overlays & Warning Badges
        if self.show_violations and active_violations:
            for v in active_violations:
                vx1, vy1, vx2, vy2 = v.get("bbox", [50, 50, 150, 150])
                vtype = v["violation"]
                vlabel = f"VIOLATION: {vtype}"
                if v.get("license_plate") and v["license_plate"] != "UNKNOWN":
                    vlabel += f" [{v['license_plate']}]"
                    
                # Red alert box around violator
                cv2.rectangle(annotated, (vx1, vy1), (vx2, vy2), (0, 0, 255), 3)
                cv2.putText(annotated, vlabel, (vx1, max(25, vy1 - 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)

        # 7e. Heads-Up Display (HUD) Dashboard
        if self.show_hud:
            self._render_hud(annotated, count_stats, density_stats, len(active_violations))

        # Telemetry payload for frontend / API consumers
        telemetry = {
            "fps": round(self.fps, 1),
            "frame_number": self.frame_count,
            "vehicle_count_visible": density_stats["vehicle_count"],
            "total_counted": count_stats["total"],
            "in_count": count_stats["in"],
            "out_count": count_stats["out"],
            "classification_visible": count_stats["current_visible"],
            "classification_cumulative": {
                "in": count_stats["by_class_in"],
                "out": count_stats["by_class_out"]
            },
            "density": {
                "congestion_pct": density_stats["congestion_pct"],
                "level_of_service": density_stats["level_of_service"],
                "status": density_stats["status"]
            },
            "active_violations": active_violations
        }
        
        return annotated, telemetry

    def _render_hud(self, img, counts, density, active_viol_count):
        """Draws a sleek semi-transparent HUD telemetry banner on the top-left."""
        hud_w = 340
        hud_h = 160
        overlay = img.copy()
        cv2.rectangle(overlay, (10, 10), (10 + hud_w, 10 + hud_h), (20, 20, 25), -1)
        cv2.addWeighted(overlay, 0.75, img, 0.25, 0, img)
        cv2.rectangle(img, (10, 10), (10 + hud_w, 10 + hud_h), (80, 80, 95), 1)
        
        # HUD Header
        cv2.putText(img, "ROADPULSE AI COMMAND HUD", (20, 32), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 215, 255), 2)
        cv2.line(img, (20, 40), (10 + hud_w - 10, 40), (60, 60, 75), 1)
        
        # Key Stats
        cv2.putText(img, f"FPS: {self.fps:.1f} | Vehicles Active: {density['vehicle_count']}", 
                    (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)
        cv2.putText(img, f"Total Counted: {counts['total']} (In: {counts['in']} | Out: {counts['out']})", 
                    (20, 82), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1)
                    
        # Density & LOS
        los_str = f"Density: {density['congestion_pct']}% | LOS: {density['level_of_service']} ({density['status']})"
        cv2.putText(img, los_str, (20, 104), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, density["color_bgr"], 1)
                    
        # Active Violations Alert
        viol_color = (0, 0, 255) if active_viol_count > 0 else (0, 255, 0)
        viol_text = f"Enforcement Alerts: {active_viol_count} active"
        cv2.putText(img, viol_text, (20, 126), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, viol_color, 2 if active_viol_count > 0 else 1)
                    
        # Classification quick list
        vis = counts["current_visible"]
        cls_summary = f"C:{vis.get('car', 0)} M:{vis.get('motorcycle', 0)} B:{vis.get('bus', 0)} T:{vis.get('truck', 0)} P:{vis.get('pedestrian', 0)}"
        cv2.putText(img, cls_summary, (20, 150), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.40, (180, 180, 180), 1)
