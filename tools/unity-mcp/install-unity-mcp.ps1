# MCP for Unity 자동 설치 (Windows)
# - Git, uv, Python 3.10+, Claude Code CLI 가 없으면 설치
# - Unity 프로젝트 Packages/manifest.json 에 MCP for Unity 패키지 추가
# - Claude Code 에 UnityMCP 서버 등록 (HTTP, http://localhost:8080/mcp)
#
# 사용법: install-unity-mcp.cmd 더블클릭
#   또는: powershell -ExecutionPolicy Bypass -File install-unity-mcp.ps1 [Unity 프로젝트 경로]

param([string]$ProjectPath)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$PackageName = 'com.coplaydev.unity-mcp'
$PackageUrl  = 'https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main'
$McpName     = 'UnityMCP'
$McpUrl      = 'http://localhost:8080/mcp'
$LocalBin    = Join-Path $HOME '.local\bin'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Has($cmd)  { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$LocalBin;$machine;$user"
}

# 네이티브 명령의 실패/stderr 를 무시하고 실행
function Invoke-Quiet([scriptblock]$Block) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Block *> $null } catch { } finally { $ErrorActionPreference = $old }
}

# 3.10 이상 Python 경로 (없으면 $null)
function Find-Python {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = & uv python find '>=3.10' 2>$null } catch { $out = $null } finally { $ErrorActionPreference = $old }
    if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
    return ($out | Select-Object -Last 1).ToString().Trim()
}

function Winget-Install($id) {
    if (-not (Has 'winget')) {
        throw "winget 이 없어 $id 를 자동 설치할 수 없습니다. 직접 설치한 뒤 다시 실행하세요."
    }
    & winget install --id $id -e --source winget --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
}

function Test-UnityProject($path) {
    return $path -and (Test-Path (Join-Path $path 'Packages\manifest.json'))
}

try {
    Refresh-Path

    # 1. Git (Unity Package Manager 와 Claude Code 가 사용)
    Step 'Git 확인'
    if (-not (Has 'git')) { Winget-Install 'Git.Git' }
    if (-not (Has 'git')) { throw 'Git 설치 후에도 git 을 찾을 수 없습니다. 창을 닫고 다시 실행하세요.' }
    Ok (& git --version)

    # 2. uv
    Step 'uv 확인'
    if (-not (Has 'uv')) {
        Invoke-RestMethod 'https://astral.sh/uv/install.ps1' | Invoke-Expression
        Refresh-Path
    }
    if (-not (Has 'uv')) { throw 'uv 설치 후에도 uv 를 찾을 수 없습니다. 창을 닫고 다시 실행하세요.' }
    Ok (& uv --version)

    # 3. Python 3.10+ (uv 가 관리하는 Python 사용)
    Step 'Python 3.10+ 확인'
    $python = Find-Python
    if (-not $python) {
        & uv python install 3.12
        $python = Find-Python
    }
    if (-not $python) { throw 'Python 3.10+ 를 준비하지 못했습니다.' }
    Ok "$python"

    # 4. Claude Code CLI
    Step 'Claude Code 확인'
    if (-not (Has 'claude')) {
        Invoke-RestMethod 'https://claude.ai/install.ps1' | Invoke-Expression
        Refresh-Path
    }
    if (-not (Has 'claude')) { throw 'Claude Code 설치 후에도 claude 를 찾을 수 없습니다. 창을 닫고 다시 실행하세요.' }
    Ok (& claude --version)

    # 5. Unity 프로젝트 선택
    Step 'Unity 프로젝트 확인'
    if (-not (Test-UnityProject $ProjectPath) -and (Test-UnityProject (Get-Location).Path)) {
        $ProjectPath = (Get-Location).Path
    }
    if (-not (Test-UnityProject $ProjectPath)) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
            $dlg.Description = 'Unity 프로젝트 폴더를 선택하세요 (Assets, Packages 폴더가 있는 곳)'
            if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $ProjectPath = $dlg.SelectedPath }
        } catch { }
    }
    if (-not (Test-UnityProject $ProjectPath)) {
        $answer = Read-Host 'Unity 프로젝트 폴더 경로를 입력하세요'
        if ($answer) { $ProjectPath = $answer.Trim('" ') }
    }
    if (-not (Test-UnityProject $ProjectPath)) {
        throw "Unity 프로젝트가 아닙니다 (Packages\manifest.json 없음): $ProjectPath"
    }
    $ProjectPath = (Resolve-Path $ProjectPath).Path
    Ok $ProjectPath

    $versionFile = Join-Path $ProjectPath 'ProjectSettings\ProjectVersion.txt'
    if (Test-Path $versionFile) {
        $m = Select-String -Path $versionFile -Pattern 'm_EditorVersion:\s*(\d+)\.(\d+)' | Select-Object -First 1
        if ($m) {
            $major = [int]$m.Matches[0].Groups[1].Value
            $minor = [int]$m.Matches[0].Groups[2].Value
            if ($major -lt 2021 -or ($major -eq 2021 -and $minor -lt 3)) {
                Warn "Unity $major.$minor 는 지원되지 않을 수 있습니다 (2021.3 LTS 이상 필요)."
            }
        }
    }

    # 6. manifest.json 에 패키지 추가
    Step 'MCP for Unity 패키지 추가'
    $manifest = Join-Path $ProjectPath 'Packages\manifest.json'
    $editor = Join-Path ([IO.Path]::GetTempPath()) 'add_unity_mcp_package.py'
    @'
import json, sys
path, name, url = sys.argv[1:4]
with open(path, encoding="utf-8-sig") as f:
    original = f.read()
data = json.loads(original)
deps = data.setdefault("dependencies", {})
if name in deps:
    print("already present: " + deps[name])
    sys.exit(0)
deps[name] = url
with open(path + ".bak-unity-mcp", "w", encoding="utf-8", newline="") as f:
    f.write(original)
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("added: " + url + " (backup: manifest.json.bak-unity-mcp)")
'@ | Set-Content -Path $editor -Encoding ASCII
    $result = & $python $editor $manifest $PackageName $PackageUrl
    if ($LASTEXITCODE -ne 0) { throw 'manifest.json 수정에 실패했습니다.' }
    Remove-Item $editor -Force
    Ok "$result"

    # 7. Claude Code 에 MCP 서버 등록 (프로젝트 로컬 범위)
    Step 'Claude Code 에 UnityMCP 등록'
    Push-Location $ProjectPath
    try {
        Invoke-Quiet { & claude mcp remove --scope local $McpName }
        & claude mcp add --scope local --transport http $McpName $McpUrl
        if ($LASTEXITCODE -ne 0) { throw 'claude mcp add 에 실패했습니다.' }
    } finally { Pop-Location }
    Ok "$McpName -> $McpUrl"

    Write-Host ''
    Write-Host '설치 완료! 남은 단계:' -ForegroundColor Green
    Write-Host '  1) Unity 에서 이 프로젝트를 엽니다 (이미 열려 있으면 창을 한 번 클릭). 패키지가 자동으로 받아집니다.'
    Write-Host '  2) 설정 마법사가 뜨면 Done. Window > MCP for Unity 에서 [Start Server] 를 누릅니다.'
    Write-Host '     (Advanced 의 "Auto-Start Server on Editor Load" 를 켜 두면 다음부터 자동 시작)'
    Write-Host "  3) 터미널에서:  cd `"$ProjectPath`"  ;  claude"
    Write-Host '     Claude Code 에서 /mcp 를 입력해 UnityMCP 가 connected 인지 확인합니다.'
}
catch {
    Write-Host ''
    Write-Host "[실패] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
