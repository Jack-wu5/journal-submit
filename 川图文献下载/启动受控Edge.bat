@echo off
rem 启动受控Edge.bat — 启动带 CDP 调试端口(9333)的 Edge
rem 配置目录独立于日常使用，登录态持久化（已含 sclib 平台登录）
rem 若 Edge 已在运行且无调试端口，请先关闭全部 Edge 窗口再运行本脚本
chcp 65001 >nul
set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set PROFILE=C:\Users\user\Desktop\Zcode_test\sclib_work\edge-profile

if exist "%PROFILE%" goto launch
mkdir "%PROFILE%"

:launch
start "" %EDGE% --remote-debugging-port=9333 --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --window-size=1400,900 "https://www.sclib.cn/"
echo 已启动受控 Edge（CDP: http://127.0.0.1:9333，配置目录: %PROFILE%）
