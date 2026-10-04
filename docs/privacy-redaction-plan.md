# Socrates: Plan fuer sensible Daten

Stand: 2026-10-04. Branch: `feat/sensitive-data-redaction`. Analysebasis: `f73e009`.
Status: Kernimplementierung vorhanden, lokal mit synthetischen Daten getestet.
Cloud-Aktivierung und Freigabe fuer echte Daten stehen noch aus.

## Umsetzungsstand

Presidio ist wieder der einzige reale Schutzpfad. Die zwischenzeitliche
Node-only-Alternative wurde entfernt. App und Backend bleiben auf Vercel;
der Presidio-Dienst wird separat mit `render.yaml` gehostet. Fehlende Konfiguration
blockiert die Weitergabe. Aktuelle Anleitung: [Vercel Quickstart](privacy-vercel-quickstart.md).

- Implementiert: lokaler DE/EN-Presidio-Dienst, Pixel-Schwaerzung VOR Claude/Focus/
  Speicherung, Textschutz, geschuetzter Bildabruf, Owner-/Reader-Pruefung,
  sofortige Browser-Pause und Datenbank-Versionen gegen verspaetete Ergebnisse.
- Verifiziert: 9 echte OCR-/Service-Tests, 12 Node-Integrationstests ohne externe
  Modellaufrufe; SQL-Sperren/Rollen in temporaerem PostgreSQL getestet.
  Typecheck, Lint, Build und lokale Browserchecks fuer Desktop/Mobil sowie
  Pause/Resume sind erfolgreich; der geschuetzte Bildabruf verwendet Blob-URLs.
  Synthetische OCR-Fixtures: 18/28 px Schrift, DE/EN, ca. 0.42-0.74 s pro Bild
  im warmen lokalen Test. Kein allgemeiner Produktionsbenchmark.
- Akzeptierte Grenze: Live-Audio geht weiterhin direkt zu ElevenLabs. Kein lokaler
  ASR-Umbau und keine Aenderung eurer Agenten-/Retention-Konfiguration.
- Nicht ausgefuehrt: echte Supabase-Migration, Cloud-Deployment, Altbestand-Backfill
  oder Loeschung. Kein vollstaendiger Multi-Instanz-End-to-End-Test mit Supabase;
  RPC-Fences wurden isoliert geprueft. Keine manuelle Masken- oder Sharing-UI.
- Aktuelle Start-/Aktivierungsschritte: [privacy/README.md](../privacy/README.md).

Die folgenden Abschnitte erhalten den urspruenglichen Analyse-/Zielplan. Geplante
Details sind nicht automatisch implementiert; der Umsetzungsstand oben und die
Betriebsdoku sind fuer den aktuellen Branch massgeblich.

## 1. Auftrag und Entscheidung

`web/file.pdf`, Seite 6, empfiehlt Microsoft Presidio fuer persoenliche Daten in
Transkripten und Frames. Seite 4 verlangt Schutz persoenlicher Bildschirmdaten und
"off the record". `AGENTS.md`, Abschnitt 6, verlangt serverseitige Schwaerzung vor
Speicherung/Anzeige; waehrend off-record keine Frames, Speicherung oder Fragen.
Fuer Tests werden ausschliesslich synthetische Daten verwendet.

Empfehlung: Presidio als selbst gehosteten Python-Dienst einsetzen. Er schuetzt
Bilder UND Texte vor Speicherung und vor weiteren Modellaufrufen. Die bestehende
React/Vite/Node/Supabase-Architektur bleibt bestehen. Kein neuer Frontend-Stack.

Wichtige aktuelle Einschraenkungen:

- Presidio wird inzwischen unter Data Privacy Stack weitergefuehrt; die alten
  Microsoft-Container erhalten keine neuen Versionen. Neue Images aus GHCR bzw.
  eigene Builds verwenden und Version/Digest festschreiben.
  [Projektuebergang](https://github.com/data-privacy-stack/presidio/blob/main/docs/project_transition.md)
- Der Image Redactor ist offiziell Beta und nicht als produktionsreif bezeichnet.
  Erst einen Qualitaets-/Latenztest durchfuehren, dann ueber den Einsatz entscheiden.
  [Image Redactor](https://presidio.dataprivacystack.org/image-redactor/)
- Automatische Erkennung garantiert nicht, dass alle sensiblen Daten gefunden
  werden. Ein erfolgreicher Scan ist keine Zusicherung vollstaendiger Anonymitaet.
  [Presidio](https://github.com/data-privacy-stack/presidio)
- Stabile Ersatznamen sind Pseudonymisierung, nicht automatisch Anonymisierung.
  Kontext kann Personen weiterhin identifizierbar machen.
  [EDPB: Abgrenzung](https://www.edpb.europa.eu/topics/ai-and-technology/anonymisation-pseudonymisation_en)

## 2. Konkrete Luecken in der Analysebasis

Zeilen beziehen sich auf die Analysebasis; sie verschieben sich bei Aenderungen.

| Stelle | Befund | Konsequenz |
| --- | --- | --- |
| `web/server/capture.ts:222-269` | `saveFrame(tick.image)` erfolgt vor Vision; vorige und aktuelle Originalbilder gehen an das Modell. | Schutz muss VOR Speicherung, Vision und Focus erfolgen. |
| `web/server/store.ts:125`, `web/server/db.ts:209-215` | Frames enthalten rohe Bytes; vorhandene Frames werden in Supabase hochgeladen. | Auch ein nachfolgender Request kann ein zuvor liegengebliebenes Original hochladen. |
| `web/src/components/screen-moment-view.tsx:32-38` | Schwaerzungen sind nur HTML-Overlays ueber dem Originalbild. | Download oder Entfernen des Overlays legt die Daten frei. |
| `web/server/router.ts:173-179` | Bildroute umgeht `requireUser`; Bilder werden einen Tag gecacht. | Privater Storage-Bucket allein schuetzt diese Proxy-Route nicht. |
| `web/server/auth.ts`, `web/server/db.ts`, `web/supabase/schema.sql` | Anmeldung ist vorhanden, aber Session-/Workflow-Zugriffe sind nicht eigentuemerbezogen. Ohne Supabase-Konfiguration ist das Backend offen. | Gueltiges JWT ist noch keine Berechtigung; Echtbetrieb braucht Zugriffsschutz. |
| `web/src/features/capture/use-capture-loop.ts:92-95` | ERP-Feldwerte/Aktionen gehen direkt als Voice-Kontext zu ElevenLabs. | Reine Screenshot-Schwaerzung schliesst diesen Textweg nicht. |
| `web/src/lib/voice/use-voice-agent.ts:81-134` | Tool-Parameter und Nachrichten werden roh in die App-Unterhaltung aufgenommen; Kontext geht direkt zum Agenten. | Auch lokale Anzeige, Typing, Tools und dynamische Variablen brauchen einen Textschutz. |
| `web/server/workmap.ts`, `web/server/teach.ts` | Antworten, Zitate, Korrekturen, Fragen und Datensaetze gelangen ungeschuetzt in Workflows/Modellkontext. | Capture allein reicht nicht; Map, Ask, Teach und Workflow-Drafter gehoeren dazu. |
| `web/src/features/capture/session-page.tsx:237`, `web/server/capture.ts:226` | Off-record setzt Status, beendet aber nicht die Voice-Verbindung; laufende Jobs werden nicht durchgehend verworfen. | Datenschutzpause braucht Transportstopp und Schutz gegen verspaetete Ergebnisse. |
| `web/src/features/teach/lesson-page.tsx:120` | Bei einem fehlgeschlagenen Check wird Speichern erlaubt. | Bei Datenschutzfehlern muss die Entscheidung angehalten werden. |
| `web/src/lib/capture/screen.ts:2-48` | Frames werden bereits auf 1280 Pixel und JPEG-Qualitaet 0.7 reduziert. | Kleine Schrift kann vor OCR unlesbar werden. |
| `web/server/router.ts:196`, `web/server/capture.ts:141` | Fehler und Captions koennen in Logs/Fehlerantworten auftauchen. | Keine Rohinhalte, OCR-Treffer oder Provider-Payloads loggen. |

## 3. Ziel-Datenfluss und Vertrauensgrenze

```text
Browser: Screenshot / strukturierte Felder / Text
  -> eigenes Backend: Auth, Berechtigung, Limits, Session-Pausenstatus
  -> eigener Privacy-Dienst: OCR + Erkennung + destruktive Schwaerzung / Ersatztexte
  -> validierte, verarbeitete Bilder und Texte
  -> Vision / Focus / Workflow-Modelle / App-eigener ElevenLabs-Kontext
  -> Supabase + berechtigte Anzeige
```

Rohe Daten existieren dabei kurzzeitig im Browser, im eigenen Backend und im
eigenen Privacy-Dienst. Sie werden dort nicht absichtlich persistiert oder
geloggt. Das ist KEIN Versprechen, dass nichts das Geraet verlaesst oder dass
Speicherbytes in JavaScript/Python sicher geloescht werden koennen. Hosting,
Monitoring, Crash-Dumps und Request-Logging gehoeren ebenfalls zur Pruefung.

Ausnahme des aktuellen Stacks: Live-Mikrofon-Audio geht direkt zu ElevenLabs.
Spaetere Transkript-Schwaerzung schuetzt unsere App/DB, nicht die vorherige
Verarbeitung des Audios beim Voice-Anbieter. Soll auch dieser Rohdatenweg
ausgeschlossen werden, braucht es lokale/eigene Spracherkennung und eine neue
Voice-Architektur. Das ist ein separater Auftrag, nicht mit Presidio allein geloest.

## 4. Schutzregeln: Was entfernen, was erhalten?

| Daten | Standardregel | Begruendung |
| --- | --- | --- |
| Namen Dritter, E-Mail, Telefon, Privatanschrift | Bilder deckend schwaerzen; Text durch typisierte Platzhalter ersetzen. | Personenbezug minimieren. |
| IBAN, Kontodaten, Kartennummern | Schwaerzen/ersetzen, soweit fuer den gezeigten Prozess nicht zwingend erforderlich. | Zahlungsidentifikatoren. |
| Passwoerter, API-Keys, Tokens | Immer entfernen; bekannte Felder manuell maskieren. | Gesonderte Secret-Regeln noetig, keine Vollstaendigkeitsgarantie fuer beliebige Secrets. |
| Lieferanten-/Kundennamen, Kunden-/Rechnungskennungen | Nach Freigabe der Geschaeftsregel als vertraulich behandeln; eigene Recognizer/Feldregeln. | Nicht jede Unternehmensinformation ist ein eingebauter PII-Typ. |
| Wiederkehrender Lieferant | Stabiler Ersatzname im freigegebenen Team-/Policy-Bereich. | Dezember-Ausnahme und Memory-Matching bleiben nachvollziehbar. |
| Experten-/Lernendenname | Kontoprofil getrennt behandeln; Attribution nur bewusst freigeben. | Nicht versehentlich alle Profildaten an Modelle weiterreichen. |
| Betraege, EUR-5.000-Grenze, Kostenstellen 0400/4711 | Erhalten, sofern nicht ausdruecklich anders klassifiziert. | Sonst zerstoeren wir die Entscheidungslogik. |
| Dezember und tschechische Tochtergesellschaft | Geschaeftsregel erhalten; nicht pauschal alle Daten/Orte loeschen. | Fuer die richtige Entscheidung relevant. |

Deutsch UND Englisch explizit konfigurieren: NLP-Modelle, Recognizer und
sprachabhaengige Kontextwoerter. Die Standardkonfiguration ist nicht automatisch
zweisprachig. [Sprachen](https://presidio.dataprivacystack.org/analyzer/languages/)
Fachliche Geheimnisse brauchen eigene Regeln neben eingebauten Entitaeten.
[Entitaeten](https://presidio.dataprivacystack.org/supported_entities/)

Fuer stabile Ersatznamen: serverseitig schluesselbasierte HMAC-Aliase mit festem
Namespace und Policy-Version. Keine einfache Hashfunktion fuer erratbare Namen,
keine persistente Tabelle mit Klartext-zu-Alias-Zuordnungen. Die exakte
Normalisierung und der Geltungsbereich werden anhand der Memory-Fixtures getestet.
Ein Alias in Texten garantiert keine visuelle Wiedererkennung schwarz maskierter
Namen; wo noetig liefert das Backend den ebenfalls geschuetzten Feldkontext.

## 5. Neue Komponenten und Schnittstellen (geplant)

### Privacy-Dienst unter `privacy/`

- Python/FastAPI, Presidio Analyzer/Anonymizer/Image Redactor, lokale Tesseract-OCR
  mit `deu+eng`, passende deutsche/englische NLP-Modelle.
- Eigener Docker-Build mit festgeschriebenen Versionen; Modelle beim Build laden,
  nicht pro Request. Ohne Azure-OCR braucht Presidio keinen Microsoft-Account/API-Key.
- Geplante interne Endpunkte: `POST /redact/image`, `POST /redact/text`, `GET /health`.
- Authentifizierte Aufrufe; lokal an Loopback binden, produktiv HTTPS.
- Bildergebnis: neu codierte Bytes, MIME, Dimensionen, normalisierte Rects,
  Policy-Version und sichere Status-/Zaehlerdaten. Keine Original-Trefferwerte.
- Textergebnis: Ersatztext und sichere Metadaten, keine Klartext-Matchliste.
- Deckende Pixelmasken mit geprueftem Rand, keine CSS-Maske/Weichzeichnung.
  Bildmetadaten entfernen; Rects beziehen sich exakt auf das ausgegebene Bild.
- Harte Byte-/Pixel-Limits, MIME-/Decoderpruefung, Timeouts, keine beliebigen
  Download-URLs, keine persistierten Originaldateien oder Request-Body-Logs.
- OCR-Qualitaet und bekannte sensible Felder pruefen; unlesbarer relevanter Text
  fuehrt zum Blockieren/erneuten Erfassen. "Keine Treffer" beweist keinen Schutz.
- Nichttextliche Inhalte wie Gesichter oder QR-Codes sind nicht automatisch
  abgedeckt. Bekannte Bereiche vorab ausschliessen/manuell maskieren.

### Node-Backend: ein verbindliches Privacy-Gateway

Geplant: `web/server/privacy.ts` fuer Service-Client, Response-Validierung,
Policy-Pruefung, strukturierte Textfelder und sichere Fehler.

`processTick` erhaelt folgende Reihenfolge:

1. Session-Berechtigung/Pausenstatus pruefen; Pipeline-Busy vor erstem OCR-Await setzen.
2. Eingaben validieren. ERP-Texte bereits vor Buffer-Aufnahme bereinigen.
3. Bild verarbeiten; bei Service-/OCR-/Validierungsfehlern blockieren, nie Rohfallback.
4. Pausen-/Versionsstatus erneut pruefen; nur verarbeitete Bytes speichern/verlinken.
5. Vorige UND aktuelle verarbeitete Frames an Vision; Focus nutzt dieselben Bytes.
6. Modelltexte vor Events, Fragen, Workflow, Agent-Kontext und Rueckgabe erneut pruefen.
7. Spaete Ergebnisse einer pausierten/veralteten Session verwerfen; Busy im `finally` loesen.

`saveFrame` nimmt nur einen serverseitig erzeugten und validierten
`ProcessedFrame` an, nicht beliebige Base64-Strings oder Client-Flags. Das ist
eine Pipeline-Invariante, keine Garantie, dass der Erkenner nichts uebersehen hat.
Storage-Upload prueft Policy/Status ebenfalls. Frame-IDs erhalten volle UUIDs.
Frame-Metadaten speichern Session, Berechtigungskontext, Policy, Dimensionen und
Rects, aber keine gefundenen Klartextwerte. Historische Frames gelten nicht
automatisch als verarbeitet.

Textschutz erfasst Intake, Events, ERP, Debrief, Teach-back-Korrekturen, Zitate,
Ask, Teach-Checks, Drafter, Tool-Parameter/-Ergebnisse und dynamische Variablen.
Strukturierte Felder einzeln behandeln; nicht blind JSON-Zahlen/IDs mit Regex
ersetzen. Zitate behalten Wortlaut ausser sensiblen Ersetzungen sowie Quelle und
Zeitstempel; eine Kennzeichnung macht die Ersetzungen sichtbar. Kein paralleles
Originalzitat speichern.

### Browser, Anzeige und Vertrag

- Direkte rohe ERP-Kontextupdates entfernen. Nur bereinigte Backend-Ergebnisse
  an den Voice-Agenten geben; auch Typing/Tools/dynamische Variablen zentral schuetzen.
- Neue App-API fuer geschuetzte Textaufbereitung ueber `SocratesApi` einbauen.
  Vor lokalem Transcript-Append sanitizen; beim eingehenden Live-Transkript ist
  ElevenLabs bereits vorher beteiligt gewesen.
- `TickResult`/Privacy-Metadaten unterscheiden verarbeitet/blockiert mit sicheren
  Fehlercodes; keine sensible Fehlermeldung aus dem Dienst an den Browser geben.
- Vertrag in `types.ts`, `client.ts`, `http.ts`, Mock und Hooks gemeinsam aendern.
  `WorkMap`-Bezeichner bleiben erhalten; Team ueber Vertragsaenderung informieren.
- OCR-taugliche Aufnahmequalitaet experimentell waehlen; erst NACH Schwaerzung
  fuer Vision verkleinern. Pixel-/Byte-Limits muessen zum gewaehlten Format passen.
- Bildroute hinter Auth UND Ressourcenberechtigung; no-store statt Tagescache.
  Gemeinsamer autorisierter Fetch mit Blob-URL fuer ScreenMomentView, Live-Steps,
  Cover und andere Bilder; Blob-URLs bei Unmount/Logout widerrufen.
- Kein JWT im URL-Query. Berechtigung pro Session/Workflow bzw. expliziter Freigabe
  pruefen; auch JSON-Listen/Details entsprechend begrenzen. Private Storage-Downloads
  unterstuetzen Authorization; signierte URLs bleiben bis Ablauf gueltig.
  [Supabase Downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- Echter Datenbetrieb darf bei fehlender Auth/Privacy-Konfiguration nicht offen
  weiterlaufen. Der ausdrueckliche synthetische Mock-Modus bleibt ohne Dienste nutzbar.

## 6. Off-record, Nebenlaeufigkeit und Voice

Beim Button oder Voice-Tool lokal sofort Aufnahme-/Kontext-/Fragenpfade sperren,
Voice-Verbindung beenden und Client-Buffer leeren. Wiederaufnahme per Button:
Ein abgeschaltetes Mikrofon kann den gesprochenen Resume-Befehl nicht empfangen.

Serverseitig Privacy-Zustand pro Session statt nur globalem `captureStatus`
verwalten. Eine autoritative Privacy-Version im Datastore verhindert, dass eine
andere Vercel-Instanz mit einem alten Zustand weiterarbeitet. Ergebnisse nur per
Versionsvergleich committen; keine rohen Antworten aus `recordEvent` zurueckechoen.
Neue Jobs und Dispatches bei Pause sperren, laufende Requests soweit moeglich
abbrechen, Warteschlangen leeren und spaete Ergebnisse nicht anwenden.

Eine reine In-Memory-Pruefung oder ein Check am Request-Anfang reicht nicht.
Der Pause-Acknowledgement muss mit laufenden Dispatch-/Storage-Operationen
koordiniert werden, z.B. per Session-Lease/Fencing und begrenzten Timeouts. Diese
Race-Eigenschaft ist ein eigener Integrationstest und Freigabepunkt, kein durch
ein einzelnes Flag geloestes Problem. Bereits gestartete externe Verarbeitung
laesst sich nicht rueckwirkend ungeschehen machen. Off-record-Ereignisse enthalten
nur Zeitspanne/Status, keine Inhalte.

Fuer alle verwendeten ElevenLabs-Agenten Audio Saving deaktivieren und eine
bewusste Retention konfigurieren. Retention 0 markiert Daten fuer die vorgesehene
Loeschung und ist nicht gleichbedeutend mit Zero Retention Mode. Enterprise bietet
gesonderten ZRM. Nachtraegliche History-Redaction ersetzt unseren vorgelagerten
Textschutz nicht. Account-Konfiguration wurde hier nicht geprueft/geaendert.
[Retention](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention),
[ZRM](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode)
Privacy-Einstellungen auch in `web/scripts/setup-agents.ts` aufnehmen, damit ein
spaeterer Agent-Sync sie nicht versehentlich ueberschreibt.

## 7. Umsetzung in kleinen, pruefbaren Schritten

| Schritt | Dateien/Bereich | Fertig, wenn ... |
| --- | --- | --- |
| 1. Policy und Spike | `privacy/`, synthetische DE/EN-Fixtures, Benchmark | benoetigte PII/Fachfelder erkannt, Pixel wirklich ersetzt, OCR-Qualitaet und Latenz dokumentiert; Go/No-Go fuer Image Redactor. |
| 2. Bildpipeline | `server/privacy.ts`, `capture.ts`, `store.ts`, `db.ts`, `focus.ts`, `lib/capture/screen.ts` | kein Original in Speicher/Storage/Vision/Focus; Fehler blockieren; ein Job pro Session. |
| 3. Zugriff/Metadaten | SQL-Migration, `auth.ts`, `router.ts`, gemeinsame Bildanzeige, API-Vertrag | unauthorisierte und fremde Zugriffe gesperrt; alle Bilder serverseitig verarbeitet. Keine komplette Billing-/Tenant-Plattform bauen. |
| 4. Texte und Voice-Kontext | `workmap.ts`, `teach.ts`, Voice-Hook, Capture/Teach/Drafter, API und Mock | alle App-kontrollierten Textwege geschuetzt; Zitatprovenienz erhalten; Datenschutzfehler halten Teach-Save an. |
| 5. Pause und Altbestand | Session-Privacy-Version, Capture-Loop, Voice-Lifecycle, Migrationswerkzeug | Off-record-Races und Multi-Instanz-Verhalten getestet; alte Daten nicht stillschweigend als sicher behandelt. |
| 6. Freigabe/Deployment | Testskripte, Env-Beispiel, Agent-Setup, Betriebsdoku | Abnahmetests, Mock, typecheck, lint und build gruen; Dienst/Provider-Konfiguration nachvollziehbar. |

Bild- und Textteil getrennt reviewen. Ein nur teilweise integrierter Dienst ist
noch KEINE Freigabe fuer echte Daten. Die Reihenfolge ist ein Implementierungsplan,
keine Zusage, dass einzelne Zwischenstaende bereits datenschutzsicher sind.

## 8. Altbestand und Hosting

Bestehende Supabase-Objekte/JSONB koennen Originale enthalten. Zuerst Inventar und
Referenzen ermitteln, unbekannte Frames sperren, dann nach expliziter Freigabe
verarbeiten: neue Objektschluessel, Referenzen/Metadaten atomar aktualisieren,
Ergebnis pruefen, danach Originale gemaess vereinbarter Loeschregel entfernen.
Keine automatische Loeschung bestehender Teamdaten ohne Freigabe. Backups, Logs,
bereits heruntergeladene Dateien und Voice-Anbieter-Historie separat behandeln.
Replay-Fixtures enthalten nur synthetische oder bereits geschuetzte Daten.

Empfohlen ist ein warmer EU-Container fuer OCR/NLP, z.B. Azure Container Apps.
Vercel behaelt das Node-Backend. Vercel unterstuetzt auch Python; die Trennung ist
eine Betriebsentscheidung fuer native OCR/NLP-Abhaengigkeiten, kein behauptetes
Python-Verbot. [Vercel Python](https://vercel.com/docs/functions/runtimes/python)
Vercel muss den Dienst erreichen koennen: authentifiziertes HTTPS oder explizite
private Netzwerkintegration, nicht einfach unerreichbare interne Ingress-Adresse.
[Azure Ingress](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview)
Ein EU-Privacy-Container macht Supabase/Vercel/ElevenLabs/Modellanbieter nicht
automatisch zu einer ausschliesslich europaeischen Verarbeitungskette.

Server-Umgebungsvariablen:

- `SOCRATES_PRIVACY_URL`: lokal `http://127.0.0.1:8081`, produktiv HTTPS.
- `SOCRATES_PRIVACY_TOKEN`: Dienstauthentifizierung, nur serverseitig.
- Kein `SOCRATES_PRIVACY_MODE`: realer Backend-Pfad ist immer geschuetzt;
  `npm run dev:mock` bleibt ein getrennter synthetischer Mock-Pfad.
- `SOCRATES_PRIVACY_TIMEOUT_MS`: begrenztes Request-Budget; Wert nach Benchmark waehlen.
- `SOCRATES_PRIVACY_ALIAS_KEY`: nur Privacy-Dienst, sicherer HMAC-Schluessel.

Keine Schluessel in `VITE_*`, Git oder Chat. Betriebsmetriken enthalten Dauer,
sicheren Fehlercode und aggregierte Trefferzahlen, keine PII oder Request-Inhalte.

## 9. Was Shisir machen muss

1. Docker Desktop starten, Linux-Engine aktivieren und `docker info` pruefen.
   Lokal ist die Engine inzwischen gestartet und das Image erfolgreich gebaut.
   Der konkrete Compose-Befehl steht in `privacy/README.md`.
2. Policy freigeben: DE/EN, Experten-Attribution, Lieferanten/Kunden als vertraulich,
   fuer Entscheidungen erforderliche Betraege/Kostenstellen und Alias-Geltungsbereich.
3. Voice-Grenze entscheiden: direkte ElevenLabs-Audioverarbeitung akzeptieren und
   transparent erklaeren, oder zusaetzliche lokale ASR-/Voice-Architektur beauftragen.
4. 10-20 repraesentative synthetische Screens/Transkripte bereitstellen oder die
   Erzeugung beauftragen: kleine Schrift, deutsche Namen, gemischte Sprachen,
   Zahlungen, Ausnahme-Lieferant, Popups und schwierig erkennbare Felder.
5. Fuer Deployment Container-Host/Region/Budget waehlen. Azure-Account nur noetig,
   falls Azure als Host gewaehlt wird, nicht fuer lokale Presidio-Nutzung.
6. In ElevenLabs alle eingesetzten Agenten auf Audio Saving/Retention/ZRM-Optionen
   pruefen; die konkrete Policy mit dem Team festlegen. Provider-Vertraege,
   Regionen und Logging fuer den geplanten Echtbetrieb ebenfalls klaeren.
7. Nach Umsetzung SQL-Migration und serverseitige Env-Werte einspielen; privaten
   Frames-Bucket und Berechtigungen verifizieren. Zugriff fuer andere Teammitglieder
   ueber explizite Workflow-Freigaben festlegen.
8. Altbestandsverarbeitung/Loeschung und Aufbewahrungsdauer freigeben. Bis zur
   erfolgreichen Abnahme ausschliesslich Fake-/Sandbox-Daten verwenden.

## 10. Verbindliche Abnahme

- Synthetische PII-Canaries duerfen nach dem Gateway nicht in Provider-Payloads,
  JSONB, Storage, API-Antworten, App-Transkripten oder Logs vorkommen. Tests mit
  Provider-Spies statt echten sensiblen Daten beim Modellanbieter.
- Pixeltests beweisen deckende Schwaerzung im direkt geladenen Bild, passende
  Rects/Dimensionen und korrekte Focus-Darstellung; Overlay-Entfernung hilft nicht.
- Vorige/aktuelle Frames und Hintergrund-Focus sind geschuetzt. Ein fehlgeschlagener
  Vision-Call hinterlaesst kein Original fuer einen spaeteren Storage-Upload.
- Fehler/Timeout, ungueltiges Bild, schlechte relevante OCR, fehlende Konfiguration
  oder ungueltige Dienstantwort: kein Rohfallback, klare sichere Blockade/Retry.
- 5.000-EUR-Grenze, 7.200-EUR-Fall, Kostenstellen, Dezember-/Tochtergesellschaftsregel
  und wiederkehrender Alias bleiben fachlich korrekt. Teach darf bei einem
  Datenschutzfehler keine falsche Entscheidung einfach speichern lassen.
- Pause waehrend OCR/Vision/Frage/Tool/Speech testen, auch mit zwei Backend-Instanzen.
  Neue Jobs sind gesperrt, spaete Ergebnisse verworfen, Buffer geleert und
  Voice-Transport beendet. Bereits gestartete Provider-Calls separat dokumentieren.
- Frame ohne Anmeldung: 401; fremde Session mit gueltigem JWT: 403/404;
  berechtigter Workflow-Leser funktioniert. Entsprechende JSON-Zugriffe ebenfalls testen.
- Ask, Drafter, Intake, ERP, Debrief, Korrektur, Typed Chat, Tools und dynamische
  Variablen testen; Modell-Ausgaben werden vor Speicherung/Weitergabe geprueft.
- Altbestand ohne Policy wird gesperrt; Migration erzeugt keine kaputten Verweise.
- Mock laeuft ohne Privacy-Dienst/Account. Falls Mock-Schwaerzungen gezeigt werden,
  sind die Fixture-Pixel bereits ersetzt, nicht nur per Overlay verdeckt.
- Fokussierte Python-/Node-Tests, manuelle DE/EN-Fixture-Pruefung, Latenzmessung,
  `npm run typecheck`, `npm run lint` und `npm run build` erfolgreich.

Nicht zugesichert: perfekte automatische Erkennung, Schutz beliebiger Nichttext-
PII, rueckwirkendes Entfernen bereits uebertragener Audiodaten oder rechtlich
vollstaendige Anonymitaet. Diese Grenzen muessen im Produktversprechen sichtbar sein.
