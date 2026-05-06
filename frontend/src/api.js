async function request(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const errorPayload = await response.json();
      message = errorPayload.error || message;
    } catch {
      // ignore non-json errors
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function archiveFormData(archiveFile) {
  const formData = new FormData();
  formData.append("archive", archiveFile);
  return formData;
}

function projectFormData({ archiveFile, title, sourceUrl, etpUrl }) {
  const formData = archiveFormData(archiveFile);
  formData.append("title", title || "");
  formData.append("sourceUrl", sourceUrl || "");
  formData.append("etpUrl", etpUrl || "");
  return formData;
}

export function fetchDashboard() {
  return request("/api/dashboard");
}

export function fetchYears() {
  return request("/api/years");
}

export function fetchYear(year) {
  return request(`/api/years/${year}`);
}

export function fetchMonth(year, month) {
  return request(`/api/years/${year}/months/${month}`);
}

export function fetchDay(year, month, day) {
  return request(`/api/years/${year}/months/${month}/days/${day}`);
}

export function fetchRecord(recordId) {
  return request(`/api/records/${recordId}`);
}

export function fetchRecordMarkdownDocument(recordId, documentId) {
  return request(`/api/records/${encodeURIComponent(recordId)}/documents/${encodeURIComponent(documentId)}/markdown`);
}

export function ingestArchive(archiveFile) {
  return request("/api/ingest/archive", {
    method: "POST",
    body: archiveFormData(archiveFile)
  });
}

export function createRecord(payload) {
  return request("/api/records", {
    method: "POST",
    body: projectFormData(payload)
  });
}

export function saveRecord(recordId, payload) {
  return request(`/api/records/${recordId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function deleteRecord(recordId) {
  return request(`/api/records/${recordId}`, {
    method: "DELETE"
  });
}
