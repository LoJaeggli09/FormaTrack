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
| `app_admin` | Come `admin` ma trasversale a tutte le aree di lavoro (multi-tenant) |

---

## Funzionalità principali

- **Autenticazione Supabase** con password hashate bcrypt. Al primo accesso con password predefinita (`Abc123!`) viene forzato il cambio password prima di accedere alla dashboard.
- **Restore sessione sicuro**: al refresh la sessione viene verificata direttamente sul DB per controllare il flag `must_change_password`.
- **Dashboard**: profilo dell'apprendista selezionato + grafico "Valutazioni per apprendista" (formatore/admin/ispettore).
- **Calendario**: vista mensile con celle ampie; eventi creati manualmente (verde), attività già svolte (giallo) e prenotazioni future (arancione) sullo stesso calendario, senza duplicare i dati. Eventi e attività si possono creare, modificare ed eliminare direttamente dal pannello del giorno selezionato.
- **Note**: elenco di annotazioni testuali libere per apprendista, con autore e data.
- **Attività**: tabella delle attività svolte da un apprendista — data/orario apprendista, orario formatore, numero apprendisti coinvolti, tipo attività, descrizione, durata stimata, sede, ticket.
- **Prenotazione**: il formatore pianifica in anticipo un'attività futura per l'apprendista (data obbligatoriamente futura, orario, durata stimata, tipo). Compare automaticamente sia nel registro Attività sia nel Calendario.
- **Valutazioni**: ogni apprendista (o il formatore per l'apprendista selezionato) può registrare una valutazione con materia libera, voto (0–6) e una nota facoltativa.
- **Dati**: statistiche aggregate su tutti gli apprendisti visibili (formatore/admin/ispettore) — sedi con più interventi, apprendisti con più attività, tipo di attività più frequente, andamento mensile, durata media attività.
- **Gestione Utenti** (admin): organizzata in 4 tab — Utenti (ricerca/filtro/CRUD/promozione anno), Assegnazioni Bulk (assegna formatore a più apprendisti), Archivio (apprendisti archiviati, ripristinabili), Log Audit (storico azioni).
- **Aree di lavoro** (multi-tenant, solo `app_admin`): creazione area di lavoro con relativo admin, selezione area di lavoro attiva.
- **Impostazioni personalizzate**: lingua, tema chiaro/scuro, vista iniziale, modalità compatta, riduzione animazioni, memoria ultimo apprendista selezionato, controllo aggiornamenti app.
- **Cambio password** con checklist requisiti in tempo reale (10–20 caratteri, maiuscole, minuscole, numero, simbolo speciale `! $ # _`).
- **Accessibilità**: navigazione da tastiera, focus trap nel menu, annunci screen reader.
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
| Framer Motion | 12 | Animazioni di transizione tra sezioni |
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
- `FormaTrack-2.0.10.exe` — installer NSIS per Windows
- `FormaTrack-2.0.10.exe.blockmap` — per aggiornamenti incrementali
- `latest.yml` — metadata per auto-updater

### Pubblicazione su GitHub Release

1. Vai a [GitHub Releases](https://github.com/LoJaeggli09/formatrack/releases)
2. Crea una nuova release con tag `v2.0.10`
3. Carica questi file:
   - `FormaTrack-2.0.10.exe`
   - `latest.yml`
   - `FormaTrack-2.0.10.exe.blockmap` (opzionale, per update più veloci)

L'app usa `electron-updater` per scaricare automaticamente l'installer dal release più recente.

---

## Versioning

Versione corrente: **`2.0.10`**

Regola incremento (script `version:bump`):
- patch standard: `1.1.0 → 1.1.1`
- rollover a 100: `1.1.99 → 1.2.0`

```bash
npm run version:bump
```

Aggiorna automaticamente `package.json` e `src/appVersion.js`. Lo script cerca anche di aggiornare una riga `## Ultime Migliorie (vX.X.X)` in questo README, se presente.

> Per un salto di versione non incrementale (es. major bump come questo, `1.2.x → 2.0.10`), aggiornare manualmente `package.json` e `src/appVersion.js`.

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
├── public/
│   └── index.html
├── src/
│   ├── App.js                           # Root: gestione screen, sessione, inattività
│   ├── App.css                          # Stili globali e variabili CSS
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
│   │   ├── GradingSection.js            # Valutazioni (materia libera + voto + nota)
│   │   ├── DataSection.js               # Statistiche aggregate sulle attività
│   │   ├── GradesByUserChart.js         # Grafico valutazioni per apprendista (Dashboard)
│   │   ├── RankedBarChart.js            # Grafico a barre riutilizzabile (Recharts)
│   │   ├── ManageSection.js             # Gestione utenti/aree di lavoro (a tab)
│   │   ├── SettingsSection.js           # Impostazioni + cambio password
│   │   ├── ErrorBoundary.js             # Boundary errori React
│   │   ├── SkeletonLoader.js            # Placeholder di caricamento
│   │   └── ThemeProvider.js             # Context tema chiaro/scuro
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
│   │   └── inactivityTimeout.js         # Logout automatico per inattività
│   └── utils/
│       └── logger.js                    # Logging centralizzato (console + IPC + toast)
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

---

## Architettura

### Layer

1. **Electron (main process)** — `main.js`: crea finestra, carica React (dev `http://localhost:3003`, prod `build/index.html`).
2. **React (renderer)** — gestisce login, stato utente, lingua, routing interno tra schermate.

### Navigazione interna

Non usa React Router. La vista è gestita con stato:

- `currentScreen` (in `App.js`): `login` / `forceChangePassword` / `dashboard`
- `currentView` (in `DashboardScreen.js`): `dashboard`, `calendar`, `notes`, `activities`, `booking`, `grading`, `data` (formatore/admin/ispettore), `manage` (admin), `settings`

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

Il file `main.js` è configurato in modo permissivo per lo sviluppo (`nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false`).

**Questa versione NON è pronta per il deploy in produzione pubblica.**

Per hardening produzione:
- `contextIsolation: true`
- `nodeIntegration: false`
- `preload` script con API esposte esplicitamente
- Variabili Supabase URL/Key in variabili d'ambiente (`.env`), non nel sorgente
- Rimuovere `webSecurity: false`
- Le policy RLS delle nuove tabelle (`calendar_events`, `notes`, `activities`, `workspaces`) sono permissive (`using (true)`) per compatibilità con l'autenticazione custom — da restringere se si integra Supabase Auth

---

## Styling e tema

- CSS in `src/App.css` con variabili CSS (`:root`) per colori e superfici.
- `ThemeProvider` sincronizza classe body (`dark-mode`) e tema MUI (`src/theme.js`).
- Supporto tema chiaro/scuro con persistenza in `localStorage`.
- Calendario: verde = appuntamenti, giallo = attività svolte, arancione = prenotazioni future (stessa legenda visibile nella UI).

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

### Convenzioni

- Codice sempre role-aware (`student` / `trainer` / `inspector` / `admin` / `app_admin`).
- Logica business centralizzata in `src/data/`, non nei componenti.
- Ogni nuova chiave i18n va aggiunta in **tutte e 4 le lingue** (it, en, de, fr).
- Prenotazioni e attività condividono la stessa tabella `activities`: una riga è una "prenotazione" solo se `activity_date` è nel futuro (calcolato lato client, nessun flag dedicato).
- Aggiornare questo README quando cambia: flusso login, schema DB, struttura file.

---

## Troubleshooting

| Problema | Soluzione |
|---|---|
| Schermata bianca in Electron | Verificare che React dev server sia attivo su porta `3003` |
| Build non parte | Controllare dipendenze e `npm run react-build` |
| "Could not find column ... in the schema cache" salvando un'attività | Eseguire gli script SQL in `supabase-activities-*.sql` mancanti, poi Supabase → Settings → API → Reload schema |
| Dati incoerenti dopo test | Pulire `localStorage` del profilo test |
| Traduzioni mancanti | Aggiungere chiave in `i18n.js` per tutte le lingue |
| Modal cambio password loop | Verificare che `updateUserPassword` aggiorni `must_change_password = false` su Supabase |
| Badge warning non appare in Gestione Utenti | Verificare che la colonna `must_change_password` esista nella tabella `users` |

---

## Prossimi passi consigliati

- [ ] Inizializzare un repository git (attualmente il progetto non è versionato) prima di ulteriori modifiche importanti
- [ ] Rimuovere da `package.json` le dipendenze non più usate (`jspdf`, `jspdf-autotable`, `xlsx`, `react-window`) — erano legate a export/liste virtualizzate ora rimossi
- [ ] Attività "precise": trasformare `activity_type` da testo libero a categorie predefinite per apprendistato, se richiesto
- [ ] Hardening Electron (`contextIsolation: true`, `nodeIntegration: false`, `preload`) prima di un deploy pubblico
- [ ] Restringere le policy RLS delle nuove tabelle oltre al semplice `using (true)`
