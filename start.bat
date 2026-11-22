@echo off
REM Top-level launcher: gets the newest version, then starts the app in the "goldfish" folder next to this file.
REM Optional: start.bat --data-dir "D:\path\to\folder"
if not exist "%~dp0goldfish\server.py" (
  echo Could not find goldfish\server.py next to this file.
  echo Keep start.bat inside the downloaded folder, together with the "goldfish" folder.
  pause
  exit /b 1
)
REM Keep the next line as ONE line: the update may replace this file while it runs.
call "%~dp0goldfish\start.bat" %* & exit /b
