# AES67 Stream Monitor

[![GitHub](https://img.shields.io/github/stars/stoeckenm/aes67-monitor?style=flat&label=GitHub%20%E2%AD%90)](https://github.com/stoeckenm/aes67-monitor)
[![license](https://img.shields.io/github/license/stoeckenm/aes67-monitor.svg)](https://github.com/stoeckenm/aes67-monitor?tab=MIT-1-ov-file)
[![release](https://img.shields.io/github/v/release/stoeckenm/aes67-monitor?display_name=tag)](https://github.com/stoeckenm/aes67-monitor/releases/latest)

AES67 Stream Monitor ist eine plattformübergreifende Audio-over-IP-Monitoring-Anwendung, konzipiert für Live-Sound, Studio- und Broadcast-Umgebungen. Getestet mit AES67-kompatibler Dante-Hardware, bietet die Anwendung umfassende Funktionen zur Verwaltung und Analyse von Audio-over-IP-Streams:

- **Extensive Format Support:** Unterstützt die volle Bandbreite der Audioformate, wie in den AES67-, RAVENNA- und ST 2110-30-Standards definiert. Dies umfasst unkomprimiertes L16- und L24-PCM-Audio über bis zu 64 Kanäle, verschiedene Abtastraten (48000Hz, 96000Hz und mehr) und alle durch die Standards spezifizierten Paketzeiten, abhängig von den Fähigkeiten Ihrer Soundkarte.
- **Automatische Erkennung & Manuelle Streams:** Erkennt AES67-Streams automatisch über das Session Announcement Protocol (SAP). Manuelles Hinzufügen von Streams ist zusätzlich durch direkte Eingabe von Raw-SDP-Daten möglich.
- **Stream-Filterung und -Sortierung:** Einfaches Filtern und Sortieren von Streams, um schnell die benötigten Kanäle zu finden.
- **Selektives Channel Listening:** Auswahl spezifischer Kanäle zum Abhören, mit Unterstützung für Stereo-Paare und individuelle Mono-Kanäle.
- **Konfigurierbare Systemschnittstellen:**
  - **Netzwerk:** Konfigurierbare Netzwerkschnittstellen für Stream-Empfang und SAP-Erkennung.
  - **Audio:** Auswahl spezifischer Audio-Schnittstellen und Konfiguration der **RTP-Pufferung** (Jitter Buffer), um die Stabilität bei Netzwerkproblemen zu erhöhen.
- **Audiogeräte mit bevorzugtem Gerät:** Eine eigene Seite listet die Ausgabegeräte mit Kanälen und Sampleraten. Ein Gerät kann als **bevorzugt** markiert werden: es wird benutzt, sobald es angeschlossen ist — auch nach einem Neustart. Fehlt es, läuft die Ausgabe über das Ersatzgerät weiter und übernimmt von selbst wieder, sobald das Gerät zurück ist. Alternativ folgt der Monitor der System-Audioausgabe; die Seite sagt immer, welches Gerät aus welchem Grund aktiv ist.
- **Admin Mode:** Optionale Ausblendung aller Einstellungen, wenn der Admin-Modus deaktiviert ist.
- **Kanal-Verwaltung:** Eine eigene Adminseite zum Einrichten der Kanäle, die Bediener sehen: Anzeigename, Quelle, Kanalzuordnung und Reihenfolge an einer Stelle, mit Vorschau der Bedienansicht.
- **Datenpersistenz:** Getrennte Speicherung von **maschinenspezifischen Einstellungen** (`persistentData`) und **benutzerspezifischen UI-Einstellungen** (`userData`).

---

## ⚙️ Architektur & Entwicklungshinweise

Die Anwendung basiert auf Electron und Vue 3 (Vite, Pinia, vue-i18n). Die kritischen Prozesse für AES67-Netzwerkerkennung (`src/lib/sdp.js`) und Audio-Wiedergabe (`src/lib/audio.js`) laufen als eigene Node-Prozesse (`child_process.fork`) und werden vom Hauptprozess überwacht und bei einem Absturz automatisch neu gestartet.

Die Oberfläche ist bewusst zweigeteilt:

- **Bedienansicht:** ausschließlich große Kanal-Kacheln mit Abhören/Stopp. Keine technischen Details.
- **Adminansicht:** nach Aufgaben geordnete Navigation — Übersicht (läuft es?), Kanäle (was sehen Bediener?), Streams (was ist im Netz?), Sender (wer sendet?) und Einstellungen. Über das Schloss-Symbol und optional ein Passwort erreichbar.

Die Backend-Logik ist unterteilt in:

- **`backend/system/`**: Netzwerkschnittstellen, `audify`/RtAudio-Geräteverwaltung und die Passwortprüfung.
- **`backend/persistence/`**: asynchrones, atomares Speichern und Laden der Konfiguration, inklusive Migration älterer Formate.
- **`backend/ipc/`**: Kommunikation zwischen Renderer und Hauptprozess.

Vite bündelt ausschließlich den Renderer. `main.js`, `preload.js`, `backend/` und `src/lib/` bleiben CommonJS und werden von Electron direkt geladen.

Die maschinenweite Konfiguration liegt unter Windows in `%ProgramData%\StreamMonitor`, die benutzerspezifische unter `%APPDATA%\StreamMonitor`.

## 📸 Screenshots

Below are some screenshots showcasing the application's interface. **Hinweis:** diese Aufnahmen zeigen noch die Navigation vor der Überarbeitung des Adminbereichs.
![Screenshot](.doc/streams.png "Screenshot of streams overview page")
![Screenshot](.doc/details.png "Screenshot of stream details page")
![Screenshot](.doc/settings.png "Screenshot of settings page")
![Screenshot](.doc/favorites.png "Screenshot of favorites page")
![Screenshot](.doc/admin_favorites.png "Screenshot of favorites page with active admin mode")
![Screenshot](.doc/admin_settings.png "Screenshot of settings page with updated audio configs")

## Installation

See the [lastest release](https://github.com/stoeckenm/aes67-monitor/releases/latest) for ready-to-use binaries for MacOS, Windows and Linux. Please note that the binaries are currently not signed.

## Installation and Building from source

```

git clone [https://github.com/stoeckenm/aes67-monitor.git](https://github.com/stoeckenm/aes67-monitor.git)
cd aes67-monitor
npm install

```

This installs all dependencies for your platform. **Audify** (das verwendete Audio-Backend auf Basis von RtAudio) prebuilds sind für die meisten wichtigen Plattformen und NodeJS-Versionen verfügbar. Sollten native Module fehlschlagen, siehe [Build Audify from Source](https://github.com/almoghamdani/audify#requirements-for-source-build).

Nach einer erfolgreichen Installation, erstellen Sie das Binary für Ihr System durch Ausführen von:

```

npm run build

```

Dies erstellt die Binaries für die aktuelle Plattform (MacOS, Windows, Linux).

## Development

### Frontend mit Hot Reload starten

```
npm run dev
```

### Electron starten

Dafür muss `npm run dev` ebenfalls laufen.

```
npm start
```

#### Erster Start hinter einem Proxy

Electron 45 hat kein `postinstall`: die Electron-Binary wird erst beim ersten
`npm start` heruntergeladen, nicht bei `npm install`. `@electron/get` benutzt dafür
Nodes globales `fetch`, und das ignoriert `HTTP_PROXY`/`HTTPS_PROXY` — hinter einem
Proxy bricht der erste Start deshalb mit `TypeError: fetch failed` ab.

Abhilfe, einmalig nötig (cmd):

```
set "ELECTRON_GET_USE_PROXY=true"
npm start
```

Der Proxy muss dabei als Umgebungsvariable vorliegen (`HTTPS_PROXY`); eine nur in
`.npmrc` hinterlegte Proxy-Konfiguration wird nicht gelesen. Verlangt der Proxy
NTLM/Kerberos, hilft keine Variable — dann die passende
`electron-v<version>-win32-x64.zip` aus dem GitHub-Release im Browser laden und nach
`%LOCALAPPDATA%\electron\Cache\<sha256 der Release-URL>\` legen; der nächste
`npm start` entpackt sie ohne Netzzugriff. `npm run build` ist nicht betroffen.

### Tests, Lint und Formatierung

```
npm test
npm run lint
npm run format
```

## Testing

New releases of the AES67 Stream Monitor are tested using both AES67-compliant hardware and software to ensure reliable stream discovery and accurate audio playback. Testing is primarily conducted on macOS, with additional testing performed on Windows. Furthermore, new releases may be tested by [partners](#partners) on various hardware and platforms.

### Hardware

The following hardware devices are used during testing:

| Manufacturer | Device                       | AoIP Protocol        | Discovery                                            | Codec | Sample Rate | Channels per Stream | Packet Time |
| :----------- | :--------------------------- | :------------------- | :--------------------------------------------------- | :---- | :---------- | :------------------ | :---------- |
| Audinate     | AVIO USB-C                   | AES67 (Dante flavor) | [SAP](https://datatracker.ietf.org/doc/html/rfc2974) | L24   | 48 kHz      | 1 – 2               | 1 ms        |
| Behringer    | WING Compact w/ Dante Module | AES67 (Dante flavor) | [SAP](https://datatracker.ietf.org/doc/html/rfc2974) | L24   | 48 kHz      | 1 – 8               | 1 ms        |
| Blackmagic   | 2110 IP Mini BiDirect 12G    | ST 2110-30           | [NMOS](https://specs.amwa.tv/nmos/)                  | L24   | 48 kHz      | 2 – 16              | 0.125 ms    |

### Software-Generated Streams

GStreamer is used to generate AES67-compliant RTP streams with the following configurations:

| Codec | Sample Rate | Channels | Packet Time |
| :---- | :---------- | :------- | :---------- |
| L16   | 44.1 kHz    | 1        | 1 ms        |
| L16   | 44.1 kHz    | 8        | 1 ms        |
| L16   | 48 kHz      | 1        | 0.125 ms    |
| L16   | 48 kHz      | 1        | 1 ms        |
| L16   | 48 kHz      | 2        | 4 ms        |
| L16   | 48 kHz      | 4        | 2 ms        |
| L16   | 48 kHz      | 8        | 0.125 ms    |
| L16   | 48 kHz      | 8        | 1 ms        |
| L16   | 48 kHz      | 64       | 0.125 ms    |
| L16   | 96 kHz      | 1        | 0.125 ms    |
| L16   | 96 kHz      | 1        | 1 ms        |
| L16   | 96 kHz      | 4        | 1 ms        |
| L16   | 96 kHz      | 8        | 0.125 ms    |
| L16   | 96 kHz      | 32       | 0.125 ms    |
| L24   | 44.1 kHz    | 1        | 1 ms        |
| L24   | 44.1 kHz    | 8        | 1 ms        |
| L24   | 48 kHz      | 1        | 0.125 ms    |
| L24   | 48 kHz      | 1        | 1 ms        |
| L24   | 48 kHz      | 2        | 4 ms        |
| L24   | 48 kHz      | 4        | 2 ms        |
| L24   | 48 kHz      | 8        | 0.125 ms    |
| L24   | 48 kHz      | 8        | 1 ms        |
| L24   | 48 kHz      | 64       | 0.125 ms    |
| L24   | 96 kHz      | 1        | 0.125 ms    |
| L24   | 96 kHz      | 1        | 1 ms        |
| L24   | 96 kHz      | 4        | 1 ms        |
| L24   | 96 kHz      | 8        | 0.125 ms    |
| L24   | 96 kHz      | 32       | 0.125 ms    |

For details on the software testing implementation and SDP files, please refer to [philhartung/aoip-tester](https://github.com/philhartung/aoip-tester).

## Partners

This section is dedicated to partners supporting the development of AES67 Stream Monitor. Partners listed here provide resources that help advance the project in various ways. This may include testing new releases on AoIP hardware by the partner, supplying hardware for testing, or offering financial support for new features or the general development of AES67 Stream Monitor. Partners are essential to ensure that AES67 Stream Monitor works as expected and to provide critical feedback on which features are needed for wider adoption.

Partners receive higher priority for bug reports & feature requests, are provided early access builds and are listed in this section. Partners also have a direct channel of communication and receive feedback on any hardware they provide for testing. If you're interested in becoming a partner, feel free to reach out via email at partners [at] aes67.app.

### Current Project Partners

| Partner                                                                                                                                                                                                                                                                                                                       | Type of Partnership | Description                                                                                                                                                                                                                                |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="https://hochschulradio-aachen.de"><picture><source media="(prefers-color-scheme: dark)" srcset=".doc/logo-hochschulradio-light.png"><source media="(prefers-color-scheme: light)" srcset=".doc/logo-hochschulradio-dark.png"><img alt="Hochschulradio Aachen" src=".doc/logo-hochschulradio-dark.png"></picture></a> | Testing & Feedback  | RWTH Aachen University's campus radio station is a founding partner and has played a key role since the beginning of the project. Every new release is tested on their hybrid Dante / AES67 network in a real-world broadcast environment. |
