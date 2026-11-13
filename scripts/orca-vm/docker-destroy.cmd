@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-destroy.ps1"
exit /b %ERRORLEVEL%
