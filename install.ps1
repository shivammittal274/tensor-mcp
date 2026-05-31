# tensor-mcp installer for Windows (PowerShell 5+ / PowerShell Core)
#
# Usage:
#   iwr -useb https://raw.githubusercontent.com/shivammittal274/tensor-mcp/main/install.ps1 | iex
#
# Or from a downloaded copy:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# Env vars:
#   TENSOR_MCP_VERSION   Install a specific tag (e.g. v0.3.0). Default: latest.
#
# What this does:
#   1. Detects x64 vs arm64.
#   2. Downloads the matching tensor-mcp-windows-<arch>.exe from the
#      GitHub release, verifies SHA-256 against SHA256SUMS.txt.
#   3. Drops it at $HOME\.tensor-mcp\bin\tensor-mcp.exe.
#   4. Downloads the model + onnxruntime DLLs (~35 MB) from upstream
#      (HuggingFace + unpkg) and stages them under
#      $HOME\.tensor-mcp\embeddings\.
#   5. Tells the user to add the bin dir to PATH (we don't modify
#      registry PATH without explicit user consent).

$ErrorActionPreference = 'Stop'

$Repo = 'shivammittal274/tensor-mcp'
$InstallDir = Join-Path $env:USERPROFILE '.tensor-mcp\bin'
$EmbedDir   = Join-Path $env:USERPROFILE '.tensor-mcp\embeddings'
$BinName    = 'tensor-mcp.exe'

function Info($msg) { Write-Host $msg }
function Fail($msg) { Write-Error "install.ps1: $msg"; exit 1 }

# --- Architecture detection -------------------------------------------------

$archEnv = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
switch ($archEnv) {
  'X64'   { $arch = 'x64' }
  'Arm64' { $arch = 'arm64' }
  default { Fail "unsupported architecture: $archEnv" }
}
$target = "windows-$arch"
Info "Installing tensor-mcp for $target..."

# --- Resolve version --------------------------------------------------------

$version = $env:TENSOR_MCP_VERSION
if ($version) {
  $baseUrl = "https://github.com/$Repo/releases/download/$version"
  Info "  → version: $version"
} else {
  $baseUrl = "https://github.com/$Repo/releases/latest/download"
  Info "  → version: latest"
}

$asset    = "tensor-mcp-$target.exe"
$assetUrl = "$baseUrl/$asset"
$sumsUrl  = "$baseUrl/SHA256SUMS.txt"

# --- Download to temp -------------------------------------------------------

$tmpDir = Join-Path $env:TEMP "tensor-mcp-install-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $tmpDir | Out-Null
try {
  $tmpBinary = Join-Path $tmpDir $asset
  $tmpSums   = Join-Path $tmpDir 'SHA256SUMS.txt'

  Info "  → downloading $assetUrl"
  Invoke-WebRequest -Uri $assetUrl -OutFile $tmpBinary

  Info "  → downloading SHA256SUMS.txt"
  Invoke-WebRequest -Uri $sumsUrl -OutFile $tmpSums

  # --- Verify checksum ------------------------------------------------------
  $expected = (Get-Content $tmpSums |
    Where-Object { $_ -match "(?:\*)?$([regex]::Escape($asset))\s*$" } |
    Select-Object -First 1) -replace '\s+.*$',''
  if (-not $expected) { Fail "no checksum entry for $asset in SHA256SUMS.txt" }

  $actual = (Get-FileHash -Algorithm SHA256 -Path $tmpBinary).Hash.ToLower()
  if ($expected -ne $actual) {
    Fail "checksum mismatch for $asset`n  expected: $expected`n  actual:   $actual"
  }
  Info "  → sha256 verified ($actual)"

  # --- Install --------------------------------------------------------------
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  $dest = Join-Path $InstallDir $BinName
  Move-Item -Path $tmpBinary -Destination $dest -Force
  Info ""
  Info "Installed: $dest"
}
finally {
  Remove-Item -Recurse -Force -Path $tmpDir -ErrorAction SilentlyContinue
}

# --- Embeddings (~35 MB, one-time) ------------------------------------------
#
# Same upstream sources as install.sh — HuggingFace for the model files,
# unpkg/onnxruntime-node for the DLLs. Soft failure throughout: any
# download problem just disables semantic ranking (BM25-only fallback)
# without aborting the install.

$HfBase  = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main'
$OrtBase = 'https://unpkg.com/onnxruntime-node@1.21.0/bin/napi-v3'

# Runtime entries — per-arch. DirectML.dll is delay-loaded by
# onnxruntime.dll on Windows; bundle it alongside.
$runtimeEntries = switch ($arch) {
  'x64' { @(
    @{ Local='onnxruntime.dll'; Url="$OrtBase/win32/x64/onnxruntime.dll";
       Sha='cf96b2b7de5328adafe79f9b1d818abdc04931cbcb39c6a6c9ae2ddc872ef63b' },
    @{ Local='DirectML.dll'; Url="$OrtBase/win32/x64/DirectML.dll";
       Sha='9c9e6d822561c6c41b90e6994b3e8857cf1d66dbfb1e0c4c799c7c89b4e92da1' }
  ) }
  'arm64' { @(
    @{ Local='onnxruntime.dll'; Url="$OrtBase/win32/arm64/onnxruntime.dll";
       Sha='8252109df07494085ae818df7f79a67d562b74b9eede9d6a6aad2b02475f6d88' },
    @{ Local='DirectML.dll'; Url="$OrtBase/win32/arm64/DirectML.dll";
       Sha='77b0db83ff903f2323f5caf538499d75af6038bbea23b7959f7d232d9a4ab9d4' }
  ) }
  default { @() }
}

# Model + tokenizer entries — same for every Windows arch.
$modelEntries = @(
  @{ Local='model.onnx'; Url="$HfBase/onnx/model_quantized.onnx";
     Sha='afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1' },
  @{ Local='tokenizer.json'; Url="$HfBase/tokenizer.json";
     Sha='da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0' },
  @{ Local='tokenizer_config.json'; Url="$HfBase/tokenizer_config.json";
     Sha='9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3' },
  @{ Local='special_tokens_map.json'; Url="$HfBase/special_tokens_map.json";
     Sha='b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3' },
  @{ Local='config.json'; Url="$HfBase/config.json";
     Sha='7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7' },
  @{ Local='vocab.txt'; Url="$HfBase/vocab.txt";
     Sha='07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3' }
)

$modelDir   = Join-Path $EmbedDir 'fast-all-MiniLM-L6-v2'
$runtimeDir = Join-Path $EmbedDir 'runtime'

Info ''
Info "Downloading embeddings (one-time, ~35 MB)..."

$embedFailed = $false
function Get-VerifiedFile {
  param([string]$Url, [string]$DestDir, [string]$Local, [string]$Sha)
  $destPath = Join-Path $DestDir $Local
  if (Test-Path $destPath) {
    Info "  → $Local (cached)"
    return $true
  }
  Info "  → $Local"
  New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
  $tmpPath = "$destPath.part"
  try {
    Invoke-WebRequest -Uri $Url -OutFile $tmpPath -ErrorAction Stop
  } catch {
    Info "    ⚠ download failed: $_"
    Remove-Item -Force -Path $tmpPath -ErrorAction SilentlyContinue
    return $false
  }
  $actual = (Get-FileHash -Algorithm SHA256 -Path $tmpPath).Hash.ToLower()
  if ($actual -ne $Sha) {
    Info "    ⚠ sha256 mismatch (expected $Sha, got $actual)"
    Remove-Item -Force -Path $tmpPath -ErrorAction SilentlyContinue
    return $false
  }
  Move-Item -Path $tmpPath -Destination $destPath -Force
  return $true
}

foreach ($e in $modelEntries) {
  if (-not (Get-VerifiedFile $e.Url $modelDir $e.Local $e.Sha)) { $embedFailed = $true }
}
foreach ($e in $runtimeEntries) {
  if (-not (Get-VerifiedFile $e.Url $runtimeDir $e.Local $e.Sha)) { $embedFailed = $true }
}

if ($runtimeEntries.Count -eq 0) {
  Info "  → no onnxruntime for $target; search will use BM25-only."
} elseif ($embedFailed) {
  Info "  ⚠ some embedding files failed. Search will use BM25-only until re-run."
} else {
  Info "  → embeddings ready at $EmbedDir"
}

# --- PATH hint --------------------------------------------------------------

$inPath = $env:PATH -split ';' | Where-Object { $_ -eq $InstallDir }
Info ''
if ($inPath) {
  Info "Run: tensor-mcp --help"
} else {
  Info "Add $InstallDir to your PATH. For example, in PowerShell:"
  Info ""
  Info "  [Environment]::SetEnvironmentVariable('PATH', `"`$env:PATH;$InstallDir`", 'User')"
  Info ""
  Info "Or open System → Environment Variables → edit User PATH."
  Info ""
  Info "Then in a new shell: tensor-mcp --help"
}
