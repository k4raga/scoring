const checks = [
  "http://localhost:4100/api/health",
  "http://localhost:4100/api/years",
  "http://localhost:4100/api/years/2026",
  "http://localhost:4100/api/years/2026/months/4",
  "http://localhost:4100/api/years/2026/months/4/days/16",
  "http://localhost:4100/api/records/cemros-block-2026-04-16",
  "http://localhost:5173/",
  "http://localhost:5173/years/2026/months/4"
];

for (const url of checks) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Smoke failed for ${url}: ${response.status}`);
  }

  console.log(`OK ${url}`);
}

const exportResponse = await fetch("http://localhost:4100/api/years/2026/months/4/days/16/export");

if (!exportResponse.ok) {
  throw new Error(`Export failed: ${exportResponse.status}`);
}

const contentType = exportResponse.headers.get("content-type") || "";

if (!contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
  throw new Error(`Unexpected export content type: ${contentType}`);
}

console.log("OK export endpoint");
console.log("Smoke passed");
