#!/bin/sh
# Xcode Cloud: príprava Capacitora pred tým, než sa začne riešiť Xcode projekt.
#
# CI dostane iba čistý klon repozitára, a to na tento projekt nestačí:
#   1. `App/App/public` a `App/App/capacitor.config.json` sú v ios/.gitignore,
#      lebo ich generuje `cap sync`. V klone teda neexistujú a build spadne.
#   2. `CapApp-SPM/Package.swift` odkazuje na pluginy lokálnymi cestami do
#      node_modules. Bez inštalácie závislostí Xcode balíky nerozbalí.
#
# Tento skript beží po klonovaní a pred rozbaľovaním závislostí, takže obe
# veci stihne pripraviť.

set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Image Xcode Cloudu bun neobsahuje, doinštalujeme ho do domovského adresára.
export BUN_INSTALL="$HOME/.bun"
curl -fsSL https://bun.sh/install | bash
export PATH="$BUN_INSTALL/bin:$PATH"

# --frozen-lockfile: CI nemá meniť bun.lock, len ho presne dodržať.
bun install --frozen-lockfile

# Vygeneruje App/App/public, App/App/capacitor.config.json a Package.swift.
bunx cap sync ios
