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
const tabsContainer = document.getElementById("tabsContainer");

// Content containers
const dataPreview = document.getElementById("dataPreview");
const columnDescriptions = document.getElementById("columnDescriptions");
const sdtmMapping = document.getElementById("sdtmMapping");
const analysisResult = document.getElementById("analysisResult");
const issuesResult = document.getElementById("issuesResult");
const resultsTable = document.getElementById("resultsTable");
const summaryResult = document.getElementById("summaryResult");
const pythonCode = document.getElementById("pythonCode");
const codeContent = document.getElementById("codeContent");
const selectedDatasetSpan = document.getElementById("selectedDataset");
const analyzeButton = document.getElementById("analyzeButton");

// Tab elements
const previewTab = document.getElementById("preview-tab");
const columnDescTab = document.getElementById("column-desc-tab");
const sdtmMappingTab = document.getElementById("sdtm-mapping-tab");
const analysisTab = document.getElementById("analysis-tab");
const issuesTab = document.getElementById("issues-tab");
const resultsTab = document.getElementById("results-tab");
const summaryTab = document.getElementById("summary-tab");

// Global variables
let fileData = null;
let parsedData = null;
let token = '';
let config = null;
let fixedData = null; // Store fixed data for download
let appliedFixes = []; // Track applied fixes

// Tab management functions
function enableTab(tabElement) {
  if (tabElement) {
    tabElement.classList.remove('tab-disabled');
  }
}

function activateTab(tabElement) {
  if (tabElement) {
    const tab = new bootstrap.Tab(tabElement);
    tab.show();
  }
}

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
    // Reset fix-related variables when switching datasets
    fixedData = null;
    appliedFixes = [];
    
    // Reset the update summary if it exists
    const fixSummary = document.getElementById('fixSummary');
    if (fixSummary) {
      fixSummary.innerHTML = '<span class="text-muted">No updates applied yet</span>';
    }
    
    showAnalysisProgress();
    updateAnalysisProgress(0, "Loading dataset...");
    const response = await fetch(`dataset/${datasetName}`);
    if (!response.ok) throw new Error('Failed to load dataset');
    
    const csvData = await response.arrayBuffer();
    parsedData = parseFile(csvData);

    // Show first 5 rows in preview
    updateAnalysisProgress(50, "Preparing data preview...");
    displayDataPreview(parsedData.slice(0, 6));
    
    // Show tabs container and analysis controls
    tabsContainer.classList.remove("d-none");
    analysisControls.classList.remove("d-none");
    
    // Enable the preview tab (already active by default)
    enableTab(previewTab);
    
    // Get column descriptions
    await getColumnDescriptions(parsedData);
    
    // Get SDTM mapping
    updateAnalysisProgress(75, "Generating SDTM mappings...");
    await getSDTMMapping(parsedData[0]);
    
    // Complete the loading
    updateAnalysisProgress(100, "Dataset loaded!");
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
    // Use 'array' type for ArrayBuffer data
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
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
    tableHTML += `<th>${header !== undefined && header !== null ? header : ""}</th>`;
  });
  tableHTML += "</tr></thead>";

  // Table body
  tableHTML += "<tbody>";
  rows.forEach((row) => {
    tableHTML += "<tr>";
    row.forEach((cell) => {
      // Safely convert values to strings and escape any HTML
      const safeValue = cell !== undefined && cell !== null ? String(cell) : "";
      tableHTML += `<td>${safeValue}</td>`;
    });
    tableHTML += "</tr>";
  });
  tableHTML += "</tbody></table>";

  dataPreview.innerHTML = tableHTML;
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
  // Initialize fixedData as a deep copy of parsedData if not already initialized
  if (!fixedData) {
    fixedData = JSON.parse(JSON.stringify(parsedData));
  }
  
  const tableHTML = `
    <table class="table table-striped table-bordered">
      <thead>
        <tr>
          <th>Row Index</th>
          <th>Status</th>
          <th>Issue</th>
          <th>Suggestion</th>
          <th>Fix Value</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${generateTableRows(issuesData, totalRows)}
      </tbody>
    </table>
  `;

  // Add download button and changes summary for fixed data
  const downloadButtonHTML = `
    <div class="card mt-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-0">Data Updates</h6>
            <p class="text-muted small mb-0">Apply updates to the data and download the corrected CSV</p>
            <div id="fixSummary" class="small mt-2">
              <span class="text-muted">No updates applied yet</span>
            </div>
          </div>
          <button id="downloadFixedData" class="btn btn-success" disabled>
            <i class="bi bi-download"></i> Download Updated CSV
          </button>
        </div>
      </div>
    </div>
  `;

  resultsTable.innerHTML = tableHTML + downloadButtonHTML;
  
  // Add event listener to download button
  document.getElementById('downloadFixedData').addEventListener('click', downloadFixedCSV);
  
  // Add event listeners to fix buttons
  document.querySelectorAll('.fix-issue-btn').forEach(button => {
    button.addEventListener('click', applyFix);
  });
}

// Generate table rows for results
function generateTableRows(issuesData, totalRows) {
  let rows = '';
  
  // Group issues by row index
  const issuesByRow = {};
  issuesData.issues.forEach(issue => {
    if (!issuesByRow[issue.issueRowIndex]) {
      issuesByRow[issue.issueRowIndex] = [];
    }
    issuesByRow[issue.issueRowIndex].push(issue);
  });

  for (let i = 0; i < totalRows; i++) {
    const rowIssues = issuesByRow[i] || [];
    
    if (rowIssues.length > 0) {
      // For rows with issues
      let isFirstIssue = true;
      
      // Create a row for each issue in this row
      rowIssues.forEach((issue, issueIndex) => {
        const columnName = issue.columnName || '';
        const fixValue = issue.fixValue || '';
        const issueId = issue.issueId || `row${i}_issue${issueIndex}`;
        
        rows += `
          <tr${issueIndex > 0 ? ' class="table-light"' : ''}>
            ${isFirstIssue ? `<td rowspan="${rowIssues.length}">${i}</td>` : ''}
            <td>${isFirstIssue ? 
              `<span class="badge bg-danger">${rowIssues.length > 1 ? `${rowIssues.length} Issues` : 'Issue'}</span>` : 
              ''}</td>
            <td>${issue.issue}</td>
            <td>${issue.suggestion}</td>
            <td><code>${fixValue}</code>${columnName ? ` <small class="text-muted">(in ${columnName})</small>` : ''}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary fix-issue-btn" 
                data-issue-id="${issueId}"
                data-row="${i}" 
                data-column="${columnName}" 
                data-value="${fixValue}">
                Apply Update
              </button>
            </td>
          </tr>`;
          
        isFirstIssue = false;
      });
    } else {
      // For rows without issues
      rows += `
        <tr>
          <td>${i}</td>
          <td><span class="badge bg-success">No Issues</span></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>`;
    }
  }
  return rows;
}

// Apply fix to data
function applyFix(e) {
  const button = e.target;
  const rowIndex = parseInt(button.dataset.row, 10);
  const columnName = button.dataset.column;
  const fixValue = button.dataset.value;
  const issueId = button.dataset.issueId;
  
  console.log(`Applying fix to row ${rowIndex}, column ${columnName}, value: ${fixValue}`);
  
  // Find the column index based on column name
  const headers = fixedData[0];
  // Try exact match first
  let columnIndex = headers.findIndex(header => header === columnName);
  
  // If exact match fails, try case-insensitive match
  if (columnIndex === -1 && columnName) {
    columnIndex = headers.findIndex(header => 
      header.toLowerCase() === columnName.toLowerCase());
  }
  
  // If still no match, try fuzzy match (check if column name is contained in header)
  if (columnIndex === -1 && columnName) {
    columnIndex = headers.findIndex(header => 
      header.toLowerCase().includes(columnName.toLowerCase()) || 
      columnName.toLowerCase().includes(header.toLowerCase()));
  }
  
  console.log(`Column index found: ${columnIndex}, headers:`, headers, 'for column name:', columnName);
  
  // Validate indices
  if (columnIndex === -1) {
    console.error(`Could not find column: ${columnName}`);
    alert(`Could not find column: ${columnName}`);
    return;
  }
  
  // if (rowIndex < 1 || rowIndex >= fixedData.length) {
  //   console.error(`Invalid row index: ${rowIndex}`);
  //   alert(`Invalid row index: ${rowIndex}`);
  //   return;
  // }
  
  // Store the old value for display
  const oldValue = fixedData[rowIndex+1][columnIndex];
  console.log(`Old value: ${oldValue}, New value: ${fixValue}`);
  
  // Apply the fix to the data
  fixedData[rowIndex+1][columnIndex] = fixValue;
  
  // Track this fix
  appliedFixes.push({
    rowIndex,
    columnName,
    oldValue,
    newValue: fixValue,
    timestamp: new Date()
  });
  
  // Update button appearance to show fix was applied
  button.classList.remove('btn-outline-primary');
  button.classList.add('btn-success');
  button.textContent = 'Updated';
  button.disabled = true;
  
  // Enable the download button
  const downloadButton = document.getElementById('downloadFixedData');
  downloadButton.disabled = false;
  
  // Update fix summary
  updateFixSummary();
  
  // Update the cell to show it was fixed
  const row = button.closest('tr');
  row.classList.add('table-success');
  row.classList.remove('table-light');
  
  // Add a tooltip to show the change
  const fixValueCell = row.querySelector('td:nth-child(5)');
  if (fixValueCell) {
    fixValueCell.innerHTML = `<code>${fixValue}</code>${columnName ? ` <small class="text-muted">(in ${columnName})</small>` : ''}<br>
      <small class="text-success"><i class="bi bi-check-circle-fill"></i> Changed from: <del>${oldValue}</del></small>`;
  }
  
  // Check if all issues for this row have been fixed
  const rowIssueButtons = document.querySelectorAll(`.fix-issue-btn[data-row="${rowIndex}"]`);
  const allFixed = Array.from(rowIssueButtons).every(btn => btn.disabled || btn === button);
  
  // If this is the first issue in a row with multiple issues, update the status badge
  const statusCell = row.querySelector('td:nth-child(2)');
  if (statusCell && statusCell.querySelector('.badge')) {
    statusCell.querySelector('.badge').className = 'badge bg-warning';
    statusCell.querySelector('.badge').textContent = 'Fixing';
    
    // If all issues are fixed, update to 'Updated'
    if (allFixed) {
      const allStatusCells = document.querySelectorAll(`tr td:nth-child(2) .badge`);
      allStatusCells.forEach(badge => {
        if (badge.closest('tr').querySelector(`.fix-issue-btn[data-row="${rowIndex}"]`)) {
          badge.className = 'badge bg-success';
          badge.textContent = 'Updated';
        }
      });
    }
  }
  
  console.log('Updated fixedData:', fixedData);
}

// Download fixed CSV
function downloadFixedCSV() {
  if (!fixedData || fixedData.length === 0) {
    console.error('No fixed data available for download');
    return;
  }
  
  try {
    // Convert the fixed data to CSV format with proper escaping
    let csvContent = '';
    fixedData.forEach(row => {
      // Properly escape CSV values
      const escapedRow = row.map(value => {
        // Convert to string and handle null/undefined
        const str = value !== null && value !== undefined ? String(value) : '';
        // Escape quotes and wrap in quotes if needed
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });
      csvContent += escapedRow.join(',') + '\n';
    });
    
    // Create a blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    const filename = selectedDatasetSpan.textContent.replace('.csv', '_updated.csv');
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    
    // Show feedback to user
    const downloadButton = document.getElementById('downloadFixedData');
    const originalText = downloadButton.innerHTML;
    downloadButton.innerHTML = '<i class="bi bi-check-circle"></i> Downloaded!';
    downloadButton.classList.replace('btn-success', 'btn-outline-success');
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up URL object
    URL.revokeObjectURL(url);
    
    // Reset button after a delay
    setTimeout(() => {
      downloadButton.innerHTML = originalText;
      downloadButton.classList.replace('btn-outline-success', 'btn-success');
    }, 2000);
    
    console.log(`CSV file ${filename} downloaded successfully`);
  } catch (error) {
    console.error('Error downloading CSV:', error);
    alert('Error downloading CSV: ' + error.message);
  }
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
  // Extract headers to provide to the LLM
  const headers = parsedData && parsedData.length > 0 ? parsedData[0] : [];
  const headersList = headers.join(', ');
  
  const issuesPrompt = `You are a data quality analyst. Based on the analysis results, return a JSON object with the following schema:
{
  "issues": [
    {
      "issueRowIndex": integer,
      "issueId": string,  // A unique identifier for this issue
      "issue": string,
      "suggestion": string,
      "columnName": string,
      "fixValue": string
    }
  ]
}

The dataset has the following column headers: ${headersList}

Each issue should have:
- issueRowIndex: The row number where the issue was found
- issueId: A unique identifier for this issue (e.g., "row5_col3" for row 5, column 3)
- issue: A clear description of the issue
- suggestion: A specific suggestion to fix the issue. Suggest with values relevant for current context.
- columnName: The name of the column where the issue was found. IMPORTANT: Use EXACTLY the same column name as provided in the headers list above.
- fixValue: A specific value that can replace the problematic value to fix the issue

IMPORTANT: A single row may have multiple issues in different columns. In such cases, create separate issue objects for each problem, but with the same issueRowIndex. For example, if row 5 has issues in both the "Name" and "Age" columns, create two separate issue objects with issueRowIndex=5 but different issueId, columnName, and fixValue. Suggest values only where there are missing values or inconsistent casing.No need to create issue objects for duplicate values.
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

// Update fix summary display
function updateFixSummary() {
  const fixSummary = document.getElementById('fixSummary');
  if (!fixSummary) return;
  
  if (appliedFixes.length === 0) {
    fixSummary.innerHTML = '<span class="text-muted">No updates applied yet</span>';
    return;
  }
  
  // Group updates by column
  const updatesByColumn = {};
  appliedFixes.forEach(update => {
    if (!updatesByColumn[update.columnName]) {
      updatesByColumn[update.columnName] = [];
    }
    updatesByColumn[update.columnName].push(update);
  });
  
  // Create summary text
  let summaryHTML = `<span class="text-success"><strong>${appliedFixes.length} update${appliedFixes.length > 1 ? 's' : ''} applied</strong></span>`;
  
  // Add column breakdown
  const columnList = Object.keys(updatesByColumn);
  if (columnList.length > 0) {
    summaryHTML += '<ul class="mb-0 ps-3">';
    columnList.forEach(column => {
      const count = updatesByColumn[column].length;
      summaryHTML += `<li>${column}: ${count} update${count > 1 ? 's' : ''}</li>`;
    });
    summaryHTML += '</ul>';
  }
  
  fixSummary.innerHTML = summaryHTML;
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
        // Safely convert values to strings and escape any HTML
        const safeValue = value !== undefined && value !== null ? String(value) : "";
        tableHTML += `<td>${safeValue}</td>`;
      });
    }
    
    tableHTML += "</tr>";
  });
  tableHTML += "</tbody></table>";

  // Add table to DOM
  issuesResult.innerHTML = tableHTML;
}

// Get SDTM mapping for columns
async function getSDTMMapping(headers) {
  if (!headers || !headers.length) return;

  sdtmMapping.innerHTML = "";

  // System prompt for SDTM mapping
  const systemPrompt = `You are a CDISC SDTM expert tasked with mapping raw clinical data to SDTM domains and variables.

Using the following table samples:
- Map each column to SDTM domains like DM, AE, EX, VS, LB.
- Provide SDTM variable names.
- Suggest appropriate controlled terminology.
- Cite SDTM IG references if possible.

Format your response in markdown table format with these columns:
| Raw Variable | SDTM Domain | SDTM Variable | Controlled Terminology | SDTM IG Reference |`;

  try {
    // Get mapping from LLM
    const response = await callLLM(systemPrompt, headers.join(", "));
    // Display the table using marked for markdown parsing
    sdtmMapping.innerHTML = marked.parse(response);
    
    // Enable the SDTM mapping tab
    enableTab(sdtmMappingTab);
  } catch (error) {
    console.error("Error getting SDTM mapping:", error);
    sdtmMapping.innerHTML = `<div class="alert alert-danger">Error getting SDTM mapping: ${error.message}</div>`;
  }
}

// Get column descriptions from config.json
async function getColumnDescriptions(data) {
  if (!data || !data.length) return;
  
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
  
  // Enable the column descriptions tab
  enableTab(columnDescTab);
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
The dictionary MUST include an 'issue_rows' key that contains a list of rows with all the issues found in the row (missing values, outliers, inconsistent formatting, etc.).

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
    
    // Enable and activate the analysis tab
    enableTab(analysisTab);
    activateTab(analysisTab);

    // Get and display formatted issues
    updateAnalysisProgress(83, "Generating Final Table...");
    const issuesData = await getFinalTableData(analysisResults);
    displayResultsTable(issuesData, parsedData.length - 1); // -1 to exclude header row
    
    // Enable the results tab
    enableTab(resultsTab);

    if (analysisResults.issue_rows && analysisResults.issue_rows.length > 0) {
      displayIssueRows(analysisResults.issue_rows);
      
      // Enable the issues tab
      enableTab(issuesTab);
    }

    // Generate summary
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
    
    // Enable the summary tab
    enableTab(summaryTab);
    
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
