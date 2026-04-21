# GitHub Actions CI/CD for macOS App Distribution

Complete GitHub Actions workflow for building, signing, notarizing, and releasing macOS apps.

## Prerequisites

### Required GitHub Secrets

Set these in your repository Settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `APPLE_DEVELOPER_ID_APPLICATION_CERT_BASE64` | Base64-encoded .p12 certificate |
| `APPLE_DEVELOPER_ID_APPLICATION_CERT_PASSWORD` | Password for the .p12 file |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `KEYCHAIN_PASSWORD` | Temporary keychain password (any strong password) |

### Export Certificate

```bash
# Export from Keychain Access:
# 1. Open Keychain Access
# 2. Find "Developer ID Application: Your Name"
# 3. Right-click → Export
# 4. Save as .p12 with password

# Convert to base64
base64 -i DeveloperIDApplication.p12 | pbcopy
# Paste into APPLE_DEVELOPER_ID_APPLICATION_CERT_BASE64 secret
```

## Basic Workflow

Create `.github/workflows/build-and-release.yml`:

```yaml
name: Build and Release macOS App

on:
  push:
    tags:
      - 'v*'  # Trigger on version tags like v1.0.0
  workflow_dispatch:
    inputs:
      version:
        description: 'Version number (e.g., 1.0.0)'
        required: true

env:
  APP_NAME: MyApp
  SCHEME: MyApp
  PROJECT: MyApp.xcodeproj

jobs:
  build:
    runs-on: macos-14  # macOS Sonoma with Xcode 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Determine version
        id: version
        run: |
          if [ "${{ github.event_name }}" = "push" ]; then
            VERSION=${GITHUB_REF#refs/tags/v}
          else
            VERSION=${{ github.event.inputs.version }}
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "Building version: $VERSION"

      - name: Setup Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: '15.2'

      - name: Install create-dmg
        run: brew install create-dmg

      - name: Import Code Signing Certificate
        env:
          CERT_BASE64: ${{ secrets.APPLE_DEVELOPER_ID_APPLICATION_CERT_BASE64 }}
          CERT_PASSWORD: ${{ secrets.APPLE_DEVELOPER_ID_APPLICATION_CERT_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          # Create temporary keychain
          KEYCHAIN_PATH=$RUNNER_TEMP/signing.keychain-db
          security create-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
          security set-keychain-settings -lut 21600 $KEYCHAIN_PATH
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH

          # Import certificate
          echo -n "$CERT_BASE64" | base64 --decode -o $RUNNER_TEMP/cert.p12
          security import $RUNNER_TEMP/cert.p12 -P "$CERT_PASSWORD" -A -t cert -f pkcs12 -k $KEYCHAIN_PATH
          security list-keychain -d user -s $KEYCHAIN_PATH

          # Allow codesign to access keychain
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH

      - name: Store Notarization Credentials
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
        run: |
          xcrun notarytool store-credentials "AC_PASSWORD" \
            --apple-id "$APPLE_ID" \
            --team-id "$APPLE_TEAM_ID" \
            --password "$APPLE_APP_SPECIFIC_PASSWORD"

      - name: Update Version
        run: |
          VERSION=${{ steps.version.outputs.version }}
          # Update Info.plist or build settings
          /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "${{ env.APP_NAME }}/Info.plist" || true
          echo "$VERSION" > version.txt

      - name: Build Archive
        run: |
          xcodebuild -project "${{ env.PROJECT }}" \
            -scheme "${{ env.SCHEME }}" \
            -configuration Release \
            -archivePath build/${{ env.APP_NAME }}.xcarchive \
            archive \
            CODE_SIGN_IDENTITY="Developer ID Application" \
            CODE_SIGN_STYLE=Manual

      - name: Export App
        run: |
          xcodebuild -exportArchive \
            -archivePath build/${{ env.APP_NAME }}.xcarchive \
            -exportPath build/export \
            -exportOptionsPlist ExportOptions.plist

      - name: Verify App Signature
        run: |
          codesign --verify --deep --strict build/export/${{ env.APP_NAME }}.app
          echo "App signature verified successfully"

      - name: Create DMG
        run: |
          VERSION=${{ steps.version.outputs.version }}
          DMG_NAME="${{ env.APP_NAME }}-${VERSION}.dmg"

          create-dmg \
            --volname "${{ env.APP_NAME }}" \
            --window-pos 200 120 \
            --window-size 600 400 \
            --icon-size 100 \
            --icon "${{ env.APP_NAME }}.app" 150 190 \
            --app-drop-link 450 190 \
            "build/${DMG_NAME}" \
            "build/export/${{ env.APP_NAME }}.app"

      - name: Sign DMG
        run: |
          VERSION=${{ steps.version.outputs.version }}
          DMG_PATH="build/${{ env.APP_NAME }}-${VERSION}.dmg"
          codesign --sign "Developer ID Application" --timestamp "$DMG_PATH"

      - name: Notarize DMG
        run: |
          VERSION=${{ steps.version.outputs.version }}
          DMG_PATH="build/${{ env.APP_NAME }}-${VERSION}.dmg"

          echo "Submitting for notarization..."
          xcrun notarytool submit "$DMG_PATH" \
            --keychain-profile "AC_PASSWORD" \
            --wait

      - name: Staple DMG
        run: |
          VERSION=${{ steps.version.outputs.version }}
          DMG_PATH="build/${{ env.APP_NAME }}-${VERSION}.dmg"
          xcrun stapler staple "$DMG_PATH"

      - name: Verify Final DMG
        run: |
          VERSION=${{ steps.version.outputs.version }}
          DMG_PATH="build/${{ env.APP_NAME }}-${VERSION}.dmg"
          spctl --assess --type open --context context:primary-signature "$DMG_PATH"
          echo "DMG verification passed!"

      - name: Generate Checksums
        run: |
          VERSION=${{ steps.version.outputs.version }}
          DMG_PATH="build/${{ env.APP_NAME }}-${VERSION}.dmg"
          shasum -a 256 "$DMG_PATH" > "$DMG_PATH.sha256"

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ env.APP_NAME }}-${{ steps.version.outputs.version }}
          path: |
            build/*.dmg
            build/*.sha256

      - name: Create GitHub Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v1
        with:
          files: |
            build/*.dmg
            build/*.sha256
          draft: false
          prerelease: false
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Cleanup Keychain
        if: always()
        run: |
          security delete-keychain $RUNNER_TEMP/signing.keychain-db || true
```

## ExportOptions.plist

Create `ExportOptions.plist` in your repository:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
    <key>signingCertificate</key>
    <string>Developer ID Application</string>
</dict>
</plist>
```

## Usage

### Automatic Release (Tag Push)

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

### Manual Release

1. Go to Actions → "Build and Release macOS App"
2. Click "Run workflow"
3. Enter version number
4. Click "Run workflow"

## Advanced: Matrix Build for Multiple Apps

```yaml
jobs:
  build:
    runs-on: macos-14
    strategy:
      matrix:
        app:
          - name: MyApp
            scheme: MyApp
          - name: MyAppHelper
            scheme: MyAppHelper

    steps:
      - name: Build ${{ matrix.app.name }}
        run: |
          xcodebuild -project MyProject.xcodeproj \
            -scheme "${{ matrix.app.scheme }}" \
            -configuration Release \
            archive
```

## Troubleshooting

### Certificate Issues

**"No identity found"**
- Verify CERT_BASE64 is correctly encoded
- Check certificate hasn't expired
- Ensure it's a "Developer ID Application" certificate

**Debug certificate import:**
```yaml
- name: Debug Certificates
  run: |
    security find-identity -v -p codesigning
```

### Notarization Issues

**"Invalid credentials"**
- Verify APPLE_ID is correct
- Check app-specific password is valid
- Ensure TEAM_ID matches your account

**Debug notarization:**
```yaml
- name: Check Notarization Log
  if: failure()
  run: |
    xcrun notarytool history --keychain-profile "AC_PASSWORD"
```

### Xcode Version

**Update Xcode version:**
```yaml
- name: Setup Xcode
  uses: maxim-lobanov/setup-xcode@v1
  with:
    xcode-version: '15.4'  # Or 'latest-stable'
```
