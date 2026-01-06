@echo off
setlocal

:: --- CONFIGURATION ---
set "SERVICE_NAME=TallyAgent"
set "DISPLAY_NAME=Shippeasy Tally Agent"
set "DESCRIPTION=Background service for syncing Tally data."

:: Get the current folder path where this script is running
set "CURRENT_DIR=%~dp0"
:: Remove trailing backslash if present to avoid quote escaping issues
if "%CURRENT_DIR:~-1%"=="\" set "CURRENT_DIR=%CURRENT_DIR:~0,-1%"

echo ==================================================
echo   INSTALLING SHIPPEASY AGENT
echo ==================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with Admin privileges.
) else (
    echo [ERROR] You must right-click this file and choose "Run as Administrator".
    pause
    exit
)

echo.
echo [1/4] Stopping any existing service...
"%CURRENT_DIR%\nssm.exe" stop %SERVICE_NAME% >nul 2>&1

echo [2/4] Removing old versions...
"%CURRENT_DIR%\nssm.exe" remove %SERVICE_NAME% confirm >nul 2>&1

echo [3/4] Installing new service...
"%CURRENT_DIR%\nssm.exe" install %SERVICE_NAME% "%CURRENT_DIR%\shipeasy-tally-agent.exe"
"%CURRENT_DIR%\nssm.exe" set %SERVICE_NAME% DisplayName "%DISPLAY_NAME%"
"%CURRENT_DIR%\nssm.exe" set %SERVICE_NAME% Description "%DESCRIPTION%"
"%CURRENT_DIR%\nssm.exe" set %SERVICE_NAME% Start SERVICE_AUTO_START

:: CRITICAL: Set the directory so the app finds config.js and writes logs correctly
"%CURRENT_DIR%\nssm.exe" set %SERVICE_NAME% AppDirectory "%CURRENT_DIR%"

:: Set Logging
"%CURRENT_DIR%\nssm.exe" set %SERVICE_NAME% AppStdout "%CURRENT_DIR%\agent-out.log"
"%CURRENT_DIR%\nssm.exe" set %SERVICE_NAME% AppStderr "%CURRENT_DIR%\agent-err.log"

echo [4/4] Starting service...
"%CURRENT_DIR%\nssm.exe" start %SERVICE_NAME%

echo.
echo ==================================================
echo   SUCCESS! The agent is running in the background.
echo   You can close this window.
echo ==================================================
pause