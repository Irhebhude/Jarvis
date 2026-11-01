"""Reference safety-state evaluator for simulation and design review only.

This module is NOT a certified safety controller and does not command motors.
A real wearable robot requires an independent, hardware-enforced safety system
validated by qualified robotics/medical-device engineers.
"""
from dataclasses import dataclass
from enum import Enum
from time import monotonic


class State(str, Enum):
    DISARMED = 'DISARMED'
    READY = 'READY'
    FAULT = 'FAULT'
    ESTOP_LATCHED = 'ESTOP_LATCHED'


@dataclass(frozen=True)
class Limits:
    max_abs_angle_deg: float = 45.0
    max_abs_velocity_deg_s: float = 90.0
    max_sample_age_s: float = 0.10


class SafetySupervisor:
    def __init__(self, limits=Limits()):
        self.limits = limits
        self.state = State.DISARMED
        self.reason = 'Not armed'

    def evaluate(self, *, armed_request: bool, estop: bool, angle_deg: float,
                 velocity_deg_s: float, sample_time: float | None = None,
                 now: float | None = None) -> State:
        if estop:
            self.state, self.reason = State.ESTOP_LATCHED, 'Emergency stop asserted; manual inspection/reset required'
            return self.state
        if self.state == State.ESTOP_LATCHED:
            self.reason = 'Emergency stop remains latched; power-cycle and qualified manual reset required'
            return self.state
        if not armed_request:
            self.state, self.reason = State.DISARMED, 'Operator disarmed'
            return self.state
        now = monotonic() if now is None else now
        if sample_time is None or now - sample_time > self.limits.max_sample_age_s or now < sample_time:
            self.state, self.reason = State.FAULT, 'Sensor sample missing, stale or from the future'
        elif abs(angle_deg) > self.limits.max_abs_angle_deg:
            self.state, self.reason = State.FAULT, 'Joint angle outside configured simulation limit'
        elif abs(velocity_deg_s) > self.limits.max_abs_velocity_deg_s:
            self.state, self.reason = State.FAULT, 'Joint velocity outside configured simulation limit'
        else:
            self.state, self.reason = State.READY, 'Simulation inputs within configured limits; no actuator command generated'
        return self.state
