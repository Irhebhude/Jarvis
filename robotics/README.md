# JARVIS robotics integration boundary

## ROS 2 telemetry bridge

`jarvis_ros_bridge` is a **read-only telemetry bridge**. It subscribes to ROS 2 `/joint_states` and sends bounded joint-count/min/max summaries to the authenticated JARVIS gateway endpoint `/v1/devices/telemetry`.

It does not publish to command topics, load actuator drivers, arm robots, or command motors. Install it in a ROS 2 workspace with `rclpy` and `sensor_msgs`, then set:

```bash
export JARVIS_GATEWAY_URL=https://your-private-jarvis-host
export JARVIS_GATEWAY_TOKEN='your-long-random-gateway-token'
export JARVIS_ROBOT_ID='robot-lab-01'
ros2 run jarvis_ros_bridge telemetry_bridge
```

The gateway only accepts allowlisted scalar/vector telemetry and stores the latest snapshot per device. Keep the gateway behind HTTPS and authentication. Do not expose ROS DDS directly to the public internet; use a VPN/private network and firewall rules.

## Exoskeleton safety reference model

`exoskeleton_safety/safety_supervisor.py` is a small deterministic **simulation/reference state evaluator**, not a motor controller or certified safety system. It demonstrates disarmed-by-default behavior, stale-sensor faults, configurable angle/velocity bounds and a latched emergency-stop state. It emits no actuator command.

A real exoskeleton requires an independent hardware safety controller, redundant sensors where appropriate, mechanical stops, current/torque/speed limits, watchdogs, emergency-stop circuits, safe power removal, risk analysis, bench testing, human-factors review and applicable regulatory/safety review by qualified engineers. Never connect this reference code directly to powered actuators.
