# Voice Transcription Mobile App

This is a mobile version of the Voice Transcription and Summarization app, built with Capacitor to provide native speech recognition capabilities on Android devices.

## Features

- Native speech recognition using Android's built-in capabilities
- Transcription of spoken text
- Summarization using the backend API
- Works offline for the transcription part

## Setup and Build Instructions

### Prerequisites

- Node.js and npm
- JDK 11 or newer (for Android builds)
- Android command line tools (for building without Android Studio)

### Installation

1. Install dependencies:
   ```
   npm install
   ```

2. Initialize Capacitor:
   ```
   npm run build
   ```

3. Add Android platform:
   ```
   npm run init-android
   ```

### Building an APK (without Android Studio)

1. Make sure you have set up the Android SDK environment variables:
   ```
   export ANDROID_SDK_ROOT=/path/to/your/android/sdk
   ```

2. Build a debug APK:
   ```
   npm run build-debug
   ```

3. The APK will be available at `android/app/build/outputs/apk/debug/app-debug.apk`

### Testing the Web Version

You can test the web version (without native features) using:
```
npm start
```

This will serve the app on http://localhost:3000

## Installation on Android Devices

1. Enable "Install from Unknown Sources" in your device settings
2. Transfer the APK to your device
3. Tap on the APK file to install

## Notes

- The app uses native Android speech recognition instead of Web Speech API
- The summarization requires an internet connection to connect to the backend API
- The app will request microphone permissions on first use 