<#
.SYNOPSIS
  Authoritative Windows verification of the Log Analyzer (Tauri v2). Implements scripts/verify.ps1.spec.md.

.DESCRIPTION
  Runs the six spec steps in order, in log-analyzer-dashboard\, and never stops early, so one run lists
  every failure:
    1. npm ci
    2. npx tsc -b
    3. npx vitest run
    4. npm run build
    5. npx tauri build
    6. cargo test --manifest-path src-tauri\Cargo.toml

  Exit codes (strict):
    0  every step passed (the known unit baseline, and only it, counts as passed - reported as BASELINE)
    1  at least one step failed
    2  harness error: missing toolchain, wrong branch, repo not found. Never used for a product failure.

  Artifacts, dated and never overwritten (a time suffix is added if the folder exists):
    verification\YYYY-MM-DD-<short-sha>\
      verify.log        all six steps: banners, output, exit codes, then the report
      tauri-build.log   npx tauri build
      unit.log          vitest
      cargo-test.log    cargo test
      bundle-path.txt   absolute path(s) of the installer/exe the tauri build produced
    plus npm-ci.log, tsc.log, build.log and report.md (the report on its own).

  "Wrong branch" means HEAD does not contain origin/feat-log-analyzer-electron (the trunk; main is a stale
  ancestor). A feature branch built on the trunk passes, so PR branches can be verified too.

.PARAMETER RepoRoot
  The repository root. Default: the folder above this script.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
#>
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Continue'
$Trunk = 'origin/feat-log-analyzer-electron'

# Known failures that do not fail the run, each OWNED by an open bug note (review F1.1, rubric R13: a pinned
# failure is a deferral and needs an owner). Matched by file + exact name. Remove an entry when its fix lands.
# Keep this list identical to scripts/verify.sh and the spec's "Known baseline".
$Baseline = @(
  @{ File  = 'src/components/__tests__/LogAnalyzer.test.tsx'
     Name  = 'typing a query into the query bar actually filters the rendered rows'
     Owner = 'vault/bugs/2026-10-07-query-bar-filter-regression.md' }   # a live regression of the 09-01 fix
)

function Stop-Harness([string]$Message) {
  Write-Host "verify.ps1: HARNESS ERROR - $Message"
  exit 2
}

# ---------------------------------------------------------------- preconditions (exit 2)
try { $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path }
catch { Stop-Harness "repo not found: $RepoRoot" }
$App = Join-Path $RepoRoot 'log-analyzer-dashboard'
if (-not (Test-Path -LiteralPath (Join-Path $App 'package.json'))) { Stop-Harness "no log-analyzer-dashboard\package.json under $RepoRoot" }
if (-not (Test-Path -LiteralPath (Join-Path $App 'src-tauri\Cargo.toml'))) { Stop-Harness "no log-analyzer-dashboard\src-tauri\Cargo.toml" }

foreach ($tool in 'git', 'node', 'npm', 'npx', 'cargo') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Stop-Harness "$tool is not on PATH" }
}
$nodeVersion = (& node --version 2>$null)
$nodeMajor = 0
if ($nodeVersion -match '^v(\d+)') { $nodeMajor = [int]$Matches[1] }
if ($nodeMajor -lt 20) { Stop-Harness "Node 20+ is required (found '$nodeVersion')" }
$cargoVersion = (& cargo --version 2>$null)
if ($LASTEXITCODE -ne 0) { Stop-Harness 'cargo --version failed (Rust stable is required)' }

Push-Location -LiteralPath $RepoRoot
$branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
$sha = (& git rev-parse --short HEAD 2>$null)
if (-not $sha) { Pop-Location; Stop-Harness "$RepoRoot is not a git checkout" }
& git rev-parse --verify --quiet "$Trunk^{commit}" *> $null
if ($LASTEXITCODE -ne 0) { Pop-Location; Stop-Harness "$Trunk not found - run 'git fetch origin' first" }
& git merge-base --is-ancestor $Trunk HEAD *> $null
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Stop-Harness "wrong branch: $branch @ $sha does not contain $Trunk (the trunk is feat-log-analyzer-electron, not main)"
}
Pop-Location

# ---------------------------------------------------------------- artifacts
$stamp = Get-Date -Format 'yyyy-MM-dd'
$Out = Join-Path $RepoRoot "verification\$stamp-$sha"
if (Test-Path -LiteralPath $Out) { $Out = "$Out-" + (Get-Date -Format 'HHmmss') }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$VerifyLog = Join-Path $Out 'verify.log'
$started = Get-Date

function Write-Log([string]$Text) {
  Add-Content -LiteralPath $VerifyLog -Value $Text -Encoding UTF8
  Write-Host $Text
}

Write-Log "verify.ps1 - $RepoRoot"
Write-Log "branch $branch @ $sha | node $nodeVersion | $cargoVersion | $(Get-Date -Format 's')"

# Plain output for the parsers below. CI must be 'true': the tauri CLI rejects CI=1 ("invalid value
# '1' for '--ci'"), which failed step 5 in 9 s on the first run (2026-10-06).
$env:CI = 'true'
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'

$Results = New-Object System.Collections.Generic.List[object]

function Invoke-Step([int]$Number, [string]$Command, [string]$LogName) {
  $log = Join-Path $Out $LogName
  Write-Log ""
  Write-Log "=== STEP $Number/6: $Command   [$(Get-Date -Format 'HH:mm:ss')]"
  $t = Get-Date
  Push-Location -LiteralPath $App
  # cmd /s strips the outer quotes and keeps the inner ones, so paths with spaces survive.
  & cmd.exe /d /s /c "`"$Command > `"$log`" 2>&1`""
  $code = $LASTEXITCODE
  Pop-Location
  if (Test-Path -LiteralPath $log) {
    Get-Content -LiteralPath $log | Add-Content -LiteralPath $VerifyLog -Encoding UTF8
  }
  $status = 'PASS'
  if ($code -ne 0) { $status = 'FAIL' }
  $secs = [int]((Get-Date) - $t).TotalSeconds
  Write-Log "=== STEP $Number/6: $Command -> exit $code $status (${secs}s)"
  if ($code -ne 0 -and (Test-Path -LiteralPath $log)) {
    Write-Host '--- last 40 lines ---'
    Get-Content -LiteralPath $log -Tail 40 | Write-Host
  }
  $r = [pscustomobject]@{ Step = $Number; Command = $Command; Exit = $code; Status = $status; Log = $log; Note = '' }
  $Results.Add($r)
  return $r
}

# ---------------------------------------------------------------- the six steps
Invoke-Step 1 'npm ci' 'npm-ci.log' | Out-Null
Invoke-Step 2 'npx tsc -b' 'tsc.log' | Out-Null
# --maxWorkers=4 (spec amendment): with vitest's default of one worker per core (22 here), every worker
# timed out ("Timeout waiting for worker to respond", no test run) on both 2026-10-06 runs; with 4 the
# suite runs: 252 passed, 1 failed (the baseline).
$unit = Invoke-Step 3 'npx vitest run --maxWorkers=4' 'unit.log'

# Failing tests by name; the baseline (and only it) is not a regression.
$failing = @()
if (Test-Path -LiteralPath $unit.Log) {
  $failing = @(Get-Content -LiteralPath $unit.Log | ForEach-Object {
      # vitest's summary lists each failed test as " FAIL  <file> > <suite> > <test>"
      if ($_ -match '^\s*FAIL\s+(.+?)\s*(\d+\s*m?s)?\s*$') { $Matches[1].Trim() }
    } | Where-Object { $_ -match '\.(test|spec)\.' } | Sort-Object -Unique)
}
$unexpected = @($failing | Where-Object {
    $line = $_
    -not ($Baseline | Where-Object { $line -like "*$($_.File)*" -and $line.EndsWith($_.Name) })
  })
$baselineHit = @($failing | Where-Object { $unexpected -notcontains $_ })
if ($unit.Exit -ne 0 -and $failing.Count -gt 0 -and $unexpected.Count -eq 0) {
  $unit.Status = 'BASELINE'
  $unit.Note = "only the known baseline failed ($($baselineHit.Count))"
}
elseif ($unit.Exit -ne 0 -and $failing.Count -eq 0) {
  # vitest failed without naming a test: it never ran one (first run: 15 worker timeouts, "no tests")
  $unhandled = @(Select-String -LiteralPath $unit.Log -Pattern 'Unhandled Error' -SimpleMatch).Count
  $unit.Note = "no test reported as failing; vitest did not run the suite ($unhandled unhandled errors - see unit.log)"
}
elseif ($unit.Exit -ne 0) {
  $unit.Note = "$($failing.Count) failing, $($unexpected.Count) not in the baseline"
}

# Step 5's beforeBuildCommand runs `npm run build` again, so the frontend builds twice. That is on purpose
# (spec): step 4 on its own pins a frontend break to step 4, rather than leaving it buried inside step 5.
Invoke-Step 4 'npm run build' 'build.log' | Out-Null
$tauriStart = Get-Date
$tauri = Invoke-Step 5 'npx tauri build' 'tauri-build.log'
Invoke-Step 6 'cargo test --manifest-path src-tauri\Cargo.toml' 'cargo-test.log' | Out-Null

# ---------------------------------------------------------------- bundle
$bundleDir = Join-Path $App 'src-tauri\target\release\bundle'
$bundles = @()
if (Test-Path -LiteralPath $bundleDir) {
  $bundles = @(Get-ChildItem -LiteralPath $bundleDir -Recurse -File -Include *.msi, *.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -ge $tauriStart } | ForEach-Object { $_.FullName })
}
$bundleFile = Join-Path $Out 'bundle-path.txt'
if ($bundles.Count -gt 0) { Set-Content -LiteralPath $bundleFile -Value $bundles -Encoding UTF8 }
else { Set-Content -LiteralPath $bundleFile -Value '(no installer produced by this run)' -Encoding UTF8 }
$shellVerified = ($tauri.Exit -eq 0 -and $bundles.Count -gt 0)
# Tell "the exe did not build" apart from "the exe built, the installer did not" (run 2: missing .ico).
if ($tauri.Exit -ne 0 -and (Test-Path -LiteralPath $tauri.Log)) {
  $built = Select-String -LiteralPath $tauri.Log -Pattern 'Finished `release` profile' -SimpleMatch -Quiet
  $why = @(Select-String -LiteralPath $tauri.Log -Pattern 'failed to bundle project|^error' | Select-Object -Last 1 | ForEach-Object { $_.Line.Trim() })
  if ($built) { $tauri.Note = 'release exe built; bundling failed' } else { $tauri.Note = 'the release build did not finish' }
  if ($why.Count -gt 0) { $tauri.Note = $tauri.Note + ': ' + $why[0] }
}

# ---------------------------------------------------------------- report
$failed = @($Results | Where-Object { $_.Status -eq 'FAIL' })
$code = 0
if ($failed.Count -gt 0) { $code = 1 }
$overall = 'PASS'
if ($code -ne 0) { $overall = 'FAIL' }
$mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)

$report = New-Object System.Collections.Generic.List[string]
$report.Add("# verify.ps1 report - $branch @ $sha - $(Get-Date -Format 'yyyy-MM-dd HH:mm') ($mins min)")
$report.Add('')
$report.Add('| Step | Command | Exit | Result |')
$report.Add('|---|---|---|---|')
foreach ($r in $Results) {
  $res = $r.Status
  if ($r.Note) { $res = "$res - $($r.Note)" }
  $report.Add("| $($r.Step) | ``$($r.Command)`` | $($r.Exit) | $res |")
}
$report.Add('')
$report.Add("Failing unit tests: $($failing.Count)")
foreach ($f in $failing) {
  $tag = 'NEW'
  if ($unexpected -notcontains $f) { $tag = 'BASELINE' }
  $report.Add("- [$tag] $f")
}
$report.Add('')
if ($bundles.Count -gt 0) { $report.Add('Bundle: ' + ($bundles -join '; ')) } else { $report.Add('Bundle: none produced') }
$report.Add("Artifact directory: $Out")
$tv = 'no'
if ($shellVerified) { $tv = 'yes' }
$report.Add("Tauri shell verified: $tv")
$report.Add("Overall: $overall (exit $code)")
$report.Add('')
$report.Add("EVIDENCE: scripts/verify.ps1 @ $sha -> $overall (exit $code) | $(Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz') | $Out")

Set-Content -LiteralPath (Join-Path $Out 'report.md') -Value $report -Encoding UTF8
Write-Log ''
foreach ($line in $report) { Write-Log $line }
exit $code
