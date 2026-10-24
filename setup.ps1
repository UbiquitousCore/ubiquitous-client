# Setup for Windows: makes sure Node 26 is available (installing fnm and Node
# with winget when it is not), then installs the client's packages. Safe to
# run again.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$need = (Get-Content .nvmrc -Raw).Trim().TrimStart('v')
$major = [int]($need.Split('.')[0])

function Test-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    return [int]((node -p 'process.versions.node.split(".")[0]')) -ge $major
}

Write-Host "==> Node $need"
if (Test-Node) {
    Write-Host "found node $(node --version)"
} else {
    if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "Install Node $need or newer from https://nodejs.org, then run this again" }
        winget install --id Schniz.fnm -e --accept-package-agreements --accept-source-agreements
        Write-Host "`nfnm installed. Open a NEW terminal (so PATH refreshes) and run .\setup.ps1 again."
        exit 0
    }
    fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
    fnm install $need
    fnm use $need
    Write-Host "installed node $(node --version) with fnm"
    Write-Host 'for your own terminals add this line to your PowerShell profile:  fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression'
}

Write-Host '==> Packages'
Push-Location client
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
Pop-Location

Write-Host @'

Ready. Next:
  1. start ubiquitous-server (its README: .\run.ps1 start, or just dev)
  2. cd client; npm run dev
  3. open http://localhost:8780 and choose your .ipa
'@
