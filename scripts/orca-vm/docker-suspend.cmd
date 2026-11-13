@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-suspend.ps1"
exit /b %ERRORLEVEL%
