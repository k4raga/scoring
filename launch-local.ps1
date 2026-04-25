$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\illki\Desktop\projects\scoring"

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$projectRoot'; npm run dev:backend"
) | Out-Null

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$projectRoot'; npm run dev:frontend"
) | Out-Null

Write-Host "Scoring local started."
Write-Host "Backend:  http://localhost:4100"
Write-Host "Frontend: http://localhost:5173"
