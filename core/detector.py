"""
OmniTraffic AI - Detector Module
Integrates YOLOv8 COCO vehicle/person detection with custom helmet & plate models,
and uses HungarianTracker for reliable, self-contained multi-object tracking.
Properly differentiates between Pedestrians (people on foot) and Riders (people on two-wheelers).
"""

import os
import cv2
import numpy as np
from ultralytics import YOLO
from core.tracker import HungarianTracker

class MultiModelDetector:
    def __init__(self, coco_model_path="models/yolov8n.pt", 
                 helmet_model_path="models/helmet_best.pt",
                 conf_thresh=0.35):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.coco_path = os.path.join(base_dir, coco_model_path)
        self.helmet_path = os.path.join(base_dir, helmet_model_path)
        
        self.conf_thresh = conf_thresh
        
        # Load primary COCO model
        if not os.path.exists(self.coco_path):
            raise FileNotFoundError(f"COCO Model not found at {self.coco_path}")
        self.coco_model = YOLO(self.coco_path)
        
        # Self-contained tracker
        self.tracker = HungarianTracker(max_age=15, min_hits=1, iou_threshold=0.25)
        
        # Load dedicated helmet and plate model
        self.helmet_model = None
        if os.path.exists(self.helmet_path):
            try:
                self.helmet_model = YOLO(self.helmet_path)
                print(f"[Detector] Helmet/Plate model loaded: {self.helmet_path}")
            except Exception as e:
                print(f"[Detector] Warning: Could not load helmet model: {e}")
        
        # Relevant COCO classes:
        # 0: person, 1: bicycle, 2: car, 3: motorcycle, 5: bus, 7: truck
        self.target_coco_classes = {
            0: "person",
            1: "bicycle",
            2: "car",
            3: "motorcycle",
            5: "bus",
            7: "truck"
        }
        
        # Color palette for distinct vehicle classes (BGR)
        self.class_colors = {
            "car": (0, 165, 255),           # Orange
            "motorcycle": (255, 200, 0),     # Cyan-blue
            "bus": (255, 100, 0),           # Blue
            "truck": (255, 0, 200),         # Purple
            "bicycle": (0, 255, 200),       # Teal
            "pedestrian": (255, 180, 230),  # Soft Lavender / Violet
            "rider": (0, 225, 255),         # Vibrant Cyan
            "person": (255, 180, 230),      # Default to pedestrian styling
            "with helmet": (0, 255, 0),     # Green
            "without helmet": (0, 0, 255),  # Red
            "number plate": (255, 255, 0)   # Cyan
        }

    @staticmethod
    def _check_overlap(boxA, boxB):
        ax1, ay1, ax2, ay2 = boxA
        bx1, by1, bx2, by2 = boxB
        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
        inter = (ix2 - ix1) * (iy2 - iy1)
        areaA = max(1, (ax2 - ax1) * (ay2 - ay1))
        return inter / areaA

    def detect_vehicles_and_persons(self, frame):
        """
        Runs YOLO inference on the frame and updates HungarianTracker.
        Distinguishes between Pedestrians (walking/standing) and Riders (on two-wheelers).
        """
        results = self.coco_model.predict(
            frame, 
            conf=self.conf_thresh, 
            classes=list(self.target_coco_classes.keys()),
            verbose=False
        )
        
        raw_detections = []
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for box in boxes:
                cls_id = int(box.cls.item())
                if cls_id not in self.target_coco_classes:
                    continue
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                conf = float(box.conf.item())
                label = self.target_coco_classes[cls_id]
                
                raw_detections.append({
                    "bbox": [x1, y1, x2, y2],
                    "conf": conf,
                    "label": label
                })
                
        # Track objects across frames
        tracked_boxes = self.tracker.update(raw_detections)
        
        # Distinguish between Pedestrians and Riders
        two_wheelers = [b for b in tracked_boxes if b["label"] in ("motorcycle", "bicycle")]
        
        for obj in tracked_boxes:
            if obj["label"] in ("person", "pedestrian", "rider"):
                p_box = obj["bbox"]
                is_rider = False
                
                # Check overlap with any motorcycle or bicycle
                for tw in two_wheelers:
                    tw_box = tw["bbox"]
                    # Expand two-wheeler bounds slightly upwards where the rider sits
                    tw_rider_zone = [
                        tw_box[0] - int(tw["w"] * 0.15),
                        tw_box[1] - int(tw["h"] * 0.95),
                        tw_box[2] + int(tw["w"] * 0.15),
                        tw_box[3]
                    ]
                    if self._check_overlap(p_box, tw_rider_zone) > 0.20:
                        is_rider = True
                        break
                        
                if is_rider:
                    obj["label"] = "rider"
                else:
                    obj["label"] = "pedestrian"
                    
        return tracked_boxes

    def detect_helmets_and_plates(self, frame, conf=0.30):
        """
        Runs specialized helmet and plate model.
        Returns detections:
            dict with 'helmets', 'no_helmets', 'riders', 'plates'
        """
        if self.helmet_model is None:
            return {"helmets": [], "no_helmets": [], "riders": [], "plates": []}
            
        results = self.helmet_model.predict(frame, conf=conf, verbose=False)
        out = {"helmets": [], "no_helmets": [], "riders": [], "plates": []}
        
        if len(results) == 0 or results[0].boxes is None:
            return out
            
        boxes = results[0].boxes
        names = self.helmet_model.names
        
        for box in boxes:
            cls_id = int(box.cls.item())
            label = names.get(cls_id, str(cls_id)).lower()
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf_val = float(box.conf.item())
            
            det = {
                "bbox": [x1, y1, x2, y2],
                "cx": (x1 + x2) // 2,
                "cy": (y1 + y2) // 2,
                "conf": conf_val,
                "label": label
            }
            
            if "with helmet" in label or label == "helmet":
                out["helmets"].append(det)
            elif "without helmet" in label or "no helmet" in label or "nohelmet" in label:
                out["no_helmets"].append(det)
            elif "rider" in label:
                out["riders"].append(det)
            elif "plate" in label:
                out["plates"].append(det)
                
        return out
