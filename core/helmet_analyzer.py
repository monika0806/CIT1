"""
OmniTraffic AI - Helmet Detection & Violation Analyzer
Identifies two-wheeler (motorcycle/scooter) riders operating without protective helmets.

CRITICAL SAFETY RULES:
1. NO_HELMET violations ONLY apply to verified motorcycle riders.
2. Pedestrians, bystanders, or people walking on foot MUST NEVER be flagged or fined.
3. Requires confirmed spatial overlap with a motorcycle track.
"""

class HelmetAnalyzer:
    def __init__(self, iou_thresh=0.25):
        self.iou_thresh = iou_thresh

    def analyze(self, tracked_boxes, helmet_detections, frame_w, frame_h):
        """
        tracked_boxes: output from vehicle detector
        helmet_detections: dict with 'helmets', 'no_helmets', 'riders', 'plates'
        Returns:
            list of violation dicts (ONLY for confirmed motorcycle riders):
               'track_id', 'bbox', 'violation': 'NO_HELMET', 'conf': float
        """
        violations = []
        no_helmets = helmet_detections.get("no_helmets", [])
        
        # If no unhelmeted head is detected, return immediately
        if not no_helmets:
            return violations

        # Filter active motorcycles
        motorcycles = [b for b in tracked_boxes if b["label"] == "motorcycle"]
        
        # If there are NO motorcycles in the scene, NO helmet violation can possibly occur!
        # (All detected persons are pedestrians/bystanders who do not require helmets).
        if not motorcycles:
            return violations

        # Filter persons mounted on motorcycles (riders)
        persons = [b for b in tracked_boxes if b["label"] in ("person", "pedestrian", "rider")]
        
        for no_h in no_helmets:
            hx1, hy1, hx2, hy2 = no_h["bbox"]
            hcx, hcy = no_h["cx"], no_h["cy"]
            h_conf = no_h["conf"]
            
            matched_bike = None
            
            # Step 1: Check if this unhelmeted head is directly above or inside a motorcycle bounding box
            for bike in motorcycles:
                bx1, by1, bx2, by2 = bike["bbox"]
                bw = bx2 - bx1
                bh = by2 - by1
                
                # Expand bike box upward to define rider's head/torso area
                rider_zone_y1 = max(0, by1 - int(bh * 1.0))
                rider_zone_y2 = by2
                rider_zone_x1 = max(0, bx1 - int(bw * 0.15))
                rider_zone_x2 = min(frame_w, bx2 + int(bw * 0.15))
                
                # Verify that the unhelmeted head is inside this motorcycle rider zone
                if (rider_zone_x1 <= hcx <= rider_zone_x2) and (rider_zone_y1 <= hcy <= rider_zone_y2):
                    # Also verify that a person detection is seated on this bike
                    bike_has_rider = False
                    for p in persons:
                        px1, py1, px2, py2 = p["bbox"]
                        # Person intersects with motorcycle bounds
                        if (px1 < bx2 and px2 > bx1 and py1 < by2 and py2 > by1):
                            bike_has_rider = True
                            break
                            
                    # If confirmed on motorcycle or immediately on motorcycle zone
                    if bike_has_rider or (hcy < by1 + int(bh * 0.5)):
                        matched_bike = bike
                        break
            
            # CRITICAL ENFORCEMENT: If no motorcycle is associated, DISCARD!
            # Pedestrians walking on foot do NOT wear helmets and must NEVER be fined.
            if matched_bike is None:
                continue
                
            bx1, by1, bx2, by2 = matched_bike["bbox"]
            full_violation_bbox = [
                min(bx1, hx1),
                min(hy1, by1),
                max(bx2, hx2),
                by2
            ]
            
            violations.append({
                "track_id": matched_bike.get("id"),
                "bbox": full_violation_bbox,
                "head_bbox": [hx1, hy1, hx2, hy2],
                "violation": "NO_HELMET",
                "conf": round(h_conf, 2),
                "vehicle_type": "motorcycle"
            })
            
        return violations
