# Dienstplan Generator (Offline, Monat) – Version 4.4

## Start
- ZIP entpacken
- `index.html` doppelklicken (öffnet im Browser)
- Keine Installation, kein Internet nötig

## Was kann das Tool?
### 1) Mitarbeiter verwalten
- Name + Wochenstunden (typisch 20/30/40)
- Für „Urlaub“ wird pro Wochentag (Mo–Fr) automatisch gutgeschrieben:
  - 40h → 8h
  - 30h → 6h
  - 20h → 4h
  - Allgemein: Wochenstunden / 5

### 2) Blockliste (pro Tag & Mitarbeiter)
- Frei = Mitarbeiter ist an dem Tag gesperrt, keine Stunden-Gutschrift
- WF (Wunschfrei, max. 3×/Monat pro Person) = wie Frei, aber höhere Priorität
- Urlaub = Mitarbeiter ist an dem Tag gesperrt, aber Mo–Fr wird Stunden-Gutschrift berechnet

**Zusätzlich (pro Datum, global)**
- TD Pflicht = an diesem Tag muss (wenn irgendwie möglich) ein TD besetzt sein

**Prioritäten bei Konflikten**
1. IWD muss immer belegt sein. TD so viele wie möglich (wenn reduzieren: zuerst Wochenende)
2. Urlaub
3. WF
4. Frei
5. Überstunden/Stundenkonto
6. Sonderwünsche

### 3) Dienstplan generieren
- Pro Tag genau 1× IWD (20h)
- TD (10h) wird je Woche „so viel wie nötig“ eingeplant, damit die Soll-Stunden möglichst passen  
  Wenn eine Woche nicht genug Stunden hat, werden TDs zuerst am Wochenende weggelassen, dann unter der Woche.
- Nach einem IWD ist der Folgetag für diese Person immer frei und wird als „/“ angezeigt
- Stundenkonto:
  - Positive Stunden (= Überstunden) → Person bekommt tendenziell etwas weniger Dienste
  - Negative Stunden (= Minusstunden) → Person bekommt tendenziell etwas mehr Dienste
  - Pro Monat wird ungefähr 1/12 des Kontos ausgeglichen (gedeckelt auf ±20h/Monat)
- Ziel: möglichst geringe Abweichung vom Monats-Ziel (Vertrag + Konto-Korrektur)

### 4) Sonderwünsche (pro Mitarbeiter)
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

### 5) Drucken
- Mit dem Button „Drucken“ wird der Dienstplan als A4-Seite im Querformat ausgegeben (Browser-Print-Dialog)

### 6) Zwischenspeicher / Cache-Datei
- Standard: Alles bleibt lokal im Browser gespeichert (LocalStorage)
- Optional: „Cache-Datei verbinden“ erstellt/öffnet eine Projektdatei (`dienstplan_cache.json`) und speichert automatisch mit  
  (Je nach Browser verfügbar – sonst bitte Export/Import nutzen.)

### 7) Export / Import
- JSON-Export/Import zum Sichern oder Übertragen

## Hinweise & zu beachten
- Alles läuft lokal im Browser – keine Installation, kein Internet
- IWD ist immer Pflicht, TD wird flexibel ergänzt
- Nach IWD ist der Folgetag zwingend frei („/“)
- WF ist begrenzt (max. 3×/Monat/Person)

## Qualitätskurve (mehr Versuche = bessere Lösung)
Eine höhere Anzahl an Versuchen verbessert typischerweise die Plan-Qualität,
liefert aber abnehmende Steigerungen:

```
Qualität
100% |                             *
 90% |                         *   |
 80% |                     *       |
 70% |                 *           |
 60% |             *               |
 50% |         *                   |
 40% |     *                       |
 30% | *                           |
      +-------------------------------
        1k   5k   10k  25k  50k  100k
                 Versuche
```
