require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const regression = require("regression");

const app = express();
const PORT = process.env.PORT || 3000;
const IP = process.env.IP || "192.168.166.147";

app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");
let controlledData = {
  voltage: 120,
  current: 0,
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
  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    // If request is from an API client expecting JSON
    res.json({ voltage: reftovoltage });
  } else {
    // Otherwise, render the EJS page
    res.render("getvoltage", { voltage: reftovoltage });
  }
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

// Generate and return V-I Graph
app.get("/plotGraph", async (req, res) => {
  if (readings.length < 2) {
    return res.status(400).json({ error: "Not enough data points" });
  }

  // Convert readings to regression format
  let dataPoints = readings.map((r) => [r.current, r.voltage]);

  // Perform Linear Regression
  const result = regression.linear(dataPoints);
  const slope = result.equation[0]; // Resistance (R)

  // Chart.js configuration
  const width = 800;
  const height = 600;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const chartConfig = {
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
  };

  // Render graph
  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(chartConfig);

  // Set response headers and send image
  res.set("Content-Type", "image/png");
  res.send(imageBuffer);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://${IP}:${PORT}`);
});
