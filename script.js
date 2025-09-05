// Import Pyodide worker
const pyodideWorker = new Worker("./pyworker.js", { type: "module" });

// DOM elements
const introSection = document.getElementById("introSection");
const mainContent = document.getElementById("mainContent");
const proceedButton = document.getElementById("proceedButton");
const datasetContainer = document.getElementById("datasetContainer");
const analysisControls = document.getElementById("analysisControls");
const analysisLoader = document.getElementById("analysisLoader");
const analysisProgressContainer = document.getElementById("analysisProgressContainer");
const analysisProgress = document.getElementById("analysisProgress");
const analysisStatus = document.getElementById("analysisStatus");
const dataPreview = document.getElementById("dataPreview");
const previewCard = document.getElementById("previewCard");
const columnDescCard = document.getElementById("columnDescCard");
const columnDescriptions = document.getElementById("columnDescriptions");
const sdtmMappingCard = document.getElementById("sdtmMappingCard");
const sdtmMapping = document.getElementById("sdtmMapping");
const analysisCard = document.getElementById("analysisCard");
const summaryCard = document.getElementById("summaryCard");
const issuesCard = document.getElementById("issuesCard");
const analysisResult = document.getElementById("analysisResult");
const summaryResult = document.getElementById("summaryResult");
const issuesResult = document.getElementById("issuesResult");
const analyzeButton = document.getElementById("analyzeButton");
const pythonCode = document.getElementById("pythonCode");
const codeContent = document.getElementById("codeContent");
const selectedDatasetSpan = document.getElementById("selectedDataset");

// Global variables
let fileData = null;
let parsedData = null;
let token = '';
let config = null;

async function init() {
  try {
    // Load config.json
    const configResponse = await fetch('config.json');
    if (!configResponse.ok) throw new Error('Failed to load config.json');
    config = await configResponse.json();

    // Create dataset cards
    createDatasetCards();

    // Get API token
    const response = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" });
    const data = await response.json();
    token = data.token;
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Failed to initialize application: ' + error.message);
  }
}

// Create dataset cards from config
function createDatasetCards() {
  if (!config || !config.datasets) return;
  
  const html = config.datasets.map(dataset => `
    <div class="col-md-6 col-lg-3">
      <div class="card h-100" data-dataset="${dataset.file}">
        <div class="card-body d-flex flex-column">
          <h5 class="card-title">${dataset.title}</h5>
          <p class="card-text flex-grow-1">${dataset.description}</p>
          <div class="mt-auto">
            <button class="btn btn-outline-primary select-dataset">Select Dataset</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  datasetContainer.innerHTML = html;

  // Add event listeners to new buttons
  document.querySelectorAll('.select-dataset').forEach(button => {
    button.addEventListener('click', handleDatasetSelect);
  });
}

// Handle dataset selection
async function handleDatasetSelect(e) {
  const card = e.target.closest('.card');
  if (!card) return;
  
  const datasetName = card.dataset.dataset;
  selectedDatasetSpan.textContent = datasetName;

  // Reset any previously selected cards
  document.querySelectorAll('.card').forEach(c => {
    if (c) {
      c.classList.remove('border-primary');
      const btn = c.querySelector('button');
      if (btn) btn.classList.replace('btn-primary', 'btn-outline-primary');
    }
  });

  // Highlight selected card
  card.classList.add('border-primary');
  e.target.classList.replace('btn-outline-primary', 'btn-primary');

  try {
    showAnalysisProgress();
    updateAnalysisProgress(0, "Loading dataset...");
    const response = await fetch(`dataset/${datasetName}`);
    if (!response.ok) throw new Error('Failed to load dataset');
    
    const csvData = await response.arrayBuffer();
    parsedData = parseFile(csvData);

    // Show first 5 rows in preview
    updateAnalysisProgress(50, "Preparing data preview...");
    displayDataPreview(parsedData.slice(0, 6));
    previewCard.classList.remove("d-none");
    getColumnDescriptions(parsedData);
    analysisControls.classList.remove("d-none");
    
    // Complete the loading
    updateAnalysisProgress(100, "Dataset loaded!");
    // await getSDTMMapping(parsedData[0]);
    setTimeout(() => hideAnalysisProgress(), 1000);
  } catch (error) {
    console.error(error);
    alert(`Error loading dataset: ${error.message}`);
    hideAnalysisProgress();
  }
}

init();

// Add event listener for proceed button
proceedButton.addEventListener("click", () => {
  introSection.classList.add("d-none");
  mainContent.classList.remove("d-none");
});

analyzeButton.addEventListener("click", analyzeData);

// Parse CSV file using XLSX
function parseFile(data) {
  try {
    const workbook = XLSX.read(data, { type: 'binary' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    throw new Error('Failed to parse CSV file: ' + error.message);
  }
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

// Analysis progress functions
function updateAnalysisProgress(percent, status) {
  analysisProgress.style.width = `${percent}%`;
  if (status) {
    analysisStatus.textContent = status;
  }
}

function showAnalysisProgress() {
  analysisLoader.classList.remove("d-none");
  analysisProgressContainer.classList.remove("d-none");
  analysisStatus.classList.remove("d-none");
  analyzeButton.disabled = true;
  analysisProgress.style.width = "0%";
}

// Display results in a table format
function displayResultsTable(issuesData, totalRows) {
  const resultsTableCard = document.getElementById('resultsTableCard');
  const resultsTable = document.getElementById('resultsTable');

  const tableHTML = `
    <table class="table table-striped table-bordered">
      <thead>
        <tr>
          <th>Row Index</th>
          <th>Status</th>
          <th>Issue</th>
          <th>Suggestion</th>
        </tr>
      </thead>
      <tbody>
        ${generateTableRows(issuesData, totalRows)}
      </tbody>
    </table>
  `;

  resultsTable.innerHTML = tableHTML;
  resultsTableCard.classList.remove('d-none');
}

// Generate table rows for results
function generateTableRows(issuesData, totalRows) {
  let rows = '';
  const issueMap = new Map(issuesData.issues.map(issue => [issue.issueRowIndex, issue]));

  for (let i = 0; i < totalRows; i++) {
    const issue = issueMap.get(i);
    if (issue) {
      rows += `
        <tr>
          <td>${i}</td>
          <td><span class="badge bg-danger">Issue</span></td>
          <td>${issue.issue}</td>
          <td>${issue.suggestion}</td>
        </tr>`;
    } else {
      rows += `
        <tr>
          <td>${i}</td>
          <td><span class="badge bg-success">No Issues</span></td>
          <td></td>
          <td></td>
        </tr>`;
    }
  }
  return rows;
}

// Convert BigInt values to numbers in an object
function convertBigIntToNumber(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber);
  }
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'bigint') {
      result[key] = Number(value);
    } else if (typeof value === 'object') {
      result[key] = convertBigIntToNumber(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Get formatted issues data from LLM
async function getFinalTableData(issueRows) {
  const issuesPrompt = `You are a data quality analyst. Based on the analysis results, return a JSON object with the following schema:
{
  "issues": [
    {
      "issueRowIndex": integer,
      "issue": string,
      "suggestion": string
    }
  ]
}

Each issue should have:
- issueRowIndex: The row number where the issue was found
- issue: A clear description of the issue
- suggestion: A specific suggestion to fix the issue. Suggest with values relevant for current context.

Make sure the response is valid JSON and follows the exact schema.`;

  try {
    // Convert BigInt values to numbers before stringifying
    const convertedData = convertBigIntToNumber(issueRows);
    const formattedIssues = await callLLM(issuesPrompt, JSON.stringify(convertedData));
    const issuesData = JSON.parse(formattedIssues);
    console.log('Formatted issues:', issuesData);
    return issuesData;
  } catch (error) {
    console.error('Error formatting issues:', error);
    throw new Error('Failed to format issues: ' + error.message);
  }
}

function hideAnalysisProgress() {
  analysisLoader.classList.add("d-none");
  analysisProgressContainer.classList.add("d-none");
  analysisStatus.classList.add("d-none");
  analyzeButton.disabled = false;
  analysisProgress.style.width = "0%";
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
    tableHTML += "<tr>"; // Highlight issue rows
    
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

// Get SDTM mapping for columns
// async function getSDTMMapping(headers) {
//   if (!headers || !headers.length) return;

//   // Show the SDTM mapping card
//   sdtmMappingCard.classList.remove("d-none");
//   sdtmMapping.innerHTML = "";
//   showAnalysisProgress();
//   updateAnalysisProgress(25, "Generating SDTM mappings...");

//   // System prompt for SDTM mapping
//   const systemPrompt = `You are a CDISC SDTM expert tasked with mapping raw clinical data to SDTM domains and variables.

// Using the following table samples:
// - Map each column to SDTM domains like DM, AE, EX, VS, LB.
// - Provide SDTM variable names.
// - Suggest appropriate controlled terminology.
// - Cite SDTM IG references if possible.

// Format your response in markdown table format with these columns:
// | Raw Variable | SDTM Domain | SDTM Variable | Controlled Terminology | SDTM IG Reference |`;

//   try {
//     // Get mapping from LLM
//     const response = await callLLM(systemPrompt, headers.join(", "));
//     // Display the table using marked for markdown parsing
//     sdtmMapping.innerHTML = marked.parse(response);
//     updateAnalysisProgress(100, "SDTM mapping complete!");
//     setTimeout(() => hideAnalysisProgress(), 1000);
//   } catch (error) {
//     console.error("Error getting SDTM mapping:", error);
//     sdtmMapping.innerHTML = `<div class="alert alert-danger">Error getting SDTM mapping: ${error.message}</div>`;
//     hideAnalysisProgress();
//   }
// }

// Get column descriptions from config.json
async function getColumnDescriptions(data) {
  if (!data || !data.length) return;
  
  // Show the column descriptions card
  columnDescCard.classList.remove("d-none");
  columnDescriptions.innerHTML = "";
  
  // Get the dataset name from the selected dataset
  const selectedDataset = selectedDatasetSpan.textContent;
  const datasetId = selectedDataset.replace('.csv', '');
  
  // Get column descriptions for this dataset
  const descriptions = config['column-description'][datasetId];
  if (!descriptions) {
    columnDescriptions.innerHTML = `<div class="alert alert-warning">No column descriptions found for ${selectedDataset}</div>`;
    return;
  }
  
  // Create table for column descriptions
  let tableHTML = '<table class="table table-striped table-bordered">';
  tableHTML += '<thead><tr><th>Column Name</th><th>Description</th></tr></thead>';
  tableHTML += '<tbody>';

  descriptions.forEach((item) => {
    const columnName = Object.keys(item)[0];
    const description = item[columnName];
    tableHTML += `<tr><td><strong>${columnName}</strong></td><td>${description}</td></tr>`;
  });
  
  tableHTML += '</tbody></table>';
  
  // Display the table
  columnDescriptions.innerHTML = tableHTML;
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

// Analyze the data
async function analyzeData() {
  if (!parsedData) {
    alert("Please select a dataset first.");
    return;
  }

  // Setup UI and prepare data
  analysisCard.classList.remove("d-none");
  showAnalysisProgress();
  updateAnalysisProgress(0, "Analyzing data...");
  analysisResult.innerHTML = "";
  const objectData = arrayToObjectData(parsedData);

  // Format data preview for LLM
  const headers = parsedData[0];
  const previewRows = parsedData.slice(1, 6);
  const userMessage = "Data Preview:\n" + headers.join(", ") + "\n" + 
  previewRows.map((row) => row.join(", ")).join("\n");

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
- 'issues': A string describing what all issues were found in this row
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
Only return valid Python code without any explanations or markdown formatting.  `;

  try {
    // Generate and execute Python code
    updateAnalysisProgress(25, "Generating analysis code...");
    const code = await callLLM(systemPrompt, userMessage);
    pythonCode.classList.remove("d-none");
    codeContent.textContent = code;

    // Execute Python code
    updateAnalysisProgress(50, "Executing analysis code...");
    const analysisResults = await executePythonCode(code, objectData);

    // Display analysis results
    updateAnalysisProgress(75, "Processing results...");

    // Get and display formatted issues
    updateAnalysisProgress(83, "Generating Final Table...");
    const issuesData = await getFinalTableData(analysisResults);
    displayResultsTable(issuesData, parsedData.length - 1); // -1 to exclude header row

    if (analysisResults.issue_rows && analysisResults.issue_rows.length > 0) {
      issuesCard.classList.remove("d-none");
      displayIssueRows(analysisResults.issue_rows);
    }

    // Generate summary
    summaryCard.classList.remove("d-none");
    updateAnalysisProgress(90, "Generating summary...");

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
    summaryResult.innerHTML = marked.parse(summary);
    updateAnalysisProgress(100, "Analysis complete!");
    setTimeout(() => hideAnalysisProgress(), 1500); // Keep success state visible briefly
  } catch (error) {
    console.error(error);
    analysisResult.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    hideAnalysisProgress();
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
