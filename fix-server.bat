@echo off
title JobShield — Backend Fix & Restart
color 0A

echo.
echo  =====================================================
echo   JobShield Backend — Nuclear Clean + Reinstall
echo  =====================================================
echo.

cd /d "%~dp0backend"
echo [1/5] Working directory: %CD%
echo.

echo [2/5] Killing any node processes holding port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo       Done.
echo.

echo [3/5] Deleting node_modules and package-lock.json...
if exist node_modules (
    rmdir /s /q node_modules
    echo       node_modules deleted.
) else (
    echo       node_modules not found, skipping.
)
if exist package-lock.json (
    del /f /q package-lock.json
    echo       package-lock.json deleted.
)
echo.

echo [4/5] Running npm install...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: npm install failed. Check your network connection.
    pause
    exit /b 1
)
echo.

echo [4b] Installing Puppeteer packages explicitly...
call npm install puppeteer puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth --save
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Puppeteer install failed.
    pause
    exit /b 1
)
echo.

echo [5/5] All packages installed. Starting server...
echo.
cls
title JobShield Backend — Running on :5000
echo  =====================================================
echo   JobShield Backend is starting...
echo  =====================================================
echo.
node server.js

pause
