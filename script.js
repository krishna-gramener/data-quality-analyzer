// Import Pyodide worker
const pyodideWorker = new Worker("./pyworker.js", { type: "module" });

// DOM Elements
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const browseButton = document.getElementById("browseButton");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const contextText = document.getElementById("contextText");
const dataPreview = document.getElementById("dataPreview");
const previewCard = document.getElementById("previewCard");
const analysisCard = document.getElementById("analysisCard");
const summaryCard = document.getElementById("summaryCard");
const analysisResult = document.getElementById("analysisResult");
const summaryResult = document.getElementById("summaryResult");
const analysisSpinner = document.getElementById("analysisSpinner");
const summarySpinner = document.getElementById("summarySpinner");
const resetButton = document.getElementById("resetButton");
const analyzeButton = document.getElementById("analyzeButton");
const pythonCode = document.getElementById("pythonCode");
const codeContent = document.getElementById("codeContent");

// Global variables
let fileData = null;
let parsedData = null;
const { token } = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" }).then((r) => r.json());

// Helper functions for formatting
function formatCategoryName(name) {
  // Convert snake_case or camelCase to Title Case with spaces
  return name
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function formatValue(value) {
  // Handle null, undefined, primitives
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  if (typeof value === "bigint") return value.toString() + "n";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return "Empty array";
    const formatted = value
      .slice(0, 5)
      .map((v) => formatValue(v))
      .join(", ");
    return value.length > 5 ? `${formatted}... (${value.length} items)` : formatted;
  }

  // Handle objects
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() + "n" : v));
    } catch {
      return "[Complex Object]";
    }
  }

  return value.toString();
}

// Event listeners
browseButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFileSelect);
dropZone.addEventListener("dragover", handleDragOver);
dropZone.addEventListener("drop", handleFileDrop);
resetButton.addEventListener("click", resetApp);
analyzeButton.addEventListener("click", analyzeData);

// File handling functions
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add("border-primary");
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("border-primary");

  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect();
  }
}

function handleFileSelect() {
  if (!fileInput.files.length) return;

  const file = fileInput.files[0];
  const extension = file.name.split(".").pop().toLowerCase();

  if (!["xlsx", "xls", "csv"].includes(extension)) {
    alert("Please upload an Excel (.xlsx, .xls) or CSV file.");
    return;
  }

  // Update UI with file info
  fileName.textContent = file.name;
  fileInfo.classList.remove("d-none");

  // Configure reader and read file
  const reader = new FileReader();
  reader.onload = (e) => {
    fileData = e.target.result;
    try {
      // Parse data based on file type
      parsedData = extension === "csv" ? parseCSV(fileData) : parseExcel(fileData);

      // Update UI
      displayDataPreview(parsedData);
      resetButton.classList.remove("d-none");
      analyzeButton.classList.remove("d-none");
    } catch (error) {
      console.error(error);
      alert("Error parsing file: " + error.message);
    }
  };

  // Read file using appropriate method
  reader[extension === "csv" ? "readAsText" : "readAsArrayBuffer"](file);
}

// Parse Excel file using SheetJS
function parseExcel(data) {
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 });
}

// Parse CSV file
function parseCSV(data) {
  const lines = data.split("\n");
  return lines.map((line) => line.split(",").map((cell) => cell.trim()));
}

// Display data preview (first 5 rows)
function displayDataPreview(data) {
  if (!data || !data.length) return;

  const headers = data[0];
  const rows = data.slice(1, 6); // Get first 5 rows for preview

  let tableHTML = '<table class="table table-striped table-bordered">';

  // Table headers
  tableHTML += "<thead><tr>";
  headers.forEach((header) => {
    tableHTML += `<th>${header}</th>`;
  });
  tableHTML += "</tr></thead>";

  // Table body
  tableHTML += "<tbody>";
  rows.forEach((row) => {
    tableHTML += "<tr>";
    row.forEach((cell) => {
      tableHTML += `<td>${cell !== undefined && cell !== null ? cell : ""}</td>`;
    });
    tableHTML += "</tr>";
  });
  tableHTML += "</tbody></table>";

  dataPreview.innerHTML = tableHTML;
  previewCard.classList.remove("d-none");
}

// Convert array data to object format for easier processing
function arrayToObjectData(data) {
  if (!data || data.length < 2) return [];

  const headers = data[0];
  return data.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// Reset the application
function resetApp() {
  fileInput.value = "";
  fileInfo.classList.add("d-none");
  previewCard.classList.add("d-none");
  analysisCard.classList.add("d-none");
  summaryCard.classList.add("d-none");
  resetButton.classList.add("d-none");
  analyzeButton.classList.add("d-none");
  contextText.value = "";
  fileData = null;
  parsedData = null;
}

// Analyze the data
async function analyzeData() {
  if (!parsedData || !parsedData.length) return;

  // Setup UI and prepare data
  analysisCard.classList.remove("d-none");
  analysisSpinner.style.display = "flex";
  analysisResult.innerHTML = "";
  const objectData = arrayToObjectData(parsedData);

  // Format data preview for LLM
  const headers = parsedData[0];
  const previewRows = parsedData.slice(1, 6);
  let dataPreviewText =
    "Data Preview:\n" + headers.join(", ") + "\n" + previewRows.map((row) => row.join(", ")).join("\n");

  // Add context if available
  const context = contextText.value.trim();
  const userMessage = context ? `Context: ${context}\n\n${dataPreviewText}` : dataPreviewText;

  // System prompt for generating Python code for data quality analysis
  const systemPrompt = `You are an expert data quality analyst. Generate Python code that analyzes the data quality of the provided dataset.
The code should:
1. Check for missing values
2. Identify outliers
3. Analyze data distributions
4. Check for duplicates
5. Validate data types
6. Identify any potential data quality issues

The data will be provided as a pandas DataFrame named 'df'.
Your code must define a function called 'analyze_data_quality(df)' that returns a dictionary with the analysis results.
The code will be executed in a Pyodide environment with pandas, numpy, and scipy already imported.
Only return valid Python code without any explanations or markdown formatting.`;

  try {
    // Generate and execute Python code
    const code = await callLLM(systemPrompt, userMessage);
    codeContent.textContent = code;
    pythonCode.classList.remove("d-none");
    const analysisResults = await executePythonCode(code, objectData);

    // Display analysis results
    analysisSpinner.style.display = "none";
    let resultsHTML = '<div class="alert alert-info mb-4">Analysis completed successfully!</div>';

    if (analysisResults && typeof analysisResults === "object") {
      resultsHTML +=
        '<div class="card mb-4"><div class="card-header"><h6 class="mb-0">Data Quality Analysis Results</h6></div>';
      resultsHTML += '<div class="card-body">';

      for (const [category, details] of Object.entries(analysisResults)) {
        resultsHTML += `<h6 class="mt-3">${formatCategoryName(category)}</h6>`;

        if (typeof details === "object") {
          if (Array.isArray(details)) {
            // Handle array results
            resultsHTML += '<ul class="list-group list-group-flush mb-3">';
            details.forEach((item) => (resultsHTML += `<li class="list-group-item">${item}</li>`));
            resultsHTML += "</ul>";
          } else {
            // Handle object results
            resultsHTML += '<ul class="list-group list-group-flush mb-3">';
            Object.entries(details).forEach(([key, value]) => {
              resultsHTML += `<li class="list-group-item"><strong>${key}:</strong> ${formatValue(value)}</li>`;
            });
            resultsHTML += "</ul>";
          }
        } else {
          resultsHTML += `<p>${details}</p>`;
        }
      }
      resultsHTML += "</div></div>";
    }
    analysisResult.innerHTML = resultsHTML;

    // Generate summary
    summaryCard.classList.remove("d-none");
    summarySpinner.style.display = "flex";

    const summarizationPrompt = `You are an expert data quality analyst. 
Provide a clear, concise summary of the data quality analysis results in markdown format.
Highlight the most important findings and provide actionable recommendations to improve data quality.
Use bullet points, headers, and formatting to make the summary easy to read.`;

    // Use our existing formatValue function to handle complex types including BigInt
    const serializedResults = JSON.stringify(analysisResults, (key, value) =>
      typeof value === "bigint" ? value.toString() + "n" : value
    );
    const summary = await callLLM(summarizationPrompt, serializedResults);
    summarySpinner.style.display = "none";
    summaryResult.innerHTML = marked.parse(summary);
  } catch (error) {
    console.error(error);
    analysisSpinner.style.display = "none";
    summarySpinner.style.display = "none";
    analysisResult.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
  }
}

// Call OpenAI API
async function callLLM(systemPrompt, userMessage) {
  try {
    const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}:data-quality-analyst`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Use custom replacer for BigInt serialization
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "API error occurred");
    }
    return data.choices?.[0]?.message?.content || "No response received";
  } catch (error) {
    console.error(error);
    throw new Error(`API call failed: ${error.message}`);
  }
}

// Execute Python code using Pyodide
function executePythonCode(code, data) {
  return new Promise((resolve, reject) => {
    // Add necessary imports and wrapper code
    const fullCode = `
import pandas as pd
import numpy as np
from scipy import stats

${code}

# Convert input data to pandas DataFrame
df = pd.DataFrame(data)

# Run the analysis function
result = analyze_data_quality(df)

# Convert any complex objects to simpler structures
def convert_to_serializable(obj):
    if isinstance(obj, pd.DataFrame):
        return obj.to_dict(orient='records')
    if isinstance(obj, pd.Series):
        return obj.to_dict()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if hasattr(obj, 'tolist'):
        return obj.tolist()
    if hasattr(obj, '__dict__'):
        return {k: convert_to_serializable(v) for k, v in obj.__dict__.items()}
    return obj

# Convert result to serializable format
if isinstance(result, dict):
    serializable_result = {k: convert_to_serializable(v) for k, v in result.items()}
else:
    serializable_result = convert_to_serializable(result)

serializable_result
`;

    // Set up listener for worker response
    const listener = (event) => {
      pyodideWorker.removeEventListener("message", listener);
      const { result, error } = event.data;

      if (error) {
        console.error("Pyodide error:", error);
        reject(new Error(error));
      } else {
        console.log("Received result from Pyodide worker:", result);
        resolve(result);
      }
    };

    // Add event listener and send code to worker
    pyodideWorker.addEventListener("message", listener);
    try {
      pyodideWorker.postMessage({
        id: "data-quality-analysis",
        code: fullCode,
        data: data,
        context: {},
      });
    } catch (error) {
      console.error("Error posting message to worker:", error);
      reject(new Error(`Failed to send data to Python worker: ${error.message}`));
    }
  });
}
