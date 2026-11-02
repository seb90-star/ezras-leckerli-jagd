# Ezras Leckerli-Jagd

Allgemeine Arbeitsweise steht in der globalen CLAUDE.md – vor jeder Änderung erst mit Sebastian sprechen.

## Wo alles liegt
- Projekt: F:\Webseiten\Ezras-Leckerli-Jagd (nicht D:\Ezras Leckerli-Jagd, der ist leer)
- Spiel: docs/index.html (eine Datei), Android-App über Capacitor (webDir: docs)
- Offene Aufgaben: TODO.md
- Native Plugins über `window.Capacitor.Plugins` ansprechen (ohne Bundler gibt es kein `registerPlugin`)

## Entwickler-Menü
- `const ENTWICKLUNG = true` in docs/index.html schaltet Testhilfen ein (Einstellungen → „🛠 Entwickler“, Pause-Menü: Sieg/Unverwundbar)
- Vor der Veröffentlichung auf `false` stellen (steht auch in TODO.md)

## Nach jeder Änderung am Spiel
- Version in docs/sw.js erhöhen
- `npx cap sync android`

## Testen
- Handy per USB (adb: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`)
- `android/gradlew.bat installDebug`
- Beim Testen keine Daten auf dem Handy verändern (Bestenliste, Name, Fortschritt) – oder vorher fragen
