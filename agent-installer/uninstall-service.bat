@echo off
setlocal

:: --- CONFIGURATION ---
set "SERVICE_NAME=TallyAgent"

:: Get the current folder path
set "CURRENT_DIR=%~dp0"

echo ==================================================
echo   UNINSTALLING SHIPPEASY AGENT
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
echo [1/2] Stopping service...
"%CURRENT_DIR%nssm.exe" stop %SERVICE_NAME% >nul 2>&1

echo [2/2] Removing service...
:: The 'confirm' flag bypasses the "Are you sure?" popup
"%CURRENT_DIR%nssm.exe" remove %SERVICE_NAME% confirm

echo.
echo ==================================================
echo   SUCCESS! The service has been removed.
echo ==================================================
pause