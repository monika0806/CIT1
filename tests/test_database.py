import importlib.util
import tempfile
import unittest
from pathlib import Path


DATABASE_MODULE_PATH = Path(__file__).resolve().parents[1] / "database" / "db.py"
MODULE_SPEC = importlib.util.spec_from_file_location("roadpulse_database", DATABASE_MODULE_PATH)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise ImportError(f"Unable to load database module from {DATABASE_MODULE_PATH}")

database = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(database)


class DatabaseSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = database.DB_PATH
        database.DB_PATH = str(Path(self.temp_dir.name) / "test_traffic_system.db")
        database.init_db()

    def tearDown(self):
        database.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_schema_and_challan_lifecycle(self):
        connection = database.get_connection()
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        connection.close()
        self.assertTrue(
            {"vehicle_detections", "density_logs", "violations", "echallans"}
            .issubset(tables)
        )

        violation_id, challan_number = database.log_violation(
            1, "NO_HELMET", "motorcycle", "KA01AB1234", 0.98, "snapshot.jpg"
        )
        self.assertIsNotNone(violation_id)
        self.assertIsNotNone(challan_number)

        recent = database.get_recent_violations()
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0]["challan_number"], challan_number)
        self.assertEqual(recent[0]["fine_amount"], 1000.0)
        self.assertEqual(len(database.search_challans("KA01AB1234")), 1)
        self.assertEqual(
            database.get_challan_details(challan_number)["status"], "ISSUED"
        )

        success, transaction_reference = database.pay_challan(challan_number)
        self.assertTrue(success)
        self.assertIsNotNone(transaction_reference)
        self.assertEqual(
            database.get_challan_details(challan_number)["status"], "PAID"
        )

    def test_telemetry_writes(self):
        database.log_detection(42, "car", 0.91)
        database.log_density(1, "LOW", "A", 0.1)

        stats = database.get_statistics()
        self.assertEqual(stats["total_detected"], 1)
        self.assertEqual(stats["vehicle_types"], {"car": 1})


if __name__ == "__main__":
    unittest.main()
