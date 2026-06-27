# Protein Scan ML Kit

Tiny Android-only OCR test harness for nutrition labels.

It uses Capacitor plus `@pantrist/capacitor-plugin-ml-kit-text-recognition`, which wraps Google ML Kit Text Recognition on Android.

## Commands

```powershell
npm install
npm run sync
cd android
.\gradlew.bat assembleDebug
```

The debug APK will be under:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install with:

```powershell
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe install -r android/app/build/outputs/apk/debug/app-debug.apk
```
