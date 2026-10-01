@echo off
rem Double-click to install MCP for Unity and register it with Claude Code.
rem Optional: pass the Unity project folder as the first argument.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-unity-mcp.ps1" %*
echo.
pause
