import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from safety_supervisor import SafetySupervisor, State


class SafetySupervisorTests(unittest.TestCase):
    def test_disarmed_by_default(self):
        self.assertEqual(SafetySupervisor().state, State.DISARMED)

    def test_ready_requires_fresh_in_range_samples(self):
        s = SafetySupervisor()
        self.assertEqual(s.evaluate(armed_request=True, estop=False, angle_deg=10,
            velocity_deg_s=20, sample_time=10, now=10.02), State.READY)

    def test_stale_sensor_faults(self):
        s = SafetySupervisor()
        self.assertEqual(s.evaluate(armed_request=True, estop=False, angle_deg=0,
            velocity_deg_s=0, sample_time=1, now=2), State.FAULT)

    def test_limits_fault(self):
        s = SafetySupervisor()
        self.assertEqual(s.evaluate(armed_request=True, estop=False, angle_deg=50,
            velocity_deg_s=0, sample_time=10, now=10), State.FAULT)

    def test_estop_latches(self):
        s = SafetySupervisor()
        self.assertEqual(s.evaluate(armed_request=True, estop=True, angle_deg=0,
            velocity_deg_s=0, sample_time=10, now=10), State.ESTOP_LATCHED)
        self.assertEqual(s.evaluate(armed_request=True, estop=False, angle_deg=0,
            velocity_deg_s=0, sample_time=10, now=10), State.ESTOP_LATCHED)


if __name__ == '__main__':
    unittest.main()
