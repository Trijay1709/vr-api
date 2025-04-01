require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const IP = process.env.IP || "192.168.166.147";
const ESP32_IP = "http://192.168.1.100"; // Replace with your ESP32 IP

app.use(cors()); // Enable CORS for frontend access
app.use(express.json()); // Enable JSON parsing

let controlledData = {
  voltage: 120,
  current: 0,
  resistance: 0,
  time: Date.now(),
}; // Default values

// Function to send data to ESP32
async function sendDataToESP(voltage) {
  try {
    const response = await axios.post(`${ESP32_IP}/update`, null, {
      params: { voltage },
    });
    console.log("ESP32 Response:", response.data);
  } catch (error) {
    console.error("Error sending data to ESP32:", error.message);
  }
}
function updateControlledData(voltage, current) {
  let resistance = current !== 0 ? voltage / current : 0; // Compute R = V/I
  controlledData = { voltage, current, resistance, time: Date.now() };
}
// Endpoint to get current data (Unity will call this)
app.get("/data", (req, res) => {
  res.json(controlledData);
});

// Endpoint to update all data (Webpage will call this)
app.post("/update", (req, res) => {
  const { voltage, current } = req.body;
  if (voltage !== undefined && current !== undefined) {
    updateControlledData(voltage, current); // Compute and update
    res.json({ success: true, updatedData: controlledData });
  } else {
    res.status(400).json({ success: false, error: "Invalid input" });
  }
});

// Endpoint to update only voltage and send to ESP32
app.post("/updateVoltage", async (req, res) => {
  const { voltage } = req.body;
  if (voltage !== undefined && voltage >= 0 && voltage <= 255) {
    controlledData.voltage = voltage;
    controlledData.time = Date.now();

    // Send updated voltage to ESP32
    await sendDataToESP(voltage);

    res.json({ success: true, updatedData: controlledData });
  } else {
    res
      .status(400)
      .json({ success: false, error: "Invalid voltage (must be 0-255)" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://${IP}:${PORT}`);
});
