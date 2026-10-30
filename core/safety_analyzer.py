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

        # Simulation state cache (refreshed every 2-3 minutes or on demand)
        self.last_simulation_time = 0
        self.simulation_interval_sec = 150 # 2.5 minutes
        self.current_simulation_state = None

        # Comprehensive Monitored Streets across Tumakuru City with Baselines
        self.monitored_corridors = {
            "COR-01": {
                "id": "COR-01",
                "name": "SIT Main Gate Arterial (BH Road NH-206)",
                "zone": "Academic / Arterial Highway",
                "lat": 13.3276,
                "lng": 77.1259,
                "lighting_infrastructure": "High-Mast LED Smart Lamps (95% coverage)",
                "police_booth_distance_m": 80,
                "commercial_activity": "High (Shops, Cafes, ATMs active till 23:00)",
                "baseline_safety": 92
            },
            "COR-02": {
                "id": "COR-02",
                "name": "SIT Campus Inner Girls Hostel Lane",
                "zone": "SIT Campus Perimeter",
                "lat": 13.3238,
                "lng": 77.1285,
                "lighting_infrastructure": "Moderate Solar Streetlights (70% coverage)",
                "police_booth_distance_m": 450,
                "commercial_activity": "Low (Residential / Campus back stretch)",
                "baseline_safety": 60
            },
            "COR-03": {
                "id": "COR-03",
                "name": "Gandhi Nagar 2nd Cross Feeder Lane",
                "zone": "Residential Feeder",
                "lat": 13.3308,
                "lng": 77.1228,
                "lighting_infrastructure": "Sodium Vapor Lamps (Dim in mid-stretch)",
                "police_booth_distance_m": 600,
                "commercial_activity": "Moderate (Local kirana stores, close at 21:30)",
                "baseline_safety": 54
            },
            "COR-04": {
                "id": "COR-04",
                "name": "Railway Station Road & Auto Stand",
                "zone": "Public Transit Hub",
                "lat": 13.3392,
                "lng": 77.1085,
                "lighting_infrastructure": "Continuous High-Output Feeder Lamps",
                "police_booth_distance_m": 120,
                "commercial_activity": "24/7 Transit & Auto Stand Activity",
                "baseline_safety": 88
            },
            "COR-05": {
                "id": "COR-05",
                "name": "Ashoka Road Market Corridor",
                "zone": "Commercial Shopping",
                "lat": 13.3355,
                "lng": 77.1165,
                "lighting_infrastructure": "Standard Municipal Streetlights",
                "police_booth_distance_m": 350,
                "commercial_activity": "High evening footfall, closes by 22:00",
                "baseline_safety": 76
            },
            "COR-06": {
                "id": "COR-06",
                "name": "Batawadi High-Street Junction (NH-48)",
                "zone": "Highway Commercial",
                "lat": 13.3150,
                "lng": 77.1180,
                "lighting_infrastructure": "High-Power Highway High-Mast Luminaires",
                "police_booth_distance_m": 200,
                "commercial_activity": "24/7 Fuel Stations & Interstate Dhabas",
                "baseline_safety": 85
            },
            "COR-07": {
                "id": "COR-07",
                "name": "SS Puram Main Residential Road",
                "zone": "Residential Colony",
                "lat": 13.3420,
                "lng": 77.1120,
                "lighting_infrastructure": "Pole LED Streetlights (Some dark tree shadows)",
                "police_booth_distance_m": 750,
                "commercial_activity": "Low (Quiet residential after 21:00)",
                "baseline_safety": 52
            },
            "COR-08": {
                "id": "COR-08",
                "name": "Mandipet Wholesale Market Lane",
                "zone": "Wholesale Bazaar",
                "lat": 13.3380,
                "lng": 77.1020,
                "lighting_infrastructure": "Dense Market Sodium Lights (Deserted at night)",
                "police_booth_distance_m": 400,
                "commercial_activity": "Shops shutter by 20:30, completely deserted late",
                "baseline_safety": 46
            },
            "COR-09": {
                "id": "COR-09",
                "name": "Kyathsandra Toll Road Corridor",
                "zone": "Suburban Arterial",
                "lat": 13.3080,
                "lng": 77.1550,
                "lighting_infrastructure": "Expressway Median Lights (Intermittent gaps)",
                "police_booth_distance_m": 500,
                "commercial_activity": "Fast moving vehicular transit, low footfall",
                "baseline_safety": 68
            },
            "COR-10": {
                "id": "COR-10",
                "name": "Gubbi Gate Circle & KSRTC Road",
                "zone": "Bus Transit Center",
                "lat": 13.3460,
                "lng": 77.0980,
                "lighting_infrastructure": "Smart LED High Mast Array (90% coverage)",
                "police_booth_distance_m": 150,
                "commercial_activity": "Continuous night tea stalls & passenger movement",
                "baseline_safety": 82
            },
            "COR-11": {
                "id": "COR-11",
                "name": "Melekote Industrial Extension Lane",
                "zone": "Outer Industrial Area",
                "lat": 13.3550,
                "lng": 77.1350,
                "lighting_infrastructure": "Sparse Sodium Bulbs (Frequent deadzones)",
                "police_booth_distance_m": 1200,
                "commercial_activity": "Zero footfall at night, isolated warehouses",
                "baseline_safety": 32
            },
            "COR-12": {
                "id": "COR-12",
                "name": "Amanikere Lake Promenade Ring Road",
                "zone": "Waterfront / Open Park",
                "lat": 13.3310,
                "lng": 77.1040,
                "lighting_infrastructure": "Decorative Park Lanterns (Many unlit sections)",
                "police_booth_distance_m": 850,
                "commercial_activity": "Recreational evening walk till 20:00, isolated after",
                "baseline_safety": 38
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
            
        # 1. Pedestrian Natural Surveillance & Density (Max 35 pts)
        if ped_count == 0:
            ped_score = -25 # Deserted street penalty: zero natural guardianship
            density_level = "DESERTED"
            density_text = "Deserted (0 Pedestrians) - Zero Eyes on the Street"
        elif ped_count == 1:
            ped_score = -5   # Single person: high isolation risk
            density_level = "VERY_LOW"
            density_text = "Very Low (1 Pedestrian) - Solitary & Isolated"
        elif ped_count == 2:
            ped_score = 10  # Low density: minimal natural guardianship
            density_level = "LOW"
            density_text = "Low Density (2 Pedestrians) - Sparse Surveillance"
        elif 3 <= ped_count <= 8:
            ped_score = 30  # Optimal eyes-on-the-street
            density_level = "OPTIMAL"
            density_text = "Optimal Density (3-8 Pedestrians) - Active Natural Guardianship"
        else:
            ped_score = 25  # Bustling crowd
            density_level = "HIGH"
            density_text = "High Density (Crowded) - High Footfall"
            
        # 2. Traffic Flow / Passing Transit (Max 30 pts)
        if veh_count == 0:
            veh_score = -15 # Dead roadway
        elif 1 <= veh_count <= 3:
            veh_score = 10  # Light passing traffic
        elif 4 <= veh_count <= 12:
            veh_score = 25  # Active transit deterrence
        else:
            veh_score = 20  # Heavy traffic
            
        # 3. Time of Day Risk Adjustment
        if 7 <= hour_of_day <= 18:
            time_score = 15 # Daylight hours
        elif 19 <= hour_of_day <= 21:
            time_score = 0   # Evening dusk
        elif 22 <= hour_of_day <= 23:
            time_score = -12 # Late night
        else:
            time_score = -20 # Midnight to early morning (00:00 - 06:00)
            
        # Base safety constant
        base_constant = 35
        raw_score = base_constant + ped_score + veh_score + lum_score + time_score
        final_score = int(np.clip(raw_score, 5, 98))
        
        # Determine safety tier
        if final_score >= 75:
            tier = "HIGH_SAFETY"
            badge = "🟢 HIGH SAFETY: SAFE FOR SOLO TRAVEL"
            color = "#10b981"
            verdict = "Safe for women walking or traveling alone. Adequate natural surveillance with pedestrian presence, active road traffic, and sufficient street lighting."
        elif final_score >= 50:
            tier = "MODERATE_SAFETY"
            badge = "🟡 MODERATE SAFETY: CAUTION ADVISED"
            color = "#f59e0b"
            verdict = "Low pedestrian density and isolated stretches detected. Exercise caution when walking alone. Stay in illuminated roadway sections and share live route tracking."
        else:
            tier = "CRITICAL_RISK"
            badge = "🔴 HIGH VULNERABILITY: AVOID SOLO WALKING"
            color = "#ef4444"
            verdict = "Deserted or dark street corridor with low/negligible pedestrian density. Solo walking is NOT recommended! Use suggested illuminated bypass or request Pink Patrol / police escort."

        return final_score, tier, badge, color, verdict, density_level, density_text

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
        score, tier, badge, color_hex, verdict, density_level, density_text = self.calculate_safewalk_score(
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
                "pedestrian_density_level": density_level,
                "pedestrian_density_text": density_text,
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

        score, tier, badge, color_hex, verdict, density_level, density_text = self.calculate_safewalk_score(
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
                "pedestrian_density_level": density_level,
                "pedestrian_density_text": density_text,
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

    def simulate_all_tumkur_streets(self, simulated_hour=None, force_refresh=False):
        """
        Simulates and recalculates risk rate, pedestrian density, traffic flow,
        and streetlight illumination across all 12 monitored streets in Tumakuru.
        Refreshes dynamically every 2-3 minutes or upon manual trigger without requiring image uploads.
        """
        now = time.time()
        hour = simulated_hour if simulated_hour is not None else datetime.now().hour

        # Check if cached simulation is valid (within interval and same hour)
        if not force_refresh and self.current_simulation_state is not None:
            time_diff = now - self.last_simulation_time
            if time_diff < self.simulation_interval_sec and self.current_simulation_state.get("simulated_hour") == hour:
                remaining = max(0, int(self.simulation_interval_sec - time_diff))
                res = dict(self.current_simulation_state)
                res["next_refresh_seconds"] = remaining
                return res

        # Generate fresh simulation cycle across all Tumakuru streets
        streets_data = []
        for corr_id, corridor in self.monitored_corridors.items():
            base_safety = corridor["baseline_safety"]
            zone = corridor.get("zone", "Urban Road")
            
            # Determine pedestrian count based on zone & time of day
            if 7 <= hour <= 19: # Daytime
                if "Highway" in zone or "Transit" in zone or "Shopping" in zone:
                    peds = random.randint(5, 14)
                    vehs = random.randint(8, 20)
                elif "Campus" in zone or "Bazaar" in zone:
                    peds = random.randint(4, 10)
                    vehs = random.randint(4, 12)
                else: # Residential / Industrial / Waterfront
                    peds = random.randint(1, 4)
                    vehs = random.randint(2, 6)
                lum_score = 30
                lum_desc = "Bright Daylight"
                lum_quality = "BRIGHT_DAYLIGHT"
                lum_lumens = random.randint(150, 220)
            elif 20 <= hour <= 22: # Evening Dusk
                if "Highway" in zone or "Transit" in zone:
                    peds = random.randint(3, 7)
                    vehs = random.randint(5, 12)
                    lum_score = 18
                    lum_quality = "WELL_LIT_NIGHT"
                    lum_desc = "High-Mast Active"
                    lum_lumens = random.randint(85, 120)
                elif "Shopping" in zone or "Campus" in zone:
                    peds = random.randint(2, 5)
                    vehs = random.randint(3, 8)
                    lum_score = 10
                    lum_quality = "DIM_STREETLIGHTS"
                    lum_desc = "Sodium Lamps Active"
                    lum_lumens = random.randint(55, 80)
                else: # Residential / Industrial / Lake
                    peds = random.randint(0, 2)
                    vehs = random.randint(0, 3)
                    lum_score = -5 if ("Industrial" in zone or "Waterfront" in zone) else 5
                    lum_quality = "DIM_STREETLIGHTS" if lum_score > 0 else "DARK_DEADZONE"
                    lum_desc = "Dim / Scattered Shadows"
                    lum_lumens = random.randint(30, 50)
            else: # Late Night / Midnight (23:00 - 06:00)
                if "Transit" in zone or "Highway" in zone:
                    peds = random.randint(1, 3)
                    vehs = random.randint(2, 6)
                    lum_score = 12
                    lum_quality = "WELL_LIT_NIGHT"
                    lum_desc = "Continuous High-Mast LEDs"
                    lum_lumens = random.randint(70, 95)
                elif "Campus" in zone:
                    peds = random.randint(0, 1)
                    vehs = random.randint(0, 2)
                    lum_score = 0
                    lum_quality = "DIM_STREETLIGHTS"
                    lum_desc = "Solar Lamps (Dim)"
                    lum_lumens = random.randint(40, 60)
                else: # Deserted corridors
                    peds = 0 if random.random() < 0.75 else 1
                    vehs = random.randint(0, 2)
                    lum_score = -25 if ("Industrial" in zone or "Waterfront" in zone) else -10
                    lum_quality = "DARK_DEADZONE"
                    lum_desc = "Unlit / Blackout Deadzone"
                    lum_lumens = random.randint(15, 38)

            # Compute SafeWalk Score & Risk Rate
            score, tier, badge, color_hex, verdict, density_lvl, density_txt = self.calculate_safewalk_score(
                peds, vehs, lum_score, hour
            )

            # Risk Rate is the inverse of safety score (0 to 100%)
            risk_rate = 100 - score

            # Determine Risk Tier & Badge
            if risk_rate >= 50:
                risk_level = "CRITICAL_RISK"
                risk_badge = "🔴 CRITICAL RISK"
                risk_color = "#ef4444"
                solo_recommendation = "AVOID SOLO TRAVEL - Deserted & isolated. Use lit alternative bypass or request Pink Patrol escort."
                solo_recommended = False
            elif risk_rate >= 25:
                risk_level = "MODERATE_RISK"
                risk_badge = "🟡 MODERATE RISK"
                risk_color = "#f59e0b"
                solo_recommendation = "EXERCISE CAUTION - Low pedestrian density. Stay in center roadway and share live tracking."
                solo_recommended = False
            else:
                risk_level = "LOW_RISK"
                risk_badge = "🟢 LOW RISK (SAFE)"
                risk_color = "#10b981"
                solo_recommendation = "SAFE FOR SOLO WALKING - Active pedestrian flow, passing vehicles, and bright street illumination."
                solo_recommended = True

            # Police ETA
            booth_dist = corridor["police_booth_distance_m"]
            eta_mins = max(2, min(9, int(round(booth_dist / 140.0))))

            # Suggested Safe Bypass
            safe_bypass = None
            if risk_level != "LOW_RISK":
                safe_bypass = {
                    "route_name": "SIT Main Gate Arterial (BH Road NH-206)" if corr_id != "COR-01" else "Railway Station Road",
                    "reason": "Illuminated high-mast LEDs, continuous traffic flow, active police assistance booth.",
                    "distance_delta": "+150m (2 min walk)",
                    "bypass_safety_score": 93
                }

            streets_data.append({
                "id": corridor["id"],
                "name": corridor["name"],
                "zone": zone,
                "lat": corridor["lat"],
                "lng": corridor["lng"],
                "risk_rate_pct": risk_rate,
                "risk_level": risk_level,
                "risk_badge": risk_badge,
                "badge_color": risk_color,
                "safewalk_score": score,
                "solo_recommended": solo_recommended,
                "recommendation": solo_recommendation,
                "pedestrians_count": peds,
                "pedestrian_density_level": density_lvl,
                "pedestrian_density_text": density_txt,
                "vehicles_flow_per_min": vehs,
                "traffic_flow_level": "ACTIVE" if vehs >= 4 else "SPARSE" if vehs >= 1 else "EMPTY",
                "lighting": {
                    "quality": lum_quality,
                    "description": lum_desc,
                    "infrastructure": corridor["lighting_infrastructure"],
                    "luminance_value": lum_lumens
                },
                "security": {
                    "police_booth_distance_m": booth_dist,
                    "pink_patrol_eta_mins": eta_mins,
                    "pink_patrol_unit": f"Pink Patrol-{((int(corr_id.split('-')[-1]) % 4) + 1):02d}"
                },
                "safe_bypass": safe_bypass
            })

        # Calculate city summary
        avg_risk = int(round(sum(s["risk_rate_pct"] for s in streets_data) / len(streets_data)))
        high_risk_cnt = sum(1 for s in streets_data if s["risk_level"] == "CRITICAL_RISK")
        mod_risk_cnt = sum(1 for s in streets_data if s["risk_level"] == "MODERATE_RISK")
        safe_cnt = sum(1 for s in streets_data if s["risk_level"] == "LOW_RISK")

        streets_sorted = sorted(streets_data, key=lambda x: x["risk_rate_pct"], reverse=True)
        most_vulnerable = streets_sorted[0]["name"]
        safest = streets_sorted[-1]["name"]

        simulation_result = {
            "status": "success",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "simulated_hour": hour,
            "simulation_cycle_id": f"SIM-{int(now)}",
            "simulation_interval_sec": self.simulation_interval_sec,
            "next_refresh_seconds": self.simulation_interval_sec,
            "city_overview": {
                "city_name": "Tumakuru (Tumkur), Karnataka",
                "total_monitored_streets": len(streets_data),
                "average_risk_rate_pct": avg_risk,
                "high_risk_count": high_risk_cnt,
                "moderate_risk_count": mod_risk_cnt,
                "safe_count": safe_cnt,
                "most_vulnerable_street": most_vulnerable,
                "safest_street": safest,
                "active_pink_patrol_units": 6
            },
            "streets": streets_data
        }

        self.last_simulation_time = now
        self.current_simulation_state = simulation_result
        return simulation_result

# Global singleton
women_safety_analyzer = WomenSafetyAnalyzer()
