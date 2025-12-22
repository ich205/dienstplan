Dienstplan Generator (Offline, Monat) – Version 4.4

Start
- ZIP entpacken
- index.html doppelklicken (öffnet im Browser)
- Keine Installation, kein Internet nötig

Neu in Version 4.1
- Qualitäts-Level bis 100.000 Versuche.
- Stundenkonto pro Mitarbeiter (Über-/Minusstunden): ca. 1/12 pro Monat wird abgebaut/aufgebaut (max. ±20h pro Monat).
- Erweiterte Sonderwünsche (z.B. Doppel-IWD, kein Doppel-IWD, Wunsch-Wochentag, Wochenend-Präferenz, max. IWD/TD pro Woche/Monat).
- Drucken: A4 Querformat (Dienstplan-Tabelle).
- Zwischenspeicher im Browser (LocalStorage) + optional: Projektdatei (Cache) im selben Ordner verbinden (Browser-Unterstützung vorausgesetzt).
- WF (Wunschfrei) als zusätzliche Block-Stufe (max. 3 Tage pro Person/Monat) + Prioritäten-Infotafel.

Neu in Version 4.2
- Feiertage (Berlin) werden automatisch erkannt und farblich hervorgehoben.
- Sonntage & Feiertage werden als Zeile durchgehend markiert (auch im Druck).
- Blockliste: zusätzliche Spalte „TD Pflicht“ (für Termine/Begleitungen) – an diesen Tagen versucht der Generator immer einen TD zu besetzen.
- Druck-Layout verbessert: es werden nur Dienstplan + Stundenübersicht gedruckt und die Tabelle passt besser in A4 Querformat.

Neu in Version 4.3
- Druck-Fix: Datumsspalte ist im Druck wieder lesbar (kein Schwarz-auf-Schwarz).
- Deutlich stärkere Hervorhebung von Sonntagen/Feiertagen im Druck.
- Druck-Layout: Plan-Tabelle auf Seite 1, Stundenübersicht startet immer auf Seite 2.
- Platzsparender Druck: Titel wird im Kopf der Tabelle angezeigt ("Dienstplan – <Monat>") statt als extra Überschrift.

Neu in Version 4.4 (UI/UX)
- Dienstplan mit „Freeze Panes“: Kopfzeile + erste Spalte bleiben sichtbar.
- Neue Ansichtsauswahl: Normal / Kompakt / Fit-to-screen (empfohlen: Fit + optional Vollbild).
- Scroll-Modus: Seite (Standard) oder Container (alte Scroll-Boxen).
- Vollbild-Dienstplan blendet das Seitenpanel aus und schafft Platz.

Was kann das Tool?
1) Mitarbeiter verwalten
- Name + Wochenstunden (typisch 20/30/40)
- Für „Urlaub“ wird pro Wochentag (Mo–Fr) automatisch gutgeschrieben:
  * 40h -> 8h
  * 30h -> 6h
  * 20h -> 4h
  (allgemein: Wochenstunden / 5)

2) Blockliste (pro Tag & Mitarbeiter)
- Frei = Mitarbeiter ist an dem Tag gesperrt, keine Stunden-Gutschrift.
- WF (Wunschfrei, max. 3x/Monat pro Person) = wie Frei, aber höhere Priorität.
- Urlaub = Mitarbeiter ist an dem Tag gesperrt, aber Mo–Fr wird Stunden-Gutschrift berechnet.

Zusätzlich (pro Datum, global)
- TD Pflicht = an diesem Tag muss (wenn irgendwie möglich) ein TD besetzt sein.

Prioritäten bei Konflikten
- 0: IWD muss immer belegt sein. TD so viele wie möglich (wenn reduzieren: zuerst Wochenende).
- 1: Urlaub
- 2: WF
- 3: Frei
- 4: Überstunden/Stundenkonto
- 5: Sonderwünsche

3) Dienstplan generieren
- Pro Tag genau 1× IWD (20h)
- TD (10h) wird je Woche „so viel wie nötig“ eingeplant, damit die Soll-Stunden möglichst passen.
  Wenn eine Woche nicht genug Stunden hat, werden TDs zuerst am Wochenende weggelassen, dann unter der Woche.
- Nach einem IWD ist der Folgetag für diese Person immer frei und wird als „/“ angezeigt.
- Stundenkonto: Positive Stunden (= Überstunden) führen dazu, dass die Person tendenziell etwas weniger Dienste bekommt.
  Negative Stunden (= Minusstunden) führen dazu, dass die Person tendenziell etwas mehr Dienste bekommt.
  Dabei wird pro Monat ungefähr 1/12 des Kontos ausgeglichen (gedeckelt auf ±20h/Monat).
- Ziel: möglichst geringe Abweichung vom Monats-Ziel (Vertrag + Konto-Korrektur).

Sonderwünsche (pro Mitarbeiter)
Im Feld „Sonderwünsche“ werden u.a. folgende Regeln erkannt (siehe „i“ im Kreis neben dem Eingabefeld):
- „kein TD“ / „nur IWD“
- „kein IWD“ / „nur TD“
- „mehr TD“ / „TD > IWD“
- „mehr IWD“ / „IWD > TD“
- „nie Mo“, „nie Dienstag“, „nie Wochenende“ (und weitere Wochentage)
- „doppel IWD“ (IWD, /, IWD, /)
- „kein doppel IWD“ / „nach / frei“ (vermeidet IWD direkt nach dem freien Tag)
- „montags Dienst“ / „jeden Freitag Dienst“ (bevorzugter Wochentag)
- „Wochenende bevorzugt“ / „Wochenende ungern“
- „max 1 IWD pro Woche“, „max 3 TD pro Monat“

Drucken
- Mit dem Button „Drucken“ wird der Dienstplan als A4-Seite im Querformat ausgegeben (Browser-Print-Dialog).

Zwischenspeicher / Cache-Datei
- Standard: Alles bleibt lokal im Browser gespeichert (LocalStorage).
- Optional: „Cache-Datei verbinden“ erstellt/öffnet eine Projektdatei (dienstplan_cache.json) und speichert automatisch mit.
  (Je nach Browser verfügbar – sonst bitte Export/Import nutzen.)

Export / Import
- JSON-Export/Import zum Sichern oder Übertragen.

Alles läuft lokal im Browser.
