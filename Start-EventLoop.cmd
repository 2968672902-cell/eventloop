@echo off
cd /d "%~dp0"
echo EventLoop local shared prototype
echo Keep this window open while testing.
echo Publisher: http://127.0.0.1:8787/
echo Receiver:  http://localhost:8787/
echo.
node --no-warnings shared\server.mjs
echo.
echo Server stopped. Press any key to close.
pause >nul
