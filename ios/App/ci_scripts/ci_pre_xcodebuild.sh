#!/bin/sh
# App Store Connect neprijme dva buildy s rovnakým číslom, a v projekte je
# CURRENT_PROJECT_VERSION natvrdo 1. Prepíšeme ho poradovým číslom buildu
# od Xcode Cloudu, takže každé nahranie je unikátne bez ručného zásahu.
#
# Verzia pre používateľa (MARKETING_VERSION) sa nemení — tú dvíhaj ručne,
# keď ide o novú verziu appky, nie o nový build tej istej.
#
# Zámerne bez `agvtool`: ten očakáva VERSIONING_SYSTEM = apple-generic, ktoré
# tento projekt nastavené nemá. Priamy zápis do projektu je predvídateľnejší.

set -e

if [ -z "$CI_BUILD_NUMBER" ]; then
  echo "CI_BUILD_NUMBER nie je nastavené — nechávam číslo buildu tak, ako je."
  exit 0
fi

PROJECT="$CI_PRIMARY_REPOSITORY_PATH/ios/App/App.xcodeproj/project.pbxproj"

sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $CI_BUILD_NUMBER;/g" "$PROJECT"

echo "Číslo buildu nastavené na $CI_BUILD_NUMBER:"
grep -m2 "CURRENT_PROJECT_VERSION" "$PROJECT"
