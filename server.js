require("dotenv").config();
const express = require("express");
const cors = require("cors");
const regression = require("regression");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;
const IP = process.env.IP || "0.0.0.0";

app.use(cors());
app.use(express.json());

let controlledData = {
  voltage: 120,
  current: 0,
  resistance: 0,
  time: Date.now(),
};

let reftovoltage = 0;
let readings = [];

// Helper to update controlled data
function updateControlledData(voltage, current) {
  const resistance = current !== 0 ? voltage / current : 0;
  controlledData = { voltage, current, resistance, time: Date.now() };
}

// --- API ENDPOINTS ---

// Fetch controlled data (used by Unity)
app.get("/data", (req, res) => {
  res.json(controlledData);
});

// ESP posts voltage & current
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

// Store reading (Voltage & Current)
app.post("/storeReading", (req, res) => {
  const { voltage, current } = req.body;
  if (voltage !== undefined && current !== undefined) {
    readings.push({
      voltage: parseFloat(voltage),
      current: parseFloat(current),
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: "Invalid input" });
  }
});

// Clear stored readings
app.post("/clearReadings", (req, res) => {
  readings = [];
  res.json({ success: true, message: "Readings cleared" });
});

// Generate graph using QuickChart
app.get("/plotGraph", async (req, res) => {
  if (readings.length < 2) {
    return res.status(400).json({ error: "Not enough data points" });
  }

  // Format for regression and scatter plot
  const dataPoints = readings.map((r) => [r.current, r.voltage]);
  const scatterPoints = readings.map(
    (r) => `{ x: ${r.current}, y: ${r.voltage} }`
  );

  const result = regression.linear(dataPoints);
  const slope = result.equation[0].toFixed(2);
  const intercept = result.equation[1];

  // Generate best-fit line points
  const xMin = Math.min(...readings.map((r) => r.current));
  const xMax = Math.max(...readings.map((r) => r.current));
  const yMin = intercept + slope * xMin;
  const yMax = intercept + slope * xMax;

  const quickChartConfig = {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Voltage vs Current",
          data: readings.map((r) => ({ x: r.current, y: r.voltage })),
          backgroundColor: "blue",
        },
        {
          label: `Fit Line (R = ${slope} Ω)`,
          data: [
            { x: xMin, y: yMin },
            { x: xMax, y: yMax },
          ],
          borderColor: "red",
          fill: false,
          showLine: true,
          type: "line",
        },
      ],
    },
    options: {
      scales: {
        x: {
          title: { display: true, text: "Current (A)" },
        },
        y: {
          title: { display: true, text: "Voltage (V)" },
        },
      },
    },
  };

  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(quickChartConfig)
  )}`;

  try {
    const imageRes = await axios.get(chartUrl, { responseType: "arraybuffer" });
    res.set("Content-Type", "image/png");
    res.send(imageRes.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate graph" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://${IP}:${PORT}`);
});
