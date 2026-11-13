@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-create.ps1"
exit /b %ERRORLEVEL%
