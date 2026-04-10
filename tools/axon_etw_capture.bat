@echo off
REM ===========================================================================
REM Axon servo programmer USB ETW capture, Windows-on-ARM friendly.
REM
REM Run from an Administrator Command Prompt:
REM     tools\axon_etw_capture.bat
REM
REM Or right-click the file in Explorer and "Run as administrator".
REM
REM This script:
REM   1. Deletes any leftover trace named "axon-usb"
REM   2. Starts an ETW trace covering all 5 USB providers on Windows ARM
REM   3. Pauses while you do the test sequence in the Axon .exe
REM   4. Stops the trace
REM   5. Converts the .etl binary to .xml using tracerpt
REM   6. Prints the file paths so you can drag them to the Mac
REM
REM Outputs:
REM   %USERPROFILE%\Desktop\axon-usb.etl    (binary trace)
REM   %USERPROFILE%\Desktop\axon-usb.xml    (parseable text)
REM ===========================================================================

setlocal enableextensions

set TRACE_NAME=axon-usb
set ETL_PATH=%USERPROFILE%\Desktop\axon-usb.etl
set XML_PATH=%USERPROFILE%\Desktop\axon-usb.xml

REM ---- Sanity-check we are running elevated ---------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: this script needs to run as Administrator.
    echo Right-click axon_etw_capture.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo.
echo === Step 1/6 — Cleaning up any leftover trace session ===
logman delete %TRACE_NAME% -ets >nul 2>&1

echo.
echo === Step 2/6 — Starting trace with USBPORT ===
logman create trace %TRACE_NAME% -ow ^
    -o "%ETL_PATH%" ^
    -p "Microsoft-Windows-USB-USBPORT" 0xffffffffffffffff 0xff ^
    -nb 64 256 -bs 1024 ^
    -mode Circular -f bincirc -max 16384 ^
    -ets
if errorlevel 1 goto fail_create

echo.
echo === Step 3/6 — Adding the xHCI providers ===
logman update %TRACE_NAME% -p "Microsoft-Windows-USB-UCX"      0xffffffffffffffff 0xff -ets
logman update %TRACE_NAME% -p "Microsoft-Windows-USB-USBHUB3"  0xffffffffffffffff 0xff -ets
logman update %TRACE_NAME% -p "Microsoft-Windows-USB-USBXHCI"  0xffffffffffffffff 0xff -ets
logman update %TRACE_NAME% -p "Microsoft-Windows-USB-USBHUB"   0xffffffffffffffff 0xff -ets

echo.
echo === Step 4/6 — Trace is RUNNING ===
echo.
echo Now do this in the VM (do NOT close this window):
echo.
echo     1. Launch  Axon_Servo_Programming_Software_v1.0.5.exe
echo     2. Wait for "Servo plug-in!" in the log pane
echo     3. Click  Read
echo     4. Click  Exit
echo.
echo Then come back here and press any key to stop the trace.
echo.
pause

echo.
echo === Step 5/6 — Stopping trace and writing %ETL_PATH% ===
logman stop %TRACE_NAME% -ets

echo.
echo === Step 6/6 — Converting ETL to XML with tracerpt ===
tracerpt "%ETL_PATH%" -o "%XML_PATH%" -of XML -lr -y

echo.
echo === Done ===
echo.
dir "%ETL_PATH%" "%XML_PATH%" 2>nul
echo.
echo If both files exist above, copy them to the Mac so I can analyse them:
echo.
echo     %ETL_PATH%
echo     %XML_PATH%
echo.
echo Drag them from Windows Explorer to a Mac Finder window, or copy via
echo \\Mac\Home if shared folders are working.
echo.
pause
exit /b 0


:fail_create
echo.
echo ERROR: logman create failed. Possible causes:
echo   - Not running as Administrator (try right-click -^> Run as administrator)
echo   - Trace session "%TRACE_NAME%" still exists (delete with: logman delete %TRACE_NAME% -ets)
echo   - The Microsoft-Windows-USB-USBPORT provider is not registered on this build
echo.
pause
exit /b 1
