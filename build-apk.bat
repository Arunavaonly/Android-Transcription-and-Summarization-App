@echo off
echo Building Voice Transcription APK...

REM Set Android SDK location - update this path to your actual Android SDK location
set ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk

REM Create local.properties file with SDK location
echo sdk.dir=%ANDROID_HOME% > android\local.properties

REM Sync Capacitor project
call npx cap sync

REM Build APK with Gradle
cd android
call .\gradlew assembleDebug

echo.
echo If build was successful, APK is located at:
echo android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Install it on your Android device by transferring the file and installing it.
echo Remember to enable "Install from Unknown Sources" in your device settings.
pause 