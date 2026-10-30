"""
OmniTraffic AI - High-Performance Self-Contained Multi-Object Tracker
Uses Hungarian algorithm (scipy.optimize.linear_sum_assignment) with IoU & Euclidean cost
to assign persistent track IDs across frames without requiring external C libraries (like lap/lapx).
"""

import numpy as np
from scipy.optimize import linear_sum_assignment

class Track:
    def __init__(self, track_id, bbox, label, conf):
        self.track_id = track_id
        self.bbox = bbox  # [x1, y1, x2, y2]
        self.label = label
        self.conf = conf
        self.cx = (bbox[0] + bbox[2]) // 2
        self.cy = (bbox[1] + bbox[3]) // 2
        self.w = bbox[2] - bbox[0]
        self.h = bbox[3] - bbox[1]
        
        self.hits = 1
        self.time_since_update = 0
        self.history = [(self.cx, self.cy)]

    def update(self, bbox, conf):
        self.bbox = bbox
        self.conf = conf
        self.cx = (bbox[0] + bbox[2]) // 2
        self.cy = (bbox[1] + bbox[3]) // 2
        self.w = bbox[2] - bbox[0]
        self.h = bbox[3] - bbox[1]
        self.hits += 1
        self.time_since_update = 0
        self.history.append((self.cx, self.cy))
        if len(self.history) > 30:
            self.history.pop(0)

    def mark_missed(self):
        self.time_since_update += 1

    def to_dict(self):
        return {
            "id": self.track_id,
            "bbox": self.bbox,
            "cx": self.cx,
            "cy": self.cy,
            "w": self.w,
            "h": self.h,
            "conf": self.conf,
            "label": self.label,
            "hits": self.hits
        }


class HungarianTracker:
    def __init__(self, max_age=15, min_hits=1, iou_threshold=0.3):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.tracks = []
        self.next_id = 1

    @staticmethod
    def _compute_iou(boxA, boxB):
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
        areaB = max(1, (bx2 - bx1) * (by2 - by1))
        union_area = areaA + areaB - inter_area
        return inter_area / union_area if union_area > 0 else 0.0

    def update(self, detections):
        """
        detections: list of dicts with 'bbox': [x1, y1, x2, y2], 'label': str, 'conf': float
        Returns:
            list of active tracked objects as dicts
        """
        # If no tracks exist yet, initialize them
        if len(self.tracks) == 0:
            for det in detections:
                t = Track(self.next_id, det["bbox"], det["label"], det["conf"])
                self.next_id += 1
                self.tracks.append(t)
            return [t.to_dict() for t in self.tracks if t.hits >= self.min_hits]

        # Cost matrix based on (1 - IoU) + label penalty
        num_tracks = len(self.tracks)
        num_dets = len(detections)
        
        if num_dets == 0:
            for t in self.tracks:
                t.mark_missed()
            self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]
            return [t.to_dict() for t in self.tracks if t.hits >= self.min_hits and t.time_since_update == 0]

        cost_matrix = np.zeros((num_tracks, num_dets), dtype=np.float32)
        for i, t in enumerate(self.tracks):
            for j, det in enumerate(detections):
                iou = self._compute_iou(t.bbox, det["bbox"])
                # Penalize class mismatch so a car doesn't suddenly become a motorcycle
                class_penalty = 0.0 if t.label == det["label"] else 1.0
                cost_matrix[i, j] = (1.0 - iou) + class_penalty

        # Hungarian matching via SciPy
        row_ind, col_ind = linear_sum_assignment(cost_matrix)

        matched_tracks = set()
        matched_dets = set()

        for r, c in zip(row_ind, col_ind):
            # Verify that IoU is above minimum threshold and class matches
            iou = self._compute_iou(self.tracks[r].bbox, detections[c]["bbox"])
            if iou >= self.iou_threshold and self.tracks[r].label == detections[c]["label"]:
                self.tracks[r].update(detections[c]["bbox"], detections[c]["conf"])
                matched_tracks.add(r)
                matched_dets.add(c)

        # Unmatched tracks
        for i, t in enumerate(self.tracks):
            if i not in matched_tracks:
                t.mark_missed()

        # Unmatched detections -> spawn new tracks
        for j, det in enumerate(detections):
            if j not in matched_dets:
                t = Track(self.next_id, det["bbox"], det["label"], det["conf"])
                self.next_id += 1
                self.tracks.append(t)

        # Remove dead tracks that exceeded max_age
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]

        # Return only currently active confirmed tracks
        active = [t.to_dict() for t in self.tracks if t.hits >= self.min_hits and t.time_since_update == 0]
        return active
