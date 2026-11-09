@echo off
rem Installer bauen per Doppelklick: Node und Cargo in den Pfad, dann tauri build (kein PowerShell, keine Execution Policy).
rem Ergebnis: src-tauri\target\release\bundle\nsis\OpenForm CAD_<Version>_x64-setup.exe
setlocal
set "NODE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
set "PATH=%NODE%;%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "%~dp0"
call npm.cmd run desktop:build
if errorlevel 1 (echo. & echo Bau fehlgeschlagen, siehe oben.) else (echo. & echo Fertig: src-tauri\target\release\bundle\nsis\ & start "" "src-tauri\target\release\bundle\nsis")
pause
