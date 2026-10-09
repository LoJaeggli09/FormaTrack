# FormaTrack — Gestionale Apprendisti

Applicazione desktop sviluppata con **Electron + React** per la gestione operativa degli apprendisti: calendario, note, registro attività, prenotazioni future, valutazioni e statistiche. I dati sono persistiti su **Supabase** (PostgreSQL cloud) e l'autenticazione avviene tramite credenziali gestite direttamente nella tabella `users`.

> **Nota storica**: fino alla v1.x l'app era un tracker del percorso formativo a obiettivi (piano formativo SEFRI, competenze, notifiche di completamento). Dalla v2.0 è stata trasformata in un gestionale apprendisti generico: obiettivi, notifiche, statistiche di progresso, ricerca ed export sono stati rimossi e sostituiti da calendario, note, attività, prenotazioni e un cruscotto dati.

---

## Ruoli

| Ruolo | Permessi |
|---|---|
| `student` (apprendista) | Gestisce il proprio calendario, note, attività e valutazioni; impostazioni personali, cambio password |
| `trainer` (formatore) | Seleziona un apprendista assegnato e ne gestisce calendario/note/attività/prenotazioni/valutazioni; accesso a Dati e Gestione Utenti/Aree di lavoro |
| `inspector` (ispettore) | Accesso in sola lettura agli apprendisti collegati, incluse le statistiche in Dati |
| `admin` | Gestione utenti e aree di lavoro completa, supervisione di tutti gli apprendisti dell'area di lavoro |
| `app_admin` | Come `admin` ma trasversale a tutte le aree di lavoro (multi-tenant); crea, archivia, ripristina ed elimina le aree di lavoro |

---

## Funzionalità principali

- **Autenticazione Supabase** con password hashate bcrypt. Al primo accesso con password predefinita (`Abc123!`) viene forzato il cambio password prima di accedere alla dashboard.
- **Restore sessione sicuro**: al refresh la sessione viene verificata direttamente sul DB per controllare il flag `must_change_password`.
- **Dashboard**: profilo dell'apprendista selezionato + grafico "Valutazioni per apprendista" (formatore/admin/ispettore).
- **Calendario**: viste mensile e settimanale, eventi ricorrenti (settimanale, quindicinale, mensile) con data di fine serie, esportazione `.ics` e stampa; eventi creati manualmente (verde), attività già svolte (giallo) e prenotazioni future (arancione) sullo stesso calendario, senza duplicare i dati. Eventi e attività si possono creare, modificare ed eliminare direttamente dal pannello del giorno selezionato.
- **Note**: annotazioni per apprendista con autore, data, categoria (generale, feedback positivo, richiamo, colloquio, obiettivo), visibilità (condivisa con l'apprendista oppure privata del formatore) e stato letto/non letto.
- **Attività**: tabella delle attività svolte da un apprendista — data/orario apprendista, orario formatore, numero apprendisti coinvolti, tipo attività, descrizione, durata stimata, sede, ticket. Barra filtri (testo, periodo, tipo, sede, stato), ordinamento per colonna, paginazione a 50 righe, duplicazione di una riga e modelli riutilizzabili salvati per utente.
- **Inserimento attività** a due livelli: il modulo "Nuova attività" mostra subito solo l'essenziale (attività svolta, tipo, data, durata); orari, numero di apprendisti, sede e ticket si aprono con "Aggiungi dettagli" (e si aprono da soli quando un modello o una duplicazione li compila). I campi obbligatori hanno l'asterisco, il pulsante "Aggiungi attività" resta spento finché mancano, i modelli stanno in testata e "Salva modello" in fondo al modulo. Lo stesso modulo (`ActivityFormFields`) serve anche la Prenotazione.
- **Validazione attività**: flusso `bozza → inviata → validata / respinta` con firma (nome + data) del formatore. Le attività create direttamente dal formatore nascono già validate; se l'apprendista modifica una riga validata, questa torna in bozza.
- **Prenotazione**: il formatore pianifica in anticipo un'attività futura per l'apprendista (data obbligatoriamente futura, orario, durata stimata, tipo). Compare automaticamente sia nel registro Attività sia nel Calendario.
- **Assenze**: registro di malattia, vacanze, scuola, corsi interaziendali, servizio militare e altro, con mezze giornate, flag di giustificazione e conteggio sui soli giorni lavorativi. Compaiono nel calendario come quarto colore e nelle statistiche.
- **Allegati**: file (PDF, foto, certificati) collegati a una singola attività o nota, su bucket privato Supabase Storage; download tramite finestra di salvataggio nativa.
- **Valutazioni**: ogni apprendista (o il formatore per l'apprendista selezionato) può registrare una valutazione con materia libera, voto (0–6) e una nota facoltativa. In Dashboard un grafico mostra andamento nel tempo, media progressiva, media per materia e soglia di sufficienza (4.0).
- **Dati**: statistiche aggregate su tutti gli apprendisti visibili (formatore/admin/ispettore), filtrabili per periodo (mese, trimestre, anno, intervallo personalizzato) — ore totali e per apprendista/tipo/mese, ore di affiancamento per formatore, sedi con più interventi, durata media, giorni di assenza e tasso di presenza.
- **Rapporto di formazione periodico**: PDF firmabile con riepilogo del periodo (attività, ore, assenze, medie per materia), commento del formatore e riquadro firme.
- **Promemoria**: campanella in alto a destra, accanto al logo (con il numero dei promemoria aperti), contatore in rosso sulle voci di menu che hanno qualcosa in sospeso e notifiche di sistema per prenotazioni di oggi/domani, attività da validare o respinte, apprendisti fermi da oltre 10 giorni, valutazioni mancanti, note non lette e assenze senza giustificativo. Per l'`app_admin` c'è anche il promemoria "Aree di lavoro eliminabili", che compare quando un'area è archiviata da almeno 30 giorni: serve solo ad avvisare e porta all'archivio, **non elimina nulla** (l'eliminazione si fa dall'archivio, con conferma). Disattivabili dalle impostazioni.
- **Gestione Utenti** (admin): organizzata in 4 tab — Utenti (ricerca/filtro/CRUD/promozione anno), Assegnazioni Bulk (assegna formatore a più apprendisti), Archivio (apprendisti archiviati, ripristinabili), Log Audit (storico azioni).
- **Aree di lavoro** (multi-tenant, solo `app_admin`): creazione area di lavoro con relativo admin, selezione area di lavoro attiva.
- **Archivio delle aree di lavoro** (solo `app_admin`): un'area si può archiviare (pulsante *Archivia* sulla sua scheda) e ripristinare. **Un'area archiviata continua a funzionare normalmente** — accessi, utenti e dati non cambiano —, esce solo dall'elenco attivo e finisce nell'*Archivio aree di lavoro*, dove si vede da quando è archiviata e da quando si può eliminare. L'eliminazione definitiva è possibile **solo dopo 30 giorni in archivio** (`ARCHIVE_RETENTION_DAYS` in `utils/workspaceArchive.js`), solo da quella pagina e solo dopo una conferma scritta (si digita il nome dell'area): elimina l'area, i suoi utenti e tutti i loro dati, file allegati compresi. Ripristinare un'area azzera il conteggio dei 30 giorni. Il limite è applicato anche dal database (vedi `supabase-workspaces-archive.sql`), non solo dall'interfaccia.
- **Impostazioni** organizzate in quattro gruppi di righe (titolo e spiegazione a sinistra, controllo a destra): *Interfaccia* (lingua, layout compatto, riduci animazioni), *Avvio e navigazione* (vista iniziale, ricorda l'ultimo apprendista, apprendista selezionato), *Promemoria e sicurezza* (promemoria, disconnessione automatica, cambio password) e *Applicazione* (versione, aggiornamenti, supporto).
- **Cambio password** con checklist requisiti in tempo reale (10–20 caratteri, maiuscole, minuscole, numero, simbolo speciale `! $ # _`).
- **Accessibilità**: navigazione da tastiera, focus trap nel menu, annunci screen reader.
- **Ricerca globale** (`Ctrl+K`): su note, attività, prenotazioni, eventi e valutazioni; formatore, admin e ispettore possono cercare su tutti gli apprendisti assegnati e saltare al risultato cambiando apprendista attivo.
- **Interfaccia multilingua**: Italiano, English, Deutsch, Français.
- **Session timeout**: logout automatico dopo 5 minuti di inattività con dialog di avviso 30 s prima.
- **Aggiornamenti automatici**: `electron-updater` scarica le nuove versioni dalle GitHub Release.

---

## Stack tecnologico

| Libreria | Versione | Uso |
|---|---|---|
| React | 18 | UI renderer |
| Electron | 40 | Desktop wrapper |
| Material UI | 7 | Componenti UI (switch, select, snackbar) |
| Framer Motion | 12 | Non più usato: il linguaggio visivo esclude le animazioni di entrata e di pagina |
| Lucide React | 0.294 | Icone |
| Recharts | 3 | Grafici a barre (sezione Dati, valutazioni per apprendista) |
| Supabase JS | 2 | Database cloud + realtime |
| bcryptjs | 3 | Hashing password |

---

## Requisiti

- Node.js 18+
- npm
- Account Supabase (progetto già configurato)
- Windows 10+ / macOS / Linux

---

## Installazione

```bash
git clone <REPO_URL>
cd "FormaTrack APP"
npm install
```

Crea un file `.env` nella root con:

```
REACT_APP_SUPABASE_URL=<url progetto Supabase>
REACT_APP_SUPABASE_ANON_KEY=<anon key progetto Supabase>
```

---

## Avvio in sviluppo

```bash
npm start
```

- `npm run react-start` — avvia React su porta **3003**
- `npm run electron-start` — avvia Electron
- `npm start` — avvia React + Electron insieme (usa `concurrently` + `wait-on`)

---

## Build produzione

```bash
npm run build
```

Esegue in sequenza:
1. build React (`react-scripts build`)
2. packaging Electron con `electron-builder` → output in `dist/`

### Output

Genera:
- `FormaTrack-2.1.60.exe` — installer NSIS per Windows
- `FormaTrack-2.1.60.exe.blockmap` — per aggiornamenti incrementali
- `latest.yml` — metadata per auto-updater

### Pubblicazione su GitHub Release

1. Vai a [GitHub Releases](https://github.com/LoJaeggli09/formatrack/releases)
2. Crea una nuova release con tag `v2.1.60`
3. Carica questi file:
   - `FormaTrack-2.1.60.exe`
   - `latest.yml`
   - `FormaTrack-2.1.60.exe.blockmap` (opzionale, per update più veloci)

L'app usa `electron-updater` per scaricare automaticamente l'installer dal release più recente.

---

## Versioning

Versione corrente: **`2.1.60`**

Regola incremento (script `version:bump`):
- patch standard: `1.1.0 → 1.1.1`
- rollover a 100: `1.1.99 → 1.2.0`

```bash
npm run version:bump
```

Aggiorna automaticamente `package.json` e `src/appVersion.js`. Lo script cerca anche di aggiornare una riga `## Ultime Migliorie (vX.X.X)` in questo README, se presente.

> Per un salto di versione non incrementale (es. il minor bump `2.0.13 → 2.1.0` della release Assenze/Validazione/Promemoria), aggiornare manualmente `package.json` e `src/appVersion.js`.

---

## Struttura progetto

```text
.
├── main.js                              # Electron main process
├── package.json
├── electron-builder.json
├── supabase-workspaces-policies.sql             # Schema + RLS: workspaces
├── supabase-calendar-notes-activities.sql       # Schema + RLS: calendar_events, notes, activities
├── supabase-activities-extra-fields.sql         # ALTER: tipo/orario/durata/sede/ticket su activities
├── supabase-activities-trainer-fields.sql       # ALTER: orario formatore + numero apprendisti su activities
├── supabase-activities-validation.sql           # ALTER: stato/validazione su activities (v2.1)
├── supabase-notes-structured.sql                # ALTER: categoria/visibilità/letto su notes (v2.1)
├── supabase-calendar-recurrence.sql             # ALTER: ricorrenze su calendar_events (v2.1)
├── supabase-absences.sql                        # Tabella absences + RLS (v2.1)
├── supabase-attachments.sql                     # Tabella attachments + bucket Storage (v2.1)
├── supabase-workspaces-archive.sql              # Archivio aree di lavoro: archived_at, blocco eliminazione prima di 30 giorni (v2.1)
├── public/
│   └── index.html
├── src/
│   ├── App.js                           # Root: gestione screen, sessione, inattività
│   ├── App.css                          # Stili delle schermate e delle sezioni (usa solo i token)
│   ├── styles/
│   │   ├── tokens.css                   # Token di design (colori, font, spazi, linee) e base
│   │   ├── tokens.js                    # Gli stessi token per il tema MUI (un test verifica che coincidano)
│   │   ├── controls.css                 # Componenti condivisi: campi, pulsanti, badge, tabelle, finestre
│   │   └── __tests__/                   # Guardia del linguaggio visivo (niente ombre, gradienti, raggi, hex)
│   ├── fonts/                           # Manrope e Source Sans 3 (woff2, sottoinsieme latino, in locale)
│   ├── appVersion.js                    # Versione (auto-aggiornato)
│   ├── i18n.js                          # Traduzioni (it, en, de, fr)
│   ├── supabaseClient.js                # Istanza Supabase
│   ├── theme.js                         # Tema MUI
│   ├── components/
│   │   ├── ForceChangePasswordModal.js  # Modal cambio password obbligatorio
│   │   ├── SideMenu.js                  # Menu laterale
│   │   ├── ProfileSection.js            # Profilo apprendista (vista Dashboard)
│   │   ├── CalendarSection.js           # Calendario mensile (eventi + attività + prenotazioni)
│   │   ├── NotesSection.js              # Note per apprendista
│   │   ├── ActivitiesSection.js         # Tabella attività svolte
│   │   ├── BookingSection.js            # Prenotazione attività future
│   │   ├── AbsencesSection.js           # Registro assenze
│   │   ├── ActivityFormFields.js        # Campi di inserimento attività/prenotazione (essenziale + dettagli)
│   │   ├── AttachmentsPanel.js          # Allegati di un'attività o nota
│   │   ├── NotificationsPanel.js        # Campanella promemoria
│   │   ├── PeriodFilter.js              # Selettore di periodo riutilizzabile
│   │   ├── PeriodReportDialog.js        # Rapporto di formazione periodico
│   │   ├── GradingSection.js            # Valutazioni (materia libera + voto + nota)
│   │   ├── DataSection.js               # Statistiche aggregate sulle attività
│   │   ├── GradesByUserChart.js         # Grafico valutazioni per apprendista (Dashboard)
│   │   ├── GradesTrendChart.js          # Andamento voti, media per materia, soglia 4.0
│   │   ├── RankedBarChart.js            # Grafico a barre riutilizzabile (Recharts)
│   │   ├── chartStyle.js                # Stile condiviso dei grafici (assi, tooltip, tracce)
│   │   ├── ManageSection.js             # Gestione utenti/aree di lavoro (a tab)
│   │   ├── SettingsSection.js           # Impostazioni a gruppi + cambio password + aggiornamenti
│   │   ├── ErrorBoundary.js             # Boundary errori React
│   │   ├── SkeletonLoader.js            # Placeholder di caricamento
│   │   └── ThemeProvider.js             # Provider del tema MUI (unico tema, chiaro)
│   ├── screens/
│   │   ├── LoginScreen.js               # Autenticazione + creazione area di lavoro
│   │   └── DashboardScreen.js           # Orchestratore principale (routing interno)
│   ├── data/
│   │   ├── users.supabase.js            # CRUD utenti, auth bcrypt, flag password
│   │   ├── workspaces.supabase.js       # CRUD aree di lavoro
│   │   ├── calendar.supabase.js         # CRUD eventi calendario
│   │   ├── notes.supabase.js            # CRUD note
│   │   ├── activities.supabase.js       # CRUD attività/prenotazioni + query aggregate multi-apprendista
│   │   ├── grades.supabase.js           # CRUD valutazioni + query aggregate multi-apprendista
│   │   └── auditLog.supabase.js         # Scrittura/lettura log audit
│   ├── hooks/
│   │   ├── accessibility.js             # Tastiera, screen reader
│   │   ├── useReminders.js              # Promemoria: caricamento, intervalli, notifiche native
│   │   └── inactivityTimeout.js         # Logout automatico per inattività
│   └── utils/
│       ├── logger.js                    # Logging centralizzato (console + IPC + toast)
│       ├── reminders.js                 # Regole dei promemoria (pure, testate)
│       ├── dateRange.js                 # Preset di periodo condivisi
│       ├── recurrence.js                # Espansione degli eventi ricorrenti
│       ├── activityStats.js             # Aggregazioni su ore e tempo formatore
│       ├── workspaceArchive.js          # Regola dei 30 giorni dell'archivio aree di lavoro (pura, testata)
│       ├── activityTemplates.js         # Modelli di attività (localStorage)
│       ├── icsExport.js                 # Esportazione calendario .ics
│       ├── saveFile.js                  # Salvataggio file (Electron / browser)
│       └── exportReport.js              # Export Excel e PDF (report completo e periodico)
├── scripts/
│   └── bump-version.js
└── build/                               # Output build (generato, non committare)
```

---

## Database Supabase

Lo schema base (`users`, `grades`, `audit_log`) proviene dalla versione originale dell'app. Le tabelle introdotte con il gestionale v2.0 sono negli script SQL in root — eseguirli in ordine nell'SQL Editor di Supabase su un progetto nuovo o non ancora aggiornato:

1. `supabase-workspaces-policies.sql` — tabella `workspaces`
2. `supabase-calendar-notes-activities.sql` — tabelle `calendar_events`, `notes`, `activities`
3. `supabase-activities-extra-fields.sql` — colonne `activity_type`, `start_time`, `duration_minutes`, `site`, `ticket` su `activities`
4. `supabase-activities-trainer-fields.sql` — colonne `trainer_time`, `apprentice_count` su `activities`
5. `supabase-activities-validation.sql` — colonne `status`, `submitted_at`, `validated_by`, `validated_by_name`, `validated_at`, `rejection_reason` su `activities`
6. `supabase-notes-structured.sql` — colonne `category`, `visibility`, `read_at`, `read_by` su `notes`
7. `supabase-calendar-recurrence.sql` — colonne `recurrence`, `recurrence_end` su `calendar_events`
8. `supabase-absences.sql` — tabella `absences`
9. `supabase-attachments.sql` — tabella `attachments` + bucket privato `attachments` su Supabase Storage
10. `supabase-workspaces-archive.sql` — colonna `archived_at` su `workspaces`, trigger che impedisce di eliminare un'area archiviata da meno di 30 giorni e funzione `delete_archived_workspace` (eliminazione atomica di area, utenti e dati)

> Gli script 5–10 sono opzionali finché non servono: `src/data/schemaFallback.js` riconosce colonne e tabelle mancanti e fa degradare l'app alle funzioni della v2.0 (niente validazione, niente categorie note, niente ricorrenze, sezioni Assenze e Allegati vuote, nessun archivio aree di lavoro: archiviare ed eliminare rispondono con un messaggio che chiede di eseguire lo script) invece di rompersi. Dopo ogni script: Supabase → Settings → API → **Reload schema**.

### Tabella `workspaces`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `int8` PK | |
| `name` / `description` | `text` | |
| `owner_id` | `int8` FK | Utente proprietario (può essere nullo) |
| `created_at` | `timestamptz` | |
| `archived_at` | `timestamptz` | Data di archiviazione (v2.1); nulla = area attiva. Un'area si può eliminare solo se `archived_at` è di almeno 30 giorni fa |

### Schema tabella `users`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `int8` PK | Auto-increment |
| `nome` / `cognome` | `text` | |
| `email` | `text` | |
| `ruolo` | `text` | `student` / `trainer` / `inspector` / `admin` / `app_admin` |
| `password_hash` | `text` | Hash bcrypt |
| `must_change_password` | `boolean` | `true` = forzato cambio al prossimo login |
| `trainer_id` / `inspector_id` | `int8` FK | Assegnazioni (solo apprendisti) |
| `workspace_id` | `int8` FK | Area di lavoro di appartenenza |
| `numero_studente` | `text` | |
| `anno_formazione` | `int4` | |
| `data_inizio_apprendistato` / `data_fine_apprendistato` | `date` | |
| `archiviato` | `boolean` | Apprendista archiviato |
| `stato` | `text` | |

### Tabella `activities` (registro attività + prenotazioni)

| Colonna | Tipo | Note |
|---|---|---|
| `student_id` | `int8` FK | Apprendista |
| `activity_date` | `date` | Data attività — se futura, l'attività è trattata come "prenotazione" nel Calendario |
| `description` | `text` | Descrizione libera |
| `activity_type` | `text` | Tipo attività (testo libero) |
| `start_time` | `time` | Orario apprendista |
| `trainer_time` | `time` | Orario formatore (stesso giorno) |
| `apprentice_count` | `int4` | Numero apprendisti coinvolti insieme |
| `duration_minutes` | `int4` | Durata stimata/effettiva |
| `site` | `text` | Sede |
| `ticket` | `text` | Riferimento ticket |
| `created_by` | `int8` FK | Chi ha creato la riga |
| `status` | `text` | `draft` / `submitted` / `validated` / `rejected` (v2.1) |
| `submitted_at` | `timestamptz` | Quando l'apprendista l'ha inviata |
| `validated_by` / `validated_by_name` / `validated_at` | `int8` / `text` / `timestamptz` | Firma del formatore |
| `rejection_reason` | `text` | Motivo del rifiuto |

### Tabella `absences`

| Colonna | Tipo | Note |
|---|---|---|
| `student_id` | `int8` FK | Apprendista |
| `start_date` / `end_date` | `date` | Periodo coperto (estremi inclusi) |
| `absence_type` | `text` | `sick` / `vacation` / `school` / `inter_company` / `military` / `other` |
| `half_day` | `bool` | Vale 0.5 giorni, solo per assenze di un giorno |
| `justified` | `bool` | Giustificativo ricevuto |
| `reason` | `text` | Motivo/riferimento |

I giorni si contano solo sui giorni lavorativi (lun–ven): `countAbsenceDays()` in `src/data/absences.supabase.js`.

### Tabella `attachments`

| Colonna | Tipo | Note |
|---|---|---|
| `student_id` | `int8` FK | Apprendista |
| `entity_type` / `entity_id` | `text` / `int8` | `activity` o `note` a cui il file è collegato |
| `file_path` | `text` | Percorso nel bucket privato `attachments` |
| `file_name` / `mime_type` / `size_bytes` | `text` / `text` / `int8` | Metadati del file (limite 10 MB) |
| `uploaded_by` / `uploaded_by_name` | `int8` / `text` | Chi ha caricato |

---

## Architettura

### Layer

1. **Electron (main process)** — `main.js`: crea finestra, carica React (dev `http://localhost:3003`, prod `build/index.html`).
2. **React (renderer)** — gestisce login, stato utente, lingua, routing interno tra schermate.

### Navigazione interna

Non usa React Router. La vista è gestita con stato:

- `currentScreen` (in `App.js`): `login` / `forceChangePassword` / `dashboard`
- `currentView` (in `DashboardScreen.js`): `dashboard`, `calendar`, `notes`, `activities`, `booking`, `absences`, `grading`, `data` (formatore/admin/ispettore), `manage` (admin), `settings`

### Flusso login

```
LoginScreen
  → authenticateUser (users.supabase.js)
      → verifica bcrypt
      → migrazione trasparente password plain → bcrypt
      → controlla must_change_password (DB) o password === 'Abc123!'
  → App.js: handleLogin
      → mustChangePassword? → ForceChangePasswordModal (blocca accesso)
      → altrimenti → DashboardScreen + salva sessione in localStorage
```

### Restore sessione al refresh

```
App.js useEffect
  → legge localStorage
  → chiama getUserById(id) su Supabase
      → must_change_password true? → forceChangePassword screen
      → false? → dashboard (sessione ripristinata)
      → errore DB? → fallback dati cache localStorage
```

### Selezione apprendista

- `trainer` / `admin` / `inspector` selezionano un apprendista da una lista (student-selector) prima di operare su calendario/note/attività/prenotazione/valutazioni.
- `student` opera sempre sui propri dati, senza selettore.
- La sezione **Dati** e il grafico valutazioni in Dashboard aggregano invece **tutti** gli apprendisti visibili al ruolo corrente, non solo quello selezionato.

---

## Sicurezza

Hardening Electron già applicato in `main.js`: `contextIsolation: true`, `nodeIntegration: false`, API esposte esplicitamente da `preload.js`, URL esterni deviati al browser di sistema con allowlist.

Resta da sistemare prima di un deploy pubblico:
- Le policy RLS delle tabelle (`calendar_events`, `notes`, `activities`, `absences`, `attachments`, `workspaces`) sono permissive (`using (true)`) per compatibilità con l'autenticazione custom: chiunque abbia la anon key legge tutto. Da restringere per `workspace_id` integrando Supabase Auth.
- Nessun blocco dopo N tentativi di login falliti (l'evento `login_failed` viene solo registrato nell'audit log).
- Il bucket `attachments` è privato e si legge via signed URL, ma le policy Storage sono anch'esse permissive.

---

## Styling e tema

Linguaggio visivo comune al sito di prodotto: superfici bianche, filetti da 1 px, spigoli vivi (raggio 0),
nessuna ombra, gradiente o animazione di entrata, un solo colore guida (il blu `#1565c0`) e colori accesi
solo per lo stato. Font: Manrope (titoli, numeri, etichette, pulsanti) e Source Sans 3 (testo), incorporati in
`src/fonts/`.

- **Token**: colori, font, scala dei testi, spazi e spessori sono definiti una sola volta in
  `src/styles/tokens.css` come variabili CSS (`--ink`, `--blue`, `--line`, `--s-4`, …). Gli stessi valori per il
  tema MUI sono in `src/styles/tokens.js`; `src/styles/__tests__/tokens.test.js` fallisce se i due divergono.
- **Componenti**: i componenti condivisi (campi, pulsanti, badge, tabelle, finestre) sono in
  `src/styles/controls.css`; `src/App.css` contiene solo layout e stile delle singole schermate. Nei componenti
  non vanno scritti colori o stili visivi in linea: si usano classi e variabili.
- **Libreria MUI**: ombre, raggi, ripple e transizioni di entrata sono neutralizzati una volta sola in
  `src/theme.js`, non schermata per schermata.
- **Un solo tema**: l'app è solo chiara (il tema scuro è stato rimosso, insieme alla relativa impostazione).
  `ThemeProvider` applica il tema MUI e ripulisce le vecchie preferenze salvate in `localStorage`.
- **Movimento**: l'unica transizione ammessa è colore / sfondo / bordo in 120 ms, disattivata con
  `prefers-reduced-motion` e con l'impostazione "Riduci animazioni".
- **Categorie**: verde = appuntamenti, giallo = attività svolte, arancione = prenotazioni future, rosso =
  assenze (classi `.cat-*` in `controls.css`, stessa legenda visibile nella UI).
- **Guardia**: `src/styles/__tests__/designRules.test.js` segnala ombre, gradienti, raggi diversi da zero,
  animazioni e colori scritti a mano fuori dai token.

---

## Guida sviluppatori

### Dove mettere una modifica

| Tipo | Dove |
|---|---|
| Nuovo campo su un'attività | `src/data/activities.supabase.js` (normalize + CRUD) + `ActivitiesSection.js` / `BookingSection.js` / `CalendarSection.js` (UI) + script SQL `ALTER TABLE` |
| Nuova sezione dashboard | Componente in `src/components/` + voce in `SideMenu.js` + switch in `DashboardScreen.js` |
| Nuove traduzioni | `src/i18n.js` (tutte e 4 le lingue) |
| Nuova colonna tabella `users` | Aggiornare `normalizeUser` e `denormalizeUser` in `users.supabase.js` |
| Nuovo grafico statistiche | `RankedBarChart.js` (riutilizzabile) da `DataSection.js` o `GradesByUserChart.js` |
| Nuovo promemoria | Regola in `src/utils/reminders.js` (+ test in `src/utils/__tests__/reminders.test.js`) e chiavi i18n `reminders.*` |
| Nuova aggregazione su ore/attività | `src/utils/activityStats.js`, così Dati e rapporto PDF restano allineati |
| Nuovo preset di periodo | `src/utils/dateRange.js` (`PERIOD_PRESETS`) + chiave i18n `period.*` |
| Nuova colonna su una tabella esistente | Script `ALTER TABLE` + `normalize*` nel modulo `src/data/` + elenco colonne opzionali passato a `withOptionalColumns` |

### Convenzioni

- Codice sempre role-aware (`student` / `trainer` / `inspector` / `admin` / `app_admin`).
- Logica business centralizzata in `src/data/`, non nei componenti.
- Ogni nuova chiave i18n va aggiunta in **tutte e 4 le lingue** (it, en, de, fr).
- Prenotazioni e attività condividono la stessa tabella `activities`: una riga è una "prenotazione" solo se `activity_date` è nel futuro (calcolato lato client, nessun flag dedicato). Il flusso di validazione si applica solo alle righe non future.
- Gli eventi ricorrenti stanno nel database come una riga sola (la prima occorrenza): le ripetizioni sono generate a runtime da `src/utils/recurrence.js`, quindi modificare o cancellare una serie resta un'operazione su una riga.
- La logica pura (promemoria, periodi, ricorrenze, statistiche, conteggio assenze) va tenuta fuori dai componenti e coperta da test: `npm run test:ci`.
- Aggiornare questo README quando cambia: flusso login, schema DB, struttura file.

---

## Troubleshooting

| Problema | Soluzione |
|---|---|
| Schermata bianca in Electron | Verificare che React dev server sia attivo su porta `3003` |
| Build non parte | Controllare dipendenze e `npm run react-build` |
| "Could not find column ... in the schema cache" salvando un'attività | Eseguire gli script SQL in `supabase-activities-*.sql` mancanti, poi Supabase → Settings → API → Reload schema |
| Archiviare o eliminare un'area di lavoro mostra "Esegui lo script supabase-workspaces-archive.sql" | Eseguire `supabase-workspaces-archive.sql` (poi **Reload schema**) |
| Le sezioni Assenze/Allegati restano vuote | Eseguire `supabase-absences.sql` e `supabase-attachments.sql`; finché mancano, l'app le mostra vuote senza errori (vedi `schemaFallback.js`) |
| I pulsanti Valida/Respingi non fanno nulla | Manca `supabase-activities-validation.sql`: l'app avvisa con "Esegui lo script..." |
| Categoria/visibilità delle note non si salvano | Manca `supabase-notes-structured.sql`: la nota viene salvata lo stesso, ma senza quei campi |
| Le notifiche di sistema non compaiono | Le notifiche native esistono solo nella build Electron e vanno abilitate per l'app in Windows; il pannello promemoria funziona comunque |
| Dati incoerenti dopo test | Pulire `localStorage` del profilo test |
| Traduzioni mancanti | Aggiungere chiave in `i18n.js` per tutte le lingue |
| Modal cambio password loop | Verificare che `updateUserPassword` aggiorni `must_change_password = false` su Supabase |
| Badge warning non appare in Gestione Utenti | Verificare che la colonna `must_change_password` esista nella tabella `users` |

---

## Prossimi passi consigliati

- [ ] Restringere le policy RLS oltre al semplice `using (true)` e valutare il passaggio a Supabase Auth
- [ ] Blocco del login dopo N tentativi falliti e scadenza password
- [ ] Coda di sincronizzazione offline (oggi senza rete l'app è in sola lettura)
- [ ] Estendere l'audit log ai CRUD su attività, note e valutazioni (oggi copre solo login e gestione utenti)
- [ ] Attività "precise": trasformare `activity_type` da testo libero a categorie predefinite per area di lavoro
- [ ] Rimuovere `react-window` da `package.json`: il registro attività usa la paginazione, non la virtualizzazione
