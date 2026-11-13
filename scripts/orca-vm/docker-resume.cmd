@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker-resume.ps1"
exit /b %ERRORLEVEL%
