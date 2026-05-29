@echo off
title SR Platform - Install Startup
echo Installing SR Platform server as Windows startup item...
set TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SR-Platform-Launcher.lnk
set SCRIPT=%~dp0local\run-server.vbs
if not exist "%SCRIPT%" (
    echo ERROR: run-server.vbs not found at "%SCRIPT%"
    pause
    exit /b 1
)
if exist "%~dp0local\start-server.exe" (
    set TARGET=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SR-Platform-Launcher.exe
    copy /Y "%~dp0local\start-server.exe" "%TARGET%" >nul
    echo Installed start-server.exe to Windows Startup folder.
) else (
    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%TARGET%'); $s.TargetPath = '%SCRIPT%'; $s.WindowStyle = 7; $s.Description = 'SR Platform Local Servers'; $s.WorkingDirectory = '%~dp0local'; $s.Save()"
    echo Installed run-server.vbs shortcut to Windows Startup folder.
)
echo SR Platform servers will start automatically on next login.
echo To remove, run uninstall-startup.bat
pause
