const DEFAULT_EXTRACTOR_API_BASE_URL = "http://127.0.0.1:4200";

export async function requestExternalAnalysis({
  archiveHref = "",
  archivePath = "",
  hints = {},
  jobId = "",
  recordId = ""
} = {}) {
  const baseUrl = normalizeBaseUrl(
    process.env.SCORING_EXTRACTOR_API_BASE_URL ||
      process.env.SCORING_ANALYSIS_API_BASE_URL ||
      DEFAULT_EXTRACTOR_API_BASE_URL
  );

  if (!baseUrl) {
    throw new Error("extractor_api_base_url_missing");
  }

  const requestBody = JSON.stringify({
    archiveHref,
    archivePath,
    hints,
    jobId,
    recordId
  });
  const response = await fetch(`${baseUrl}/api/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: requestBody
  });

  let payload = await readJsonResponse(response);

  if (shouldRetryLegacyAnalyze(response, payload)) {
    const legacyResponse = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: requestBody
    });
    payload = await readJsonResponse(legacyResponse);
    return assertSuccessfulExtractorResponse(legacyResponse, payload);
  }

  return assertSuccessfulExtractorResponse(response, payload);
}

function assertSuccessfulExtractorResponse(response, payload) {
  if (!response.ok || payload?.ok === false) {
    const message = normalizeOptionalText(payload?.message) || normalizeOptionalText(payload?.error) || `extractor_api_${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function shouldRetryLegacyAnalyze(response, payload) {
  if (response.status === 404 || response.status === 405) {
    return true;
  }

  return payload?.error === "not_found";
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
