/**
 * Fetch Semantic Scholar papers with exponential backoff and write new items to [News].
 * Configure retry_count and backoff_factor in seconds.
 */
function automatedLiteratureReviewRunner() {

  const SHEET_NAME = "Sheet1"; 
  const SEARCH_KEYWORD = 'LLM Safety'; // Key words to search for 
  const OPEN_ACCESS = true; // Open Access papers on Arxiv and other sites
  const LIMIT_PER_RUN = 15; // Number of rows to add per run
  const PUBLISHED_PAST_MONTHS = 10; // Papers published from past n months




  const API_URL = "https://api.semanticscholar.org/graph/v1/paper/search/bulk";
  // Docs:- https://api.semanticscholar.org/api-docs/graph
  // Query parameters (Refer Docs for advanced usage)

  const today = new Date();
  const currentMonth = (today.getMonth() + 1).toString().padStart(2, '0'); 
  today.setMonth(today.getMonth() - PUBLISHED_PAST_MONTHS); 
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');

  const params = {
    query: SEARCH_KEYWORD,
    fields: "title,abstract,publicationDate,openAccessPdf,citationCount,referenceCount,externalIds,url,authors",
    sort: "publicationDate:desc",
    publicationDateOrYear:`${year}-${month}:${year}-${currentMonth}:`,
    limit: LIMIT_PER_RUN,
  };

    // User-configurable retry controls
  const retry_count = 5;          // total attempts including the first
  const backoff_factor = 1.0;     // seconds; delay = backoff_factor * 2^(attempt-1)



  Logger.log("Starting Semantic Scholar fetch with backoff...");

  // Get sheet
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  // 1. Create Sheet if it doesn't exist
  if (!sheet) {
    Logger.log(`Sheet "${SHEET_NAME}" not found. Creating it...`);
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  }

  // 2. Check for missing headers and CREATE them if missing
  let columnMap = getHeaderColumnMap_(sheet);
  const required = ["date", "title", "authors", "abstract", "link"]; // keys must match lowercase
  const missing = required.filter(h => !(h in columnMap));
  
  if (missing.length) {
    Logger.log("Missing required headers: " + missing.join(", ") + ". Adding them now...");
    const lastCol = sheet.getLastColumn();
    
    missing.forEach((headerKey, index) => {
      // Capitalize the header for display (e.g., "date" -> "Date")
      const displayHeader = headerKey.charAt(0).toUpperCase() + headerKey.slice(1);
      // Set value in the first row, next available column
      sheet.getRange(1, lastCol + 1 + index).setValue(displayHeader);
      // Optional: Make header bold
      sheet.getRange(1, lastCol + 1 + index).setFontWeight("bold");
    });

    // REFRESH the column map so the rest of the script knows where the new columns are
    columnMap = getHeaderColumnMap_(sheet);
  }

  Logger.log("Column map: " + JSON.stringify(columnMap));

  // Build query string
  let qs = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  if(OPEN_ACCESS){
    qs += "&openAccessPdf"
  }

  const url = `${API_URL}?${qs}`;

  // console.log(url)

  // Fetch with exponential backoff
  const res = fetchWithExponentialBackoff_(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { "Accept": "application/json" }
  }, retry_count, backoff_factor);

  if (!res) {
    Logger.log("No response returned after retries.");
    return;
  }

  const status = res.getResponseCode();
  Logger.log("Final HTTP status: " + status);
  if (status < 200 || status >= 300) {
    Logger.log("Aborting: non-2xx after retries. Body: " + res.getContentText());
    return;
  }

  let payload;
  try {
    payload = JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log("JSON parse error: " + e.message);
    return;
  }
  if (!payload || !Array.isArray(payload.data)) {
    Logger.log("Unexpected response shape (no data array).");
    return;
  }
  Logger.log("API Response items count: " + payload.data.length)

  // console.log(payload)


  // Read existing links for dedupe
  const lastRow = sheet.getLastRow();
  let existingTitles = [];
  
  // Only try to get values if there is data (lastRow > 1) AND the title column exists
  if (lastRow > 1 && columnMap.title) {
    existingTitles = sheet
      .getRange(2, columnMap.title, lastRow - 1, 1)
      .getValues()
      .flat()
      .map(String);
  }
  const existingSet = new Set(existingTitles);
  Logger.log("Existing items loaded: " + existingTitles.length);

  // Prepare rows
  const newRows = [];
  for (const paper of payload.data) {
    try {
      const title = (paper.title || "").toString().trim();
      const publicationDate = paper.publicationDate || "";
      // Prefer open access PDF; fall back to canonical paper URL if available
      const pdfUrl = paper.openAccessPdf && paper.openAccessPdf.url ? paper.openAccessPdf.url : "";
      const canonicalUrl = paper.url || ""; // provided by Graph API
      
      // 3. SAFETY FIX: Check if paper.abstract exists before accessing .text
      const abstractText = paper.abstract;
      const link = (pdfUrl || canonicalUrl || "").toString().trim();

      // Authors: join names if present
      let authors = "";
      if (Array.isArray(paper.authors) && paper.authors.length) {
        authors = paper.authors
          .map(a => a && a.name ? a.name : "")
          .filter(Boolean)
          .join(", ");
      }

      if (!title) {
        Logger.log("Skipping: missing title for paperId=" + (paper.paperId || ""));
        continue;
      }

      if (existingSet.has(title)) {
        Logger.log("Duplicate (by Title), skipping: " + title);
        continue;
      }

      // Build row by header map
      const rowValues = [];
      // Determine how wide the row needs to be based on existing columns
      const maxCol = Math.max(...Object.values(columnMap));
      
      for (let c = 1; c <= maxCol; c++) rowValues.push("");

      if (columnMap.date) rowValues[columnMap.date - 1] = publicationDate || "";
      if (columnMap.title) rowValues[columnMap.title - 1] = title;
      if (columnMap.authors) rowValues[columnMap.authors - 1] = authors;
      if (columnMap.link) rowValues[columnMap.link - 1] = link;
      if (columnMap.abstract) rowValues[columnMap.abstract - 1] = abstractText;

      newRows.push(rowValues);
      if(newRows.length >= params.limit){
        break;
      }
    } catch (e) {
      Logger.log("Error processing a paper item: " + e.message);
    }
  }

  if (!newRows.length) {
    Logger.log("No new rows to append.");
    return;
  }

  // Append and highlight
  const startRow = sheet.getLastRow() + 1;
  const startCol = 1;
  const numCols = Math.max(...Object.values(columnMap));
  
  // Ensure we don't try to write to a range of 0 columns
  if (numCols > 0) {
    sheet.getRange(startRow, startCol, newRows.length, numCols).setValues(newRows);
    sheet.getRange(startRow, startCol, newRows.length, numCols).setBackground("#E1F5FE");
    Logger.log(`Appended ${newRows.length} new rows starting at row ${startRow}.`);
  }
}

/**
 * Exponential backoff using UrlFetchApp.
 * delaySeconds = backoff_factor * 2^(attempt-1); attempt starts at 1.
 * Returns HTTPResponse or null after exhausting attempts.
 */
function fetchWithExponentialBackoff_(url, options, retry_count, backoff_factor) {
  const attempts = Math.max(1, Number(retry_count) || 1);
  const factor = Math.max(0.1, Number(backoff_factor) || 1.0);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, options);
      const code = res.getResponseCode();
      Logger.log(`Attempt ${attempt}/${attempts} -> HTTP ${code}`);
      if (code >= 200 && code < 300) return res;

      // Retry on common transient errors
      if (attempt < attempts && (code === 429 || (code >= 500 && code < 600))) {
        const delay = Math.round(factor * Math.pow(2, attempt - 1) * 1000);
        Logger.log(`Retrying after ${delay} ms due to HTTP ${code}...`);
        Utilities.sleep(delay);
        continue;
      }

      // Non-retriable or last attempt
      return res;
    } catch (err) {
      Logger.log(`Attempt ${attempt}/${attempts} exception: ${err.message}`);
      if (attempt < attempts) {
        const delay = Math.round(factor * Math.pow(2, attempt - 1) * 1000);
        Logger.log(`Retrying after ${delay} ms due to exception...`);
        Utilities.sleep(delay);
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Build a header -> column index map from the first row (case-insensitive).
 * Example headers: Date, Title, Authors, Link
 */
function getHeaderColumnMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {}; // Handle completely empty sheet

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, idx) => {
    if (h !== null && h !== undefined) {
      const key = String(h).trim().toLowerCase();
      if (key) map[key] = idx + 1;
    }
  });
  return map;
};