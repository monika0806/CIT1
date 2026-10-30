"""
RoadPulseAI - Main Entry Point
Launch the Web Command Center or run headless video processing via CLI.

Usage:
  1. Web Dashboard Mode (Default):
     python3 run.py

  2. CLI Headless Video Processing:
     python3 run.py --cli --video sample_data/traffic.mp4 --output output.mp4
"""

import argparse
import os
import sys
import cv2
import time

def run_web(port=5000, host="0.0.0.0"):
    from web.app import app
    print("\n" + "=" * 60)
    print(" 🚀 RoadPulseAI Command Center & Enforcement Hub")
    print(f" 🌐 Dashboard URL: http://127.0.0.1:{port}")
    print("=" * 60 + "\n")
    app.run(host=host, port=port, debug=False, threaded=True)

def run_cli(video_path, output_path="output_annotated.mp4", heatmap=False, direction="down"):
    from core.pipeline import MasterTrafficPipeline
    
    if not os.path.exists(video_path):
        print(f"[Error] Video file not found: {video_path}")
        sys.exit(1)
        
    print(f"[CLI] Processing video: {video_path}")
    pipeline = MasterTrafficPipeline(expected_direction=direction)
    pipeline.show_heatmap = heatmap
    
    cap = cv2.VideoCapture(video_path)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Scale down if 4K
    if w > 1280:
        h = int(h * (1280 / w))
        w = 1280
        
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
    
    frame_idx = 0
    t0 = time.time()
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or frame is None:
            break
            
        if frame.shape[1] != w:
            frame = cv2.resize(frame, (w, h))
            
        annotated, telemetry = pipeline.process_frame(frame)
        out.write(annotated)
        frame_idx += 1
        
        if frame_idx % 25 == 0 or frame_idx == total_frames:
            elapsed = time.time() - t0
            cur_fps = frame_idx / max(1e-5, elapsed)
            print(f"[{frame_idx}/{total_frames}] {cur_fps:.1f} FPS | Active: {telemetry['vehicle_count_visible']} | Total Count: {telemetry['total_counted']} | Density: {telemetry['density']['congestion_pct']}% | Violations: {len(telemetry['active_violations'])}")
            
    cap.release()
    out.release()
    print(f"\n[CLI] Processing complete! Annotated video saved to: {output_path}")

def main():
    parser = argparse.ArgumentParser(description="RoadPulseAI - Smart Traffic & Enforcement System")
    parser.add_argument("--cli", action="store_true", help="Run in headless CLI video processing mode")
    parser.add_argument("--video", type=str, default="sample_data/traffic.mp4", help="Input video file path for CLI mode")
    parser.add_argument("--output", type=str, default="output_annotated.mp4", help="Output annotated video path for CLI mode")
    parser.add_argument("--heatmap", action="store_true", help="Enable thermal density heatmap overlay in output")
    parser.add_argument("--direction", type=str, default="bidirectional_split", choices=["auto", "down", "up", "bidirectional_split"], help="Expected traffic flow direction")
    parser.add_argument("--port", type=int, default=5000, help="Web dashboard server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Web dashboard host")
    
    args = parser.parse_args()
    
    if args.cli:
        run_cli(args.video, args.output, args.heatmap, args.direction)
    else:
        run_web(port=args.port, host=args.host)

if __name__ == "__main__":
    main()
