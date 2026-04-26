const DEFAULT_ANALYSIS_API_BASE_URL = "http://127.0.0.1:4200";

export async function requestExternalAnalysis({
  archiveHref = "",
  archivePath = "",
  hints = {},
  jobId = "",
  recordId = ""
} = {}) {
  const baseUrl = normalizeBaseUrl(process.env.SCORING_ANALYSIS_API_BASE_URL || DEFAULT_ANALYSIS_API_BASE_URL);

  if (!baseUrl) {
    throw new Error("analysis_api_base_url_missing");
  }

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      archiveHref,
      archivePath,
      hints,
      jobId,
      recordId
    })
  });

  const payload = await readJsonResponse(response);

  if (!response.ok || payload?.ok === false) {
    const message = normalizeOptionalText(payload?.message) || normalizeOptionalText(payload?.error) || `analysis_api_${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/u, "");
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function normalizeOptionalText(value) {
  return String(value || "").trim();
}
