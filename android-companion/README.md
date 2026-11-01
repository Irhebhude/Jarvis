# JARVIS Android Companion (0.1.0)

A minimal native Android companion that reports **foreground-only, user-started** accelerometer, gyroscope, magnetometer, light and proximity readings to the JARVIS gateway. The app does not request camera, microphone, location, contacts, SMS, accessibility or device-admin permissions. It has no remote-control capability.

## Build

Open this `android-companion` folder in Android Studio (JDK 17, Android SDK 35, Gradle 8.9 / Android Gradle Plugin 8.7.3), or run:

```bash
gradle --no-daemon :app:assembleDebug
```

The GitHub Actions workflow builds and uploads a debug APK artifact when CI runs.

## Pair and use

1. Deploy the JARVIS gateway behind HTTPS and enable a long random `JARVIS_GATEWAY_TOKEN`.
2. Open the app, enter the HTTPS gateway URL and token, then press **START CONSENTED SENSOR SHARING**.
3. Keep the app in the foreground while testing. Press **STOP SENSOR SHARING** to unregister listeners and clear the token from app memory.

The token is intentionally not persisted by this minimal reference app. Use a dedicated, revocable device token rather than a shared administrator credential for a public deployment. Add a token-rotation/device-pairing service before production use.

Android lifecycle and OS restrictions mean this is not continuous background monitoring. Additional sensors and background services require separate user-visible permission flows and must comply with the Android version's foreground-service rules. Do not treat this companion as mobile antivirus or as a substitute for Android's built-in security controls.
