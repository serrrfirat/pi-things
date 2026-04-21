---
name: macos-app-distribution
description: Build, sign, notarize, and distribute macOS apps as DMG files. Use when creating DMG installers, code signing apps, notarizing for Gatekeeper, or sharing macOS apps with testers. Covers Xcode builds, Developer ID signing, Apple notarization, and distribution workflows.
---

# macOS App Distribution

Complete workflow for building, signing, notarizing, and distributing macOS applications as DMG files for direct distribution outside the App Store.

## Quick Start

For a typical distribution workflow:

```bash
# 1. Build the app
xcodebuild -project MyApp.xcodeproj -scheme MyApp -configuration Release -archivePath build/MyApp.xcarchive archive

# 2. Export the app
xcodebuild -exportArchive -archivePath build/MyApp.xcarchive -exportPath build/export -exportOptionsPlist ExportOptions.plist

# 3. Create and sign DMG
./scripts/create-dmg.sh

# 4. Notarize
xcrun notarytool submit MyApp.dmg --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID --password @keychain:AC_PASSWORD --wait

# 5. Staple
xcrun stapler staple MyApp.dmg
```

## Prerequisites

Before distributing macOS apps, you need:

### 1. Apple Developer Account ($99/year)
- Enroll at [developer.apple.com](https://developer.apple.com)
- Required for Developer ID certificate and notarization
- Without this, apps trigger Gatekeeper warnings

### 2. Certificates and Profiles
Generate in Xcode or Apple Developer Portal:
- **Developer ID Application** - for signing the .app
- **Developer ID Installer** - for signing .pkg installers (optional)

### 3. App-Specific Password (for notarization)
1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign In → Security → App-Specific Passwords
3. Generate password for "notarytool"
4. Store in Keychain:
```bash
xcrun notarytool store-credentials "AC_PASSWORD" \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

## Step-by-Step Workflow

### Step 1: Prepare Your Xcode Project

**Configure Signing:**
1. Open project in Xcode
2. Select target → Signing & Capabilities
3. Set Team to your Apple Developer team
4. Signing Certificate: "Developer ID Application"
5. Ensure Hardened Runtime is enabled

**Set Version:**
```bash
# Update version in Info.plist or build settings
# Marketing Version (CFBundleShortVersionString): 1.0.0
# Build Number (CFBundleVersion): 1
```

**Entitlements (if needed):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.hardened-runtime</key>
    <true/>
    <!-- Add other entitlements as needed -->
</dict>
</plist>
```

### Step 2: Create Export Options Plist

Create `ExportOptions.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
```

### Step 3: Build and Archive

**Using xcodebuild:**
```bash
# Clean build folder
rm -rf build/

# Archive
xcodebuild -project MyApp.xcodeproj \
  -scheme MyApp \
  -configuration Release \
  -archivePath build/MyApp.xcarchive \
  archive

# Export
xcodebuild -exportArchive \
  -archivePath build/MyApp.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ExportOptions.plist
```

**Using Xcode GUI:**
1. Product → Archive
2. Window → Organizer
3. Distribute App → Developer ID → Export

### Step 4: Verify Code Signing

```bash
# Check signature
codesign -dv --verbose=4 build/export/MyApp.app

# Verify signature is valid
codesign --verify --deep --strict build/export/MyApp.app

# Check entitlements
codesign -d --entitlements :- build/export/MyApp.app

# Verify Gatekeeper will accept
spctl --assess --type execute build/export/MyApp.app
```

### Step 5: Create DMG

**Option A: Simple DMG (hdiutil)**
```bash
# Create temporary DMG
hdiutil create -volname "MyApp" -srcfolder build/export/MyApp.app -ov -format UDRW build/temp.dmg

# Convert to compressed, read-only DMG
hdiutil convert build/temp.dmg -format UDZO -o build/MyApp-1.0.0.dmg

# Clean up
rm build/temp.dmg
```

**Option B: Pretty DMG with create-dmg**
```bash
# Install create-dmg
brew install create-dmg

# Create DMG with background and positioning
create-dmg \
  --volname "MyApp" \
  --volicon "Assets/VolumeIcon.icns" \
  --background "Assets/dmg-background.png" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "MyApp.app" 150 190 \
  --hide-extension "MyApp.app" \
  --app-drop-link 450 190 \
  "build/MyApp-1.0.0.dmg" \
  "build/export/MyApp.app"
```

**Option C: Script for Automation**

Create `scripts/create-dmg.sh`:
```bash
#!/bin/bash
set -e

APP_NAME="MyApp"
VERSION=$(cat version.txt 2>/dev/null || echo "1.0.0")
DMG_NAME="${APP_NAME}-${VERSION}.dmg"
BUILD_DIR="build"
EXPORT_DIR="${BUILD_DIR}/export"

echo "Creating DMG: ${DMG_NAME}"

# Remove existing DMG
rm -f "${BUILD_DIR}/${DMG_NAME}"

# Create DMG
if command -v create-dmg &> /dev/null; then
    create-dmg \
        --volname "${APP_NAME}" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon-size 100 \
        --icon "${APP_NAME}.app" 150 190 \
        --app-drop-link 450 190 \
        "${BUILD_DIR}/${DMG_NAME}" \
        "${EXPORT_DIR}/${APP_NAME}.app"
else
    # Fallback to hdiutil
    hdiutil create -volname "${APP_NAME}" \
        -srcfolder "${EXPORT_DIR}/${APP_NAME}.app" \
        -ov -format UDZO \
        "${BUILD_DIR}/${DMG_NAME}"
fi

echo "DMG created: ${BUILD_DIR}/${DMG_NAME}"
```

### Step 6: Sign the DMG

```bash
# Sign the DMG with Developer ID Application
codesign --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --timestamp \
  build/MyApp-1.0.0.dmg

# Verify DMG signature
codesign --verify build/MyApp-1.0.0.dmg
```

### Step 7: Notarize

**Submit for Notarization:**
```bash
# Using stored credentials
xcrun notarytool submit build/MyApp-1.0.0.dmg \
  --keychain-profile "AC_PASSWORD" \
  --wait

# Or with explicit credentials
xcrun notarytool submit build/MyApp-1.0.0.dmg \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password @keychain:AC_PASSWORD \
  --wait
```

**Check Notarization Status:**
```bash
# Get submission history
xcrun notarytool history --keychain-profile "AC_PASSWORD"

# Get details of specific submission
xcrun notarytool info SUBMISSION_ID --keychain-profile "AC_PASSWORD"

# Get detailed log if failed
xcrun notarytool log SUBMISSION_ID --keychain-profile "AC_PASSWORD"
```

### Step 8: Staple the Ticket

```bash
# Staple notarization ticket to DMG
xcrun stapler staple build/MyApp-1.0.0.dmg

# Verify stapling
xcrun stapler validate build/MyApp-1.0.0.dmg
```

### Step 9: Final Verification

```bash
# Verify complete package
spctl --assess --type open --context context:primary-signature build/MyApp-1.0.0.dmg

# Test on a fresh Mac or VM
# The app should open without Gatekeeper warnings
```

## Complete Build Script

Create `scripts/build-and-distribute.sh`:

```bash
#!/bin/bash
set -e

# Configuration
APP_NAME="MyApp"
SCHEME="MyApp"
PROJECT="MyApp.xcodeproj"  # or use -workspace MyApp.xcworkspace
VERSION=$(cat version.txt 2>/dev/null || echo "1.0.0")
BUILD_DIR="build"
ARCHIVE_PATH="${BUILD_DIR}/${APP_NAME}.xcarchive"
EXPORT_PATH="${BUILD_DIR}/export"
DMG_PATH="${BUILD_DIR}/${APP_NAME}-${VERSION}.dmg"
KEYCHAIN_PROFILE="AC_PASSWORD"

echo "=== Building ${APP_NAME} v${VERSION} ==="

# Clean
echo "Cleaning..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Archive
echo "Archiving..."
xcodebuild -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration Release \
  -archivePath "${ARCHIVE_PATH}" \
  archive \
  | xcpretty || xcodebuild -project "${PROJECT}" -scheme "${SCHEME}" -configuration Release -archivePath "${ARCHIVE_PATH}" archive

# Export
echo "Exporting..."
xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportPath "${EXPORT_PATH}" \
  -exportOptionsPlist ExportOptions.plist

# Verify app signing
echo "Verifying app signature..."
codesign --verify --deep --strict "${EXPORT_PATH}/${APP_NAME}.app"

# Create DMG
echo "Creating DMG..."
if command -v create-dmg &> /dev/null; then
    create-dmg \
        --volname "${APP_NAME}" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon-size 100 \
        --icon "${APP_NAME}.app" 150 190 \
        --app-drop-link 450 190 \
        "${DMG_PATH}" \
        "${EXPORT_PATH}/${APP_NAME}.app"
else
    hdiutil create -volname "${APP_NAME}" \
        -srcfolder "${EXPORT_PATH}/${APP_NAME}.app" \
        -ov -format UDZO \
        "${DMG_PATH}"
fi

# Sign DMG
echo "Signing DMG..."
codesign --sign "Developer ID Application" --timestamp "${DMG_PATH}"

# Notarize
echo "Submitting for notarization..."
xcrun notarytool submit "${DMG_PATH}" \
  --keychain-profile "${KEYCHAIN_PROFILE}" \
  --wait

# Staple
echo "Stapling ticket..."
xcrun stapler staple "${DMG_PATH}"

# Final verification
echo "Final verification..."
spctl --assess --type open --context context:primary-signature "${DMG_PATH}"

echo ""
echo "=== Success! ==="
echo "DMG ready for distribution: ${DMG_PATH}"
echo "Size: $(du -h "${DMG_PATH}" | cut -f1)"
```

## Distribution Options

### 1. Direct Download Link
```bash
# Upload to your server or cloud storage
# Popular options:
# - GitHub Releases
# - AWS S3 / CloudFront
# - Cloudflare R2
# - Google Drive / Dropbox (for small teams)

# For GitHub Releases:
gh release create v${VERSION} "${DMG_PATH}" \
  --title "Version ${VERSION}" \
  --notes "Release notes here"
```

### 2. Sparkle Auto-Updates
For automatic updates, integrate [Sparkle](https://sparkle-project.org/):

1. Add Sparkle framework to your project
2. Create appcast.xml:
```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>MyApp Updates</title>
    <item>
      <title>Version 1.0.0</title>
      <sparkle:version>1</sparkle:version>
      <sparkle:shortVersionString>1.0.0</sparkle:shortVersionString>
      <pubDate>Mon, 10 Jan 2026 12:00:00 +0000</pubDate>
      <enclosure url="https://example.com/MyApp-1.0.0.dmg"
                 sparkle:edSignature="SIGNATURE"
                 length="12345678"
                 type="application/octet-stream"/>
    </item>
  </channel>
</rss>
```

### 3. TestFlight (Alternative)
For beta testing with Apple's infrastructure:
```bash
# Archive for App Store distribution
xcodebuild -exportArchive \
  -archivePath build/MyApp.xcarchive \
  -exportPath build/testflight \
  -exportOptionsPlist TestFlightExportOptions.plist

# Upload to App Store Connect
xcrun altool --upload-app \
  -f build/testflight/MyApp.ipa \
  -u "your@email.com" \
  -p @keychain:AC_PASSWORD
```

## Troubleshooting

### Code Signing Issues

**"Developer ID Application: ambiguous"**
```bash
# List available identities
security find-identity -v -p codesigning

# Use specific identity
codesign --sign "Developer ID Application: Your Name (TEAM_ID)" app.app
```

**"The signature is invalid"**
```bash
# Remove existing signature and re-sign
codesign --remove-signature MyApp.app
codesign --sign "Developer ID Application" --deep --force --timestamp MyApp.app
```

**Hardened Runtime Issues**
```bash
# Check if hardened runtime is enabled
codesign -d --verbose=4 MyApp.app | grep runtime

# Re-sign with hardened runtime
codesign --sign "Developer ID Application" \
  --options runtime \
  --timestamp \
  --force \
  MyApp.app
```

### Notarization Issues

**"The software is not signed"**
- Ensure Hardened Runtime is enabled
- Sign all embedded frameworks/binaries

**"The executable does not have the hardened runtime enabled"**
```bash
# Add to your entitlements or signing command
codesign --sign "Developer ID Application" \
  --options runtime \
  --timestamp \
  MyApp.app
```

**Check notarization log:**
```bash
xcrun notarytool log SUBMISSION_ID --keychain-profile "AC_PASSWORD"
```

**Common notarization failures:**
- Unsigned binaries inside the app bundle
- Missing timestamp on signature
- Hardened runtime not enabled
- Insecure entitlements without proper exceptions

### DMG Issues

**"Resource busy" when creating DMG**
```bash
# Unmount any existing volumes with same name
hdiutil detach "/Volumes/MyApp" 2>/dev/null || true
```

**DMG doesn't mount**
```bash
# Check DMG integrity
hdiutil verify MyApp.dmg
```

## Unsigned Distribution (Development Only)

For internal testing without Apple Developer account:

```bash
# Users must bypass Gatekeeper:
# Right-click → Open → Open (first time only)

# Or via Terminal:
xattr -d com.apple.quarantine /Applications/MyApp.app

# Or disable Gatekeeper (NOT recommended for end users):
sudo spctl --master-disable
```

**Warning:** Unsigned apps show scary warnings and are blocked by default. Only suitable for internal development.

## Best Practices

1. **Version your releases**: Include version in DMG filename
2. **Test on clean Mac**: Use VM or fresh user account
3. **Automate the process**: Use CI/CD (GitHub Actions, Xcode Cloud)
4. **Keep certificates secure**: Never commit certificates to git
5. **Document entitlements**: Explain why each entitlement is needed
6. **Provide checksums**: SHA256 for download verification
```bash
shasum -a 256 MyApp-1.0.0.dmg > MyApp-1.0.0.dmg.sha256
```

## CI/CD Integration (GitHub Actions)

See [github-actions.md](github-actions.md) for complete CI/CD workflow examples.

## References

- [Apple: Distributing Your App Outside the App Store](https://developer.apple.com/documentation/xcode/distributing-your-app-outside-the-mac-app-store)
- [Apple: Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Apple: Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Introduction/Introduction.html)
- [create-dmg Tool](https://github.com/create-dmg/create-dmg)
- [Sparkle Framework](https://sparkle-project.org/)
