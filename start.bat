@echo off
REM Top-level launcher: starts the app in the "goldfish" folder next to this file.
REM Optional: start.bat --scrymirror "D:\ScryMirror"
if not exist "%~dp0goldfish\server.py" (
  echo Could not find goldfish\server.py next to this file.
  echo Keep start.bat inside the downloaded folder, together with the "goldfish" folder.
  pause
  exit /b 1
)
call "%~dp0goldfish\start.bat" %*
