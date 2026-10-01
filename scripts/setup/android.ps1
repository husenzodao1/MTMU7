# The Android app's release key and its Google sign-in, from a Windows terminal.
#
#   irm https://raw.githubusercontent.com/husenzodao1/MTMU7/main/scripts/setup/android.ps1 | iex
#
# 1. Makes the app's release key once (RSA 2048, thirty years, PKCS#12) and
#    hands it to GitHub as ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD,
#    so every APK from now on is a release build with one signature for good:
#    not debuggable, which is what Play Protect looks at, and updatable over
#    the last one. A copy and its password go to Documents\MTMU7 Android key —
#    the only copy anywhere; lose it and the app can never be updated in place.
#    A key GitHub already has is never replaced.
# 2. Switches Google sign-in on for the app: walks through the two Firebase
#    settings (the Google provider, the key's SHA-1), waits for the new
#    google-services.json and checks it knows this key, and stores it as the
#    GOOGLE_SERVICES_JSON secret.
# 3. Puts the app's web client id on the clipboard with Supabase's Google
#    settings open, to be added to the client ids Supabase accepts.
# 4. Starts an Android build.
#
# Nothing secret is printed. Windows PowerShell 5.1 or later.

$Repo = "husenzodao1/MTMU7"
$Package = "tj.mtmu7.app"
$Branch = "claude/friendly-bell-smakfs"
$SupabaseProviders = "https://supabase.com/dashboard/project/ljvlpmbjnskstsppwaqn/auth/providers"
$ActionsPage = "https://github.com/$Repo/actions/workflows/mobile-android.yml"

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Ok([string]$Text) { Write-Host "  [+] $Text" -ForegroundColor Green }
function Warn([string]$Text) { Write-Host "  [!] $Text" -ForegroundColor Yellow }
function Info([string]$Text) { Write-Host "      $Text" }
function Open-Page([string]$Url) { try { Start-Process $Url } catch { Info $Url } }
function Copy-Text([string]$Text) { try { Set-Clipboard -Value $Text; return $true } catch { return $false } }
function Wait-Enter([string]$Text) { [void](Read-Host "      $Text — баъд Enter пахш кунед") }

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

function Find-Json([string[]]$Folders, [string]$Filter, [scriptblock]$Accept) {
  $files = Get-ChildItem -Path $Folders -Filter $Filter -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 40
  foreach ($file in $files) {
    try { $json = Get-Content -Raw -Encoding UTF8 -Path $file.FullName | ConvertFrom-Json } catch { continue }
    if (& $Accept $json $file) { return [pscustomobject]@{ Path = $file.FullName; Json = $json } }
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

function Test-GhOwner {
  & gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) {
    Info "Браузер кушода мешавад: бо аккаунти GitHub-и мактаб ворид шавед ва кодро тасдиқ кунед."
    & gh auth login --hostname github.com --git-protocol https --web
  }
  $admin = & gh api "repos/$Repo" --jq ".permissions.admin" 2> $null
  return ("$admin".Trim() -eq "true")
}

function Set-Secret([string]$Name, [string]$Value) {
  & gh secret set $Name --repo $Repo --body $Value *> $null
  return ($LASTEXITCODE -eq 0)
}

function Format-Sha1([string]$Hex) {
  return (($Hex.ToUpperInvariant() -split '(..)' | Where-Object { $_ }) -join ':')
}

Write-Host ""
Write-Host "  МТМУ №7 · калиди барнома ва воридшавӣ бо Google" -ForegroundColor White
Write-Host "  (Ctrl+C — қатъ кардан)" -ForegroundColor DarkGray

# ------------------------------------------------------------------ GitHub
Step "1/4  GitHub"
if (-not (Test-Gh)) { Warn "GitHub CLI насб нашуд. Онро аз https://cli.github.com насб кунед ва аз нав оғоз кунед."; return }
if (-not (Test-GhOwner)) { Warn "Ин аккаунти GitHub ба $Repo ҳуқуқи соҳиб надорад. «gh auth login» бо аккаунти мактаб кунед."; return }
Ok "GitHub тайёр"

# ------------------------------------------------------------- release key
Step "2/4  Калиди барнома"
$backupDir = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "MTMU7 Android key"
$backupKey = Join-Path $backupDir "MTMU7-release.p12"
$backupNote = Join-Path $backupDir "MTMU7-release-password.txt"
$names = @(& gh secret list --repo $Repo --json name --jq ".[].name" 2> $null)
$sha1 = $null

if ($names -contains "ANDROID_KEYSTORE_BASE64") {
  if ((Test-Path $backupKey) -and (Test-Path $backupNote)) {
    $password = (Get-Content -Raw $backupNote).Trim()
    try {
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($backupKey, $password)
      $sha1 = Format-Sha1 $cert.Thumbprint
    } catch {}
  }
  Ok "Калид аллакай дар GitHub аст — иваз карда намешавад."
  if (-not $sha1) { Warn "SHA-1-и он дар саҳифаи сохтани барнома навишта мешавад: $ActionsPage" }
} else {
  $rsa = [System.Security.Cryptography.RSA]::Create(2048)
  $dn = New-Object System.Security.Cryptography.X509Certificates.X500DistinguishedName("CN=MTMU7, O=MTMU No 7, C=TJ")
  $request = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest(
    $dn, $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1), [DateTimeOffset]::UtcNow.AddYears(30))
  try { $cert.FriendlyName = "upload" } catch {}
  $password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ })
  $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, $password)
  $sha1 = Format-Sha1 $cert.Thumbprint

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  [IO.File]::WriteAllBytes($backupKey, $bytes)
  Set-Content -Path $backupNote -Encoding UTF8 -Value @(
    $password,
    "",
    "МТМУ №7 · калиди барномаи Android ($Package)",
    "SHA-1: $sha1",
    "Ин файл ва MTMU7-release.p12 ягона нусхаи калиданд. Онҳоро дар флешка ё Google Drive нигоҳ доред ва ба касе надиҳед."
  )

  if (-not (Set-Secret "ANDROID_KEYSTORE_BASE64" ([Convert]::ToBase64String($bytes)))) { Warn "Калид ба GitHub гузошта нашуд."; return }
  if (-not (Set-Secret "ANDROID_KEYSTORE_PASSWORD" $password)) { Warn "Пароли калид ба GitHub гузошта нашуд."; return }
  Ok "Калиди нав сохта шуд ва ба GitHub гузошта шуд"
  Ok "Нусхаи эҳтиётӣ: $backupDir"
  Warn "Ин ҷузвдонро ба флешка ё Google Drive нусха кунед. Агар гум шавад, барномаро навсозӣ кардан ғайриимкон мешавад."
}
if ($sha1) { Ok "SHA-1: $sha1" }

# --------------------------------------------------------- Google in the app
Step "3/4  Воридшавӣ бо Google дар барнома (Firebase)"
$folders = Get-DownloadFolders
$started = Get-Date
$ours = { param($j, $f) @($j.client | ForEach-Object { $_.client_info.android_client_info.package_name }) -contains $Package }
$current = Find-Json $folders "google-services*.json" $ours
if (-not $current) { Warn "google-services.json-и $Package дар «Загрузки» нест. Аввал скрипти firebase.ps1-ро иҷро кунед."; return }
$projectId = $current.Json.project_info.project_id
Ok "Лоиҳаи Firebase: $projectId"

$hash = if ($sha1) { $sha1.Replace(":", "").ToLowerInvariant() } else { $null }
$ready = {
  param($j, $f)
  $client = @($j.client | Where-Object { $_.client_info.android_client_info.package_name -eq $Package }) | Select-Object -First 1
  if (-not $client) { return $false }
  $web = @($client.oauth_client | Where-Object { $_.client_type -eq 3 })
  $android = @($client.oauth_client | Where-Object { $_.client_type -eq 1 -and $_.android_info.certificate_hash })
  if ($web.Count -eq 0) { return $false }
  if ($hash) { return @($android | Where-Object { $_.android_info.certificate_hash.ToLowerInvariant() -eq $hash }).Count -gt 0 }
  return $android.Count -gt 0
}
$services = Find-Json $folders "google-services*.json" $ready
if ($services) {
  Ok "Firebase аллакай омода аст"
} else {
  Open-Page "https://console.firebase.google.com/project/$projectId/authentication/providers"
  Info "Дар саҳифаи кушодашуда: Get started (агар бошад) → Add new provider → Google →"
  Info "Enable → Project support email-ро интихоб кунед → Save."
  Wait-Enter "Google-ро фаъол кардед"
  if ($sha1) {
    [void](Copy-Text $sha1)
    Info "SHA-1 нусха гирифта шуд."
  } else {
    Info "SHA-1-ро аз саҳифаи сохтани барнома гиред: $ActionsPage"
  }
  Open-Page "https://console.firebase.google.com/project/$projectId/settings/general/android:$Package"
  Info "Дар саҳифаи кушодашуда, барномаи $Package → SHA certificate fingerprints →"
  Info "Add fingerprint → Ctrl+V → Save."
  Info "Баъд дар ҳамон ҷо google-services.json-ро аз нав зеркашӣ кунед. Ман онро интизорам"
  $services = Wait-Json $folders "google-services*.json" { param($j, $f) $f.LastWriteTime -gt $started -and (& $ready $j $f) }
  if (-not $services) {
    Warn "Файли нав бо Google ва SHA-1-и ин калид пайдо нашуд. Қадамҳоро санҷед ва скриптро аз нав оғоз кунед."
    return
  }
  Ok "Файли нав ёфт шуд: $($services.Path)"
}
if (-not (Set-Secret "GOOGLE_SERVICES_JSON" ([Convert]::ToBase64String([IO.File]::ReadAllBytes($services.Path))))) {
  Warn "google-services.json ба GitHub гузошта нашуд."
  return
}
Ok "Дар GitHub гузошта шуд: GOOGLE_SERVICES_JSON"

# --------------------------------------------------------------- Supabase
Step "4/4  Supabase"
$client = @($services.Json.client | Where-Object { $_.client_info.android_client_info.package_name -eq $Package }) | Select-Object -First 1
$webClient = @($client.oauth_client | Where-Object { $_.client_type -eq 3 } | ForEach-Object { $_.client_id }) | Select-Object -First 1
if (-not $webClient) { Warn "Web client id дар файл нест."; return }
[void](Copy-Text $webClient)
Open-Page $SupabaseProviders
Info "Дар саҳифаи Supabase: Google →"
Info "  «Client IDs»: ба охири он чи ҳаст вергул (,) гузоред ва Ctrl+V кунед"
Info "  (агар холӣ бошад — танҳо Ctrl+V) → Save."
Info "Web client id: $webClient"
Wait-Enter "Save кардед"
[void](Copy-Text " ")

# ------------------------------------------------------------------ build
Step "Сохтани барнома"
$ref = "main"
& gh api "repos/$Repo/branches/$([uri]::EscapeDataString($Branch))" *> $null
if ($LASTEXITCODE -eq 0) { $ref = $Branch }
& gh workflow run mobile-android.yml --repo $Repo --ref $ref
if ($LASTEXITCODE -eq 0) { Ok "Сохтан оғоз шуд (~3 дақиқа): $ActionsPage" } else { Warn "Сохтан оғоз нашуд. Ба Claude нависед." }

Write-Host ""
Write-Host "  Тайёр. Ба Claude нависед: «калид тайёр»." -ForegroundColor Green
Write-Host "  Барномаи навро аз сайт насб кунед (барномаи кӯҳнаро як бор пок кунед)." -ForegroundColor Green
Write-Host ""
