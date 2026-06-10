param(
    [string]$Version = "",
    [switch]$Vercel,
    [switch]$Tauri,
    [switch]$Android,
    [switch]$AndroidDebug,
    [switch]$GitCommit,
    [switch]$GitPush,
    [switch]$SkipVersionSync,
    [switch]$DryRun,
    [string]$CommitMessage
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$FrontendRoot = Join-Path $RepoRoot "frontend"
$AndroidRoot = Join-Path $FrontendRoot "android"
$TauriRoot = Join-Path $FrontendRoot "src-tauri"
$TauriBundleRoot = Join-Path $TauriRoot "target\release\bundle"
$TauriKeyPath = Join-Path $TauriRoot ".tauri\snowball-updater.key"
$AndroidKeyPropertiesPath = Join-Path $AndroidRoot "key.properties"

# Auto-detect correct JAVA_HOME for Android builds (requires Java 21+)
$javaBase = "C:\Program Files\Eclipse Adoptium"
if (Test-Path $javaBase) {
    $requiredJava = Get-ChildItem $javaBase -Directory | Where-Object { $_.Name -match '^jdk-(\d+)' -and [int]$matches[1] -ge 21 } |
        Sort-Object { [int](($_.Name -replace '^jdk-(\d+).*','$1')) } | Select-Object -First 1
    if ($requiredJava) {
        $targetJava = $requiredJava.FullName
        if ($env:JAVA_HOME -ne $targetJava) {
            Write-Host "   JAVA_HOME: $env:JAVA_HOME -> $targetJava" -ForegroundColor Yellow
            $env:JAVA_HOME = $targetJava
        }
    }
}

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Test-SemVer {
    param([string]$InputVersion)
    return $InputVersion -match '^\d+\.\d+\.\d+$'
}

function Get-AndroidVersionCode {
    param([string]$InputVersion)
    $parts = $InputVersion.Split('.')
    return ([int]$parts[0] * 10000) + ([int]$parts[1] * 100) + [int]$parts[2]
}

function Invoke-Step {
    param(
        [string]$Label,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "-> $Label" -ForegroundColor Yellow
    if ($DryRun) {
        Write-Host "   Dry run: skipped" -ForegroundColor DarkYellow
        return
    }

    & $Action
}

function Invoke-External {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory = $RepoRoot
    )

    if ($DryRun) {
        $joined = ($ArgumentList | ForEach-Object {
            if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
        }) -join ' '
        Write-Host "   Dry run command: $FilePath $joined" -ForegroundColor DarkYellow
        return
    }

    Push-Location $WorkingDirectory
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Set-MsvcEnvironment {
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vsWhere)) {
        Write-Host "   vswhere not found. Skipping MSVC env setup." -ForegroundColor DarkYellow
        return
    }

    $installPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ([string]::IsNullOrWhiteSpace($installPath)) {
        $installPath = & $vsWhere -all -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1
    }
    if ([string]::IsNullOrWhiteSpace($installPath)) {
        $installPath = & $vsWhere -all -products * -property installationPath | Select-Object -First 1
    }
    if ([string]::IsNullOrWhiteSpace($installPath)) {
        Write-Host "   No Visual Studio installation found. Skipping MSVC env setup." -ForegroundColor DarkYellow
        return
    }

    $vcvarsall = Join-Path $installPath "VC\Auxiliary\Build\vcvarsall.bat"
    if (-not (Test-Path $vcvarsall)) {
        Write-Host "   vcvarsall.bat not found at $vcvarsall. Skipping MSVC env setup." -ForegroundColor DarkYellow
        return
    }

    Write-Host "   Importing MSVC environment from $installPath" -ForegroundColor DarkGreen
    $envVars = & cmd.exe /c "`"$vcvarsall`" x64 >nul 2>&1 && set"
    foreach ($line in $envVars) {
        if ($line -match '^(.+?)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

function Update-JsonVersion {
    param(
        [string]$Path,
        [string]$InputVersion
    )

    $json = Get-Content $Path -Raw | ConvertFrom-Json
    $json.version = $InputVersion
    $json | ConvertTo-Json -Depth 100 | Set-Content $Path
}

function Update-RegexReplace {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement
    )

    $content = Get-Content $Path -Raw
    if (-not [regex]::IsMatch($content, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)) {
        throw "Failed to find pattern $Pattern in $Path"
    }

    $updated = [regex]::Replace($content, $Pattern, $Replacement, [System.Text.RegularExpressions.RegexOptions]::Multiline)
    Set-Content $Path $updated
}

function Sync-VersionFiles {
    param([string]$InputVersion)

    $androidVersionCode = Get-AndroidVersionCode $InputVersion

    Update-JsonVersion (Join-Path $RepoRoot "package.json") $InputVersion
    Update-JsonVersion (Join-Path $FrontendRoot "package.json") $InputVersion
    Update-JsonVersion (Join-Path $FrontendRoot "src-tauri\tauri.conf.json") $InputVersion
    Update-RegexReplace (Join-Path $FrontendRoot "src-tauri\Cargo.toml") '^version = ".*"$' ('version = "{0}"' -f $InputVersion)
    Update-RegexReplace (Join-Path $AndroidRoot "app\build.gradle") '^def computedVersionCode = .*$' ('def computedVersionCode = {0}' -f $androidVersionCode)
    Update-RegexReplace (Join-Path $AndroidRoot "app\build.gradle") '^def computedVersionName = .*$' ('def computedVersionName = "{0}"' -f $InputVersion)
}

function Set-TauriSigningEnvironment {
    if (-not (Test-Path $TauriKeyPath)) {
        Write-Host "   No Tauri updater key found at $TauriKeyPath. Skipping signing env." -ForegroundColor DarkYellow
        return $false
    }

    $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $TauriKeyPath -Raw
    
    if (-not [string]::IsNullOrEmpty($script:TauriPassword)) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $script:TauriPassword
    } else {
        # Fallback if skipped or run directly
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "SnowballPW$"
    }
    
    Write-Host "   Loaded Tauri signing key from $TauriKeyPath" -ForegroundColor DarkGreen
    return $true
}

function New-TauriLatestJson {
    param([string]$InputVersion)

    $nsisExe = Join-Path $TauriBundleRoot "nsis\Snowball_${InputVersion}_x64-setup.exe"
    $nsisSig = "${nsisExe}.sig"
    $latestJsonPath = Join-Path $TauriBundleRoot "nsis\latest.json"

    if (-not (Test-Path $nsisExe)) {
        throw "Could not find NSIS bundle at $nsisExe"
    }

    if (-not (Test-Path $nsisSig)) {
        throw "Could not find NSIS signature at $nsisSig"
    }

    $payload = [ordered]@{
        version = $InputVersion
        notes = "Snowball $InputVersion desktop release"
        pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        platforms = [ordered]@{
            "windows-x86_64" = [ordered]@{
                signature = (Get-Content $nsisSig -Raw).Trim()
                url = "https://github.com/Horrid-12/Snowball/releases/download/v$InputVersion/Snowball_${InputVersion}_x64-setup.exe"
            }
        }
    }

    $payload | ConvertTo-Json -Depth 10 | Set-Content $latestJsonPath
    Write-Host "   Wrote updater feed: $latestJsonPath" -ForegroundColor DarkGreen
}

function Test-AndroidReleaseSigningConfigured {
    return Test-Path $AndroidKeyPropertiesPath
}

function Get-AndroidApkPath {
    param([bool]$UseDebugBuild)

    if ($UseDebugBuild) {
        return Join-Path $AndroidRoot "app\build\outputs\apk\debug\app-debug.apk"
    }

    $signedRelease = Join-Path $AndroidRoot "app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $signedRelease) {
        return $signedRelease
    }

    return Join-Path $AndroidRoot "app\build\outputs\apk\release\app-release-unsigned.apk"
}

function Read-Choice {
    param(
        [string]$Prompt,
        [bool]$DefaultValue = $false
    )

    $suffix = if ($DefaultValue) { "[Y/n]" } else { "[y/N]" }
    $answer = Read-Host "$Prompt $suffix"
    if ([string]::IsNullOrWhiteSpace($answer)) {
        return $DefaultValue
    }

    return $answer.Trim().ToLowerInvariant() -in @("y", "yes")
}

function Start-InteractiveMode {
    if ([string]::IsNullOrWhiteSpace($Version) -or -not (Test-SemVer $Version)) {
        $script:Version = Read-Host "Version (semver, e.g. 6.0.0)"
    }

    if (-not (Test-SemVer $Version)) {
        throw "Invalid version '$Version'. Use semver like 6.0.0."
    }

    Write-Section "Snowball Release CLI"
    Write-Host "Version: $Version"

    $script:Vercel = Read-Choice "Deploy production to Vercel?" $true
    $script:Tauri = Read-Choice "Build the Tauri desktop app?" $true
    if ($script:Tauri) {
        $enteredPw = Read-Host "Tauri updater key password [SnowballPW$]"
        if ([string]::IsNullOrWhiteSpace($enteredPw)) {
            $script:TauriPassword = "SnowballPW$"
        } else {
            $script:TauriPassword = $enteredPw
        }
    }

    $script:Android = Read-Choice "Build the Android release app?" $true
    if ($script:Android) {
        $script:AndroidDebug = Read-Choice "Build Android debug APK instead of release?" $false
    }
    $script:GitCommit = Read-Choice "Create a git commit for this release?" $false

    if ($script:GitCommit) {
        $defaultCommit = "release: v$Version"
        $enteredCommit = Read-Host "Commit message [$defaultCommit]"
        if ([string]::IsNullOrWhiteSpace($enteredCommit)) {
            $script:CommitMessage = $defaultCommit
        }
        else {
            $script:CommitMessage = $enteredCommit
        }

        $script:GitPush = Read-Choice "Push the commit to GitHub?" $false
    }
    else {
        $script:GitPush = $false
    }
}

$explicitActions = $Vercel -or $Tauri -or $Android -or $GitCommit -or $GitPush
if (-not $explicitActions) {
    Start-InteractiveMode
}

if (-not (Test-SemVer $Version)) {
    throw "Invalid version '$Version'. Use semver like 6.0.0."
}

if (-not $CommitMessage) {
    $CommitMessage = "release: v$Version"
}

Write-Section "Release Summary"
Write-Host "Version sync : $(-not $SkipVersionSync)"
Write-Host "Vercel       : $Vercel"
Write-Host "Tauri        : $Tauri"
Write-Host "Android      : $Android"
Write-Host "Android mode : $(if (-not $Android) { 'n/a' } elseif ($AndroidDebug) { 'debug' } else { 'release' })"
Write-Host "Git commit   : $GitCommit"
Write-Host "Git push     : $GitPush"
Write-Host "Dry run      : $DryRun"

if (-not $SkipVersionSync) {
    Invoke-Step "Syncing version files to $Version" {
        Sync-VersionFiles $Version
    }
}

if ($Vercel) {
    Invoke-Step "Deploying production build to Vercel" {
        Invoke-External "npx.cmd" @("vercel", "deploy", "--prod", "--yes") $RepoRoot
    }
}

if ($Tauri) {
    Invoke-Step "Building Tauri desktop app" {
        Set-MsvcEnvironment
        Set-TauriSigningEnvironment | Out-Null
        Invoke-External "npm.cmd" @("run", "tauri:build") $FrontendRoot
        New-TauriLatestJson $Version
    }
}

if ($Android) {
    $resolvedAndroidDebug = $AndroidDebug
    if (-not $resolvedAndroidDebug -and -not (Test-AndroidReleaseSigningConfigured)) {
        Write-Host ""
        Write-Host "No Android release signing config found at $AndroidKeyPropertiesPath." -ForegroundColor DarkYellow
        Write-Host "Falling back to installable debug APK build." -ForegroundColor DarkYellow
        $resolvedAndroidDebug = $true
    }

    Invoke-Step "Syncing Capacitor Android project" {
        Invoke-External "npx.cmd" @("cap", "sync", "android") $FrontendRoot
    }

    $androidTask = if ($resolvedAndroidDebug) { "assembleDebug" } else { "assembleRelease" }
    $androidLabel = if ($resolvedAndroidDebug) { "Building Android debug app" } else { "Building Android release app" }

    Invoke-Step $androidLabel {
        Invoke-External (Join-Path $AndroidRoot "gradlew.bat") @($androidTask) $AndroidRoot
        $apkPath = Get-AndroidApkPath $resolvedAndroidDebug
        if (Test-Path $apkPath) {
            Write-Host "   Android APK: $apkPath" -ForegroundColor DarkGreen
        } else {
            Write-Host "   Android APK not found at expected path: $apkPath" -ForegroundColor DarkYellow
        }
    }
}

if ($GitCommit) {
    Invoke-Step "Creating git commit" {
        Invoke-External "git.exe" @("add", "package.json", "frontend/package.json", "frontend/src-tauri/tauri.conf.json", "frontend/src-tauri/Cargo.toml", "frontend/android/app/build.gradle") $RepoRoot
        Invoke-External "git.exe" @("commit", "-m", $CommitMessage) $RepoRoot
    }
    Invoke-Step "Creating git tag v$Version" {
        Invoke-External "git.exe" @("tag", "v$Version") $RepoRoot
    }
}

if ($GitPush) {
    Invoke-Step "Pushing commit and tag to GitHub" {
        Invoke-External "git.exe" @("push", "--follow-tags") $RepoRoot
    }
}

Write-Host ""
Write-Host "Release flow complete." -ForegroundColor Green
