from .db import init_db, log_detection, log_density, log_violation, get_recent_violations, get_statistics

# Auto-initialize database on import
init_db()
