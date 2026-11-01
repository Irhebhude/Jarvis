# Hardware and external data integration architecture

This document separates integrations that can be connected in software now from integrations requiring a native companion app, a data account, or physical hardware. A connector is not considered operational until it has been paired and tested against the real source/device.

## 1. Satellite and geospatial data — ORBIT

### Recommended sources

- **Copernicus Data Space Ecosystem (CDSE):** use the public STAC catalogue for discovery of Sentinel-1 and Sentinel-2 products. The current gateway endpoint queries Sentinel-2 L2A and Sentinel-1 GRD metadata through `https://stac.dataspace.copernicus.eu/v1/search`.
- **NASA GIBS:** use its public WMTS/WMS/TMS tile services for map visualization. GIBS offers browse imagery products, not continuous live video.
- **NASA Earthdata:** use appropriate Earthdata services for products that require account authentication or download workflows.

### Current implementation

`POST /v1/orbit/search` validates a small bounding box, UTC time interval, collection and result limit, then queries the Copernicus STAC catalogue. The Task Control panel exposes a basic Sentinel-2 catalogue search. It returns metadata, observation dates, cloud-cover estimates and safe HTTPS record/preview links. It does not download full-resolution imagery, run GIS analytics or show a live feed.

### Limits

Satellite products are collected on passes and have revisit intervals, cloud cover, processing latency, varying ground sample distance and licensing/usage conditions. They cannot provide arbitrary real-time surveillance of a home, road or person. Always show capture time, resolution, cloud cover and data source in any future map layer.

## 2. Android companion — SENTINEL / device interface

### Recommended architecture

Build a separate native Kotlin Android companion application, paired to JARVIS through a per-device credential and HTTPS/WebSocket connection. Use Android's public APIs and ask for each permission at the moment its feature is enabled. Do not attempt to bypass Android permission prompts or use hidden APIs.

- Sensor inventory and motion/environment readings: `SensorManager`; available sensors vary by handset and manufacturer.
- Camera, microphone and location: Android runtime permissions, with visible user controls and foreground notifications when applicable.
- Device/app security posture: report only information exposed by documented APIs and permissions. Do not assume an ordinary app can inspect other apps' private data, read all notifications, or obtain full antivirus/EDR visibility.
- System actions: prefer documented Android intents and user-confirmed actions. An `AccessibilityService` is only for a clearly disclosed assistive purpose and explicit user enablement; it is not a universal permission to silently control the phone.
- Background monitoring: use WorkManager for deferrable work and foreground services only for permitted, user-visible ongoing work. Android 12+ restricts background foreground-service starts; Android 14+ requires service types and matching permissions for camera, microphone, location and other protected use cases.

### Current implementation

The web interface uses browser camera/microphone capabilities where the browser grants permission. No native Android companion, persistent sensor collector, notification listener, accessibility service or device-control agent is included yet. The phone's exact sensors must be enumerated on the actual handset before promising a sensor feature.

## 3. Robotics and exoskeletons — HEDY

### Recommended architecture

Use **ROS 2** as the robotics middleware and `ros2_control` hardware interfaces for supported sensors and actuators. Put a dedicated ROS 2 gateway/adapter on the robot's onboard computer or a trusted local network. JARVIS should communicate with a narrowly allowlisted, authenticated bridge; it must not connect directly to motor buses or raw actuator drivers.

Suggested staged integration:

1. Read-only telemetry: battery, temperatures, joint positions, force/torque sensors, IMU, encoder and fault states.
2. Simulation: validate kinematics and control logic in a simulator with mock hardware.
3. Supervised low-energy bench tests with physical guards and a human operator.
4. Only after independent safety review, permit a certified low-level controller to accept bounded commands from an explicit approval workflow.

### Exoskeleton safety boundary

A language model must never be the real-time motor controller. Use an independent safety controller with hardwired emergency stop, watchdog, torque/current/velocity/position limits, joint travel limits, mechanical stops, fail-safe power removal or safe-hold design, and validated human factors. Determine the correct standards and regulatory route for the actual intended use. ISO 13482 may be relevant to some personal-care robots but explicitly excludes medical devices and industrial robots; it is not a blanket exoskeleton certification.

### Current implementation

No ROS 2 bridge, robot driver, actuator command path, simulator, exoskeleton hardware profile or safety validation is present in this release. The gateway deliberately does not expose motor-control endpoints.

## 4. Pairing, trust and command policy

- One unique credential per device; rotate and revoke credentials independently.
- Prefer TLS/mTLS, network segmentation and allowlisted endpoints/topics.
- Device registration must identify manufacturer, model, firmware, protocol, capabilities and safety classification.
- Sensor telemetry is read-only by default.
- Reversible low-risk actions may be separately enabled; safety-critical movement, external communications, payments, destructive operations and security-policy changes require explicit approval.
- Keep an append-only audit record and provide a physical emergency stop for any robot/exoskeleton.
- Never store raw device credentials or secrets in conversation memory.

## Official technical references

- [Copernicus Data Space APIs](https://documentation.dataspace.copernicus.eu/APIs.html)
- [Copernicus STAC catalogue](https://documentation.dataspace.copernicus.eu/APIs/STAC.html)
- [NASA GIBS access basics](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
- [Android sensor overview](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview)
- [Android foreground-service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [ROS 2 control hardware components](https://control.ros.org/master/doc/ros2_control/hardware_interface/doc/hardware_components_userdoc.html)
- [ISO 13482 personal-care robot safety scope](https://www.iso.org/standard/53820.html)
