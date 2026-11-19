@echo off
REM Same as start.bat, but also lets your phone / iPad on the same Wi-Fi open the app.
REM Windows may ask to allow Python through the firewall: choose "Private networks".
cd /d "%~dp0"
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python 3 was not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
  pause
  exit /b 1
)
REM Keep the next line as ONE line: the update may replace this file while it runs.
if exist "update.py" (%PY% update.py %* & %PY% server.py --lan %* & pause & exit /b) else (%PY% server.py --lan %* & pause & exit /b)
