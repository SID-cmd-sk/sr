@echo off
title SR Platform - Uninstall Startup
echo Removing SR Platform server from Windows startup...
set EXE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SR-Platform-Launcher.exe
set LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SR-Platform-Launcher.lnk
if exist "%EXE%" (
    del /F "%EXE%" >nul 2>&1
    echo Removed EXE from startup.
)
if exist "%LNK%" (
    del /F "%LNK%" >nul 2>&1
    echo Removed shortcut from startup.
)
if not exist "%EXE%" if not exist "%LNK%" (
    echo No SR Platform startup entry found.
) else (
    echo Cleanup complete.
)
pause
