@echo off
REM Same as start.bat, but also lets your phone / iPad on the same Wi-Fi open the app.
REM Windows may ask to allow Python through the firewall: choose "Private networks".
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py --lan %* & goto :end)
where python >nul 2>nul && (python server.py --lan %* & goto :end)
echo Python 3 was not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".
:end
pause
