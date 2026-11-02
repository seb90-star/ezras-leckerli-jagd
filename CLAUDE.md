# Ezras Leckerli-Jagd

Allgemeine Arbeitsweise steht in der globalen CLAUDE.md – vor jeder Änderung erst mit Sebastian sprechen.

## Wo alles liegt
- Projekt: F:\Webseiten\Ezras-Leckerli-Jagd (nicht D:\Ezras Leckerli-Jagd, der ist leer)
- Spiel: docs/index.html (eine Datei), Android-App über Capacitor (webDir: docs)
- Offene Aufgaben: TODO.md
- Native Plugins über `window.Capacitor.Plugins` ansprechen (ohne Bundler gibt es kein `registerPlugin`)
- GitHub: seb90-star/ezras-leckerli-jagd; GitHub Pages veröffentlicht `main/docs` als Webversion

## Stand (Git)
- Gearbeitet wird auf dem Zweig `fix/zurueck-taste-startseite` (gepusht, Name passt inhaltlich nicht mehr)
- `main` ist noch auf dem alten Stand. Beim Übernehmen in `main` dort `ENTWICKLUNG = false` setzen,
  sonst ist das Entwickler-Menü auf der öffentlichen Webseite sichtbar
- Sebastian ist kein Git-Profi: Begriffe (Commit, Push, Zweig) kurz und einfach erklären

## Was das Spiel inzwischen hat
- **Ezras Reise:** Levelkarte als Startseite, Welten Garten → Wald → Strand (je 10 Level), darüber Nebel mit „?“ (Cliffhanger).
  Karte von oben gezeichnet (Haus, Gartentor, Bach mit Brücke, Meer), Trittsteine, Pfoten-Stempel, Pfotenspur hinter Ezra,
  Ezra läuft nach geschafftem Level weiter, Kamerafahrt bei neuer Welt
- **Level:** eine Aufgabe mit Zeitlimit (Garten 60 s, Wald 75 s, Strand 90 s; Durchhalten und Bosse ohne Uhr),
  3 Stufen = 1–3 Pfoten (1 Pfote reicht zum Weiterkommen); Zielzahlen mit dem Spiel-Bot auf die Familie abgestimmt.
  Level 10/20/30 sind Bosse (Katze 20, Eichhörnchen 25, Möwe 30 Treffer) mit Phasen: normal → Warnung →
  Wut (nur Ekliges, nur ausweichen) → Erschöpfung (nur Leckerlis)
- **Leben:** kosten nur eklige Sachen (Socke, Zapfen, Biene, Qualle). Verpasstes kostet nur die Combo.
  Dafür mehr Ekliges (`gefahrAnteil` 28 % → 52 %)
- **Neue Sachen je Welt** (Einführung auf der Level-Karte): Würstchen, Frisbee, Eicheln (Eichhörnchen), Biene, Fisch, Eis
- **Power-ups:** Magnet, Schutz-Halstuch
- **Überraschungs-Ereignisse** (ab Level 3, nie bei Bossen): Gewitterwolke, Rasensprenger, explodierende Pilze,
  Windböe, Riesenwelle, Wal-Fontäne. Sachen daraus sind Bonus: verpasst/eklig kostet kein Leben
- **Ausrüstung:** Leckerli-Dose (Währung aus gefangenen Leckerlis), Turbo-Pfoten, Kappe, Glücks-Halsband, Rucksack,
  Sonnenbrille (je 3 Stufen), 2–4 Plätze, Tipp auf der Level-Karte; Ezra trägt alles sichtbar
- **Halstücher:** Start nur mit Halsband, nach der Proberunde das Abenteuer-Halstuch; Welt-Tücher Gänseblümchen, Tannenwald,
  Muscheln; Übergabe als Szene (Geschenk wackelt → antippen → Tuch tanzt → landet auf Ezra). Kein Regenbogen-Tuch (bewusst raus)
- **Endlos-Spiel** mit Bestenliste und Rekord bleibt erhalten (Knopf auf der Karte)
- **Feedback:** Meilenstein-/Erfolgs-Schilder im Spiel, Endkarte mit Balken (Leckerlis, Bälle, Goldene, Socken) und Erfolgs-Stapel
- **Grafik:** Licht/Volumen bei Ezra, Ebenen mit leichter Verschiebung, Dunst, Vignette, Leben (Schmetterlinge, Blätter, Möwen),
  2,5D (Boden-Schatten der fallenden Sachen, weiche Kulisse)
- **Zurück-Taste:** 2× schnell beendet die App; Pause-Menü mit Weiter, Nochmal, Zur Karte, Ton, Vibration

## Entwickler-Menü
- `const ENTWICKLUNG = true` in docs/index.html schaltet Testhilfen ein:
  Einstellungen → „🛠 Entwickler“ (Level offen, Welt fertig, Kamerafahrt, Halstuch-Übergabe, +500 🦴, Zurücksetzen),
  Pause-Menü (Sieg mit 1–3 Pfoten, Unverwundbar, Ereignis jetzt)
- Vor der Veröffentlichung auf `false` stellen (steht auch in TODO.md)

## Nach jeder Änderung am Spiel
- Version in docs/sw.js erhöhen
- `npx cap sync android`

## Testen
- **Browser:** docs/ mit einem kleinen statischen Node-Server ausliefern (z. B. Port 5178), im eingebauten Browser in
  Handygröße (412×892) öffnen. Testdaten über localStorage `ezra-fortschritt` setzen. Achtung: Ist der Browser ausgeblendet
  oder im Hintergrund, läuft das Spiel stark gedrosselt – dann Bereich einblenden oder auf dem Handy testen
- **Handy per USB** (adb: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`), `android/gradlew.bat installDebug`.
  Die App-Seite lässt sich per adb-Forward auf `webview_devtools_remote_<pid>` und Chrome DevTools Protocol fernsteuern
- Beim Testen keine Daten auf dem Handy verändern (Bestenliste, Name, Fortschritt) – oder vorher fragen
- **Spiel-Bot** (`test/spielbot.mjs`, `npm run bot`): spielt alle Level mit simulierten Spielern (Kind 5–6, Kind 8–10,
  Erwachsen, Profi) im unsichtbaren Chrome durch (playwright-core, nutzt das installierte Chrome) und schreibt einen
  Bericht nach `test-ergebnisse/` (von Git ausgenommen). Optionen: `--runden`, `--level 1-10`, `--spieler kind5,profi`,
  `--endlos`, `--ausr pfoten:2`, `--setze kind8.reaktion=.25`, `--zuschauen`. Braucht `ENTWICKLUNG = true`;
  der Test-Zugang `window.ezraTest` ist nur mit `?test` in der Adresse aktiv. Spieler-Werte sind Schätzungen –
  Ergebnisse als Tendenz lesen, besonders für Vergleiche vorher/nachher
- Vorher/Nachher-Bilder liegen in `.vergleich/` (von Git ausgenommen)
