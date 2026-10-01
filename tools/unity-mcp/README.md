# Unity MCP 자동 설치

Unity 에디터를 Claude Code 에서 제어할 수 있게 [MCP for Unity](https://github.com/CoplayDev/unity-mcp) 를 설치하고 연결합니다.
**Unity 가 설치된 내 PC 에서** 실행하세요.

## 실행

| OS | 방법 |
|---|---|
| Windows | `install-unity-mcp.cmd` 더블클릭 → Unity 프로젝트 폴더 선택 |
| macOS / Linux | `bash install-unity-mcp.sh` → Unity 프로젝트 폴더 선택 |

프로젝트 경로를 인자로 넘길 수도 있습니다: `install-unity-mcp.cmd "C:\Projects\MyGame"`

## 스크립트가 하는 일

1. 없으면 설치: Git, [uv](https://docs.astral.sh/uv/), Python 3.10+ (uv 관리), Claude Code CLI
2. Unity 프로젝트 `Packages/manifest.json` 에 `com.coplaydev.unity-mcp` 추가 (원본은 `manifest.json.bak-unity-mcp` 로 백업)
3. 그 프로젝트 범위로 Claude Code 에 등록:
   `claude mcp add --scope local --transport http UnityMCP http://localhost:8080/mcp`

여러 번 실행해도 안전합니다 (이미 설치된 항목은 건너뜀).

## 실행 후 남은 단계

1. Unity 에서 프로젝트를 엽니다. 패키지가 자동으로 받아집니다.
2. 설정 마법사가 뜨면 **Done** → **Window > MCP for Unity** 에서 **Start Server**.
   Advanced 의 **Auto-Start Server on Editor Load** 를 켜 두면 다음부터 자동 시작됩니다.
3. 프로젝트 폴더에서 `claude` 실행 → `/mcp` 에서 `UnityMCP` 가 connected 인지 확인.

## 문제 해결

- **No Unity Instances found**: Unity 에서 Start Server 를 눌렀는지 확인 후 Claude Code 재시작
- **Error when executing git command** (Unity): Git 설치 후 Unity Hub 를 완전히 종료했다가 다시 실행
- **되돌리기**: `manifest.json.bak-unity-mcp` 를 `manifest.json` 으로 복원, `claude mcp remove --scope local UnityMCP`
