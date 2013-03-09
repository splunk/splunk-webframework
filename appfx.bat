@echo off

setlocal enableextensions enabledelayedexpansion

set SPLUNKHOME=%SPLUNK_HOME%
set SCRIPTPATH=%CD%
set SPLUNKHOME_FILE="!SCRIPTPATH!\.splunkhome"

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
set PATH="%SCRIPTPATH%\node_modules\.bin;%SPLUNK_HOME%\bin"

@rem Add our base Python packages to PYTHONPATH
set PYTHONPATH=";%SCRIPTPATH%\contrib\splunk-sdk-python;%SCRIPTPATH%\contrib\envoy;%SCRIPTPATH%\contrib\argh;%SCRIPTPATH%\contrib\django;%PYTHONPATH%"

@rem We have to make the contrib/django directory to make sure
@rem Python sees it in the PYTHONPATH
mkdir %SCRIPTPATH%\contrib\django 2> nul

@rem Run the actual CLI environment
"%SPLUNK_HOME%"\bin\splunk cmd python "%SCRIPTPATH%\cli\appdo.py" %*
