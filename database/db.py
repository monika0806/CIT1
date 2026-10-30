"""
OmniTraffic AI - SQLite Database Manager
Provides persistent storage for vehicle traffic analytics,
violation logs, and e-challans without requiring an external MySQL server.
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "traffic_system.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Vehicle count and telemetry table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vehicle_detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        track_id INTEGER,
        vehicle_type TEXT,
        confidence REAL,
        direction TEXT,
        lane INTEGER DEFAULT 1
    );
    """)
    
    # Traffic density snapshots table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS density_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        vehicle_count INTEGER,
        density_level TEXT,
        level_of_service TEXT,
        congestion_index REAL
    );
    """)
    
    # Violations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        track_id INTEGER,
        violation_type TEXT,
        vehicle_type TEXT,
        license_plate TEXT,
        confidence REAL,
        snapshot_path TEXT,
        status TEXT DEFAULT 'PENDING'
    );
    """)
    
    # E-Challan table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS echallans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challan_number TEXT UNIQUE,
        violation_id INTEGER,
        license_plate TEXT,
        violation_type TEXT,
        fine_amount REAL,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'ISSUED',
        FOREIGN KEY(violation_id) REFERENCES violations(id)
    );
    """)
    
    conn.commit()
    conn.close()

def log_detection(track_id, vehicle_type, confidence, direction="down", lane=1):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO vehicle_detections (track_id, vehicle_type, confidence, direction, lane)
            VALUES (?, ?, ?, ?, ?)
        """, (track_id, vehicle_type, float(confidence), direction, lane))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Error log_detection]: {e}")

def log_density(vehicle_count, density_level, level_of_service, congestion_index):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO density_logs (vehicle_count, density_level, level_of_service, congestion_index)
            VALUES (?, ?, ?, ?)
        """, (vehicle_count, density_level, level_of_service, float(congestion_index)))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Error log_density]: {e}")

def log_violation(track_id, violation_type, vehicle_type, license_plate, confidence, snapshot_path):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO violations (track_id, violation_type, vehicle_type, license_plate, confidence, snapshot_path)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (track_id, violation_type, vehicle_type, license_plate, float(confidence), snapshot_path))
        violation_id = cursor.lastrowid
        
        # Generate automated E-Challan
        fine_rates = {
            "NO_HELMET": 1000.0,
            "TRIPLE_RIDING": 1500.0,
            "WRONG_WAY": 2000.0,
            "SPEEDING": 2000.0,
            "GENERAL": 500.0
        }
        fine = fine_rates.get(violation_type, 1000.0)
        challan_no = f"ECH-{datetime.now().strftime('%Y%m%d%H%M%S')}-{violation_id}"
        
        cursor.execute("""
            INSERT INTO echallans (challan_number, violation_id, license_plate, violation_type, fine_amount)
            VALUES (?, ?, ?, ?, ?)
        """, (challan_no, violation_id, license_plate, violation_type, fine))
        
        conn.commit()
        conn.close()
        return violation_id, challan_no
    except Exception as e:
        print(f"[DB Error log_violation]: {e}")
        return None, None

def get_recent_violations(limit=20):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT v.*, e.challan_number, e.fine_amount
            FROM violations v
            LEFT JOIN echallans e ON v.id = e.violation_id
            ORDER BY v.id DESC LIMIT ?
        """, (limit,))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        print(f"[DB Error get_recent_violations]: {e}")
        return []

def get_statistics():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM vehicle_detections")
        total_detected = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM violations")
        total_violations = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT vehicle_type, COUNT(*) as count 
            FROM vehicle_detections 
            GROUP BY vehicle_type
        """)
        type_counts = {row["vehicle_type"]: row["count"] for row in cursor.fetchall()}
        
        cursor.execute("""
            SELECT violation_type, COUNT(*) as count 
            FROM violations 
            GROUP BY violation_type
        """)
        violation_counts = {row["violation_type"]: row["count"] for row in cursor.fetchall()}
        
        conn.close()
        return {
            "total_detected": total_detected,
            "total_violations": total_violations,
            "vehicle_types": type_counts,
            "violation_types": violation_counts
        }
    except Exception as e:
        print(f"[DB Error get_statistics]: {e}")
        return {"total_detected": 0, "total_violations": 0, "vehicle_types": {}, "violation_types": {}}
