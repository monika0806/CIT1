"""
RoadPulseAI - Women's Solo Travel & Corridor Safety Perception Engine (SafeWalk AI)
Analyzes natural surveillance ("Eyes on the Street" pedestrian density), active vehicular
traffic flow, and ambient illumination to calculate a comprehensive SafeWalk Index (0 - 100),
advising women on road safety for solo walking/traveling, and providing safe route bypasses.
"""

import os
import cv2
import time
import math
import random
import numpy as np
from datetime import datetime
from ultralytics import YOLO

class WomenSafetyAnalyzer:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.audits_dir = os.path.join(base_dir, "web", "static", "safety_audits")
        os.makedirs(self.audits_dir, exist_ok=True)
        
        # Load YOLO model
        yolo_path = os.path.join(base_dir, "models", "yolov8n.pt")
        try:
            self.yolo_model = YOLO(yolo_path) if os.path.exists(yolo_path) else None
        except Exception as e:
            print(f"[SafetyAnalyzer] Warning loading YOLO: {e}")
            self.yolo_model = None

        # Monitored Corridors around SIT Tumkur with Street Lighting & Safety Baselines
        self.monitored_corridors = {
            "COR-01": {
                "id": "COR-01",
                "name": "SIT Main Gate Arterial (BH Road NH-206)",
                "lat": 13.3276,
                "lng": 77.1259,
                "lighting_infrastructure": "High-Mast LED Smart Lamps (95% coverage)",
                "police_booth_distance_m": 80,
                "commercial_activity": "High (Shops, Cafes, ATMs active till 23:00)",
                "baseline_safety": 92
            },
            "COR-02": {
                "id": "COR-02",
                "name": "SIT Campus Inner Hostel Perimeter Lane",
                "lat": 13.3238,
                "lng": 77.1285,
                "lighting_infrastructure": "Moderate Solar Streetlights (70% coverage)",
                "police_booth_distance_m": 450,
                "commercial_activity": "Low (Residential / Campus back road)",
                "baseline_safety": 64
            },
            "COR-03": {
                "id": "COR-03",
                "name": "Gandhi Nagar 2nd Cross Feeder Lane",
                "lat": 13.3308,
                "lng": 77.1228,
                "lighting_infrastructure": "Sodium Vapor Lamps (Dim in mid-stretch)",
                "police_booth_distance_m": 600,
                "commercial_activity": "Moderate (Local kirana stores, close at 21:30)",
                "baseline_safety": 58
            },
            "COR-04": {
                "id": "COR-04",
                "name": "Railway Station Parallel Collector Road",
                "lat": 13.3392,
                "lng": 77.1085,
                "lighting_infrastructure": "Continuous High-Output Railway Feeder Lights",
                "police_booth_distance_m": 120,
                "commercial_activity": "24/7 Transit & Auto Stand Activity",
                "baseline_safety": 88
            },
            "COR-05": {
                "id": "COR-05",
                "name": "Ashoka Road Market Corridor",
                "lat": 13.3355,
                "lng": 77.1165,
                "lighting_infrastructure": "Standard Municipal Streetlights",
                "police_booth_distance_m": 350,
                "commercial_activity": "High evening footfall, quiet after 22:00",
                "baseline_safety": 76
            }
        }

    def get_monitored_corridors(self):
        """Returns list of monitored streets with their baseline safety characteristics."""
        return list(self.monitored_corridors.values())

    def compute_illumination_index(self, img):
        """
        Calculates ambient lighting & darkness factor from image frame:
        Returns:
            mean_luminance: float (0 - 255)
            dark_area_ratio: percentage of pixels with low intensity (< 40)
            lighting_quality: 'BRIGHT_DAYLIGHT', 'WELL_LIT', 'DIM', or 'DARK_DEADZONE'
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mean_lum = float(np.mean(gray))
        
        # Calculate percentage of very dark shadow areas
        dark_pixels = np.sum(gray < 40)
        total_pixels = gray.size
        dark_ratio = float((dark_pixels / total_pixels) * 100.0)
        
        if mean_lum > 140:
            quality = "BRIGHT_DAYLIGHT"
            score = 30
        elif mean_lum > 85:
            quality = "WELL_LIT_NIGHT"
            score = 22
        elif mean_lum > 50:
            quality = "DIM_STREETLIGHTS"
            score = 8
        else:
            quality = "DARK_DEADZONE"
            score = -25
            
        return round(mean_lum, 1), round(dark_ratio, 1), quality, score

    def calculate_safewalk_score(self, ped_count, veh_count, lum_score, hour_of_day=None):
        """
        Computes the comprehensive SafeWalk Index (0 - 100) based on:
        1. Natural Surveillance / Pedestrians (Eyes on the street)
        2. Active Traffic Flow
        3. Illumination / Lighting
        4. Time of Day
        """
        if hour_of_day is None:
            hour_of_day = datetime.now().hour
            
        # 1. Pedestrian Natural Surveillance (Max 35 pts)
        if ped_count == 0:
            ped_score = -25 # Deserted street penalty
        elif ped_count == 1:
            ped_score = 5   # Lone person
        elif ped_count == 2:
            ped_score = 18  # Sparse
        elif 3 <= ped_count <= 8:
            ped_score = 35  # Optimal eyes-on-the-street
        else:
            ped_score = 30  # Bustling crowd
            
        # 2. Traffic Flow / Passing Transit (Max 30 pts)
        if veh_count == 0:
            veh_score = -15 # Dead roadway
        elif 1 <= veh_count <= 3:
            veh_score = 15  # Light passing traffic
        elif 4 <= veh_count <= 12:
            veh_score = 30  # Active transit deterrence
        else:
            veh_score = 25  # Heavy traffic
            
        # 3. Time of Day Risk Adjustment
        if 7 <= hour_of_day <= 18:
            time_score = 15 # Daylight hours
        elif 19 <= hour_of_day <= 21:
            time_score = 5  # Early evening
        elif 22 <= hour_of_day <= 23:
            time_score = -10 # Late night
        else:
            time_score = -22 # Midnight to early morning (00:00 - 06:00)
            
        # Base safety constant
        base_constant = 40
        raw_score = base_constant + ped_score + veh_score + lum_score + time_score
        final_score = int(np.clip(raw_score, 5, 99))
        
        # Determine safety tier
        if final_score >= 80:
            tier = "HIGH_SAFETY"
            badge = "🟢 HIGH SAFETY: SAFE FOR SOLO TRAVEL"
            color = "#10b981"
            verdict = "Safe for women walking or traveling alone. Optimal natural surveillance with active pedestrian presence, continuous passing vehicles, and sufficient illumination."
        elif final_score >= 55:
            tier = "MODERATE_SAFETY"
            badge = "🟡 MODERATE SAFETY: CAUTION ADVISED"
            color = "#f59e0b"
            verdict = "Moderate safety level. Isolated spots detected along curb shoulders. Stay alert, walk in illuminated roadway sections, and share your live location with a trusted contact."
        else:
            tier = "CRITICAL_RISK"
            badge = "🔴 HIGH VULNERABILITY: AVOID SOLO WALKING"
            color = "#ef4444"
            verdict = "Deserted street corridor with low eyes-on-the-street and dark shadow zones. Solo walking is NOT recommended! Use suggested well-lit alternative bypass or request police patrol escort."

        return final_score, tier, badge, color, verdict

    def analyze_uploaded_image(self, image_path, hour_of_day=21, street_name="Surveillance Roadway Corridor"):
        """
        Runs YOLO perception directly on an uploaded street image or camera snapshot:
        1. Counts pedestrians (people on foot) and vehicles (active traffic).
        2. Computes ambient brightness & shadow distribution.
        3. Draws visual detection overlays (Cyan for pedestrians, Orange for vehicles).
        4. Calculates the Women's Solo Travel SafeWalk Index (0 - 100).
        5. Suggests safe illuminated bypass alternatives.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at {image_path}")

        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not decode image file")

        h, w = img.shape[:2]
        if max(h, w) > 1600:
            scale = 1600.0 / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            h, w = img.shape[:2]

        annotated_img = img.copy()
        
        # 1. Compute ambient lighting & darkness factor
        mean_lum, dark_ratio, lum_quality, lum_score = self.compute_illumination_index(img)
        
        # 2. Run YOLOv8 Detection
        pedestrians = []
        vehicles = []
        
        if self.yolo_model is not None:
            results = self.yolo_model.predict(img, conf=0.18, verbose=False)
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    coords = box.xyxy[0].cpu().numpy().astype(int)
                    x1, y1, x2, y2 = coords
                    
                    # Person (class 0)
                    if cls_id == 0:
                        pedestrians.append({
                            "id": f"PED-{len(pedestrians)+1:02d}",
                            "type": "pedestrian",
                            "confidence": round(conf, 2),
                            "bbox": [int(x1), int(y1), int(x2), int(y2)],
                            "center": [int((x1 + x2) / 2), int((y1 + y2) / 2)]
                        })
                    # Vehicles (car: 2, motorcycle: 3, bus: 5, truck: 7, bicycle: 1)
                    elif cls_id in [1, 2, 3, 5, 7]:
                        veh_type = {1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}.get(cls_id, "vehicle")
                        vehicles.append({
                            "id": f"VEH-{len(vehicles)+1:02d}",
                            "type": veh_type,
                            "confidence": round(conf, 2),
                            "bbox": [int(x1), int(y1), int(x2), int(y2)]
                        })

        # 3. Calculate SafeWalk Index
        ped_count = len(pedestrians)
        veh_count = len(vehicles)
        score, tier, badge, color_hex, verdict = self.calculate_safewalk_score(
            ped_count, veh_count, lum_score, hour_of_day
        )

        # 4. Draw Vision Overlays on Image
        # Draw Pedestrian bounding boxes (Vibrant Cyan / Lavender)
        for ped in pedestrians:
            x1, y1, x2, y2 = ped["bbox"]
            cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (255, 220, 0), 2) # Cyan/Yellow BGR
            # Header pill
            label = "PEDESTRIAN (Eyes on Street)"
            cv2.rectangle(annotated_img, (x1, max(0, y1 - 22)), (x1 + 185, y1), (255, 220, 0), -1)
            cv2.putText(annotated_img, label, (x1 + 4, max(0, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (10, 10, 10), 1, cv2.LINE_AA)

        # Draw Vehicle bounding boxes (Orange/Blue)
        for veh in vehicles:
            x1, y1, x2, y2 = veh["bbox"]
            cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 165, 255), 2) # Orange BGR
            label = f"{veh['type'].upper()} (Active Transit)"
            cv2.rectangle(annotated_img, (x1, max(0, y1 - 22)), (x1 + 150, y1), (0, 165, 255), -1)
            cv2.putText(annotated_img, label, (x1 + 4, max(0, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (10, 10, 10), 1, cv2.LINE_AA)

        # 5. Top Cyber HUD Overlay on Image
        hud_h = 75
        overlay = annotated_img.copy()
        cv2.rectangle(overlay, (0, 0), (w, hud_h), (8, 12, 22), -1)
        cv2.addWeighted(overlay, 0.88, annotated_img, 0.12, 0, annotated_img)
        
        # Border glow line colored by safety tier
        bgr_color = (16, 185, 129) if tier == "HIGH_SAFETY" else (245, 158, 11) if tier == "MODERATE_SAFETY" else (239, 68, 68)
        # BGR conversion:
        hud_line_bgr = (40, 210, 50) if tier == "HIGH_SAFETY" else (10, 180, 250) if tier == "MODERATE_SAFETY" else (30, 30, 235)
        cv2.line(annotated_img, (0, hud_h), (w, hud_h), hud_line_bgr, 3)

        cv2.putText(annotated_img, "ROADPULSE AI - WOMEN'S SOLO TRAVEL SAFETY AUDITOR (SafeWalk AI)", (20, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 245, 255), 2, cv2.LINE_AA)
        hud_metrics = f"SAFEWALK INDEX: {score}/100 [{tier.replace('_', ' ')}] | EYES ON STREET: {ped_count} PEDESTRIANS | TRAFFIC: {veh_count} VEHICLES | ILLUMINATION: {mean_lum}/255"
        cv2.putText(annotated_img, hud_metrics, (20, 56), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (230, 240, 255), 1, cv2.LINE_AA)

        # 6. Save annotated & original images
        ts = int(time.time() * 1000)
        annotated_fn = f"safety_audit_{ts}.jpg"
        orig_fn = f"safety_orig_{ts}.jpg"
        
        cv2.imwrite(os.path.join(self.audits_dir, annotated_fn), annotated_img)
        cv2.imwrite(os.path.join(self.audits_dir, orig_fn), img)

        annotated_web_url = f"/static/safety_audits/{annotated_fn}"
        orig_web_url = f"/static/safety_audits/{orig_fn}"

        # 7. Safe Alternative Bypass Recommendations
        safe_bypasses = []
        if tier != "HIGH_SAFETY":
            safe_bypasses = [
                {
                    "route_name": "SIT Main Gate Arterial (BH Road NH-206)",
                    "reason": "Continuous high-mast LED lighting, active police assistance booth (80m away), open cafes & student activity.",
                    "distance_delta": "+150 meters (2 min walk)",
                    "safety_score": 94
                },
                {
                    "route_name": "Railway Station Commercial Corridor Parallel",
                    "reason": "24/7 CCTV surveillance, active auto-rickshaw stand, high natural guardianship.",
                    "distance_delta": "+280 meters (3.5 min walk)",
                    "safety_score": 89
                }
            ]

        return {
            "status": "success",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "corridor_name": street_name,
            "hour_of_day": hour_of_day,
            "annotated_image_url": annotated_web_url,
            "original_image_url": orig_web_url,
            "safety_assessment": {
                "safewalk_score": score,
                "tier": tier,
                "badge": badge,
                "badge_color": color_hex,
                "verdict": verdict,
                "solo_walking_recommended": (tier == "HIGH_SAFETY")
            },
            "perception_metrics": {
                "pedestrians_detected": ped_count,
                "natural_surveillance_level": "OPTIMAL" if ped_count >= 3 else "LOW" if ped_count >= 1 else "DESERTED (HIGH RISK)",
                "vehicles_detected": veh_count,
                "traffic_flow_level": "ACTIVE" if veh_count >= 4 else "SPARSE" if veh_count >= 1 else "EMPTY",
                "ambient_illumination": {
                    "mean_luminance": mean_lum,
                    "dark_shadow_ratio_pct": dark_ratio,
                    "quality": lum_quality
                }
            },
            "emergency_actions": {
                "pink_patrol_recommended": (tier == "CRITICAL_RISK"),
                "nearby_safe_bypasses": safe_bypasses,
                "emergency_helpline": "Dial 112 (Karnataka Police) / 1091 (Women's Helpline)"
            },
            "detected_entities": {
                "pedestrians": pedestrians,
                "vehicles": vehicles
            }
        }

    def audit_corridor_by_id(self, corridor_id="COR-01", simulated_hour=21):
        """
        Calculates safety score for monitored campus/urban corridors around SIT Tumkur
        based on time of day, historical flow patterns, and real-time simulator state.
        """
        corridor = self.monitored_corridors.get(corridor_id, self.monitored_corridors["COR-01"])
        
        # Simulate realistic pedestrian and vehicle presence based on hour & corridor type
        if 7 <= simulated_hour <= 19:
            base_peds = random.randint(4, 9) if corridor["id"] in ["COR-01", "COR-05"] else random.randint(2, 5)
            base_vehs = random.randint(6, 14) if corridor["id"] in ["COR-01", "COR-04"] else random.randint(2, 6)
            lum_score = 30
            lum_quality = "BRIGHT_DAYLIGHT"
        elif 20 <= simulated_hour <= 22:
            base_peds = random.randint(2, 5) if corridor["id"] == "COR-01" else random.randint(0, 2)
            base_vehs = random.randint(4, 8) if corridor["id"] in ["COR-01", "COR-04"] else random.randint(0, 2)
            lum_score = 18 if corridor["id"] in ["COR-01", "COR-04"] else 5
            lum_quality = "WELL_LIT_NIGHT" if corridor["id"] in ["COR-01", "COR-04"] else "DIM_STREETLIGHTS"
        else: # Late night (23:00 - 05:00)
            base_peds = 0 if corridor["id"] != "COR-04" else random.randint(1, 3)
            base_vehs = random.randint(0, 2) if corridor["id"] != "COR-04" else random.randint(2, 4)
            lum_score = 12 if corridor["id"] in ["COR-01", "COR-04"] else -20
            lum_quality = "WELL_LIT_NIGHT" if corridor["id"] in ["COR-01", "COR-04"] else "DARK_DEADZONE"

        score, tier, badge, color_hex, verdict = self.calculate_safewalk_score(
            base_peds, base_vehs, lum_score, simulated_hour
        )

        safe_bypasses = []
        if tier != "HIGH_SAFETY":
            safe_bypasses = [
                {
                    "route_name": "SIT Main Gate Arterial (BH Road NH-206)",
                    "reason": "Illuminated high-mast LEDs, continuous traffic flow, active police assistance booth.",
                    "distance_delta": "+150m (2 min)",
                    "safety_score": 93
                }
            ]

        return {
            "status": "success",
            "corridor": corridor,
            "hour_of_day": simulated_hour,
            "safety_assessment": {
                "safewalk_score": score,
                "tier": tier,
                "badge": badge,
                "badge_color": color_hex,
                "verdict": verdict,
                "solo_walking_recommended": (tier == "HIGH_SAFETY")
            },
            "perception_metrics": {
                "pedestrians_detected": base_peds,
                "natural_surveillance_level": "OPTIMAL" if base_peds >= 3 else "LOW" if base_peds >= 1 else "DESERTED (HIGH RISK)",
                "vehicles_detected": base_vehs,
                "traffic_flow_level": "ACTIVE" if base_vehs >= 4 else "SPARSE" if base_vehs >= 1 else "EMPTY",
                "ambient_illumination": {
                    "quality": lum_quality,
                    "infrastructure": corridor["lighting_infrastructure"]
                }
            },
            "emergency_actions": {
                "pink_patrol_recommended": (tier == "CRITICAL_RISK"),
                "nearby_safe_bypasses": safe_bypasses,
                "emergency_helpline": "Dial 112 (Karnataka Police) / 1091 (Women's Helpline)"
            }
        }

# Global singleton
women_safety_analyzer = WomenSafetyAnalyzer()
