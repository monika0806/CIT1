"""
OmniTraffic AI - Triple Riding Analyzer
Detects motorcycles carrying more than 2 persons (overcrowded two-wheelers).
"""

class TripleRidingAnalyzer:
    def __init__(self, min_occupants=3, overlap_thresh=0.25):
        self.min_occupants = min_occupants
        self.overlap_thresh = overlap_thresh

    @staticmethod
    def _box_overlap(boxA, boxB):
        """
        Calculates intersection over min-area ratio between person box and motorcycle rider zone.
        """
        ax1, ay1, ax2, ay2 = boxA
        bx1, by1, bx2, by2 = boxB
        
        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)
        
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
            
        inter_area = (ix2 - ix1) * (iy2 - iy1)
        areaA = max(1, (ax2 - ax1) * (ay2 - ay1))
        
        # Overlap relative to person's bounding box area
        return inter_area / areaA

    def analyze(self, tracked_boxes, frame_w, frame_h):
        """
        Identifies motorcycles with >= 3 persons on board.
        Returns:
            list of violation dicts:
               'track_id', 'bbox', 'violation': 'TRIPLE_RIDING', 'occupant_count': int
        """
        violations = []
        motorcycles = [b for b in tracked_boxes if b["label"] == "motorcycle"]
        persons = [b for b in tracked_boxes if b["label"] == "person"]
        
        if not motorcycles or len(persons) < self.min_occupants:
            return violations

        for bike in motorcycles:
            bx1, by1, bx2, by2 = bike["bbox"]
            bw = bx2 - bx1
            bh = by2 - by1
            
            # Expanded motorcycle rider zone (reaching upward to catch rider torsos/heads)
            zone_x1 = max(0, bx1 - int(bw * 0.15))
            zone_y1 = max(0, by1 - int(bh * 0.95))
            zone_x2 = min(frame_w, bx2 + int(bw * 0.15))
            zone_y2 = min(frame_h, by2 + int(bh * 0.1))
            rider_zone = (zone_x1, zone_y1, zone_x2, zone_y2)
            
            overlapping_persons = []
            for p in persons:
                p_box = p["bbox"]
                overlap = self._box_overlap(p_box, rider_zone)
                if overlap >= self.overlap_thresh:
                    overlapping_persons.append(p)
                    
            if len(overlapping_persons) >= self.min_occupants:
                # Union box encompassing bike and all riders
                all_x1 = min(bx1, min(p["bbox"][0] for p in overlapping_persons))
                all_y1 = min(zone_y1, min(p["bbox"][1] for p in overlapping_persons))
                all_x2 = max(bx2, max(p["bbox"][2] for p in overlapping_persons))
                all_y2 = max(by2, max(p["bbox"][3] for p in overlapping_persons))
                
                violations.append({
                    "track_id": bike.get("id"),
                    "bbox": [all_x1, all_y1, all_x2, all_y2],
                    "bike_bbox": [bx1, by1, bx2, by2],
                    "violation": "TRIPLE_RIDING",
                    "occupant_count": len(overlapping_persons),
                    "conf": bike["conf"],
                    "vehicle_type": "motorcycle"
                })
                
        return violations
