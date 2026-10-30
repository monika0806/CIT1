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
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'ISSUED',
        FOREIGN KEY(violation_id) REFERENCES violations(id)
    );
    """)
    
    # Women Safety Pink Patrol SOS Dispatches table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sos_dispatches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispatch_id TEXT UNIQUE,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        corridor TEXT,
        lat REAL,
        lng REAL,
        unit_assigned TEXT,
        patrol_vehicle TEXT,
        officer_in_charge TEXT,
        eta_mins INTEGER,
        status TEXT DEFAULT 'DISPATCHED'
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

def get_recent_violations(limit=25):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT v.*, e.challan_number, e.fine_amount, e.status as challan_status
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

def get_challan_details(identifier):
    """Fetch complete legal challan record by numeric ID or Challan Number"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        if str(identifier).isdigit():
            cursor.execute("""
                SELECT e.*, v.snapshot_path, v.vehicle_type, v.confidence, v.timestamp as violation_time
                FROM echallans e
                JOIN violations v ON e.violation_id = v.id
                WHERE e.id = ? OR e.violation_id = ?
            """, (int(identifier), int(identifier)))
        else:
            cursor.execute("""
                SELECT e.*, v.snapshot_path, v.vehicle_type, v.confidence, v.timestamp as violation_time
                FROM echallans e
                JOIN violations v ON e.violation_id = v.id
                WHERE e.challan_number = ? OR e.license_plate = ?
            """, (str(identifier), str(identifier)))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        print(f"[DB Error get_challan_details]: {e}")
        return None

def search_challans(query_str):
    """Search challans by license plate or challan number"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        q = f"%{query_str.strip().upper()}%"
        cursor.execute("""
            SELECT e.*, v.snapshot_path, v.vehicle_type, v.confidence, v.timestamp as violation_time
            FROM echallans e
            JOIN violations v ON e.violation_id = v.id
            WHERE UPPER(e.license_plate) LIKE ? OR UPPER(e.challan_number) LIKE ?
            ORDER BY e.id DESC LIMIT 50
        """, (q, q))
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        print(f"[DB Error search_challans]: {e}")
        return []

def pay_challan(challan_identifier, method="UPI_ONLINE"):
    """Mark a challan as PAID with transaction record"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        tx_ref = f"TXN-{datetime.now().strftime('%Y%m%d%H%M')}-{int(datetime.now().timestamp())%10000}"
        
        if str(challan_identifier).isdigit():
            cursor.execute("""
                UPDATE echallans 
                SET status = 'PAID' 
                WHERE id = ? OR violation_id = ?
            """, (int(challan_identifier), int(challan_identifier)))
        else:
            cursor.execute("""
                UPDATE echallans 
                SET status = 'PAID' 
                WHERE challan_number = ?
            """, (str(challan_identifier),))
            
        conn.commit()
        conn.close()
        return True, tx_ref
    except Exception as e:
        print(f"[DB Error pay_challan]: {e}")
        return False, None

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

def log_sos_dispatch(dispatch_id, corridor, lat, lng, unit_assigned, patrol_vehicle, officer_in_charge, eta_mins):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sos_dispatches (dispatch_id, corridor, lat, lng, unit_assigned, patrol_vehicle, officer_in_charge, eta_mins, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DISPATCHED')
        """, (dispatch_id, corridor, float(lat), float(lng), unit_assigned, patrol_vehicle, officer_in_charge, int(eta_mins)))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB Error log_sos_dispatch]: {e}")
        return False

def get_recent_sos_dispatches(limit=10):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM sos_dispatches ORDER BY id DESC LIMIT ?
        """, (limit,))
        rows = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        print(f"[DB Error get_recent_sos_dispatches]: {e}")
        return []

