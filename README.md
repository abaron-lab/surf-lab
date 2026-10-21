# Surf Lab

Ein Surfspiel für den Browser: 3rd-Person-Sicht, jede Runde startet beim Anpaddeln in die Welle und dauert 60 Sekunden. Sieben Spots der Championship Tour, jeder mit eigenem Wellencharakter, eigener Wertung und erkennbaren Landmarks.

| Spot | Welle | Fokus | Landmarks |
|---|---|---|---|
| Teahupo'o (Tahiti) | schwere Linke, dicke Lippe | Tube | zackige grüne Berge von Tahiti Iti, Judges' Tower und Boote im Channel |
| Pipeline (Oahu) | Linke direkt vor dem Strand | Tube | Strand mit Palmen und Häusern, Lifeguard-Tower, Zuschauer, Ko'olau-Kette |
| Jeffreys Bay (Südafrika) | lange, schnelle Rechte | Turns | Felsküste, weiße Häuser am Hang, Fynbos-Hügel, Kouga-Berge |
| Bells Beach (Australien) | Rechte im Abendlicht | Turns | ockerrote Klippen, Holztreppe, Aussichtsplattform |
| Snapper Rocks (Gold Coast) | Superbank-Rechte | Turns + Airs | Snapper-Felsen, Leuchtturm am Point Danger, Skyline von Surfers Paradise |
| Lower Trestles (Kalifornien) | Rampen über Kopfsteinpflaster | Airs | Holz-Trestle mit Amtrak-Zug, goldene Hügel, Kuppeln von San Onofre |
| Saquarema (Brasilien) | Linke | Airs | weiße Kirche Nossa Senhora de Nazaré auf dem Felshügel, Fans mit Brasilien-Flaggen |

## Starten

Das Spiel braucht keinen Build-Schritt, aber ES-Module laden nicht über `file://`. Einen beliebigen lokalen Webserver im Projektordner starten, zum Beispiel:

```sh
npx serve .
# oder
python3 -m http.server 8000
```

Dann `http://localhost:3000` bzw. `http://localhost:8000` öffnen. Three.js wird von jsDelivr geladen, beim ersten Start ist also eine Internetverbindung nötig.

## Steuerung

| Taste | Aktion |
|---|---|
| `↑` | Paddeln (wiederholt drücken) · auf der Welle: pumpen für mehr Speed |
| `↓` | Bremsen · in die Tube stallen |
| `←` `→` | Lenken: zur Wand hoch oder runter ins Wellental · in der Luft drehen |
| `Leertaste` | Aufstehen beim Take-off · Sprung von der Lippe |
| `Esc` / `P` | Pause |

WASD funktioniert ebenfalls. Auf Touch-Geräten erscheinen ein Steuerkreuz und ein Sprung-Button.

## Wertung

- **Tube**: Zeit unter der Lippe, tiefer (näher an der Brechung) zählt mehr. Nur wer sauber wieder rauskommt, bekommt die Punkte.
- **Turns**: Bottom Turn, Snap/Top Turn, Re-entry von der Lippe, Cutback und Roundhouse Cutback. Speed und Höhe auf der Wand erhöhen die Punkte.
- **Airs**: an der Lippe mit Schwung nach oben springen. Air, Air Reverse, Full Rotation, 540. Die Landung muss vorwärts oder rückwärts ausgerichtet sein.

Jeder Spot gewichtet die drei Kategorien unterschiedlich. Dasselbe Manöver bringt bei Wiederholung weniger Punkte. Aus der Punktsumme wird eine Wertung von 0 bis 10 berechnet; der Bestwert pro Spot wird im Browser gespeichert.

## Technik

- `src/wave.js` – Wellenmodell: Querschnitte als Spline, der von glatter Dünung über steile Wand bis zur Barrel-Röhre morpht, vorberechnet als Tabelle über den Abstand zur Brechung. Dieselbe Tabelle treibt GPU-Mesh und Physik.
- `src/water.js` – Wasser-Shader: Himmelsreflexion, Fresnel, Sonnenglitzern, Lichtdurchschein in dünnen Lippen, Schatten im Tube-Inneren, Schaum.
- `src/rider.js` – Paddeln, Take-off, Fahrphysik auf der Wand, Airs, Wipeouts, Trick-Erkennung und Wertung.
- `src/surfer.js` – Surfer aus Grundkörpern mit Zwei-Knochen-IK für Beine und Arme.
- `src/spots.js`, `src/scenery.js` – Spot-Definitionen und Landmarks.
- `src/fx.js` – Gischt, Offshore-Spray, Barrel-Spit.
