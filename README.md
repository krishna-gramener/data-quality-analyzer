# Data Quality Analyzer

A web application for automated data quality analysis powered by AI. Upload your data files and get comprehensive quality assessments, insights, and recommendations.

## Features

- AI-powered data quality analysis
- Smart data validation and issue detection
- Automated column mapping and metadata analysis
- Interactive data preview and visualization
- Detailed quality reports with actionable recommendations
- Intelligent suggestions for data improvements

## How to Use

1. Open `index.html` in a web browser
2. Select your dataset from the available options
3. Review data preview and column information
4. Click "Analyze Data" to start the analysis
5. View results, issues, and recommendations

## Technical Details

- Built with HTML, CSS, JavaScript, and Bootstrap 5
- Uses XLSX library for Excel/CSV file handling
- Uses Pyodide for in-browser Python execution
- Integrates with LLM API for:
  - Intelligent data analysis
  - Python code generation
  - Quality assessment
  - Results summarization
- Configuration-driven for easy customization

## Setup

1. Configure your datasets in `config.json`:
   - Dataset metadata (id, file, title, description)
   - Column descriptions
2. Place your CSV files in the `dataset` folder
3. Set your API token in `script.js`:


## Dependencies

- Bootstrap 5.3.0
- Marked (for Markdown rendering)
- Pyodide 0.27.0

## Browser Compatibility

This application works best in modern browsers that support ES6+ features and Web Workers.
