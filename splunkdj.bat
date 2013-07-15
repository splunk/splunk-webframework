@echo off

setlocal enableextensions enabledelayedexpansion

set SPLUNKHOME=%SPLUNK_HOME%
set SCRIPTPATH=%CD%
set SPLUNKHOME_FILE="!SCRIPTPATH!\.splunkhome"


@rem Try to run an administrator-level command to verify that this
@rem script is being run as administrator.  The "net session" command
@rem is typically used for this purpose.  This command is available on
@rem Windows XP through Windows 8.
net session >nul 2>&1
if NOT %errorLevel% == 0 (
   echo Administrative permission is required to run this file.
   goto :eof
)

if exist !SPLUNKHOME_FILE! (
    set /p HOMEPATH=<!SPLUNKHOME_FILE!
) else (
    set HOMEPATH=
)

if not exist "!HOMEPATH!" (
    set /P HOMEPATH="Where is Splunk installed (version 5.0 or later is required)? [!SPLUNKHOME!]: "
    
    if "!HOMEPATH!" == "" (
        if "!SPLUNKHOME!" == "" (
            echo "Must supply a 'SPLUNK_HOME' value"
            goto :eof
        ) else (
            set HOMEPATH=!SPLUNKHOME!
        )
    )

    if not exist "!HOMEPATH!" (
        echo "!HOMEPATH! does not exist. Please provide a valid SPLUNK_HOME value"
        goto :eof
    )

    echo !HOMEPATH! > !SPLUNKHOME_FILE!
)
(
    endlocal
    set SPLUNK_HOME=%HOMEPATH%
    set SCRIPTPATH=%SCRIPTPATH%
)

@rem Trim the SPLUNK_HOME variable of spaces
setlocal enabledelayedexpansion enableextensions 
for /f "tokens=* delims= " %%a in ("!SPLUNK_HOME!") do set SPLUNK_HOME=%%a
for /l %%a in (1,1,100) do if "!SPLUNK_HOME:~-1!"==" " set SPLUNK_HOME=!SPLUNK_HOME:~0,-1!
(
    endlocal
    set "SPLUNK_HOME=%SPLUNK_HOME:"=%"
)

@rem Add the node_modules bin directory to the PATH
set PATH=%PATH%;%SCRIPTPATH%\node_modules\.bin;%SPLUNK_HOME%\bin

@rem Run the actual CLI environment
"%SPLUNK_HOME%"\bin\splunk cmd python "%SCRIPTPATH%\cli\appdo.py" %*
