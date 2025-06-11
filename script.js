// Import Pyodide worker
const pyodideWorker = new Worker("./pyworker.js", { type: "module" });

// DOM elements
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const browseButton = document.getElementById("browseButton");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileType = document.getElementById("fileType");
const contextText = document.getElementById("contextText");
const globalLoader = document.getElementById("globalLoader");
const dataPreview = document.getElementById("dataPreview");
const previewCard = document.getElementById("previewCard");
const columnDescCard = document.getElementById("columnDescCard");
const columnDescriptions = document.getElementById("columnDescriptions");
const analysisCard = document.getElementById("analysisCard");
const summaryCard = document.getElementById("summaryCard");
const issuesCard = document.getElementById("issuesCard");
const analysisResult = document.getElementById("analysisResult");
const summaryResult = document.getElementById("summaryResult");
const issuesResult = document.getElementById("issuesResult");
const resetButton = document.getElementById("resetButton");
const analyzeButton = document.getElementById("analyzeButton");
const pythonCode = document.getElementById("pythonCode");
const codeContent = document.getElementById("codeContent");

// Global variables
let fileData = null;
let parsedData = null;
let token='';

async function init(){
  const response = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" }).then((r) => r.json());
  token=response.token;
}

init();

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
  
  // Get column descriptions
  getColumnDescriptions(data);
}

// Loading functions
function showLoading() {
  globalLoader.classList.remove("d-none");
}

function hideLoading() {
  globalLoader.classList.add("d-none");
}

// Display rows with issues
function displayIssueRows(issueRows) {
  if (!issueRows || !issueRows.length) return;

  let tableHTML = '<table class="table table-striped table-bordered">';
  
  // Table headers
  tableHTML += "<thead><tr>";
  tableHTML += "<th>Row #</th><th>Issue</th>";
  
  // Add data column headers if available
  if (issueRows[0] && issueRows[0].row) {
    const firstRow = issueRows[0].row;
    Object.keys(firstRow).forEach(key => {
      tableHTML += `<th>${key}</th>`;
    });
  }
  tableHTML += "</tr></thead>";
  
  // Table body
  tableHTML += "<tbody>";
  issueRows.forEach((issueRow) => {
    tableHTML += "<tr class='table-warning'>"; // Highlight issue rows
    
    // Add row index cell
    tableHTML += `<td>${issueRow.index !== undefined ? issueRow.index : "N/A"}</td>`;
    
    // Add issue description cell
    tableHTML += `<td>${issueRow.issues || "Unknown issue"}</td>`;
    
    // Add data cells
    if (issueRow.row) {
      Object.values(issueRow.row).forEach((value) => {
        tableHTML += `<td>${value !== undefined && value !== null ? value : ""}</td>`;
      });
    }
    
    tableHTML += "</tr>";
  });
  tableHTML += "</tbody></table>";

  // Add table to DOM
  issuesResult.innerHTML = tableHTML;
}

// Get column descriptions from LLM
async function getColumnDescriptions(data) {
  if (!data || !data.length) return;
  
  // Show the column descriptions card and loading indicator
  columnDescCard.classList.remove("d-none");
  showLoading();
  columnDescriptions.innerHTML = "";
  
  const headers = data[0];
  const rows = data.slice(1, 6); // Get first 5 rows for preview
  
  // Format data for LLM
  let dataPreviewText = "Data Preview:\n" + headers.join(", ") + "\n" + 
      rows.map((row) => row.join(", ")).join("\n");
  
  // Add context if available
  const context = contextText.value.trim();
  const userMessage = context ? `Context: ${context}\n\n${dataPreviewText}` : dataPreviewText;
  
  // System prompt for generating column descriptions
  const systemPrompt = `You are an expert data analyst. Based on the provided data preview, 
  generate a brief description for each column in the dataset.
  For each column, provide a clear description of what the column represents

  Format :- 
{
  "type": "object",
  "properties": {
    "columnDescription": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "columnName": {
            "type": "string"
          },
          "description": {
            "type": "string"
          }
        },
        "required": ["columnName", "description"]
      }
    }
  },
  "required": ["columnDescription"]
}
`;
  
  try {
    // Get descriptions from LLM
    const response = await callLLM(systemPrompt, userMessage);
    
    // Parse the response (expecting JSON)
    let columnData;
    try {
      // Try to parse as JSON
      columnData = JSON.parse(response);
    } catch (e) {
      console.error("Error parsing column descriptions:", e);
      return;
    }
    
    // Create table for column descriptions
    let tableHTML = '<table class="table table-striped table-bordered">';
    tableHTML += '<thead><tr><th>Column Name</th><th>Description</th></tr></thead>';
    tableHTML += '<tbody>';

    columnData["columnDescription"].forEach((item) => {
      tableHTML += `<tr><td><strong>${item.columnName}</strong></td><td>${item.description}</td></tr>`;
    });
    tableHTML += '</tbody></table>';  
    // Display the table
    columnDescriptions.innerHTML = tableHTML;
  } catch (error) {
    console.error("Error getting column descriptions:", error);
    columnDescriptions.innerHTML = `<div class="alert alert-danger">Error getting column descriptions: ${error.message}</div>`;
  } finally {
    hideLoading();
  }
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
  columnDescCard.classList.add("d-none");
  analysisCard.classList.add("d-none");
  summaryCard.classList.add("d-none");
  issuesCard.classList.add("d-none");
  resetButton.classList.add("d-none");
  analyzeButton.classList.add("d-none");
  contextText.value = "";
  fileData = null;
  parsedData = null;
  hideLoading();
}

// Analyze the data
async function analyzeData() {
  if (!parsedData || !parsedData.length) return;

  // Setup UI and prepare data
  analysisCard.classList.remove("d-none");
  showLoading();
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
7. Return a comprehensive analysis as a dictionary
8. Identify and return problematic rows in a separate key called 'issue_rows'

The data will be provided as a pandas DataFrame named 'df'.
Your code must define a function called 'analyze_data_quality(df)' that returns a dictionary with the analysis results.
The dictionary MUST include an 'issue_rows' key that contains a list of rows with issues (missing values, outliers, inconsistent formatting, etc.).

IMPORTANT: Each issue row in the 'issue_rows' list must be a dictionary with exactly these three keys:
- 'index': The row index number
- 'issues': A string describing what issues were found in this row
- 'row': The complete row data as a dictionary

For example:
{
  'index': 5,
  'issues': 'Missing values in Name and Age columns',
  'row': {'Employee_ID': 'E1004', 'Name': None, 'Age': None, ...}
}

Be very careful with DataFrame indexing and avoid complex slicing operations. Always check if columns exist before accessing them.
Handle all potential errors with try/except blocks to ensure the code doesn't crash.
Make sure to convert row data to dictionaries properly using df.iloc[index].to_dict() or similar approaches.
Do not use df[slice(None), column_index] style indexing as it causes errors in Pyodide.

The code will be executed in a Pyodide environment with pandas, numpy, and scipy already imported.
Only return valid Python code without any explanations or markdown formatting.`;

  try {
    // Generate and execute Python code
    const code = await callLLM(systemPrompt, userMessage);
    codeContent.textContent = code;
    pythonCode.classList.remove("d-none");
    const analysisResults = await executePythonCode(code, objectData);

    // Display analysis results
    hideLoading();

    // Display rows with issues if available
    if (analysisResults.issue_rows && analysisResults.issue_rows.length > 0) {
      issuesCard.classList.remove("d-none");
      displayIssueRows(analysisResults.issue_rows);
    }

    // Generate summary
    summaryCard.classList.remove("d-none");
    showLoading();

    const summarizationPrompt = `You are an expert data quality analyst. 
Provide a clear, concise summary of the data quality analysis results in markdown format.
Highlight the most important findings and provide actionable recommendations to improve data quality.
Use bullet points, headers, and formatting to make the summary easy to read.

For any repeated values found in the data, suggest alternative values that would make the data more unique while maintaining semantic meaning.`;

    // Use our existing formatValue function to handle complex types including BigInt
    const serializedResults = JSON.stringify(analysisResults, (key, value) =>
      typeof value === "bigint" ? value.toString() + "n" : value
    );
    const summary = await callLLM(summarizationPrompt, serializedResults);
    hideLoading();
    summaryResult.innerHTML = marked.parse(summary);
  } catch (error) {
    console.error(error);
    hideLoading();
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
