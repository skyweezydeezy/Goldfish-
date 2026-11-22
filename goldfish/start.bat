@echo off
REM ICEYfish - double-click to start. It first gets the newest version, then opens the app.
REM Uses the ICEYFISH_DATA_DIR environment variable for your local Scryfall data folder. To use another folder:
REM   start.bat --data-dir "D:\path\to\folder"
REM To start without checking for a new version:  start.bat --no-update
cd /d "%~dp0"
if not exist "server.py" (
  echo server.py was not found in: %cd%
  echo Run start.bat from inside the "goldfish" folder, next to server.py and the "static" folder.
  pause
  exit /b 1
)
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python 3 was not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
  pause
  exit /b 1
)
REM Keep the next line as ONE line: the update may replace this file while it runs.
if exist "update.py" (%PY% update.py %* & %PY% server.py %* & pause & exit /b) else (%PY% server.py %* & pause & exit /b)
