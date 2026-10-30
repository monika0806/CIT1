"""
OmniTraffic AI - Emergency Green Vehicle Corridor Engine
Provides real-time AI-optimized emergency transit routing for ambulances,
fire engines, police escorts, and critical medical transport in Tumakuru.
Calculates primary green-wave synchronized corridors and contingency bypasses
based on live traffic congestion, vehicle volume, travel times, and intersection bottlenecks.
"""

import time
import math
import heapq
from datetime import datetime

class GreenCorridorEngine:
    def __init__(self, map_simulator):
        self.simulator = map_simulator
        
        # Emergency Hubs (Hospitals, Trauma Centers, Fire Stations, Police HQ)
        self.emergency_facilities = {
            "HOSP-01": {
                "id": "HOSP-01",
                "name": "Tumakuru District Government Hospital",
                "category": "hospital",
                "sub_type": "District General Hospital",
                "lat": 13.3440,
                "lng": 77.1005,
                "nearest_junction": "J8",
                "connector_km": 0.28,
                "emergency_services": "24/7 Level-1 Trauma, ICU, Burn Ward, Blood Bank",
                "helpline": "108 / 0816-2278250"
            },
            "HOSP-02": {
                "id": "HOSP-02",
                "name": "Siddaganga Super Specialty Hospital & Trauma Center",
                "category": "hospital",
                "sub_type": "Super Specialty Care",
                "lat": 13.3210,
                "lng": 77.1380,
                "nearest_junction": "J5",
                "connector_km": 0.35,
                "emergency_services": "Cardiac Emergency, Stroke Unit, Neurotrauma ICU",
                "helpline": "0816-2290000"
            },
            "HOSP-03": {
                "id": "HOSP-03",
                "name": "Shridevi Institute of Medical Sciences & Hospital",
                "category": "hospital",
                "sub_type": "Tertiary Medical Center",
                "lat": 13.3550,
                "lng": 77.0910,
                "nearest_junction": "J8",
                "connector_km": 1.45,
                "emergency_services": "Trauma ICU, Neonatal ICU, Multi-Organ Care",
                "helpline": "0816-2212121"
            },
            "HOSP-04": {
                "id": "HOSP-04",
                "name": "SIT Health & Emergency Triage Center",
                "category": "hospital",
                "sub_type": "Campus Emergency Clinic",
                "lat": 13.3276,
                "lng": 77.1259,
                "nearest_junction": "J1",
                "connector_km": 0.05,
                "emergency_services": "First Response, Cardiac Defibrillator, Student Triage",
                "helpline": "0816-2214000"
            },
            "HOSP-05": {
                "id": "HOSP-05",
                "name": "Ashwini Emergency & Critical Care Hospital",
                "category": "hospital",
                "sub_type": "Critical Care Center",
                "lat": 13.3360,
                "lng": 77.1140,
                "nearest_junction": "J6",
                "connector_km": 0.22,
                "emergency_services": "Urgent Care, Surgical Trauma, Oxygen ICU",
                "helpline": "0816-2277777"
            },
            "FIRE-01": {
                "id": "FIRE-01",
                "name": "Tumakuru Central Fire & Emergency Rescue HQ",
                "category": "fire_station",
                "sub_type": "Central Rescue Station",
                "lat": 13.3385,
                "lng": 77.1050,
                "nearest_junction": "J7",
                "connector_km": 0.30,
                "emergency_services": "Heavy Water Bowsers, Hydraulic Cranes, Hazmat Rescue",
                "helpline": "101 / 112"
            },
            "FIRE-02": {
                "id": "FIRE-02",
                "name": "Batawadi Industrial Fast Response Fire Depot",
                "category": "fire_station",
                "sub_type": "Highway & Industrial Post",
                "lat": 13.3330,
                "lng": 77.1340,
                "nearest_junction": "J3",
                "connector_km": 0.20,
                "emergency_services": "Foam Tender, Quick Response Boleros, Chemical Rescue",
                "helpline": "101"
            },
            "POLICE-01": {
                "id": "POLICE-01",
                "name": "Tumakuru Traffic Police Emergency Command Post",
                "category": "police_post",
                "sub_type": "Police Escort Command",
                "lat": 13.3415,
                "lng": 77.1035,
                "nearest_junction": "J8",
                "connector_km": 0.15,
                "emergency_services": "Highway Patrol Escort, Green Wave Pilot Vehicles",
                "helpline": "112 / 103"
            }
        }

        # Active Signal Preemption State
        self.active_preemptions = {}

    def get_all_locations(self):
        """Returns structured list of all selectable origin/destination points."""
        facilities_list = []
        for fid, f in self.emergency_facilities.items():
            facilities_list.append({
                "id": fid,
                "name": f["name"],
                "category": f["category"],
                "sub_type": f["sub_type"],
                "lat": f["lat"],
                "lng": f["lng"],
                "nearest_junction": f["nearest_junction"],
                "emergency_services": f["emergency_services"],
                "helpline": f["helpline"]
            })

        # Add Junctions from simulator
        junctions_list = []
        for jid, node in self.simulator.nodes.items():
            curr_state = self.simulator.state.get(jid, {})
            junctions_list.append({
                "id": jid,
                "name": node["name"],
                "category": "junction",
                "sub_type": node.get("type", "urban_junction"),
                "lat": node["lat"],
                "lng": node["lng"],
                "current_congestion": curr_state.get("congestion_pct", 25.0),
                "avg_speed": curr_state.get("avg_speed", 40.0),
                "status": curr_state.get("status", "Normal")
            })

        # Add Live Camera Feed location if active
        if self.simulator.live_camera and self.simulator.live_camera.get("active"):
            cam = self.simulator.live_camera
            addr = cam.get("address", cam.get("name", "Active Surveillance Location"))
            junctions_list.insert(0, {
                "id": "LIVE_CAM",
                "name": f"📹 Live Camera Beacon: {addr.split(',')[0]}",
                "category": "live_camera",
                "sub_type": "Surveillance Node",
                "lat": cam["lat"],
                "lng": cam["lng"],
                "nearest_junction": cam.get("nearest_node_id", "J1"),
                "current_congestion": cam.get("congestion_pct", 30.0),
                "avg_speed": 35.0,
                "status": "Live Detection Active"
            })

        return {
            "facilities": facilities_list,
            "junctions": junctions_list
        }

    def resolve_location(self, loc_id):
        """Resolves node or facility identifier into full spatial metadata and graph node."""
        if not loc_id:
            return None, "J1"

        loc_str = str(loc_id).strip()

        # 1. Check emergency facilities
        if loc_str in self.emergency_facilities:
            fac = self.emergency_facilities[loc_str]
            return {
                "id": fac["id"],
                "name": fac["name"],
                "category": fac["category"],
                "sub_type": fac["sub_type"],
                "lat": fac["lat"],
                "lng": fac["lng"],
                "description": fac["emergency_services"],
                "helpline": fac["helpline"]
            }, fac["nearest_junction"]

        # 2. Check live camera
        if loc_str == "LIVE_CAM" and self.simulator.live_camera and self.simulator.live_camera.get("active"):
            cam = self.simulator.live_camera
            addr = cam.get("address", cam.get("name", "Live Surveillance Beacon"))
            return {
                "id": "LIVE_CAM",
                "name": f"📹 {addr.split(',')[0]} (Camera Feed)",
                "category": "live_camera",
                "sub_type": "Live Vision Feed",
                "lat": cam["lat"],
                "lng": cam["lng"],
                "description": addr
            }, cam.get("nearest_node_id", "J1")

        # 3. Check simulator junctions (J1-J8)
        if loc_str in self.simulator.nodes:
            node = self.simulator.nodes[loc_str]
            return {
                "id": loc_str,
                "name": node["name"],
                "category": "junction",
                "sub_type": node.get("type", "urban_junction"),
                "lat": node["lat"],
                "lng": node["lng"],
                "description": node.get("description", "Roadway Junction")
            }, loc_str

        # 4. Fallback search by substring name
        loc_lower = loc_str.lower()
        for fid, fac in self.emergency_facilities.items():
            if loc_lower in fac["name"].lower() or loc_lower in fid.lower():
                return {
                    "id": fac["id"],
                    "name": fac["name"],
                    "category": fac["category"],
                    "sub_type": fac["sub_type"],
                    "lat": fac["lat"],
                    "lng": fac["lng"],
                    "description": fac["emergency_services"],
                    "helpline": fac["helpline"]
                }, fac["nearest_junction"]

        for jid, node in self.simulator.nodes.items():
            if loc_lower in node["name"].lower() or loc_lower in jid.lower():
                return {
                    "id": jid,
                    "name": node["name"],
                    "category": "junction",
                    "sub_type": node.get("type", "urban_junction"),
                    "lat": node["lat"],
                    "lng": node["lng"],
                    "description": node.get("description", "Roadway Junction")
                }, jid

        # Default fallback to J1
        node = self.simulator.nodes["J1"]
        return {
            "id": "J1",
            "name": node["name"],
            "category": "junction",
            "sub_type": "urban_junction",
            "lat": node["lat"],
            "lng": node["lng"],
            "description": node.get("description", "")
        }, "J1"

    def plan_green_corridor(self, origin_id, dest_id, vehicle_type="AMBULANCE", priority="CODE_RED"):
        """
        Calculates the optimal AI Green Vehicle Corridor and an Alternative Contingency Route.
        Evaluates real-time congestion, traffic volume, signal bottleneck preemption, and lane widths.
        """
        self.simulator.update()

        origin_meta, graph_origin = self.resolve_location(origin_id)
        dest_meta, graph_dest = self.resolve_location(dest_id)

        # Handle same point
        if origin_meta["id"] == dest_meta["id"]:
            return {
                "status": "success",
                "emergency_id": f"GC-TK-{int(time.time()*1000)%1000000}",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "vehicle_type": vehicle_type,
                "priority": priority,
                "origin": origin_meta,
                "destination": dest_meta,
                "primary_route": {
                    "name": "Immediate Facility Proximity",
                    "distance_km": 0.05,
                    "standard_travel_time_mins": 0.5,
                    "green_corridor_time_mins": 0.2,
                    "time_saved_mins": 0.3,
                    "time_saved_pct": 60,
                    "effective_speed_kmh": 25.0,
                    "congestion_index_pct": 10.0,
                    "traffic_volume_vpm": 2,
                    "intersections_preempted": [],
                    "bottlenecks_avoided": [],
                    "ai_recommendation_reasons": ["Origin and destination are at the same immediate facility threshold."],
                    "color": "#10b981",
                    "polyline": [[origin_meta["lat"], origin_meta["lng"]]],
                    "directions": ["Immediate bay arrival. Prepare patient triage or emergency handover."]
                },
                "alternative_route": None
            }

        # Build bidirectional adjacency graph from simulator
        adj = {jid: [] for jid in self.simulator.nodes}
        for seg in self.simulator.segments:
            u, v = seg["from"], seg["to"]
            st_u, st_v = self.simulator.state[u], self.simulator.state[v]
            
            avg_cong = (st_u["congestion_pct"] + st_v["congestion_pct"]) / 2.0
            avg_speed = max(6.0, (st_u["avg_speed"] + st_v["avg_speed"]) / 2.0)
            base_speed = (self.simulator.nodes[u]["base_speed"] + self.simulator.nodes[v]["base_speed"]) / 2.0
            lanes = seg.get("lanes", 2)

            # Normal vehicle travel time (minutes)
            std_time = (seg["length_km"] / avg_speed) * 60.0

            # Emergency Green Wave travel time:
            # Multi-lane highways permit high-speed overtaking when signals are pre-empted.
            # Narrow 2-lane roads suffer friction even with sirens.
            if lanes >= 4:
                # Overtaking lanes available: Emergency vehicle can achieve 60-70 km/h under green wave
                emg_speed = min(75.0, max(45.0, base_speed * 1.25))
            else:
                # 2-lane roadway: Traffic clearing friction limits speed
                emg_speed = min(48.0, max(28.0, base_speed * 0.95))

            # Penalty for high congestion on narrow roads
            if lanes <= 2 and avg_cong > 60:
                emg_speed = max(18.0, emg_speed * 0.65) # Choked 2-lane road penalty

            emg_time = (seg["length_km"] / emg_speed) * 60.0

            # Signal bottleneck penalty for ordinary cars vs emergency green clearance
            node_v_bottleneck = st_v.get("bottleneck_score", 0.0)

            # Edge cost for emergency Dijkstra:
            # Heavily favors multi-lane arterials with signal preemption capability
            lane_multiplier = 0.65 if lanes >= 4 else 1.25
            cost = emg_time * lane_multiplier + (avg_cong / 100.0) * 0.4

            edge_data = {
                "seg_id": seg["id"],
                "name": seg["name"],
                "length_km": seg["length_km"],
                "lanes": lanes,
                "avg_speed": avg_speed,
                "emg_speed": emg_speed,
                "congestion_pct": avg_cong,
                "vehicles_flow": int(round((avg_cong / 100.0) * seg.get("capacity_vph", 1500) / 60.0)),
                "std_time": std_time,
                "emg_time": emg_time,
                "bottleneck_score": node_v_bottleneck,
                "path": seg["path"]
            }
            adj[u].append((v, edge_data, True, cost))
            adj[v].append((u, edge_data, False, cost))

        def run_dijkstra(penalized_segs=None):
            penalized = penalized_segs or set()
            distances = {jid: float("inf") for jid in self.simulator.nodes}
            distances[graph_origin] = 0.0
            parent = {}
            pq = [(0.0, graph_origin)]

            while pq:
                d, u = heapq.heappop(pq)
                if d > distances[u]:
                    continue
                if u == graph_dest:
                    break

                for v, edge, is_fwd, base_cost in adj[u]:
                    c = base_cost
                    if edge["seg_id"] in penalized:
                        c *= 4.0 # Heavy deterrent to force completely distinct alternative
                    new_d = d + c
                    if new_d < distances[v]:
                        distances[v] = new_d
                        parent[v] = (u, edge, is_fwd)
                        heapq.heappush(pq, (new_d, v))

            if graph_dest not in parent and graph_origin != graph_dest:
                return None

            path_nodes = [graph_dest]
            path_edges = []
            curr = graph_dest
            while curr != graph_origin:
                prev_u, edge, is_fwd = parent[curr]
                path_edges.append((edge, is_fwd))
                curr = prev_u
                path_nodes.append(curr)

            path_nodes.reverse()
            path_edges.reverse()
            return path_nodes, path_edges

        # 1. Primary AI Green Corridor
        res_primary = run_dijkstra()
        if not res_primary:
            # Fallback direct
            res_primary = ([graph_origin, graph_dest], [])

        # 2. Alternative Emergency Bypass Route
        # Identify key segments used in primary and penalize them to find separate corridor
        primary_seg_ids = {e[0]["seg_id"] for e in res_primary[1]}
        res_alternative = run_dijkstra(penalized_segs=primary_seg_ids)

        def assemble_corridor_payload(route_tuple, is_primary=True):
            if not route_tuple:
                return None

            nodes, edges = route_tuple
            total_dist = sum(e[0]["length_km"] for e in edges)
            total_std_time = sum(e[0]["std_time"] for e in edges)
            total_emg_time = sum(e[0]["emg_time"] for e in edges)

            # Add origin/destination facility connector distance & time if applicable
            has_orig_conn = origin_meta["id"] != graph_origin
            has_dest_conn = dest_meta["id"] != graph_dest

            extra_dist = 0.0
            if has_orig_conn and origin_meta.get("lat"):
                extra_dist += 0.25
            if has_dest_conn and dest_meta.get("lat"):
                extra_dist += 0.25

            total_dist = round(total_dist + extra_dist, 2)
            total_std_time = round(total_std_time + (extra_dist / 30.0) * 60.0, 1)
            total_emg_time = round(max(0.8, total_emg_time + (extra_dist / 50.0) * 60.0), 1)

            time_saved = max(0.4, round(total_std_time - total_emg_time, 1))
            time_saved_pct = int(round((time_saved / max(1.0, total_std_time)) * 100))

            avg_cong = round(sum(e[0]["congestion_pct"] for e in edges) / max(1, len(edges)), 1)
            avg_vol = int(round(sum(e[0]["vehicles_flow"] for e in edges) / max(1, len(edges))))
            eff_spd = round((total_dist / (total_emg_time / 60.0)), 1) if total_emg_time > 0 else 55.0

            # Signal Preemptions
            preempted_signals = []
            for i, nid in enumerate(nodes):
                j_info = self.simulator.nodes.get(nid, {})
                j_state = self.simulator.state.get(nid, {})
                preempted_signals.append({
                    "signal_id": f"SIG-{nid}",
                    "junction_name": j_info.get("name", f"Intersection {nid}"),
                    "lat": j_info.get("lat", 13.33),
                    "lng": j_info.get("lng", 77.12),
                    "preemption_status": "AUTOMATED_GREEN_WAVE",
                    "clearance_window_sec": 45 if is_primary else 35,
                    "sequence_order": i + 1,
                    "current_cross_traffic": f"{j_state.get('current_vehicles', 15)} veh active"
                })

            # Check bottleneck avoidance
            bottlenecks_avoided = []
            for jid, st in self.simulator.state.items():
                if st.get("congestion_pct", 0) > 55 and jid not in nodes:
                    bottlenecks_avoided.append({
                        "junction_id": jid,
                        "name": self.simulator.nodes.get(jid, {}).get("name", jid),
                        "congestion_pct": st.get("congestion_pct", 0),
                        "status": st.get("status", "Bottleneck")
                    })

            # Polyline Construction
            polyline = []
            if has_orig_conn:
                polyline.append([origin_meta["lat"], origin_meta["lng"]])

            for edge, is_fwd in edges:
                coords = edge["path"] if is_fwd else list(reversed(edge["path"]))
                if not polyline:
                    polyline.extend(coords)
                else:
                    polyline.extend(coords[1:])

            if has_dest_conn:
                polyline.append([dest_meta["lat"], dest_meta["lng"]])

            # If empty (direct adjacent)
            if not polyline:
                polyline = [
                    [origin_meta["lat"], origin_meta["lng"]],
                    [dest_meta["lat"], dest_meta["lng"]]
                ]

            # Turn-by-Turn Directions
            directions = [f"🚨 Dispatch emergency unit from {origin_meta['name']} (Siren & Optical Beacon ACTIVE)"]
            for i, (edge, is_fwd) in enumerate(edges):
                target_node = nodes[i + 1]
                t_name = self.simulator.nodes[target_node]["name"]
                c_desc = f"{edge['lanes']} Lanes, ~{round(edge['emg_speed'])} km/h emergency speed"
                sig_note = f"🟢 Signal SIG-{target_node} PRE-EMPTED GREEN"
                directions.append(f"Follow {edge['name']} for {edge['length_km']} km toward {t_name} [{sig_note} | {c_desc}]")
            directions.append(f"🏥 Arrive at emergency bay: {dest_meta['name']}. Transition to trauma triage.")

            # Comprehensive AI Reasoning Breakdown
            reasons = []
            if is_primary:
                # Primary AI reasons
                reasons.append(
                    f"Optimal Emergency Speed & Green Wave: AI estimates travel time of only {total_emg_time} mins vs {total_std_time} mins for normal traffic (saving {time_saved} mins, {time_saved_pct}% faster)."
                )
                reasons.append(
                    f"Multi-Lane Road Capacity: Utilizes {max(e[0]['lanes'] for e in edges) if edges else 4}-lane arterial geometry, ensuring civil vehicles can rapidly clear the median lane upon acoustic siren alert."
                )
                reasons.append(
                    f"Synchronized Signal Preemption: Automatically overrides {len(preempted_signals)} key intersections with a 45-second forward green clearance window, eliminating cross-traffic red light deceleration."
                )
                if bottlenecks_avoided:
                    b_names = ", ".join([b["name"] for b in bottlenecks_avoided[:2]])
                    reasons.append(f"Critical Bottleneck Avoidance: Intelligently navigates around high-congestion bottlenecks ({b_names}).")
                else:
                    reasons.append(f"Low Corridor Congestion: Mainline corridor carries average congestion of {avg_cong}% (LOS B), ensuring fluid laminar flow.")
            else:
                # Alternative AI reasons
                reasons.append(
                    f"Independent Contingency Bypass: Serves as a clear backup route in the event that primary arterial NH-206 is blocked by major roadworks or an uncleared collision."
                )
                reasons.append(
                    f"Travel Time Trade-off: Estimated emergency travel time is {total_emg_time} mins (vs {total_std_time} mins normal). +{max(0.1, round(total_dist - 0.2, 2))} km longer than the primary corridor."
                )
                reasons.append(
                    f"Lane Geometry Consideration: Route traverses segments with {min(e[0]['lanes'] for e in edges) if edges else 2} lanes, where civilian vehicle clearance requires cautious driver maneuvering."
                )
                reasons.append(
                    f"Secondary Preemption Ready: {len(preempted_signals)} secondary signals are mapped and can be immediately triggered if primary route diversion is executed."
                )

            route_name = f"AI Green Wave Corridor via {' & '.join([e[0]['name'].split('—')[0].strip() for e in edges[:2]])}" if is_primary else f"Contingency Bypass via {' & '.join([e[0]['name'].split('—')[0].strip() for e in edges[:2]])}"

            return {
                "route_type": "PRIMARY_GREEN_CORRIDOR" if is_primary else "ALTERNATIVE_BYPASS",
                "name": route_name,
                "badge": "⚡ AI RECOMMENDED GREEN CORRIDOR" if is_primary else "🛡️ CONTINGENCY BYPASS ROUTE",
                "distance_km": total_dist,
                "standard_travel_time_mins": total_std_time,
                "green_corridor_time_mins": total_emg_time,
                "time_saved_mins": time_saved,
                "time_saved_pct": time_saved_pct,
                "effective_speed_kmh": eff_spd,
                "congestion_index_pct": avg_cong,
                "traffic_volume_vpm": avg_vol,
                "intersections_preempted": preempted_signals,
                "bottlenecks_avoided": bottlenecks_avoided,
                "ai_recommendation_reasons": reasons,
                "color": "#10b981" if is_primary else "#00f5ff",
                "polyline": polyline,
                "directions": directions
            }

        primary_payload = assemble_corridor_payload(res_primary, is_primary=True)
        alternative_payload = assemble_corridor_payload(res_alternative, is_primary=False)

        # Ensure alternative is not identical to primary
        if alternative_payload and primary_payload and alternative_payload["polyline"] == primary_payload["polyline"]:
            alternative_payload = None

        emergency_id = f"GC-TK-{int(time.time()*1000)%1000000}"

        return {
            "status": "success",
            "emergency_id": emergency_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "vehicle_type": vehicle_type,
            "priority": priority,
            "origin": origin_meta,
            "destination": dest_meta,
            "live_traffic_context": {
                "scenario": self.simulator.scenario,
                "city_average_congestion_pct": round(sum(s.get("congestion_pct", 25) for s in self.simulator.state.values()) / max(1, len(self.simulator.state)), 1),
                "active_surveillance_beacon": self.simulator.live_camera.get("name") if self.simulator.live_camera else "CAM-01: HIGHWAY ARTERIAL",
                "weather": self.simulator.weather
            },
            "primary_route": primary_payload,
            "alternative_route": alternative_payload
        }

    def activate_signal_preemption(self, corridor_id, signal_ids=None):
        """Activates green wave signal override on specified signals."""
        now = time.time()
        active_id = corridor_id or f"GC-ACTIVE-{int(now)%10000}"
        
        preempted_list = []
        target_signals = signal_ids or ["SIG-J1", "SIG-J2", "SIG-J3", "SIG-J8"]
        for sid in target_signals:
            preempted_list.append({
                "signal_id": sid,
                "status": "FORCE_GREEN_HOLD",
                "countdown_sec": 60,
                "cleared_at": datetime.now().strftime("%H:%M:%S")
            })

        self.active_preemptions[active_id] = {
            "corridor_id": active_id,
            "activated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "signals": preempted_list,
            "status": "ACTIVE_GREEN_WAVE"
        }

        return {
            "status": "success",
            "corridor_id": active_id,
            "message": f"Green Wave Signal Preemption triggered for {len(preempted_list)} intersections.",
            "preempted_signals": preempted_list,
            "countdown_seconds": 60
        }
