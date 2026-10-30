"""
RoadPulseAI - Narrow Street Bilateral Parking Enforcement Engine
Analyzes narrow street corridors from the nearest camera beacon to enforce single-side
parking mandates (e.g., Odd-Even day or designated curb rules) and detect illegal bilateral
parking that squeezes carriageway width and obstructs emergency vehicles.
"""

import math
import time
import random
from datetime import datetime
from database.db import log_violation

class NarrowStreetParkingAnalyzer:
    def __init__(self):
        # Database of monitored narrow streets and municipal single-side parking rules
        self.monitored_streets = {
            "NST-01": {
                "id": "NST-01",
                "name": "SIT 2nd Cross & Hostel Feeder",
                "corridor": "Gandhi Nagar to SIT Back Gate",
                "lat": 13.3308,
                "lng": 77.1228,
                "nominal_width_m": 6.2,
                "standard_carriageway_m": 6.2,
                "min_emergency_clearance_m": 3.5,
                "rule_type": "ODD_EVEN", # Odd days: Left curb | Even days: Right curb
                "manual_side_override": None, # "LEFT", "RIGHT", or None
                "nearest_camera": {
                    "id": "CAM-02",
                    "name": "CAM-02: Gandhi Nagar / SIT 2nd Cross",
                    "lat": 13.3308,
                    "lng": 77.1228
                },
                "signage": "Municipal Order No. 44/2026: Single Side Parking Only"
            },
            "NST-02": {
                "id": "NST-02",
                "name": "Ashoka Road Market Lane",
                "corridor": "SS Puram Circle to Vegetable Mandi",
                "lat": 13.3355,
                "lng": 77.1165,
                "nominal_width_m": 5.8,
                "standard_carriageway_m": 5.8,
                "min_emergency_clearance_m": 3.5,
                "rule_type": "DESIGNATED_LEFT", # Only Left curb permitted
                "manual_side_override": None,
                "nearest_camera": {
                    "id": "CAM-04",
                    "name": "CAM-04: Ashoka Road Urban Roundabout",
                    "lat": 13.3355,
                    "lng": 77.1165
                },
                "signage": "Left Curb Parking Only — Right Side Strictly No Parking"
            },
            "NST-03": {
                "id": "NST-03",
                "name": "SIT Campus Inner Perimeter Lane",
                "corridor": "Mechanical Block to Girls Hostel",
                "lat": 13.3258,
                "lng": 77.1272,
                "nominal_width_m": 6.6,
                "standard_carriageway_m": 6.6,
                "min_emergency_clearance_m": 3.5,
                "rule_type": "DESIGNATED_LEFT", # Only Left side designated parking bays
                "manual_side_override": None,
                "nearest_camera": {
                    "id": "CAM-01",
                    "name": "CAM-01: SIT Main Gate Arterial",
                    "lat": 13.3276,
                    "lng": 77.1259
                },
                "signage": "Campus Traffic Rule: Green Bay (Left) Parking Only"
            },
            "NST-04": {
                "id": "NST-04",
                "name": "Railway Station Parallel Collector Lane",
                "corridor": "Station Back Gate to Goods Shed Road",
                "lat": 13.3392,
                "lng": 77.1085,
                "nominal_width_m": 7.0,
                "standard_carriageway_m": 7.0,
                "min_emergency_clearance_m": 3.5,
                "rule_type": "DESIGNATED_RIGHT", # Right side designated
                "manual_side_override": None,
                "nearest_camera": {
                    "id": "CAM-05",
                    "name": "CAM-05: Railway Feeder High-Mast Beacon",
                    "lat": 13.3392,
                    "lng": 77.1085
                },
                "signage": "Designated Yellow Curb (Right) Parking Only"
            }
        }
        
        # Simulated parked vehicles cache per street for stable real-time monitoring
        self.cached_parked_vehicles = {}
        self._init_simulated_vehicles()

    def _init_simulated_vehicles(self):
        """Initializes realistic baseline parked vehicles on both curbs of narrow streets."""
        vehicles_pool = [
            {"id": "V-101", "type": "car", "model": "Maruti Swift", "plate": "KA-06-MB-4120", "side": "LEFT", "dist_from_curb_m": 0.2, "dwell_mins": 34},
            {"id": "V-102", "type": "car", "model": "Hyundai i20", "plate": "KA-06-EN-8819", "side": "LEFT", "dist_from_curb_m": 0.3, "dwell_mins": 52},
            {"id": "V-103", "type": "car", "model": "Tata Nexon", "plate": "KA-04-MJ-2041", "side": "RIGHT", "dist_from_curb_m": 0.25, "dwell_mins": 19},
            {"id": "V-104", "type": "auto_rickshaw", "model": "Bajaj Auto", "plate": "KA-06-TR-7112", "side": "RIGHT", "dist_from_curb_m": 0.4, "dwell_mins": 45},
            {"id": "V-105", "type": "motorcycle", "model": "Hero Splendor", "plate": "KA-06-X-9934", "side": "RIGHT", "dist_from_curb_m": 0.15, "dwell_mins": 78},
            {"id": "V-106", "type": "car", "model": "Honda City", "plate": "KA-02-PQ-5520", "side": "LEFT", "dist_from_curb_m": 0.2, "dwell_mins": 12},
        ]
        self.cached_parked_vehicles["NST-01"] = vehicles_pool

    def get_all_streets(self):
        """Returns list of all monitored narrow streets with their designated rules."""
        result = []
        for s_id, s in self.monitored_streets.items():
            curr_legal_side = self.get_designated_legal_side(s_id)
            result.append({
                **s,
                "current_legal_side": curr_legal_side,
                "current_prohibited_side": "RIGHT" if curr_legal_side == "LEFT" else "LEFT"
            })
        return result

    def find_nearest_street(self, lat, lng):
        """Finds the nearest narrow street corridor to the given coordinates."""
        closest_street = None
        min_dist = float('inf')
        
        for s_id, s in self.monitored_streets.items():
            # Haversine distance
            dlat = math.radians(s["lat"] - lat)
            dlng = math.radians(s["lng"] - lng)
            a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(s["lat"])) * math.sin(dlng / 2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            dist_km = 6371.0 * c
            
            if dist_km < min_dist:
                min_dist = dist_km
                closest_street = s
                
        return closest_street, min_dist

    def get_designated_legal_side(self, street_id):
        """
        Calculates the active legal parking side based on street policy or Odd/Even calendar day.
        Returns: 'LEFT' or 'RIGHT'
        """
        street = self.monitored_streets.get(street_id)
        if not street:
            return "LEFT"
            
        if street.get("manual_side_override") in ["LEFT", "RIGHT"]:
            return street["manual_side_override"]
            
        rule = street.get("rule_type", "DESIGNATED_LEFT")
        
        if rule == "DESIGNATED_LEFT":
            return "LEFT"
        elif rule == "DESIGNATED_RIGHT":
            return "RIGHT"
        elif rule == "ODD_EVEN":
            # Calendar day: Odd day = Left Curb / Even day = Right Curb
            day_of_month = datetime.now().day
            return "LEFT" if (day_of_month % 2 != 0) else "RIGHT"
            
        return "LEFT"

    def set_manual_override(self, street_id, side):
        """Allows an officer to set or reset a manual side override ('LEFT', 'RIGHT', or None)."""
        if street_id in self.monitored_streets:
            if side in ["LEFT", "RIGHT", None]:
                self.monitored_streets[street_id]["manual_side_override"] = side
                return True
        return False

    def analyze_street_parking(self, street_id="NST-01", camera_lat=None, camera_lng=None, live_boxes=None, frame_shape=(720, 1280)):
        """
        Performs narrow-street bilateral parking analysis:
        1. Identifies the nearest narrow street if coordinates provided.
        2. Determines the current legal parking side (e.g. Left vs Right).
        3. Classifies all detected parked vehicles as Legal or Violating.
        4. Calculates remaining carriageway width clearance and emergency bottleneck severity.
        """
        # Match nearest street if coords given
        if camera_lat is not None and camera_lng is not None:
            nearest_s, dist = self.find_nearest_street(camera_lat, camera_lng)
            if nearest_s:
                street_id = nearest_s["id"]
                
        street = self.monitored_streets.get(street_id, self.monitored_streets["NST-01"])
        legal_side = self.get_designated_legal_side(street["id"])
        prohibited_side = "RIGHT" if legal_side == "LEFT" else "LEFT"
        
        # Vehicles list: use live tracked boxes if available, otherwise high-fidelity cached scene
        vehicles = []
        h, w = frame_shape
        
        if live_boxes and len(live_boxes) > 0:
            for b in live_boxes:
                # b: [x1, y1, x2, y2, track_id, cls_id, conf]
                x1, y1, x2, y2 = b[:4]
                track_id = b[4] if len(b) > 4 else None
                conf = b[6] if len(b) > 6 else 0.85
                cx = (x1 + x2) / 2.0
                
                # Determine road curb side from lateral camera perspective
                veh_side = "LEFT" if cx < (w * 0.48) else "RIGHT"
                is_violating = (veh_side == prohibited_side)
                
                vehicles.append({
                    "id": f"LIVE-{track_id if track_id is not None else random.randint(100, 999)}",
                    "type": "vehicle",
                    "model": "Detected Vehicle",
                    "plate": f"KA-06-{random.randint(10,99)}-{random.randint(1000,9999)}",
                    "side": veh_side,
                    "is_violating": is_violating,
                    "confidence": float(conf),
                    "dist_from_curb_m": round(random.uniform(0.15, 0.45), 2),
                    "dwell_mins": random.randint(10, 60),
                    "fine_amount": 1000 if is_violating else 0,
                    "violation_reason": f"Parked on prohibited {veh_side} curb of narrow street" if is_violating else "Compliant with single-side parking rule"
                })
        else:
            # Load simulated / calibrated street vehicles
            base_list = self.cached_parked_vehicles.get(street["id"], self.cached_parked_vehicles["NST-01"])
            for v in base_list:
                is_violating = (v["side"] == prohibited_side)
                vehicles.append({
                    **v,
                    "is_violating": is_violating,
                    "confidence": 0.94,
                    "fine_amount": 1000 if is_violating else 0,
                    "violation_reason": f"Parked on prohibited {v['side']} curb of narrow street (Blocks two-way clearance)" if is_violating else "Compliant with single-side parking rule"
                })

        # Calculate counts
        legal_vehicles = [v for v in vehicles if not v["is_violating"]]
        violating_vehicles = [v for v in vehicles if v["is_violating"]]
        
        left_vehicles = [v for v in vehicles if v["side"] == "LEFT"]
        right_vehicles = [v for v in vehicles if v["side"] == "RIGHT"]
        
        # Carriageway clearance calculations
        nominal_width = street["nominal_width_m"]
        avg_car_width_m = 1.80
        
        left_obstruction_m = avg_car_width_m if len(left_vehicles) > 0 else 0.0
        right_obstruction_m = avg_car_width_m if len(right_vehicles) > 0 else 0.0
        
        total_obstruction_m = left_obstruction_m + right_obstruction_m
        effective_clearance_m = max(1.5, round(nominal_width - total_obstruction_m, 2))
        clearance_percentage = round((effective_clearance_m / nominal_width) * 100.0, 1)
        obstruction_percentage = round((total_obstruction_m / nominal_width) * 100.0, 1)
        
        # Check emergency vehicle clearance (Fire Engine / Ambulance requires min 3.5m)
        min_emergency_req = street["min_emergency_clearance_m"]
        emergency_accessible = effective_clearance_m >= min_emergency_req
        
        is_bilateral = (len(left_vehicles) > 0 and len(right_vehicles) > 0)
        
        if not emergency_accessible or (is_bilateral and len(violating_vehicles) >= 2):
            severity = "CRITICAL_BOTTLENECK"
            alert_headline = "🚨 EMERGENCY ACCESS BLOCKED: Bilateral Parking Gridlock!"
            alert_desc = f"Carriageway squeezed to {effective_clearance_m}m (requires {min_emergency_req}m for Fire/Ambulance). Immediate towing & challans recommended."
        elif len(violating_vehicles) > 0:
            severity = "MODERATE_OBSTRUCTION"
            alert_headline = "⚠️ Single-Side Parking Violation Detected"
            alert_desc = f"{len(violating_vehicles)} vehicles parked on prohibited {prohibited_side} curb. Clearance reduced by {obstruction_percentage}%."
        else:
            severity = "OPTIMAL_FLOW"
            alert_headline = "✅ Single-Side Parking Enforced"
            alert_desc = f"All parked vehicles adhere to designated {legal_side} curb. Full emergency clearance maintained."

        return {
            "status": "success",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "street": {
                "id": street["id"],
                "name": street["name"],
                "corridor": street["corridor"],
                "lat": street["lat"],
                "lng": street["lng"],
                "nominal_width_m": nominal_width,
                "rule_type": street["rule_type"],
                "signage": street["signage"],
                "nearest_camera": street["nearest_camera"]
            },
            "parking_policy": {
                "legal_side": legal_side,
                "prohibited_side": prohibited_side,
                "rule_summary": f"Single-Side Rule: {'ODD Day (Left Curb)' if legal_side == 'LEFT' and street['rule_type'] == 'ODD_EVEN' else 'EVEN Day (Right Curb)' if legal_side == 'RIGHT' and street['rule_type'] == 'ODD_EVEN' else f'Designated {legal_side} Curb Only'}"
            },
            "carriageway_clearance": {
                "nominal_width_m": nominal_width,
                "effective_clearance_m": effective_clearance_m,
                "clearance_percentage": clearance_percentage,
                "total_obstruction_m": round(total_obstruction_m, 2),
                "obstruction_percentage": obstruction_percentage,
                "left_curb_vehicles": len(left_vehicles),
                "right_curb_vehicles": len(right_vehicles),
                "is_bilateral_parking": is_bilateral,
                "min_emergency_required_m": min_emergency_req,
                "emergency_accessible": emergency_accessible,
                "severity": severity,
                "alert_headline": alert_headline,
                "alert_desc": alert_desc
            },
            "audit_summary": {
                "total_parked": len(vehicles),
                "legal_count": len(legal_vehicles),
                "violating_count": len(violating_vehicles),
                "compliance_rate": f"{round((len(legal_vehicles) / len(vehicles) * 100.0) if vehicles else 100.0, 1)}%",
                "total_penalties_incurred": len(violating_vehicles) * 1000
            },
            "parked_vehicles": vehicles
        }

    def issue_challan_for_violating_vehicles(self, street_id="NST-01"):
        """
        Automatically logs database violations and generates e-challans
        for all vehicles detected on the prohibited curb of the specified street.
        """
        analysis = self.analyze_street_parking(street_id)
        violating = [v for v in analysis["parked_vehicles"] if v["is_violating"]]
        
        issued_challans = []
        for veh in violating:
            try:
                # Log violation to database
                viol_id, challan_no = log_violation(
                    track_id=None,
                    violation_type="ILLEGAL_SIDE_PARKING",
                    vehicle_type=veh.get("type", "car"),
                    license_plate=veh.get("plate", "KA-06-UNKNOWN"),
                    confidence=veh.get("confidence", 0.92),
                    snapshot_path="/static/violations/sample_parking_viol.jpg"
                )
                issued_challans.append({
                    "vehicle_id": veh["id"],
                    "plate": veh["plate"],
                    "challan_number": challan_no,
                    "violation_id": viol_id,
                    "fine_amount": 1000.0,
                    "curb_side": veh["side"],
                    "status": "ISSUED"
                })
            except Exception as e:
                print(f"[ParkingAnalyzer] Challan issue error for {veh.get('plate')}: {e}")
                
        return {
            "status": "success",
            "street_id": street_id,
            "issued_count": len(issued_challans),
            "total_fine_amount": len(issued_challans) * 1000.0,
            "challans": issued_challans
        }

# Global singleton instance
narrow_street_analyzer = NarrowStreetParkingAnalyzer()
