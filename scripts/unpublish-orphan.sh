#!/usr/bin/env bash
set -euo pipefail

# Unpublish orphaned opencode-ai versions from npm.
# Requires NPM_TOKEN to be exported or .npmrc to have auth.
# Usage: ./scripts/unpublish-orphan.sh [version]
# Example: ./scripts/unpublish-orphan.sh 1.21.9

VERSION="${1:-1.21.9}"
PACKAGE="opencode-ai"

echo "Attempting to unpublish ${PACKAGE}@${VERSION}..."
echo "This requires npm auth (NPM_TOKEN or .npmrc with //registry.npmjs.org/:_authToken=...)"

if ! npm whoami >/dev/null 2>&1; then
  echo "ERROR: Not authenticated with npm."
  echo "Set NPM_TOKEN or run: npm login"
  exit 1
fi

echo "Authenticated as: $(npm whoami)"
echo "Unpublishing ${PACKAGE}@${VERSION} --force..."

npm unpublish "${PACKAGE}@${VERSION}" --force

echo "Done. Verify with: npm view ${PACKAGE}@${VERSION}"
