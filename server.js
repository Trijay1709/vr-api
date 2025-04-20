require("dotenv").config();
const express = require("express");
const cors = require("cors");
const QuickChart = require("quickchart-js");
const regression = require("regression");
const app = express();
const PORT = process.env.PORT || 3000;
const IP = process.env.IP || "localhost";

app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");

let controlledData = {
  voltage: 120,
  current: 10,
  resistance: 0,
  time: Date.now(),
};

let reftovoltage = 0;
let readings = []; // Stores [{ voltage, current }]

// Update controlled data
function updateControlledData(voltage, current) {
  let resistance = current !== 0 ? voltage / current : 0;
  controlledData = { voltage, current, resistance, time: Date.now() };
}

// --- API ENDPOINTS ---

// Get current data (Unity fetches this)
app.get("/data", (req, res) => {
  res.json(controlledData);
});

// ESP updates voltage & current
app.post("/update", (req, res) => {
  const { voltage, current } = req.body;
  if (voltage !== undefined && current !== undefined) {
    updateControlledData(voltage, current);
    res.json({ success: true, updatedData: controlledData });
  } else {
    res.status(400).json({ success: false, error: "Invalid input" });
  }
});

// Get reference voltage for ESP
app.get("/getVoltage", (req, res) => {
  console.log("Reference voltage requested:", reftovoltage);
  res.json({ voltage: reftovoltage });
});

// Unity updates reference voltage
app.post("/updateVoltage", (req, res) => {
  const { voltage } = req.body;
  if (voltage !== undefined && voltage >= 0 && voltage <= 255) {
    reftovoltage = voltage;
    res.json({ success: true, updatedData: reftovoltage });
  } else {
    res.status(400).json({ success: false, error: "Invalid voltage input" });
  }
});

// --- GRAPH FUNCTIONALITY ---

// Store new reading (Voltage & Current)
app.post("/storeReading", (req, res) => {
  const { voltage, current } = req.body;
  if (voltage !== undefined && current !== undefined) {
    readings.push({ voltage, current });
    res.json({ success: true, readings });
  } else {
    res.status(400).json({ success: false, error: "Invalid input" });
  }
});

// Clear stored readings
app.post("/clearReadings", (req, res) => {
  readings = [];
  res.json({ success: true, message: "Readings cleared" });
});

// Generate and return V-I Graph using QuickChart
app.get("/plotGraph", async (req, res) => {
  if (readings.length < 2) {
    return res.status(400).json({ error: "Not enough data points" });
  }

  // Perform Linear Regression
  const dataPoints = readings.map((r) => [r.current, r.voltage]);
  const result = regression.linear(dataPoints);
  const slope = result.equation[0]; // Resistance (R)

  // Create the chart using QuickChart.js
  const chart = new QuickChart();
  chart.setConfig({
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Voltage vs Current",
          data: readings.map((r) => ({ x: r.current, y: r.voltage })),
          borderColor: "blue",
          backgroundColor: "blue",
          showLine: false,
        },
        {
          label: `Best Fit Line (R = ${slope.toFixed(2)} Ω)`,
          data: [
            { x: 0, y: result.equation[1] },
            {
              x: Math.max(...readings.map((r) => r.current)),
              y: result.predict(Math.max(...readings.map((r) => r.current)))[1],
            },
          ],
          borderColor: "red",
          backgroundColor: "red",
          showLine: true,
          fill: false,
        },
      ],
    },
    options: {
      scales: {
        x: { title: { display: true, text: "Current (A)" } },
        y: { title: { display: true, text: "Voltage (V)" } },
      },
    },
  });

  // Get the chart image URL
  const imageUrl = chart.getUrl();

  // Return the image URL in the response
  res.json({ success: true, imageUrl });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://${IP}:${PORT}`);
});
