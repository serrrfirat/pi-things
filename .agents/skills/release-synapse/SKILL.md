---
name: release-synapse
description: Release the Synapse Mac app with version bumping, building, DMG creation, notarization, git tagging, and GitHub release. Use when running /release-synapse or when the user wants to release, publish, or distribute the Synapse Mac app.
---

# Release Synapse

Automates the complete release process for the Synapse Mac app.

## Arguments

Parse arguments from the skill invocation:

- `--major` - Bump major version (1.0.0 → 2.0.0)
- `--minor` - Bump minor version (1.0.0 → 1.1.0)
- `--patch` - Bump patch version (default, 1.0.0 → 1.0.1)
- `--skip-notarize` - Skip Apple notarization (for testing)
- `--draft` - Create GitHub release as draft
- `--no-github` - Skip GitHub release creation

## Release Steps

Execute these steps in order:

### Step 1: Read and Bump Version

```bash
# Read current version
cat /Users/firatsertgoz/Documents/synapse/SynapseMac/version.txt
```

Parse the version (format: MAJOR.MINOR.PATCH) and bump according to the argument:
- Default or `--patch`: increment PATCH
- `--minor`: increment MINOR, reset PATCH to 0
- `--major`: increment MAJOR, reset MINOR and PATCH to 0

Write the new version back to the file.

### Step 2: Build the Release

Run the existing build scripts:

```bash
cd /Users/firatsertgoz/Documents/synapse

# Build CLI tools
./scripts/build-cli.sh

# Build the Mac app in Release configuration
./scripts/build-app.sh
```

### Step 3: Create DMG

```bash
cd /Users/firatsertgoz/Documents/synapse
./scripts/create-dmg.sh
```

The DMG will be at: `build/Synapse-{VERSION}.dmg`

### Step 4: Notarize (unless --skip-notarize)

If notarization is NOT skipped:

```bash
VERSION=$(cat /Users/firatsertgoz/Documents/synapse/SynapseMac/version.txt)
DMG_PATH="/Users/firatsertgoz/Documents/synapse/build/Synapse-$VERSION.dmg"

# Submit for notarization
xcrun notarytool submit "$DMG_PATH" \
  --keychain-profile "notarytool-profile" \
  --wait

# Staple the notarization ticket to the DMG
xcrun stapler staple "$DMG_PATH"
```

If notarization fails due to missing keychain profile, inform the user:
```
To set up notarization credentials:
xcrun notarytool store-credentials "notarytool-profile" \
  --apple-id "your@email.com" \
  --team-id "TEAMID" \
  --password "app-specific-password"
```

### Step 5: Git Operations

```bash
cd /Users/firatsertgoz/Documents/synapse
VERSION=$(cat SynapseMac/version.txt)

# Stage version file
git add SynapseMac/version.txt

# Commit
git commit -m "chore: bump version to $VERSION"

# Create annotated tag
git tag -a "v$VERSION" -m "Release v$VERSION"

# Push commit and tag
git push && git push --tags
```

### Step 6: GitHub Release (unless --no-github)

Create a GitHub release using the `gh` CLI:

```bash
VERSION=$(cat /Users/firatsertgoz/Documents/synapse/SynapseMac/version.txt)
DMG_PATH="/Users/firatsertgoz/Documents/synapse/build/Synapse-$VERSION.dmg"

# Generate release notes from recent commits
NOTES=$(git log --oneline $(git describe --tags --abbrev=0 HEAD^)..HEAD --no-decorate)

# Create release (add --draft if requested)
gh release create "v$VERSION" "$DMG_PATH" \
  --title "Synapse v$VERSION" \
  --notes "## What's Changed

$NOTES

## Installation

1. Download Synapse-$VERSION.dmg
2. Open the DMG and drag Synapse to Applications
3. Right-click → Open → Open (first launch only, bypasses Gatekeeper)
"
```

If `--draft` is specified, add `--draft` flag to `gh release create`.

## Output Summary

After completion, display:

```
═══════════════════════════════════════════════════════════
🎉 RELEASE v{VERSION} COMPLETE!
═══════════════════════════════════════════════════════════

📦 Artifacts:
  • DMG: build/Synapse-{VERSION}.dmg
  • Tag: v{VERSION}
  • GitHub: https://github.com/serrrfirat/synapse/releases/tag/v{VERSION}

✅ Notarization: {PASSED/SKIPPED}
✅ GitHub Release: {CREATED/DRAFT/SKIPPED}
```

## Error Handling

- If any build step fails, stop and report the error
- If notarization fails, offer to continue with `--skip-notarize`
- If gh CLI is not installed, skip GitHub release and instruct user to install it
- If git operations fail (dirty working tree), warn but offer to continue

## Prerequisites

Required tools:
- Xcode command line tools (`xcode-select --install`)
- create-dmg (`brew install create-dmg`) - optional, falls back to hdiutil
- gh CLI (`brew install gh`) - for GitHub releases
- Notarization credentials stored in keychain (for notarization)
