"""
OmniTraffic AI - Unified Violation Engine
Coordinates violation detection pipelines (Helmet, Triple Riding, Wrong Way, Plates),
debounces duplicate triggers per vehicle, stores violation snapshots, and logs to database.
"""

import os
import cv2
import time
from datetime import datetime
from collections import defaultdict
from database.db import log_violation

class ViolationEngine:
    def __init__(self, cooldown_seconds=10.0, output_dir="web/static/violations"):
        self.cooldown_seconds = cooldown_seconds
        
        # Base directory for violation snapshot images
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.output_dir = os.path.join(base_dir, output_dir)
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Debounce tracker: (track_id, violation_type) -> timestamp
        self.recent_violations = {}
        
        # Active in-memory violation list for UI stream
        self.active_frame_violations = []

    def _is_cooling_down(self, track_id, violation_type):
        if track_id is None:
            return False
        key = (track_id, violation_type)
        now = time.time()
        last_time = self.recent_violations.get(key, 0)
        if now - last_time < self.cooldown_seconds:
            return True
        self.recent_violations[key] = now
        return False

    def process_violations(self, frame, raw_violations, plate_recognizer=None, plate_candidates=None):
        """
        raw_violations: list of violation dicts from analyzers
        Returns:
            processed_violations: list of enriched violation dicts
        """
        self.active_frame_violations = []
        h, w = frame.shape[:2]
        
        for viol in raw_violations:
            track_id = viol.get("track_id")
            violation_type = viol.get("violation")
            vehicle_type = viol.get("vehicle_type", "vehicle")
            bbox = viol.get("bbox", [0, 0, w, h])
            conf = viol.get("conf", 0.8)
            
            # Check cooldown
            if self._is_cooling_down(track_id, violation_type):
                viol["logged"] = False
                self.active_frame_violations.append(viol)
                continue
                
            # Attempt to extract license plate for this vehicle
            plate_text = "UNKNOWN"
            plate_conf = 0.0
            if plate_recognizer is not None and bbox:
                plate_text, plate_conf, _ = plate_recognizer.extract_and_read(
                    frame, bbox, plate_candidates
                )
                if not plate_text:
                    plate_text = f"TRACK-{track_id if track_id is not None else 'NA'}"
            else:
                plate_text = f"TRACK-{track_id if track_id is not None else 'NA'}"
                
            # Crop violation snapshot
            x1, y1, x2, y2 = bbox
            pad = 20
            crop_x1 = max(0, x1 - pad)
            crop_y1 = max(0, y1 - pad)
            crop_x2 = min(w, x2 + pad)
            crop_y2 = min(h, y2 + pad)
            
            crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
            snapshot_filename = f"viol_{violation_type}_{int(time.time()*1000)}.jpg"
            snapshot_abs_path = os.path.join(self.output_dir, snapshot_filename)
            snapshot_web_path = f"/static/violations/{snapshot_filename}"
            
            if crop.size > 0:
                cv2.imwrite(snapshot_abs_path, crop)
            else:
                cv2.imwrite(snapshot_abs_path, frame)
                
            # Log to Database & Generate E-Challan
            violation_id, challan_no = log_violation(
                track_id=track_id,
                violation_type=violation_type,
                vehicle_type=vehicle_type,
                license_plate=plate_text,
                confidence=conf,
                snapshot_path=snapshot_web_path
            )
            
            viol_entry = {
                "id": violation_id,
                "challan_number": challan_no,
                "track_id": track_id,
                "violation": violation_type,
                "vehicle_type": vehicle_type,
                "license_plate": plate_text,
                "confidence": conf,
                "snapshot_url": snapshot_web_path,
                "bbox": bbox,
                "logged": True,
                "timestamp": datetime.now().strftime("%H:%M:%S")
            }
            
            self.active_frame_violations.append(viol_entry)
            
        return self.active_frame_violations
