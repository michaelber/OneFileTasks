# OneFileTasks

A local-first, single-file task manager built with React and Tauri. Organize your work with hierarchical tasks, multiple views, and rich text notes—all stored locally with no cloud dependency. Deploy as a standalone HTML file or a native desktop application.

## Features

- **Hierarchical Task Organization** - Create nested tasks, projects, and folders
- **Multiple Views** - Switch between Next Actions, Projects, Contexts, and All Tasks
- **Rich Text Editing** - Format task notes with bold, italic, links, and lists
- **Recurring Tasks** - Set up daily, weekly, monthly, or yearly task recurrence
- **File Sync** - Optional JSON file sync with File System Access API
- **Local-First Architecture** - All data stored locally in IndexedDB, no cloud required
- **Dark Mode** - Full dark mode support with Tailwind CSS
- **Single-File Distribution** - Build as a standalone HTML file for easy sharing
- **Cross-Platform Desktop** - Package as native Tauri app for Windows, macOS, and Linux

## Demo

- Standalone HTML file demo: https://michaelber.github.io/OneFileTasks/dist/index.html (download and run locally)
- Example data: https://michaelber.github.io/OneFileTasks/demo/demodata-one-file-tasks.json

![OneFileTasks demo screenshot](demo/screenshot.png)

## Release

- Download latest release: https://github.com/michaelber/OneFileTasks/releases

## Development

**Prerequisites:** Node.js 18+, Rust 1.80+ (required only for Tauri desktop builds)

### Run in Browser

1. Install dependencies:
   ```
   npm install
   ```
2. Start the development server:
   ```
   npm run dev
   ```

### Build Options

#### Single HTML File (Browser-Based)
Create a standalone HTML file with all code and assets bundled:
```
npm run build
```
Output: `dist/index.html` - open directly in any browser, no server needed.

#### Desktop Application (Tauri)
Build a native desktop application for Windows, macOS, or Linux:
```
npm run tauri build
```
Output: Executable bundles in `src-tauri/target/release/bundle/`

##### Generate custom app icon (optional)
```
npm run tauri icon ./src-tauri/icons/icon.svg
```

#### Android Application (Tauri)
To build the Android APK locally, ensure you have [Rust](https://rustup.rs/) and [Android Studio / Android SDK](https://developer.android.com/studio) installed, then follow these steps:

### Android Development

1. **Run with Live Reload:** To test on a connected device or emulator with HMR:
   ```bash
   npm run android:dev
   ```
2. **Open in Android Studio:** To use Android Studio's native tools (Debugger, Profiler):
   ```bash
   npm run android:open
   ```

### Android Production Build

1. **Install Dependencies:** Open a terminal in the project folder and run:
   ```bash
   npm install
   ```
2. **Initialize Android Project:** Run the following command to generate the Android project files (this creates the `src-tauri/gen/android` folder):
   ```bash
   npx tauri android init
   ```
3. **Configure Keystore (Optional for Release):** To automatically sign the app during the build process, fill in your keystore details in the `.env` file:
   ```env
   TAURI_ANDROID_KEYSTORE_PATH=./my-release-key.jks
   TAURI_ANDROID_KEYSTORE_PASSWORD=your_password
   TAURI_ANDROID_KEY_ALIAS=your_alias
   TAURI_ANDROID_KEY_PASSWORD=your_key_password
   ```
4. **Build the APK:** Run the build command:
   If using the `.env` file, ensure the variables are exported to your shell. Using `npx dotenv-cli` ensures the environment variables are loaded into the build process:
   ```bash
   # Run the build with env variables loaded
   npm run android:release
   ```

Once the build completes, your signed App Bundle (.aab) for Google Play will be located at:
`src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`
