import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs";

// Initialize Pyodide
const pyodideReadyPromise = loadPyodide().then(async (pyodide) => {
  // Pre-install commonly used packages
  await pyodide.loadPackage(['numpy', 'pandas', 'scipy']);
  return pyodide;
});

self.onmessage = async (event) => {
  // Make sure Pyodide is loaded
  const pyodide = await pyodideReadyPromise;
  const { id, code, data, context } = event.data;

  // Load any additional packages needed by the code
  await pyodide.loadPackagesFromImports(code);
  
  // Set up the global context
  const globals = pyodide.globals;
  
  // Add context variables to the global scope
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      globals.set(key, pyodide.toPy(value));
    });
  }
  
  // Add data to the global scope
  globals.set("data", pyodide.toPy(data));
  
  // Helper function to convert Map objects to regular objects
  function convertMapToObject(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    // Convert Map to Object
    if (obj instanceof Map) {
      const plainObj = {};
      for (const [key, value] of obj.entries()) {
        plainObj[key] = convertMapToObject(value);
      }
      return plainObj;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => convertMapToObject(item));
    }
    
    // Handle plain objects
    if (typeof obj === 'object') {
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = convertMapToObject(value);
      }
      return newObj;
    }
    
    // Return primitive values as is
    return obj;
  }
  
  try {
    // Run the Python code
    const resultProxy = await pyodide.runPythonAsync(code, { globals });
    let result = resultProxy.toJs({ depth: 10 }); // Convert Python objects to JavaScript
    
    // Convert Map objects to regular objects for serialization
    result = convertMapToObject(result);
    
    self.postMessage({ id, result });
  } catch (e) {
    // Handle errors
    self.postMessage({ id, error: e.message });
  }
};
