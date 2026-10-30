"""
OmniTraffic AI - SIT Tumkur Karnataka Traffic Intensity & Congestion Prediction Simulator
Simulates microscopic & macroscopic traffic flow, spatial density heatmaps, and predictive
bottleneck forecasting around Siddaganga Institute of Technology (SIT), Tumakuru.
"""

import time
import math
import random
from datetime import datetime

class SITTumkurTrafficSimulator:
    def __init__(self):
        # Center of SIT Tumkur campus
        self.center = [13.3275, 77.1261]
        
        # Junctions / Nodes in and around SIT Tumkur
        self.nodes = {
            "J1": {
                "id": "J1",
                "name": "SIT Main Gate (BH Road)",
                "lat": 13.3275,
                "lng": 13.3275, # will set proper coords
                "lat": 13.3276,
                "lng": 77.1259,
                "type": "college_gate",
                "capacity": 75, # max vehicles in zone
                "base_speed": 45.0, # km/h free flow
                "description": "Primary entrance of SIT on Bengaluru-Honnavar Road (NH 206)"
            },
            "J2": {
                "id": "J2",
                "name": "Gandhi Nagar / SIT 2nd Cross",
                "lat": 13.3308,
                "lng": 77.1228,
                "type": "residential_arterial",
                "capacity": 55,
                "base_speed": 40.0,
                "description": "Commercial feeder connecting SIT to Tumkur town"
            },
            "J3": {
                "id": "J3",
                "name": "Batawadi Junction (NH-48 Feeder)",
                "lat": 13.3342,
                "lng": 77.1352,
                "type": "highway_interchange",
                "capacity": 120,
                "base_speed": 55.0,
                "description": "Major intersection linking Tumkur city with Bengaluru-Pune Expressway"
            },
            "J4": {
                "id": "J4",
                "name": "SIT Back Gate & Engineering Hostel",
                "lat": 13.3238,
                "lng": 77.1285,
                "type": "hostel_zone",
                "capacity": 45,
                "base_speed": 35.0,
                "description": "Hostel corridor and student transit access point"
            },
            "J5": {
                "id": "J5",
                "name": "Kyathsandra Road / Siddaganga Math Access",
                "lat": 13.3182,
                "lng": 77.1425,
                "type": "pilgrim_arterial",
                "capacity": 90,
                "base_speed": 50.0,
                "description": "Arterial route to the historic Siddaganga Math"
            },
            "J6": {
                "id": "J6",
                "name": "SS Puram / Ashoka Road Circle",
                "lat": 13.3355,
                "lng": 77.1165,
                "type": "urban_circle",
                "capacity": 85,
                "base_speed": 38.0,
                "description": "Busy commercial roundabout with heavy mixed traffic"
            },
            "J7": {
                "id": "J7",
                "name": "Railway Station Parallel Corridor",
                "lat": 13.3392,
                "lng": 77.1085,
                "type": "railway_hub",
                "capacity": 95,
                "base_speed": 42.0,
                "description": "Feeder corridor along Tumakuru Central Railway"
            },
            "J8": {
                "id": "J8",
                "name": "Town Hall Circle (City Core)",
                "lat": 13.3420,
                "lng": 77.1020,
                "type": "civic_hub",
                "capacity": 130,
                "base_speed": 35.0,
                "description": "Central municipal circle with automated traffic signaling"
            }
        }
        
        # Road corridors / segments connecting the junctions
        self.segments = [
            {
                "id": "SEG-01",
                "name": "BH Road (NH-206) — SIT Main Frontage",
                "from": "J1",
                "to": "J2",
                "path": [
                    [13.3276, 77.1259],
                    [13.3288, 77.1248],
                    [13.3308, 77.1228]
                ],
                "length_km": 0.45,
                "lanes": 4,
                "capacity_vph": 2200
            },
            {
                "id": "SEG-02",
                "name": "BH Road Expressway Link to Batawadi",
                "from": "J1",
                "to": "J3",
                "path": [
                    [13.3276, 77.1259],
                    [13.3295, 77.1292],
                    [13.3318, 77.1322],
                    [13.3342, 77.1352]
                ],
                "length_km": 1.25,
                "lanes": 6,
                "capacity_vph": 3600
            },
            {
                "id": "SEG-03",
                "name": "SIT Campus Inner Perimeter & Hostel Lane",
                "from": "J1",
                "to": "J4",
                "path": [
                    [13.3276, 77.1259],
                    [13.3258, 77.1272],
                    [13.3238, 77.1285]
                ],
                "length_km": 0.52,
                "lanes": 2,
                "capacity_vph": 1100
            },
            {
                "id": "SEG-04",
                "name": "Kyathsandra Siddaganga Math Feeder",
                "from": "J4",
                "to": "J5",
                "path": [
                    [13.3238, 77.1285],
                    [13.3210, 77.1350],
                    [13.3182, 77.1425]
                ],
                "length_km": 1.70,
                "lanes": 4,
                "capacity_vph": 2400
            },
            {
                "id": "SEG-05",
                "name": "Batawadi to Kyathsandra Outer Bypass",
                "from": "J3",
                "to": "J5",
                "path": [
                    [13.3342, 77.1352],
                    [13.3265, 77.1390],
                    [13.3182, 77.1425]
                ],
                "length_km": 2.10,
                "lanes": 4,
                "capacity_vph": 2800
            },
            {
                "id": "SEG-06",
                "name": "Ashoka Road Urban Link",
                "from": "J2",
                "to": "J6",
                "path": [
                    [13.3308, 77.1228],
                    [13.3332, 77.1195],
                    [13.3355, 77.1165]
                ],
                "length_km": 0.85,
                "lanes": 2,
                "capacity_vph": 1300
            },
            {
                "id": "SEG-07",
                "name": "SS Puram to Railway Hub",
                "from": "J6",
                "to": "J7",
                "path": [
                    [13.3355, 77.1165],
                    [13.3375, 77.1125],
                    [13.3392, 77.1085]
                ],
                "length_km": 0.95,
                "lanes": 4,
                "capacity_vph": 2100
            },
            {
                "id": "SEG-08",
                "name": "Railway Station to Town Hall Core",
                "from": "J7",
                "to": "J8",
                "path": [
                    [13.3392, 77.1085],
                    [13.3406, 77.1052],
                    [13.3420, 77.1020]
                ],
                "length_km": 0.72,
                "lanes": 4,
                "capacity_vph": 2500
            },
            {
                "id": "SEG-09",
                "name": "Tumkur Ring Road — Batawadi to SS Puram Bypass",
                "from": "J3",
                "to": "J6",
                "path": [
                    [13.3342, 77.1352],
                    [13.3360, 77.1260],
                    [13.3355, 77.1165]
                ],
                "length_km": 2.15,
                "lanes": 4,
                "capacity_vph": 2900
            },
            {
                "id": "SEG-10",
                "name": "Northern Arterial — Town Hall to Batawadi Link",
                "from": "J8",
                "to": "J3",
                "path": [
                    [13.3420, 77.1020],
                    [13.3385, 77.1180],
                    [13.3342, 77.1352]
                ],
                "length_km": 3.35,
                "lanes": 6,
                "capacity_vph": 3800
            },
            {
                "id": "SEG-11",
                "name": "SIT 1st Cross Arterial — SIT Main to SS Puram",
                "from": "J1",
                "to": "J6",
                "path": [
                    [13.3276, 77.1259],
                    [13.3315, 77.1210],
                    [13.3355, 77.1165]
                ],
                "length_km": 1.30,
                "lanes": 2,
                "capacity_vph": 1400
            },
            {
                "id": "SEG-12",
                "name": "Batawadi to Gandhi Nagar Commercial Link",
                "from": "J3",
                "to": "J2",
                "path": [
                    [13.3342, 77.1352],
                    [13.3320, 77.1280],
                    [13.3308, 77.1228]
                ],
                "length_km": 1.40,
                "lanes": 4,
                "capacity_vph": 2300
            }
        ]
        
        # Live camera injection from video feed
        self.live_camera = None

        # Simulation Configuration & States
        self.scenario = "college_rush" # "normal", "college_rush", "heavy_monsoon", "highway_diverted"
        self.time_override_hour = None # None means use actual system clock hour
        self.weather = "clear" # "clear", "monsoon_rain", "fog"
        self.speed_multiplier = 1.0
        
        # Real-time state memory
        self.state = {}
        self.last_update = 0
        self._initialize_state()

    def _initialize_state(self):
        """Initializes baseline state for all nodes and segments."""
        now = time.time()
        self.last_update = now
        for jid, node in self.nodes.items():
            self.state[jid] = {
                "active_vehicles": int(node["capacity"] * 0.4),
                "inflow_rate": 20,
                "avg_speed": node["base_speed"],
                "congestion_pct": 35.0,
                "los": "B",
                "trend": "STABLE",
                "queue_meters": 30
            }

    def set_scenario(self, scenario_name):
        valid = ["normal", "college_rush", "heavy_monsoon", "highway_diverted"]
        if scenario_name in valid:
            self.scenario = scenario_name
            if scenario_name == "heavy_monsoon":
                self.weather = "monsoon_rain"
            else:
                self.weather = "clear"
            return True
        return False

    def _get_diurnal_multiplier(self, hour, minute):
        """Returns diurnal traffic intensity factor (0.2 to 1.5) throughout the 24-hour day."""
        t = hour + (minute / 60.0)
        # Night calm (10:00 PM to 06:00 AM)
        if t < 6.0 or t >= 22.0:
            return 0.25 + 0.06 * math.sin(t)
        # Morning buildup (06:00 to 08:00 AM)
        elif 6.0 <= t < 8.0:
            return 0.45 + 0.25 * (t - 6.0)
        # Morning College Rush Peak (08:00 to 10:00 AM)
        elif 8.0 <= t < 10.0:
            return 1.35 - 0.35 * abs(t - 9.0)
        # Midday Regular & Lunch (10:00 AM to 04:00 PM)
        elif 10.0 <= t < 16.0:
            lunch_bump = 0.25 * math.exp(-((t - 13.5) ** 2) / 0.8)
            return 0.72 + lunch_bump
        # Evening Peak Rush (04:00 to 07:30 PM)
        elif 16.0 <= t < 19.5:
            return 1.40 - 0.28 * abs(t - 18.0)
        # Evening winding down (07:30 to 10:00 PM)
        else:
            return max(0.35, 0.95 - 0.28 * (t - 19.5))

    def update(self):
        """Executes one simulation step recalculating all traffic flows."""
        now = datetime.now()
        hour = self.time_override_hour if self.time_override_hour is not None else now.hour
        minute = now.minute
        
        diurnal_factor = self._get_diurnal_multiplier(hour, minute)
        
        # Scenario Multipliers
        scenario_mults = {
            "normal": 1.0,
            "college_rush": 1.75,
            "heavy_monsoon": 1.40,
            "highway_diverted": 2.10
        }
        sc_factor = scenario_mults.get(self.scenario, 1.0)
        
        weather_speed_penalty = 0.65 if self.weather == "monsoon_rain" else 1.0
        
        # Update each node
        for jid, node in self.nodes.items():
            st = self.state[jid]
            cap = node["capacity"]
            base_spd = node["base_speed"]
            
            # Special Node-Specific Factors (e.g. SIT Main Gate spikes during college rush)
            node_boost = 1.0
            if jid == "J1" and self.scenario == "college_rush":
                node_boost = 2.1
            elif jid in ("J3", "J5") and self.scenario == "highway_diverted":
                node_boost = 2.3
            elif jid == "J4": # hostel
                node_boost = 1.3 if (12.5 <= hour <= 14.0 or 17.0 <= hour <= 19.0) else 0.8
                
            # Random natural fluctuations
            noise = random.uniform(0.92, 1.08)
            
            # Node-specific baseline occupancy (0.35 to 0.55) modulated by diurnal curve and scenario
            base_demand = 0.42 * (diurnal_factor / 1.8) * (1.0 + 0.35 * (sc_factor - 1.0)) * node_boost * noise
            effective_density = min(0.98, max(0.15, base_demand))
            simulated_vehicles = max(3, int(cap * effective_density))
            
            # Congestion Percentage (0% - 100%)
            congestion_pct = min(100.0, max(8.0, (simulated_vehicles / cap) * 100.0))
            
            # Speed based on Greenshields traffic density curve
            occupancy_ratio = min(1.0, simulated_vehicles / max(1, cap))
            current_speed = max(8.0, base_spd * (1.0 - 0.65 * occupancy_ratio) * weather_speed_penalty)
            
            # Level of Service (LOS)
            if congestion_pct < 28:
                los = "A" # Free flow
            elif congestion_pct < 45:
                los = "B" # Stable flow
            elif congestion_pct < 65:
                los = "C" # Approaching capacity
            elif congestion_pct < 80:
                los = "D" # High density
            elif congestion_pct < 92:
                los = "E" # Severe congestion
            else:
                los = "F" # Breakdown / Gridlock
                
            # Queue length
            queue_m = max(0, int((congestion_pct - 35) * 4.2)) if congestion_pct > 35 else 0
            
            # Trend calculation
            prev = st.get("congestion_pct", congestion_pct)
            if congestion_pct - prev > 1.8:
                trend = "INCREASING"
            elif prev - congestion_pct > 1.8:
                trend = "DECREASING"
            else:
                trend = "STABLE"
                
            st["active_vehicles"] = simulated_vehicles
            st["inflow_rate"] = int(simulated_vehicles * random.uniform(0.8, 1.4))
            st["avg_speed"] = round(current_speed, 1)
            st["congestion_pct"] = round(congestion_pct, 1)
            st["los"] = los
            st["trend"] = trend
            st["queue_meters"] = queue_m
            
        self.last_update = time.time()

    def get_heatmap_points(self):
        """
        Generates dense coordinate points with intensity weights [lat, lng, weight]
        for rendering in Leaflet.heat across roads and intersections.
        """
        self.update()
        points = []
        
        # 1. Node Hotspots
        for jid, node in self.nodes.items():
            st = self.state[jid]
            # normalized weight 0.1 to 1.0
            weight = max(0.12, min(1.0, st["congestion_pct"] / 100.0))
            points.append([node["lat"], node["lng"], round(weight, 3)])
            
            # Add small surrounding jitter points for visual depth
            radius = 0.00075 * (weight * 1.2)
            for angle in [0, 60, 120, 180, 240, 300]:
                rad = math.radians(angle)
                plat = node["lat"] + radius * math.sin(rad)
                plng = node["lng"] + radius * math.cos(rad)
                points.append([plat, plng, round(weight * 0.65, 3)])
                
        # 2. Road Segment Intermediate Traffic Flow Points
        for seg in self.segments:
            st_from = self.state[seg["from"]]
            st_to = self.state[seg["to"]]
            seg_cong = (st_from["congestion_pct"] + st_to["congestion_pct"]) / 2.0
            weight = max(0.10, min(1.0, seg_cong / 100.0))
            
            path = seg["path"]
            # Interpolate points along the polyline path
            for i in range(len(path) - 1):
                p1 = path[i]
                p2 = path[i + 1]
                steps = 5
                for s in range(1, steps):
                    ratio = s / float(steps)
                    ilat = p1[0] + (p2[0] - p1[0]) * ratio
                    ilng = p1[1] + (p2[1] - p1[1]) * ratio
                    points.append([ilat, ilng, round(weight * 0.85, 3)])
                    
            # Add live camera heat point if active
            if self.live_camera and self.live_camera.get("active"):
                c_lat = self.live_camera["lat"]
                c_lng = self.live_camera["lng"]
                c_wt = max(0.25, min(1.0, self.live_camera["congestion_pct"] / 100.0))
                points.append([c_lat, c_lng, round(c_wt, 3)])
                for r in [0.0005, 0.0010]:
                    for a in [0, 90, 180, 270]:
                        rad = math.radians(a)
                        points.append([c_lat + r * math.sin(rad), c_lng + r * math.cos(rad), round(c_wt * 0.7, 3)])
                    
        return points

    def inject_live_camera_feed(self, lat, lng, name="Surveillance Cam", active_vehicles=0, is_active=True):
        """
        Dynamically binds real-time video detection metrics to GIS coordinates.
        Maps volume against thresholds: Green (<10 veh), Orange (10-22 veh), Red (>22 veh).
        """
        lat = float(lat)
        lng = float(lng)
        active_veh = int(active_vehicles)
        
        # Determine volume threshold status and colors
        if active_veh < 10:
            status = "Free Flow"
            color = "#10b981" # Green
            congestion_pct = max(16.0, min(34.0, 15.0 + active_veh * 1.8))
        elif active_veh <= 22:
            status = "Moderate Traffic"
            color = "#f59e0b" # Orange
            congestion_pct = min(68.0, 36.0 + (active_veh - 10) * 2.6)
        else:
            status = "Heavy Bottleneck"
            color = "#ef4444" # Red
            congestion_pct = min(98.5, 70.0 + (active_veh - 22) * 1.5)
            
        # Find nearest junction node
        nearest_jid = min(
            self.nodes.keys(),
            key=lambda j: (self.nodes[j]["lat"] - lat)**2 + (self.nodes[j]["lng"] - lng)**2
        )
        
        # Update node state with live camera traffic volume
        st = self.state[nearest_jid]
        st["active_vehicles"] = max(st["active_vehicles"], active_veh)
        st["congestion_pct"] = round(congestion_pct, 1)
        
        cap = self.nodes[nearest_jid]["capacity"]
        base_spd = self.nodes[nearest_jid]["base_speed"]
        occ = min(1.0, active_veh / max(1, cap))
        st["avg_speed"] = round(max(6.0, base_spd * (1.0 - 0.75 * occ)), 1)
        
        if congestion_pct > 70:
            st["los"] = "E" if congestion_pct < 88 else "F"
        elif congestion_pct > 40:
            st["los"] = "C" if congestion_pct < 55 else "D"
        else:
            st["los"] = "A" if congestion_pct < 25 else "B"
            
        self.live_camera = {
            "active": is_active,
            "name": name or "Live Surveillance Feed",
            "lat": lat,
            "lng": lng,
            "active_vehicles": active_veh,
            "congestion_pct": round(congestion_pct, 1),
            "status": status,
            "color": color,
            "timestamp": time.time(),
            "nearest_node_id": nearest_jid,
            "nearest_node_name": self.nodes[nearest_jid]["name"]
        }
        return self.live_camera

    def get_segments_geojson(self):
        """Returns colored GeoJSON features for all street corridors."""
        self.update()
        features = []
        
        for seg in self.segments:
            st_from = self.state[seg["from"]]
            st_to = self.state[seg["to"]]
            avg_cong = round((st_from["congestion_pct"] + st_to["congestion_pct"]) / 2.0, 1)
            avg_speed = round((st_from["avg_speed"] + st_to["avg_speed"]) / 2.0, 1)
            
            # Color code based on volume threshold: Green (<35%), Orange (35-65%), Red (>65%)
            if avg_cong < 35:
                color = "#10b981" # Green
                status = "Free Flow"
            elif avg_cong < 65:
                color = "#f59e0b" # Orange
                status = "Moderate Traffic"
            else:
                color = "#ef4444" # Red
                status = "Heavy Bottleneck"
                
            features.append({
                "type": "Feature",
                "properties": {
                    "id": seg["id"],
                    "name": seg["name"],
                    "length_km": seg["length_km"],
                    "lanes": seg["lanes"],
                    "congestion_pct": avg_cong,
                    "avg_speed_kmh": avg_speed,
                    "color": color,
                    "status": status,
                    "from_node": self.nodes[seg["from"]]["name"],
                    "to_node": self.nodes[seg["to"]]["name"]
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[pt[1], pt[0]] for pt in seg["path"]] # GeoJSON expects [lng, lat]
                }
            })
            
        return {
            "type": "FeatureCollection",
            "features": features
        }

    def predict_congestion(self):
        """
        Calculates predictive forecasts (15 min, 30 min, 60 min) for all nodes
        using trend propagation, capacity limits, and upcoming diurnal curves.
        """
        self.update()
        now = datetime.now()
        cur_hour = self.time_override_hour if self.time_override_hour is not None else now.hour
        cur_minute = now.minute
        
        predictions = {}
        for jid, node in self.nodes.items():
            cur_st = self.state[jid]
            cur_cong = cur_st["congestion_pct"]
            trend_val = 1.08 if cur_st["trend"] == "INCREASING" else (0.92 if cur_st["trend"] == "DECREASING" else 1.0)
            
            # Projected diurnal curves for +15, +30, +60 minutes
            d15 = self._get_diurnal_multiplier((cur_hour + (cur_minute + 15) // 60) % 24, (cur_minute + 15) % 60)
            d30 = self._get_diurnal_multiplier((cur_hour + (cur_minute + 30) // 60) % 24, (cur_minute + 30) % 60)
            d60 = self._get_diurnal_multiplier((cur_hour + (cur_minute + 60) // 60) % 24, (cur_minute + 60) % 60)
            d0 = max(0.1, self._get_diurnal_multiplier(cur_hour, cur_minute))
            
            cong_15 = min(100.0, max(5.0, cur_cong * (d15 / d0) * (0.97 + 0.05 * trend_val)))
            cong_30 = min(100.0, max(5.0, cur_cong * (d30 / d0) * (0.95 + 0.08 * trend_val)))
            cong_60 = min(100.0, max(5.0, cur_cong * (d60 / d0)))
            
            # Risk Level
            if cong_30 > 65:
                risk = "HIGH_CONGESTION"
            elif cong_30 > 35:
                risk = "MODERATE_DELAY"
            else:
                risk = "LOW_RISK"
                
            predictions[jid] = {
                "name": node["name"],
                "current_congestion": cur_cong,
                "pred_15m": round(cong_15, 1),
                "pred_30m": round(cong_30, 1),
                "pred_60m": round(cong_60, 1),
                "risk_level": risk,
                "current_speed": cur_st["avg_speed"],
                "projected_speed_30m": round(max(5.0, cur_st["avg_speed"] * (100.0 - cong_30) / max(1, 100.0 - cur_cong)), 1)
            }
            
        # Generate Smart Traffic Intelligence Advisory
        sorted_by_risk = sorted(predictions.items(), key=lambda x: x[1]["pred_30m"], reverse=True)
        top_bottleneck = sorted_by_risk[0][1]
        
        advisories = [
            f"⚡ Projected Bottleneck: {top_bottleneck['name']} will reach {top_bottleneck['pred_30m']}% density in 30 mins.",
            f"🛣️ Reroute Advisory: Vehicles entering SIT from Bengaluru NH-48 advised to divert via Kyathsandra link to reduce BH Road queue.",
            f"⏱️ Adaptive Signal Recommendation: Extend green split by +18s at Batawadi Junction (J3) to clear accumulated outflow."
        ]
        
        return {
            "predictions": predictions,
            "advisories": advisories,
            "highest_risk_junction": top_bottleneck["name"]
        }

    def get_full_telemetry(self):
        """Returns comprehensive GIS telemetry packet for frontend dashboard."""
        self.update()
        
        total_veh = sum(st["active_vehicles"] for st in self.state.values())
        avg_speed = round(sum(st["avg_speed"] for st in self.state.values()) / len(self.state), 1)
        city_congestion = round(sum(st["congestion_pct"] for st in self.state.values()) / len(self.state), 1)
        
        # Most bottlenecked node
        worst_jid = max(self.state.keys(), key=lambda k: self.state[k]["congestion_pct"])
        worst_node = self.nodes[worst_jid]
        
        return {
            "center": self.center,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "scenario": self.scenario,
            "weather": self.weather,
            "summary": {
                "total_active_vehicles": total_veh,
                "network_avg_speed": avg_speed,
                "overall_congestion_pct": city_congestion,
                "overall_los": "A" if city_congestion < 30 else ("B" if city_congestion < 50 else ("C" if city_congestion < 70 else ("D" if city_congestion < 82 else "E"))),
                "worst_bottleneck": worst_node["name"],
                "worst_congestion_pct": self.state[worst_jid]["congestion_pct"]
            },
            "nodes": {
                jid: {
                    **self.nodes[jid],
                    **self.state[jid]
                }
                for jid in self.nodes
            },
            "live_camera": self.live_camera,
            "heatmap_points": self.get_heatmap_points(),
            "segments_geojson": self.get_segments_geojson(),
            "forecast": self.predict_congestion()
        }

    def get_routing_nodes(self):
        """Returns list of selectable road junctions for the route planner."""
        return [
            {
                "id": jid,
                "name": node["name"],
                "lat": node["lat"],
                "lng": node["lng"],
                "type": node["type"],
                "description": node["description"],
                "current_congestion": self.state.get(jid, {}).get("congestion_pct", 30.0),
                "current_speed": self.state.get(jid, {}).get("avg_speed", 40.0)
            }
            for jid, node in self.nodes.items()
        ]

    def find_smart_routes(self, origin_id, dest_id):
        """
        AI Congestion-Aware Routing Engine.
        Finds the Fastest Route (congestion optimized) and Alternative Routes (bypasses).
        Weights travel time based on live vehicle volume, speed, and congestion bottlenecks.
        """
        self.update()
        if origin_id not in self.nodes or dest_id not in self.nodes:
            return {"status": "error", "message": "Invalid origin or destination node."}
            
        if origin_id == dest_id:
            node = self.nodes[origin_id]
            return {
                "status": "success",
                "origin": node,
                "destination": node,
                "recommended_route": {
                    "name": "Same Location",
                    "distance_km": 0.0,
                    "travel_time_mins": 0.0,
                    "delay_mins": 0.0,
                    "congestion_pct": 0.0,
                    "status": "Free Flow",
                    "color": "#10b981",
                    "polyline": [[node["lat"], node["lng"]]],
                    "directions": ["You are already at your destination."]
                },
                "alternative_routes": []
            }

        # Build bidirectional adjacency graph
        adj = {jid: [] for jid in self.nodes}
        for seg in self.segments:
            u, v = seg["from"], seg["to"]
            st_u, st_v = self.state[u], self.state[v]
            avg_cong = (st_u["congestion_pct"] + st_v["congestion_pct"]) / 2.0
            avg_speed = max(6.0, (st_u["avg_speed"] + st_v["avg_speed"]) / 2.0)
            base_speed = (self.nodes[u]["base_speed"] + self.nodes[v]["base_speed"]) / 2.0
            
            # Live travel time in minutes
            live_time = (seg["length_km"] / avg_speed) * 60.0
            free_flow_time = (seg["length_km"] / base_speed) * 60.0
            
            edge_data = {
                "seg_id": seg["id"],
                "name": seg["name"],
                "length_km": seg["length_km"],
                "avg_speed": avg_speed,
                "base_speed": base_speed,
                "congestion_pct": avg_cong,
                "live_time": live_time,
                "free_flow_time": free_flow_time,
                "path": seg["path"]
            }
            adj[u].append((v, edge_data, True))
            adj[v].append((u, edge_data, False))

        def run_dijkstra(weight_fn, penalized_edges=None):
            penalized = penalized_edges or set()
            import heapq
            distances = {jid: float("inf") for jid in self.nodes}
            distances[origin_id] = 0.0
            parent = {} # v -> (u, edge_data, is_forward)
            pq = [(0.0, origin_id)]
            
            while pq:
                d, u = heapq.heappop(pq)
                if d > distances[u]:
                    continue
                if u == dest_id:
                    break
                    
                for v, edge, is_fwd in adj[u]:
                    cost = weight_fn(edge)
                    if edge["seg_id"] in penalized:
                        cost *= 3.5 # heavy penalty to force alternate route
                    new_d = d + cost
                    if new_d < distances[v]:
                        distances[v] = new_d
                        parent[v] = (u, edge, is_fwd)
                        heapq.heappush(pq, (new_d, v))
                        
            if dest_id not in parent:
                return None
                
            # Reconstruct path
            path_nodes = [dest_id]
            path_edges = []
            curr = dest_id
            while curr != origin_id:
                prev_node, edge, is_fwd = parent[curr]
                path_edges.append((edge, is_fwd))
                curr = prev_node
                path_nodes.append(curr)
                
            path_nodes.reverse()
            path_edges.reverse()
            return path_nodes, path_edges

        # 1. Congestion-Aware Fastest Route (minimizes live travel time)
        res_fastest = run_dijkstra(lambda e: e["live_time"])
        # 2. Shortest Distance Route (minimizes physical km)
        res_shortest = run_dijkstra(lambda e: e["length_km"])
        
        # 3. Third Alternative (Bypass avoiding worst bottleneck edge)
        penalized_seg_id = None
        if res_fastest:
            worst_edge = max(res_fastest[1], key=lambda x: x[0]["congestion_pct"])[0]
            penalized_seg_id = worst_edge["seg_id"]
        res_bypass = run_dijkstra(lambda e: e["live_time"], penalized_edges={penalized_seg_id} if penalized_seg_id else set())

        def build_route_object(route_tuple, label, tag="OPTIMAL"):
            if not route_tuple:
                return None
            nodes, edges = route_tuple
            total_dist = sum(e[0]["length_km"] for e in edges)
            total_live_time = sum(e[0]["live_time"] for e in edges)
            total_free_time = sum(e[0]["free_flow_time"] for e in edges)
            avg_cong = sum(e[0]["congestion_pct"] for e in edges) / max(1, len(edges))
            avg_spd = (total_dist / (total_live_time / 60.0)) if total_live_time > 0 else 40.0
            
            # Polyline coordinates
            polyline = []
            for edge, is_fwd in edges:
                coords = edge["path"] if is_fwd else list(reversed(edge["path"]))
                if not polyline:
                    polyline.extend(coords)
                else:
                    polyline.extend(coords[1:]) # avoid duplicate junction vertex
                    
            # Directions
            directions = [f"Depart from {self.nodes[origin_id]['name']}"]
            for i, (edge, is_fwd) in enumerate(edges):
                target_node = nodes[i + 1]
                t_name = self.nodes[target_node]["name"]
                c_level = "🟢 Free" if edge["congestion_pct"] < 35 else ("🟠 Moderate" if edge["congestion_pct"] < 65 else "🔴 Heavy Bottleneck")
                directions.append(f"Follow {edge['name']} for {edge['length_km']} km toward {t_name} ({c_level}, ~{round(edge['avg_speed'])} km/h)")
            directions.append(f"Arrive at {self.nodes[dest_id]['name']}")

            delay = max(0.0, total_live_time - total_free_time)
            if avg_cong < 35:
                status = "Free Flow"
                color = "#10b981"
            elif avg_cong < 65:
                status = "Moderate Traffic"
                color = "#f59e0b"
            else:
                status = "Heavy Bottleneck"
                color = "#ef4444"

            return {
                "name": label,
                "tag": tag,
                "distance_km": round(total_dist, 2),
                "travel_time_mins": round(total_live_time, 1),
                "free_flow_time_mins": round(total_free_time, 1),
                "delay_mins": round(delay, 1),
                "avg_speed_kmh": round(avg_spd, 1),
                "congestion_pct": round(avg_cong, 1),
                "status": status,
                "color": color,
                "nodes": [self.nodes[n]["name"] for n in nodes],
                "polyline": polyline,
                "directions": directions
            }

        route_primary = build_route_object(res_fastest, "Recommended Congestion-Aware Route", "AI FASTEST")
        route_alt1 = build_route_object(res_shortest, "Direct Shortest Corridor", "SHORTEST DISTANCE")
        route_alt2 = build_route_object(res_bypass, "Scenic Ring Road Bypass", "SMART DETOUR")

        # Deduplicate alternative routes
        alternatives = []
        seen_keys = {tuple(route_primary["nodes"]) if route_primary else ()}
        for r in [route_alt1, route_alt2]:
            if r and tuple(r["nodes"]) not in seen_keys:
                seen_keys.add(tuple(r["nodes"]))
                alternatives.append(r)

        # Savings summary
        savings_text = "Optimal traffic route selected."
        if alternatives:
            slower = max(alternatives, key=lambda a: a["travel_time_mins"])
            time_diff = slower["travel_time_mins"] - route_primary["travel_time_mins"]
            if time_diff > 1.5:
                savings_text = f"⚡ Rerouting saves {round(time_diff, 1)} mins compared to congested direct corridor ({slower['name']})!"

        return {
            "status": "success",
            "origin": self.nodes[origin_id],
            "destination": self.nodes[dest_id],
            "savings_summary": savings_text,
            "recommended_route": route_primary,
            "alternative_routes": alternatives
        }

# Global Singleton Instance for Map Simulator
sit_simulator = SITTumkurTrafficSimulator()

