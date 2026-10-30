"""
OmniTraffic AI - License Plate Detection & OCR Module
Extracts number plate regions and performs optical character recognition (EasyOCR)
with plate pattern matching and state-code autocorrection.
"""

import os
import re
import cv2
import numpy as np

# Valid Indian State / Union Territory codes
_VALID_STATES = {
    'AP','AR','AS','BR','CG','CH','DD','DL','DN','GA','GJ',
    'HR','HP','JH','JK','KA','KL','LA','LD','MH','ML','MN',
    'MP','MZ','NL','OD','PB','PY','RJ','SK','TN','TR','TS',
    'TG','UK','UP','WB','AN'
}

_STATE_FIXES = {
    'HH': 'MH', 'HM': 'MH', 'IH': 'MH', 'NH': 'MH',
    'EL': 'KL', 'IL': 'KL', 'KI': 'KA', 'TZ': 'TN', 'IK': 'UK'
}

_PATTERNS = [
    re.compile(r'[A-Z]{2}\d{2}[A-Z]{2}\d{4}'),     # Standard: KA03XY1234
    re.compile(r'[A-Z]{2}\d{2}[A-Z]{1}\d{4}'),      # KL30G1234
    re.compile(r'[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}'),# General format
    re.compile(r'[A-Z0-9]{6,10}')                   # International catch-all
]

class LicensePlateRecognizer:
    def __init__(self, cascade_path="models/haarcascade_russian_plate_number.xml"):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.cascade_path = os.path.join(base_dir, cascade_path)
        
        self.plate_cascade = None
        if os.path.exists(self.cascade_path):
            self.plate_cascade = cv2.CascadeClassifier(self.cascade_path)
            
        self.reader = None
        self._init_ocr()

    def _init_ocr(self):
        """Lazy initialization of EasyOCR reader"""
        try:
            import easyocr
            self.reader = easyocr.Reader(['en'], gpu=False, verbose=False)
            print("[Plate OCR] EasyOCR initialized successfully.")
        except Exception as e:
            print(f"[Plate OCR] Warning: EasyOCR initialization error: {e}")
            self.reader = None

    @staticmethod
    def _correct_plate_text(raw_text):
        """
        Applies heuristic OCR character corrections based on expected license plate positions.
        """
        text = re.sub(r'[^A-Z0-9]', '', raw_text.upper())
        text = text.replace('IND', '').replace('INDIA', '')
        
        if len(text) < 5:
            return text
            
        chars = list(text)
        letter_map = {'0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G', '2': 'Z'}
        digit_map = {'O': '0', 'I': '1', 'S': '5', 'B': '8', 'Z': '2', 'G': '6', 'A': '4', 'T': '7', 'L': '1'}
        
        # Positions 0 and 1: State code letters
        for i in [0, 1]:
            if i < len(chars) and chars[i].isdigit():
                chars[i] = letter_map.get(chars[i], chars[i])
                
        # Fix known OCR state code errors
        state = ''.join(chars[:2])
        if state not in _VALID_STATES and state in _STATE_FIXES:
            fixed = _STATE_FIXES[state]
            chars[0], chars[1] = fixed[0], fixed[1]
            
        # Positions 2 and 3: District / RTO digits
        for i in [2, 3]:
            if i < len(chars) and chars[i].isalpha():
                chars[i] = digit_map.get(chars[i], chars[i])
                
        # Last 4 characters are almost always digits
        if len(chars) >= 8:
            for i in range(len(chars) - 4, len(chars)):
                if chars[i].isalpha():
                    chars[i] = digit_map.get(chars[i], chars[i])
                    
        cleaned = ''.join(chars)
        
        # Match against patterns
        for pat in _PATTERNS:
            match = pat.search(cleaned)
            if match:
                return match.group()
                
        return cleaned

    def preprocess_plate(self, plate_crop):
        """
        Enhances license plate contrast and clarity for OCR.
        """
        if plate_crop is None or plate_crop.size == 0:
            return None
            
        # Resize to standardized height
        h, w = plate_crop.shape[:2]
        if h < 40 or w < 100:
            scale = max(40 / max(1, h), 100 / max(1, w))
            plate_crop = cv2.resize(plate_crop, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
            
        gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        
        # CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrast = clahe.apply(gray)
        
        # Bilateral filter to smooth noise while keeping character edges sharp
        filtered = cv2.bilateralFilter(contrast, 9, 75, 75)
        
        return filtered

    def read_plate(self, plate_crop):
        """
        Runs OCR on a license plate crop.
        Returns:
            (plate_text, confidence)
        """
        if self.reader is None or plate_crop is None or plate_crop.size == 0:
            return "", 0.0
            
        try:
            processed = self.preprocess_plate(plate_crop)
            if processed is None:
                return "", 0.0
                
            results = self.reader.readtext(processed, detail=1, paragraph=False)
            if not results:
                # Try fallback on original BGR
                results = self.reader.readtext(plate_crop, detail=1, paragraph=False)
                
            if not results:
                return "", 0.0
                
            # Sort top to bottom, then left to right
            sorted_res = sorted(results, key=lambda r: (r[0][0][1], r[0][0][0]))
            raw_text = "".join([r[1] for r in sorted_res])
            conf = max([r[2] for r in sorted_res]) if sorted_res else 0.0
            
            cleaned_text = self._correct_plate_text(raw_text)
            return cleaned_text, round(float(conf), 2)
        except Exception as e:
            return "", 0.0

    def extract_and_read(self, frame, vehicle_bbox, plate_detections=None):
        """
        Extracts plate from a vehicle bounding box using candidate detections,
        Haar cascade, or geometric lower-crop fallback.
        """
        vx1, vy1, vx2, vy2 = vehicle_bbox
        vh, vw = vy2 - vy1, vx2 - vx1
        
        # 1. Check if YOLO detected a plate within/near this vehicle
        if plate_detections:
            for p in plate_detections:
                px1, py1, px2, py2 = p["bbox"]
                if vx1 <= px1 <= vx2 and vy1 <= py1 <= vy2:
                    crop = frame[max(0, py1):min(frame.shape[0], py2), max(0, px1):min(frame.shape[1], px2)]
                    text, conf = self.read_plate(crop)
                    if len(text) >= 4:
                        return text, conf, [px1, py1, px2, py2]
                        
        # 2. Haar cascade on vehicle crop
        veh_crop = frame[max(0, vy1):min(frame.shape[0], vy2), max(0, vx1):min(frame.shape[1], vx2)]
        if veh_crop.size > 0 and self.plate_cascade is not None:
            gray_veh = cv2.cvtColor(veh_crop, cv2.COLOR_BGR2GRAY)
            plates = self.plate_cascade.detectMultiScale(gray_veh, scaleFactor=1.1, minNeighbors=4, minSize=(30, 15))
            for (px, py, pw, ph) in plates:
                plate_crop = veh_crop[py:py+ph, px:px+pw]
                text, conf = self.read_plate(plate_crop)
                if len(text) >= 4:
                    abs_bbox = [vx1 + px, vy1 + py, vx1 + px + pw, vy1 + py + ph]
                    return text, conf, abs_bbox
                    
        # 3. Geometric lower 35% crop (where license plates standardly reside on vehicles)
        lower_y1 = max(0, vy1 + int(vh * 0.65))
        lower_crop = frame[lower_y1:min(frame.shape[0], vy2), max(0, vx1 + int(vw * 0.15)):min(frame.shape[1], vx2 - int(vw * 0.15))]
        if lower_crop.size > 0:
            text, conf = self.read_plate(lower_crop)
            if len(text) >= 4:
                return text, conf, [vx1 + int(vw * 0.15), lower_y1, vx2 - int(vw * 0.15), vy2]
                
        return "", 0.0, None
