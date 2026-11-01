package org.poifoundation.jarvis

import android.app.Activity
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.concurrent.thread

/** Foreground-only, user-started sensor telemetry. No camera, microphone, location or actuator control. */
class MainActivity : Activity(), SensorEventListener {
    private lateinit var sensorManager: SensorManager
    private lateinit var status: TextView
    private lateinit var gatewayInput: EditText
    private lateinit var tokenInput: EditText
    private val handler = Handler(Looper.getMainLooper())
    private val deviceId = UUID.randomUUID().toString()
    private val readings = JSONObject()
    private var running = false
    private var gateway = ""
    private var token = ""

    private val uploader = object : Runnable {
        override fun run() {
            if (!running) return
            val snapshot = synchronized(readings) { JSONObject(readings.toString()) }
            if (snapshot.length() > 0) upload(snapshot)
            handler.postDelayed(this, 2_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        gatewayInput = EditText(this).apply { hint = "Gateway URL, e.g. https://your-domain"; setSingleLine(true) }
        tokenInput = EditText(this).apply { hint = "JARVIS gateway token (held in memory only)"; setSingleLine(true) }
        status = TextView(this).apply { text = "Stopped. Sensors are not read until you press Start."; textSize = 16f }
        val start = Button(this).apply { text = "START CONSENTED SENSOR SHARING"; setOnClickListener { startSharing() } }
        val stop = Button(this).apply { text = "STOP SENSOR SHARING"; setOnClickListener { stopSharing() } }
        listOf(gatewayInput, tokenInput, start, stop, status).forEach { layout.addView(it, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT) }
        setContentView(layout)
    }

    private fun startSharing() {
        gateway = gatewayInput.text.toString().trim().trimEnd('/')
        token = tokenInput.text.toString().trim()
        if (!gateway.startsWith("https://") || token.length < 32) {
            status.text = "Enter an HTTPS gateway URL and a gateway token of at least 32 characters."
            return
        }
        running = true
        val types = listOf(Sensor.TYPE_ACCELEROMETER, Sensor.TYPE_GYROSCOPE, Sensor.TYPE_MAGNETIC_FIELD, Sensor.TYPE_LIGHT, Sensor.TYPE_PROXIMITY)
        var count = 0
        types.forEach { type -> sensorManager.getDefaultSensor(type)?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL); count++ } }
        status.text = "Sharing $count available sensor types while this screen is active. Press Stop to end."
        handler.removeCallbacks(uploader)
        handler.post(uploader)
    }

    private fun stopSharing() {
        running = false
        handler.removeCallbacks(uploader)
        sensorManager.unregisterListener(this)
        token = ""
        status.text = "Stopped. Sensor listeners removed and token cleared from memory."
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!running) return
        synchronized(readings) {
            val vector = JSONObject().put("x", event.values.getOrElse(0) { 0f }.toDouble())
                .put("y", event.values.getOrElse(1) { 0f }.toDouble())
                .put("z", event.values.getOrElse(2) { 0f }.toDouble())
            when (event.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> readings.put("accelerometer", vector)
                Sensor.TYPE_GYROSCOPE -> readings.put("gyroscope", vector)
                Sensor.TYPE_MAGNETIC_FIELD -> readings.put("magnetometer", vector)
                Sensor.TYPE_LIGHT -> readings.put("light", event.values[0].toDouble())
                Sensor.TYPE_PROXIMITY -> readings.put("proximity", event.values[0].toDouble())
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun upload(snapshot: JSONObject) {
        val url = "$gateway/v1/devices/telemetry"
        val bearer = token
        thread(name = "jarvis-sensor-upload") {
            try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 5_000
                connection.readTimeout = 5_000
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $bearer")
                val body = JSONObject().put("deviceId", deviceId).put("source", "android-companion-foreground")
                    .put("readings", snapshot).toString()
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val code = connection.responseCode
                runOnUiThread { if (running) status.text = if (code in 200..299) "Sensor telemetry connected. Sharing is active." else "Gateway returned HTTP $code. Check URL and token." }
                connection.disconnect()
            } catch (_: Exception) {
                runOnUiThread { if (running) status.text = "Could not reach gateway. Check internet, HTTPS URL and server status." }
            }
        }
    }

    override fun onPause() { super.onPause(); stopSharing() }
    override fun onDestroy() { stopSharing(); super.onDestroy() }
}
