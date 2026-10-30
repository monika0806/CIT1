"""
OmniTraffic AI - Vehicle Counter Module
Tracks vehicle trajectories across virtual counting lines and computes
bidirectional vehicle traffic counts broken down by classification.
"""

from collections import defaultdict, deque

class VehicleCounter:
    def __init__(self, line_y_ratio=0.6, line_offset=25):
        """
        line_y_ratio: Normalized Y coordinate for the counting line (0.0 to 1.0)
        line_offset: Pixel margin around the counting line to confirm crossing
        """
        self.line_y_ratio = line_y_ratio
        self.line_offset = line_offset
        
        # History of centroid Y positions for each track ID
        self.track_history = defaultdict(lambda: deque(maxlen=30))
        
        # Set of track IDs that have already been counted
        self.counted_ids = set()
        
        # Cumulative directional counts
        self.counts_in = defaultdict(int)   # Moving Down
        self.counts_out = defaultdict(int)  # Moving Up
        self.total_counted = 0
        
        # Active visible counts in current frame
        self.current_frame_counts = defaultdict(int)

    def update(self, tracked_boxes, frame_height):
        """
        Updates counts using tracked vehicles.
        tracked_boxes: list of dicts with 'id', 'cx', 'cy', 'label', 'bbox'
        frame_height: frame height in pixels
        """
        count_line_y = int(frame_height * self.line_y_ratio)
        self.current_frame_counts.clear()
        
        # Count currently visible objects by class
        for obj in tracked_boxes:
            label = obj["label"]
            self.current_frame_counts[label] += 1
            
            track_id = obj.get("id")
            if track_id is None:
                continue
                
            cy = obj["cy"]
            self.track_history[track_id].append(cy)
            
            # If already counted, skip tripwire trigger
            if track_id in self.counted_ids:
                continue
                
            # Need at least 2 points to determine crossing direction
            history = self.track_history[track_id]
            if len(history) >= 2:
                prev_y = history[-2]
                curr_y = history[-1]
                
                # Check crossing from top to bottom (Direction: DOWN / IN)
                if prev_y < count_line_y and curr_y >= count_line_y:
                    self.counts_in[label] += 1
                    self.total_counted += 1
                    self.counted_ids.add(track_id)
                    obj["crossed_direction"] = "down"
                    
                # Check crossing from bottom to top (Direction: UP / OUT)
                elif prev_y > count_line_y and curr_y <= count_line_y:
                    self.counts_out[label] += 1
                    self.total_counted += 1
                    self.counted_ids.add(track_id)
                    obj["crossed_direction"] = "up"
                    
        return {
            "total": self.total_counted,
            "in": sum(self.counts_in.values()),
            "out": sum(self.counts_out.values()),
            "by_class_in": dict(self.counts_in),
            "by_class_out": dict(self.counts_out),
            "current_visible": dict(self.current_frame_counts),
            "count_line_y": count_line_y
        }

    def reset(self):
        self.track_history.clear()
        self.counted_ids.clear()
        self.counts_in.clear()
        self.counts_out.clear()
        self.total_counted = 0
        self.current_frame_counts.clear()
