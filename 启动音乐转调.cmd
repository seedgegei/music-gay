@echo off
setlocal
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0music_transposer_server.py"
  if errorlevel 1 pause
  exit /b
)
where python >nul 2>nul
if not errorlevel 1 (
  python "%~dp0music_transposer_server.py"
  if errorlevel 1 pause
  exit /b
)
echo Python 3 was not found. Please install Python 3 and try again.
pause
