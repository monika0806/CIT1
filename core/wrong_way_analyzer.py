"""
OmniTraffic AI - Wrong-Way Driving Analyzer
Detects vehicles moving against the legal traffic flow direction using trajectory vectors.
"""

from collections import defaultdict, deque
import numpy as np

class WrongWayAnalyzer:
    def __init__(self, expected_direction="bidirectional_split", min_history=8, displacement_thresh=25, edge_margin_ratio=0.08, divider_ratio=0.44):
        """
        expected_direction: 'bidirectional_split', 'down', 'up'
        min_history: Number of tracked frames needed to verify consistent movement
        displacement_thresh: Minimum pixel movement against expected flow to trigger violation
        divider_ratio: Center divider position ratio (default 0.44 for divided highways)
        """
        self.expected_direction = expected_direction
        self.min_history = min_history
        self.displacement_thresh = displacement_thresh
        self.edge_margin_ratio = edge_margin_ratio
        self.divider_ratio = divider_ratio
        
        # History of centroid (cx, cy) and areas per track_id
        self.track_positions = defaultdict(lambda: deque(maxlen=20))
        self.wrong_way_tracked = set()

    def analyze(self, tracked_boxes, frame_w, frame_h):
        """
        Evaluates tracked vehicle trajectories against designated flow direction.
        Returns:
            list of violation dicts:
               'track_id', 'bbox', 'violation': 'WRONG_WAY', 'velocity_dy', 'expected', 'conf'
        """
        violations = []
        edge_x_left = int(frame_w * self.edge_margin_ratio)
        edge_x_right = int(frame_w * (1.0 - self.edge_margin_ratio))
        edge_y_top = int(frame_h * self.edge_margin_ratio)
        edge_y_bottom = int(frame_h * (1.0 - self.edge_margin_ratio))
        
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
            
            # Skip if vehicle is in the extreme edge boundary (entering/leaving noise)
            if cx < edge_x_left or cx > edge_x_right or cy < edge_y_top or cy > edge_y_bottom:
                continue
                
            history = self.track_positions[track_id]
            if len(history) < self.min_history:
                continue
                
            # Compute net displacement over recent frames
            start_cx, start_cy = history[0]
            curr_cx, curr_cy = history[-1]
            dy = curr_cy - start_cy
            
            # Determine expected direction for this vehicle position
            expected = self.expected_direction
            median_x = int(frame_w * self.divider_ratio)
            if expected in ("bidirectional_split", "split_left_up_right_down"):
                # Left carriageway flows UP (decreasing Y), Right carriageway flows DOWN (increasing Y)
                expected = "up" if curr_cx < median_x else "down"
            elif expected == "split_left_down_right_up":
                expected = "down" if curr_cx < median_x else "up"
                
            is_wrong_way = False
            if expected == "down" and dy < -self.displacement_thresh:
                # Expected down (increasing Y), but moving up (decreasing Y)
                is_wrong_way = True
            elif expected == "up" and dy > self.displacement_thresh:
                # Expected up (decreasing Y), but moving down (increasing Y)
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
                
        # Cleanup stale tracks
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
