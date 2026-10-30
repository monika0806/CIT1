"""
core package — RoadPulseAI AI & Traffic Engine

On cloud deployments (RENDER_DEPLOYMENT=true), heavy CV/AI modules (cv2, ultralytics)
are NOT imported here. Only pure-Python modules (map_simulator, green_corridor) load.
On local machines with full dependencies, everything loads normally.
"""
import os

# Safe modules — no cv2 / ultralytics dependency
from .map_simulator import SITTumkurTrafficSimulator
from .green_corridor import GreenCorridorEngine

# Heavy CV/AI modules — only load when cv2 is available
_IS_CLOUD = os.environ.get("RENDER_DEPLOYMENT", "false").lower() == "true"

if not _IS_CLOUD:
    try:
        from .detector import MultiModelDetector
        from .counter import VehicleCounter
        from .density_analyzer import DensityAnalyzer
        from .helmet_analyzer import HelmetAnalyzer
        from .triple_riding_analyzer import TripleRidingAnalyzer
        from .wrong_way_analyzer import WrongWayAnalyzer
        from .license_plate_ocr import LicensePlateRecognizer
        from .violation_engine import ViolationEngine
        from .pipeline import MasterTrafficPipeline
    except (ImportError, ModuleNotFoundError) as e:
        print(f"[core] CV modules skipped (missing dependency): {e}")
        MultiModelDetector = None
        VehicleCounter = None
        DensityAnalyzer = None
        HelmetAnalyzer = None
        TripleRidingAnalyzer = None
        WrongWayAnalyzer = None
        LicensePlateRecognizer = None
        ViolationEngine = None
        MasterTrafficPipeline = None
else:
    # Stub out all CV classes on cloud — app.py checks IS_CLOUD before using them
    MultiModelDetector = None
    VehicleCounter = None
    DensityAnalyzer = None
    HelmetAnalyzer = None
    TripleRidingAnalyzer = None
    WrongWayAnalyzer = None
    LicensePlateRecognizer = None
    ViolationEngine = None
    MasterTrafficPipeline = None
