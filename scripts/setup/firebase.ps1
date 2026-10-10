# Connects Firebase to the phone app from a Windows terminal, in one go.
#
#   irm https://raw.githubusercontent.com/husenzodao1/MTMU7/main/scripts/setup/firebase.ps1 | iex
#
# 1. Finds google-services.json in Downloads (waits for it if it is not there
#    yet), checks that it is for tj.mtmu7.app, and stores it as the
#    GOOGLE_SERVICES_JSON repository secret through the GitHub CLI, which it
#    installs and signs in the first time.
# 2. Opens the project's service-account page in Firebase, waits for the key
#    to download, checks it belongs to the same project, and puts it on the
#    clipboard with the Vercel page open, to be pasted as
#    FIREBASE_SERVICE_ACCOUNT. The key is never printed, and the downloaded
#    file is removed afterwards unless the person says no.
# 3. Starts a new Android build, which now carries notifications.
#
# Without the GitHub CLI (no winget, or the account is not the repository's
# owner) step 1 falls back to the clipboard and the secrets page as well.
# Windows PowerShell 5.1 or later; nothing to install by hand.

$Repo = "husenzodao1/MTMU7"
$Package = "tj.mtmu7.app"
$Branch = "claude/friendly-bell-smakfs"
$SecretsPage = "https://github.com/$Repo/settings/secrets/actions/new"
$VercelEnvPage = "https://vercel.com/gratorslab/mtmuraqami7/settings/environment-variables"
$ActionsPage = "https://github.com/$Repo/actions/workflows/mobile-android.yml"

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "  [+] $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "  [!] $Text" -ForegroundColor Yellow }
function Info([string]$Text) { Write-Host "      $Text" }

function Open-Page([string]$Url) {
  try { Start-Process $Url } catch { Info $Url }
}

function Copy-Text([string]$Text) {
  try { Set-Clipboard -Value $Text; return $true } catch { return $false }
}

function Get-DownloadFolders {
  if ($env:MTMU7_DOWNLOADS) { return @($env:MTMU7_DOWNLOADS) }
  $folders = @()
  try {
    $known = (New-Object -ComObject Shell.Application).NameSpace("shell:Downloads").Self.Path
    if ($known) { $folders += $known }
  } catch {}
  $folders += (Join-Path $env:USERPROFILE "Downloads")
  $folders += (Get-Location).Path
  return @($folders | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)
}

# The newest JSON file under $Folders matching $Filter that $Accept says yes to.
function Find-Json([string[]]$Folders, [string]$Filter, [scriptblock]$Accept) {
  $files = Get-ChildItem -Path $Folders -Filter $Filter -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 40
  foreach ($file in $files) {
    try { $json = Get-Content -Raw -Encoding UTF8 -Path $file.FullName | ConvertFrom-Json } catch { continue }
    if (& $Accept $json) { return [pscustomobject]@{ Path = $file.FullName; Json = $json } }
  }
  return $null
}

function Wait-Json([string[]]$Folders, [string]$Filter, [scriptblock]$Accept, [int]$Minutes = 15) {
  $deadline = (Get-Date).AddMinutes($Minutes)
  while ((Get-Date) -lt $deadline) {
    $found = Find-Json $Folders $Filter $Accept
    if ($found) { Write-Host ""; return $found }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
  }
  Write-Host ""
  return $null
}

function Test-Gh {
  if (Get-Command gh -ErrorAction SilentlyContinue) { return $true }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { return $false }
  Info "GitHub CLI насб мешавад (танҳо як бор). Агар Windows иҷозат пурсад, «Ҳа» гӯед."
  winget install --id GitHub.cli -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command gh -ErrorAction SilentlyContinue) -and (Test-Path "$env:ProgramFiles\GitHub CLI\gh.exe")) {
    $env:Path += ";$env:ProgramFiles\GitHub CLI"
  }
  return [bool](Get-Command gh -ErrorAction SilentlyContinue)
}

# Signed in to GitHub as somebody who may change the repository's secrets.
function Test-GhOwner {
  & gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) {
    Info "Браузер кушода мешавад: бо аккаунти GitHub-и мактаб ворид шавед ва кодеро, ки дар ин ҷо"
    Info "пайдо мешавад, дар браузер ворид кунед. Ба саволҳо Enter пахш кунед."
    & gh auth login --hostname github.com --git-protocol https --web
  }
  $admin = & gh api "repos/$Repo" --jq ".permissions.admin" 2> $null
  return ("$admin".Trim() -eq "true")
}

Write-Host ""
Write-Host "  МТМУ №7 · пайваст кардани Firebase ба барнома" -ForegroundColor White
Write-Host "  (Ctrl+C — қатъ кардан)" -ForegroundColor DarkGray

$folders = Get-DownloadFolders

# ------------------------------------------------------------ google-services
Step "1/3  google-services.json"
$isOurs = { param($j) @($j.client | ForEach-Object { $_.client_info.android_client_info.package_name }) -contains $Package }
$services = Find-Json $folders "google-services*.json" $isOurs
if (-not $services) {
  $other = Find-Json $folders "google-services*.json" { param($j) $null -ne $j.project_info }
  if ($other) {
    $names = @($other.Json.client | ForEach-Object { $_.client_info.android_client_info.package_name }) -join ", "
    Warn "Файли ёфтшуда барои $names аст, на барои $Package."
    Info "Дар Firebase: + Add app → Android → package name: $Package → Register app,"
    Info "баъд google-services.json-ро аз нав боргирӣ кунед."
  } else {
    Info "Дар Firebase: Add app → Android → package name: $Package → Register app →"
    Info "Download google-services.json. Ман файлро дар «Загрузки» интизорам"
  }
  Open-Page "https://console.firebase.google.com/"
  $services = Wait-Json $folders "google-services*.json" $isOurs
  if (-not $services) { Warn "Файл пайдо нашуд. Скриптро аз нав оғоз кунед."; return }
}
$projectId = $services.Json.project_info.project_id
Ok "Ёфт шуд: $($services.Path)"
Ok "Лоиҳаи Firebase: $projectId · барнома: $Package"

$servicesBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($services.Path))
$viaGh = $false
if (Test-Gh) {
  if (Test-GhOwner) {
    & gh secret set GOOGLE_SERVICES_JSON --repo $Repo --body $servicesBase64
    $viaGh = ($LASTEXITCODE -eq 0)
  } else {
    Warn "Ин аккаунти GitHub ба $Repo ҳуқуқи соҳиб надорад. «gh auth login» бо аккаунти дигар кунед."
  }
}
if ($viaGh) {
  Ok "Дар GitHub гузошта шуд: GOOGLE_SERVICES_JSON"
} else {
  [void](Copy-Text $servicesBase64)
  Open-Page $SecretsPage
  Info "Саҳифаи GitHub кушода шуд:"
  Info "  Name:   GOOGLE_SERVICES_JSON"
  Info "  Secret: Ctrl+V (аллакай нусха гирифта шудааст)"
  Info "  → Add secret"
  [void](Read-Host "      Баъд аз Add secret Enter пахш кунед")
}

# ------------------------------------------------------------ service account
Step "2/3  Калиди сервер (FIREBASE_SERVICE_ACCOUNT)"
$isKey = { param($j) $j.type -eq "service_account" -and $j.private_key -and $j.project_id -eq $projectId }
$key = Find-Json $folders "*.json" $isKey
if (-not $key) {
  Open-Page "https://console.firebase.google.com/project/$projectId/settings/serviceaccounts/adminsdk"
  Info "Дар саҳифаи кушодашуда: Generate new private key → Generate key."
  Info "Ман файлро дар «Загрузки» интизорам"
  $key = Wait-Json $folders "*.json" $isKey
  if (-not $key) { Warn "Калид пайдо нашуд. Скриптро аз нав оғоз кунед."; return }
}
Ok "Калид ёфт шуд (лоиҳаи $projectId)"

$keyBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($key.Path))
if (-not (Copy-Text $keyBase64)) { Warn "Ба буфер нусха гирифта нашуд."; return }
Open-Page $VercelEnvPage
Info "Саҳифаи Vercel кушода шуд → Add Environment Variable (ё Add New):"
Info "  Key:          FIREBASE_SERVICE_ACCOUNT"
Info "  Value:        Ctrl+V (аллакай нусха гирифта шудааст)"
Info "  Environments: танҳо Production"
Info "  → Save"
[void](Read-Host "      Баъд аз Save Enter пахш кунед")
[void](Copy-Text " ")
Ok "Буфер тоза шуд"

$answer = Read-Host "      Файли калидро аз компютер пок кунам? Он дигар лозим нест [Y/n]"
if ($answer -notmatch "^[nNнН]") {
  Remove-Item -LiteralPath $key.Path -Force
  Ok "Файли калид пок шуд"
} else {
  Warn "Файлро ба касе надиҳед: $($key.Path)"
}

# ------------------------------------------------------------ Android build
Step "3/3  Сохтани барномаи Android"
if ($viaGh) {
  $ref = "main"
  & gh api "repos/$Repo/branches/$([uri]::EscapeDataString($Branch))" *> $null
  if ($LASTEXITCODE -eq 0) { $ref = $Branch }
  & gh workflow run mobile-android.yml --repo $Repo --ref $ref
  if ($LASTEXITCODE -eq 0) {
    Ok "Сохтан оғоз шуд (~3 дақиқа): $ActionsPage"
  } else {
    Warn "Сохтан оғоз нашуд. Ба Claude нависед — ӯ оғоз мекунад."
  }
} else {
  Info "Ба Claude нависед «Firebase тайёр» — ӯ барномаро аз нав месозад."
}

Write-Host ""
Write-Host "  Тайёр. Ба Claude нависед: «Firebase тайёр» — сайт аз нав бор карда мешавад." -ForegroundColor Green
Write-Host ""
