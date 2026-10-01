#!/usr/bin/env bash
# MCP for Unity 자동 설치 (macOS / Linux)
# - Git, uv, Python 3.10+, Claude Code CLI 가 없으면 설치
# - Unity 프로젝트 Packages/manifest.json 에 MCP for Unity 패키지 추가
# - Claude Code 에 UnityMCP 서버 등록 (HTTP, http://localhost:8080/mcp)
#
# 사용법: bash install-unity-mcp.sh [Unity 프로젝트 경로]

set -euo pipefail

PACKAGE_NAME="com.coplaydev.unity-mcp"
PACKAGE_URL="https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main"
MCP_NAME="UnityMCP"
MCP_URL="http://localhost:8080/mcp"
PROJECT_PATH="${1:-}"

export PATH="$HOME/.local/bin:$PATH"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m[OK]\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m[!]\033[0m %s\n' "$1"; }
fail() { printf '\n\033[31m[실패]\033[0m %s\n' "$1" >&2; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }
is_unity_project() { [ -n "$1" ] && [ -f "$1/Packages/manifest.json" ]; }

# 1. Git
step "Git 확인"
if ! has git || ! git --version >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ]; then
    if has brew; then
      brew install git
    else
      xcode-select --install || true
      fail "Xcode Command Line Tools 설치 창이 열렸습니다. 설치가 끝나면 이 스크립트를 다시 실행하세요."
    fi
  else
    fail "git 이 없습니다. 패키지 관리자로 설치한 뒤 다시 실행하세요 (예: sudo apt install git)."
  fi
fi
ok "$(git --version)"

# 2. uv
step "uv 확인"
if ! has uv; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
has uv || fail "uv 설치 후에도 uv 를 찾을 수 없습니다. 새 터미널에서 다시 실행하세요."
ok "$(uv --version)"

# 3. Python 3.10+ (uv 가 관리하는 Python 사용)
step "Python 3.10+ 확인"
PYTHON="$(uv python find '>=3.10' 2>/dev/null || true)"
if [ -z "$PYTHON" ]; then
  uv python install 3.12
  PYTHON="$(uv python find '>=3.10')"
fi
[ -n "$PYTHON" ] || fail "Python 3.10+ 를 준비하지 못했습니다."
ok "$PYTHON"

# 4. Claude Code CLI
step "Claude Code 확인"
if ! has claude; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
has claude || fail "Claude Code 설치 후에도 claude 를 찾을 수 없습니다. 새 터미널에서 다시 실행하세요."
ok "$(claude --version)"

# 5. Unity 프로젝트 선택
step "Unity 프로젝트 확인"
if ! is_unity_project "$PROJECT_PATH" && is_unity_project "$PWD"; then
  PROJECT_PATH="$PWD"
fi
if ! is_unity_project "$PROJECT_PATH" && [ "$(uname)" = "Darwin" ]; then
  PROJECT_PATH="$(osascript -e 'POSIX path of (choose folder with prompt "Unity 프로젝트 폴더를 선택하세요 (Assets, Packages 폴더가 있는 곳)")' 2>/dev/null || true)"
  PROJECT_PATH="${PROJECT_PATH%/}"
fi
if ! is_unity_project "$PROJECT_PATH"; then
  read -r -p "Unity 프로젝트 폴더 경로를 입력하세요: " PROJECT_PATH || true
  PROJECT_PATH="${PROJECT_PATH%/}"
fi
is_unity_project "$PROJECT_PATH" || fail "Unity 프로젝트가 아닙니다 (Packages/manifest.json 없음): $PROJECT_PATH"
PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"
ok "$PROJECT_PATH"

VERSION_FILE="$PROJECT_PATH/ProjectSettings/ProjectVersion.txt"
if [ -f "$VERSION_FILE" ]; then
  version="$(sed -n 's/^m_EditorVersion:[[:space:]]*\([0-9]*\)\.\([0-9]*\).*/\1 \2/p' "$VERSION_FILE" | head -n 1)"
  if [ -n "$version" ]; then
    read -r major minor <<<"$version"
    if [ "$major" -lt 2021 ] || { [ "$major" -eq 2021 ] && [ "$minor" -lt 3 ]; }; then
      warn "Unity $major.$minor 는 지원되지 않을 수 있습니다 (2021.3 LTS 이상 필요)."
    fi
  fi
fi

# 6. manifest.json 에 패키지 추가
step "MCP for Unity 패키지 추가"
MANIFEST="$PROJECT_PATH/Packages/manifest.json"
result="$("$PYTHON" - "$MANIFEST" "$PACKAGE_NAME" "$PACKAGE_URL" <<'PY'
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
PY
)" || fail "manifest.json 수정에 실패했습니다."
ok "$result"

# 7. Claude Code 에 MCP 서버 등록 (프로젝트 로컬 범위)
step "Claude Code 에 UnityMCP 등록"
(
  cd "$PROJECT_PATH"
  claude mcp remove --scope local "$MCP_NAME" >/dev/null 2>&1 || true
  claude mcp add --scope local --transport http "$MCP_NAME" "$MCP_URL"
) || fail "claude mcp add 에 실패했습니다."
ok "$MCP_NAME -> $MCP_URL"

printf '\n\033[32m설치 완료! 남은 단계:\033[0m\n'
echo "  1) Unity 에서 이 프로젝트를 엽니다 (이미 열려 있으면 창을 한 번 클릭). 패키지가 자동으로 받아집니다."
echo "  2) 설정 마법사가 뜨면 Done. Window > MCP for Unity 에서 [Start Server] 를 누릅니다."
echo "     (Advanced 의 \"Auto-Start Server on Editor Load\" 를 켜 두면 다음부터 자동 시작)"
echo "  3) 터미널에서:  cd \"$PROJECT_PATH\" && claude"
echo "     Claude Code 에서 /mcp 를 입력해 UnityMCP 가 connected 인지 확인합니다."
