require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const IP = process.env.IP || "192.168.166.147";

app.use(cors()); // Enable CORS for frontend access
app.use(express.json()); // Enable JSON parsing

let controlledData = {
  voltage: 120,
  current: 0,
  resistance: 0,
  time: Date.now(),
}; // Default values

let reftovoltage = 0; // Reference voltage for the ESP32
// Function to send data to ESP32

function updateControlledData(voltage, current) {
  let resistance = current !== 0 ? voltage / current : 0; // Compute R = V/I
  controlledData = { voltage, current, resistance, time: Date.now() };
}
// Endpoint to get current data (Unity will call this)
app.get("/data", (req, res) => {
  res.json(controlledData);
});

// Endpoint to update all data (ESP will call this)
app.post("/update", (req, res) => {
  const { voltage, current } = req.body;
  if (voltage !== undefined && current !== undefined) {
    updateControlledData(voltage, current); // Compute and update
    res.json({ success: true, updatedData: controlledData });
  } else {
    res.status(400).json({ success: false, error: "Invalid input" });
  }
});
// Endpoint to get the latest voltage (ESP will call this)
app.get("/getVoltage", (req, res) => {
  if (reftovoltage !== undefined) {
    res.json({ voltage: reftovoltage });
  } else {
    res.status(400).json({ success: false, error: "Voltage not set" });
  }
});

// Endpoint to update ref voltage(Unity uses this)
app.post("/updateVoltage", async (req, res) => {
  const { voltage } = req.body;
  if (voltage !== undefined && voltage >= 0 && voltage <= 255) {
    reftovoltage = voltage; // Store the reference voltage
    res.json({ success: true, updatedData: reftovoltage });
  } else {
    res.status(400).json({
      success: false,
      error: "Invalid voltage input or ESP not connected",
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://${IP}:${PORT}`);
});
