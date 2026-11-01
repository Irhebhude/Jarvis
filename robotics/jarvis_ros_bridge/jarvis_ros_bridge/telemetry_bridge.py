"""Read-only JointState telemetry publisher. It never sends actuator commands."""
import json
import os
import urllib.request

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState


class JarvisTelemetryBridge(Node):
    def __init__(self):
        super().__init__('jarvis_telemetry_bridge')
        self.gateway = os.environ.get('JARVIS_GATEWAY_URL', '').rstrip('/')
        self.token = os.environ.get('JARVIS_GATEWAY_TOKEN', '')
        if not self.gateway.startswith('https://') or len(self.token) < 32:
            raise RuntimeError('Set JARVIS_GATEWAY_URL to HTTPS and JARVIS_GATEWAY_TOKEN (32+ chars).')
        self.device_id = os.environ.get('JARVIS_ROBOT_ID', 'ros2-robot')[:80]
        self.subscription = self.create_subscription(JointState, '/joint_states', self.on_joint_state, 10)
        self.get_logger().info('Read-only JointState telemetry bridge active; actuator commands are not supported.')

    def on_joint_state(self, msg):
        # Only bounded position/velocity/effort summaries are forwarded as telemetry.
        readings = {'jointCount': len(msg.name), 'positionCount': len(msg.position),
                    'velocityCount': len(msg.velocity), 'effortCount': len(msg.effort)}
        for key, values in [('position', msg.position), ('velocity', msg.velocity), ('effort', msg.effort)]:
            finite = [float(v) for v in values[:32] if abs(float(v)) < 1_000_000]
            if finite:
                readings[key + 'Min'] = min(finite)
                readings[key + 'Max'] = max(finite)
        body = json.dumps({'deviceId': self.device_id, 'source': 'ros2-joint-state-readonly', 'readings': readings}).encode()
        request = urllib.request.Request(self.gateway + '/v1/devices/telemetry', data=body,
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token}, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                if response.status not in (200, 202):
                    self.get_logger().warning(f'Gateway telemetry status: {response.status}')
        except Exception as exc:
            self.get_logger().warning(f'Telemetry upload failed: {type(exc).__name__}')


def main(args=None):
    rclpy.init(args=args)
    node = JarvisTelemetryBridge()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
