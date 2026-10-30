"""
OmniTraffic AI - Intelligent Wrong-Way Driving Analyzer
Features dynamic consensus flow auto-detection to eliminate false positives
on one-way highways, divided corridors, or multi-lane freeways.
"""

from collections import defaultdict, deque
import numpy as np

class WrongWayAnalyzer:
    def __init__(self, expected_direction="auto", min_history=10, displacement_thresh=35, edge_margin_ratio=0.08, divider_ratio=0.44):
        """
        expected_direction:
           'auto' (default: automatically learns consensus lane flow)
           'down' (all lanes flow top-to-bottom)
           'up' (all lanes flow bottom-to-top)
           'bidirectional_split' (left up, right down)
        """
        self.expected_direction = expected_direction
        self.min_history = min_history
        self.displacement_thresh = displacement_thresh
        self.edge_margin_ratio = edge_margin_ratio
        self.divider_ratio = divider_ratio
        
        # History of centroid (cx, cy) per track_id
        self.track_positions = defaultdict(lambda: deque(maxlen=25))
        self.wrong_way_tracked = set()
        
        # Consensus velocity votes: { 'left': deque(maxlen=40), 'right': deque(maxlen=40), 'global': deque(maxlen=50) }
        self.flow_votes = {
            'left': deque(maxlen=40),
            'right': deque(maxlen=40),
            'global': deque(maxlen=50)
        }

    def _update_consensus(self, cx, dy, median_x):
        """Records displacement vectors to determine consensus flow direction."""
        direction = 1 if dy > 0 else -1 # 1 = down, -1 = up
        self.flow_votes['global'].append(direction)
        if cx < median_x:
            self.flow_votes['left'].append(direction)
        else:
            self.flow_votes['right'].append(direction)

    def _get_expected_for_vehicle(self, cx, median_x):
        """Resolves expected direction based on configuration or learned consensus."""
        mode = self.expected_direction
        
        if mode == "down":
            return "down"
        elif mode == "up":
            return "up"
        elif mode in ("bidirectional_split", "split_left_up_right_down"):
            return "up" if cx < median_x else "down"
        elif mode == "split_left_down_right_up":
            return "down" if cx < median_x else "up"
            
        # AUTO CONSENSUS MODE:
        # Determine dominant flow for this section of roadway
        zone = 'left' if cx < median_x else 'right'
        votes = self.flow_votes[zone]
        
        if len(votes) >= 3:
            # If majority of vehicles in this zone move down
            return "down" if sum(votes) > 0 else "up"
            
        # Fallback to standard divided road heuristic during initial warm-up:
        # Left side typically up, right side down for Indian / divided roads
        return "up" if cx < median_x else "down"

    def analyze(self, tracked_boxes, frame_w, frame_h):
        violations = []
        edge_x_left = int(frame_w * self.edge_margin_ratio)
        edge_x_right = int(frame_w * (1.0 - self.edge_margin_ratio))
        edge_y_top = int(frame_h * self.edge_margin_ratio)
        edge_y_bottom = int(frame_h * (1.0 - self.edge_margin_ratio))
        median_x = int(frame_w * self.divider_ratio)
        
        active_ids = set()

        for obj in tracked_boxes:
            if obj["label"] not in ("car", "motorcycle", "bus", "truck"):
                continue
                
            track_id = obj.get("id")
            if track_id is None:
                continue
                
            active_ids.add(track_id)
            cx, cy = obj["cx"], obj["cy"]
            self.track_positions[track_id].append((cx, cy))
            
            # Skip vehicles in margin edges
            if cx < edge_x_left or cx > edge_x_right or cy < edge_y_top or cy > edge_y_bottom:
                continue
                
            history = self.track_positions[track_id]
            if len(history) < self.min_history:
                continue
                
            start_cx, start_cy = history[0]
            curr_cx, curr_cy = history[-1]
            dy = curr_cy - start_cy
            
            # Feed consensus vote if vehicle has significant movement
            if abs(dy) >= 15:
                self._update_consensus(curr_cx, dy, median_x)
                
            # Determine expected flow direction for this vehicle
            expected = self._get_expected_for_vehicle(curr_cx, median_x)
            
            is_wrong_way = False
            # If expected is down (dy > 0), but vehicle moved up (dy < -threshold)
            if expected == "down" and dy < -self.displacement_thresh:
                is_wrong_way = True
            # If expected is up (dy < 0), but vehicle moved down (dy > threshold)
            elif expected == "up" and dy > self.displacement_thresh:
                is_wrong_way = True
                
            if is_wrong_way:
                self.wrong_way_tracked.add(track_id)
                violations.append({
                    "track_id": track_id,
                    "bbox": obj["bbox"],
                    "violation": "WRONG_WAY",
                    "vehicle_type": obj["label"],
                    "displacement_dy": dy,
                    "expected_direction": expected,
                    "conf": obj["conf"],
                    "trajectory": list(history)
                })
            else:
                self.wrong_way_tracked.discard(track_id)
                
        # Clean up stale track histories
        stale_ids = [tid for tid in self.track_positions if tid not in active_ids]
        for tid in stale_ids:
            if len(self.track_positions[tid]) > 0:
                self.track_positions[tid].popleft()
                if len(self.track_positions[tid]) == 0:
                    del self.track_positions[tid]
                    self.wrong_way_tracked.discard(tid)
                    
        return violations

    def reset(self):
        self.track_positions.clear()
        self.wrong_way_tracked.clear()
        self.flow_votes['left'].clear()
        self.flow_votes['right'].clear()
        self.flow_votes['global'].clear()
