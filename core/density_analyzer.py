"""
OmniTraffic AI - Traffic Density & Heatmap Analyzer
Calculates traffic volume density, Level of Service (LOS),
congestion metrics, and generates smooth thermal heatmaps.
"""

import cv2
import numpy as np

class DensityAnalyzer:
    def __init__(self, decay_rate=0.92, blur_radius=25, capacity=25):
        """
        decay_rate: Temporal fading factor for the heatmap (0.0 to 1.0)
        blur_radius: Spatial dispersion Gaussian blur kernel radius
        capacity: Vehicle count threshold considered 100% road capacity
        """
        self.decay_rate = decay_rate
        self.blur_radius = blur_radius if blur_radius % 2 == 1 else blur_radius + 1
        self.capacity = capacity
        self.heatmap_acc = None

    def analyze_density(self, tracked_boxes, frame_w, frame_h):
        """
        Computes traffic density metrics from tracked vehicle detections.
        """
        # Filter for motorized vehicles
        vehicles = [b for b in tracked_boxes if b["label"] in ("car", "motorcycle", "bus", "truck")]
        vehicle_count = len(vehicles)
        
        # Congestion ratio (0.0 to 1.0+)
        congestion_index = min(1.0, vehicle_count / max(1, self.capacity))
        congestion_pct = round(congestion_index * 100, 1)
        
        # Level of Service (LOS) - Highway Capacity Manual standard
        if vehicle_count <= 4:
            los = "A"
            status = "Free Flow"
            color = (0, 255, 0) # Green
        elif vehicle_count <= 9:
            los = "B"
            status = "Stable Flow"
            color = (50, 205, 50) # Lime Green
        elif vehicle_count <= 15:
            los = "C"
            status = "Moderate Traffic"
            color = (0, 255, 255) # Yellow
        elif vehicle_count <= 22:
            los = "D"
            status = "Heavy Traffic"
            color = (0, 140, 255) # Orange
        elif vehicle_count <= 30:
            los = "E"
            status = "Severe Congestion"
            color = (0, 69, 255) # Red-Orange
        else:
            los = "F"
            status = "Gridlock / Jam"
            color = (0, 0, 255) # Red
            
        return {
            "vehicle_count": vehicle_count,
            "congestion_pct": congestion_pct,
            "level_of_service": los,
            "status": status,
            "color_bgr": color
        }

    def generate_heatmap_overlay(self, frame, tracked_boxes, alpha=0.45):
        """
        Generates and blends a cumulative thermal heatmap overlay on the frame.
        """
        h, w = frame.shape[:2]
        if self.heatmap_acc is None or self.heatmap_acc.shape[:2] != (h, w):
            self.heatmap_acc = np.zeros((h, w), dtype=np.float32)
        else:
            # Apply temporal decay so old traces fade smoothly
            self.heatmap_acc *= self.decay_rate
            
        # Accumulate current vehicle centroids
        for obj in tracked_boxes:
            if obj["label"] in ("car", "motorcycle", "bus", "truck"):
                cx, cy = obj["cx"], obj["cy"]
                if 0 <= cx < w and 0 <= cy < h:
                    cv2.circle(self.heatmap_acc, (cx, cy), 18, 1.0, -1)
                    
        # Apply Gaussian blur for smooth thermal diffusion
        blurred = cv2.GaussianBlur(self.heatmap_acc, (self.blur_radius, self.blur_radius), 0)
        max_val = blurred.max()
        if max_val > 0:
            norm_heat = (np.clip(blurred / max_val, 0, 1) * 255).astype(np.uint8)
        else:
            norm_heat = np.zeros((h, w), dtype=np.uint8)
            
        # Colorize with Jet / Turbo colormap
        colored_heat = cv2.applyColorMap(norm_heat, cv2.COLORMAP_JET)
        
        # Mask out cold zero regions to keep background clear
        mask = norm_heat > 20
        blended = frame.copy()
        blended[mask] = cv2.addWeighted(frame, 1 - alpha, colored_heat, alpha, 0)[mask]
        
        return blended
