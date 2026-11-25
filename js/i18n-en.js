// The site in English (since 2026-10-30). The site is written in Italian; with
// English chosen (js/language.js — localStorage "lang" = "en"), every page's
// inline head script (partials/theme.html) sets <html lang="en"> and loads
// this file at once, before the page's body is parsed. It watches the whole
// document (a MutationObserver: the body as it's parsed, every page swap of
// js/router.js, everything the scripts render later) and swaps each piece of
// interface text for its English — text nodes and the attributes people see
// or hear (placeholder, aria-label, title, alt, data-tooltip).
//
// Only exact, known strings are replaced (the dictionary below, keyed by the
// Italian text with its spaces collapsed), plus PATTERNS for the ones with
// numbers or names in them — so names, and what's written in the database
// (badges, announcements, leagues and events), stay as entered, by choice.
// An element (or its ancestor) with data-no-i18n is left alone.
//
// Not a module, on purpose: a classic script loaded before the body, so the
// first paint is already in English. Not loaded on the admin (Italian).
//
// Adding an interface text in Italian? Add its English here (or a pattern).
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // The dictionary: Italian (as on screen, spaces collapsed) → English.
  // ---------------------------------------------------------------------------
  var D = {
    // The shell: header, nav, tab bar, footer, search.
    "Bacheca": "Home",
    "Leghe": "Leagues",
    "Eventi": "Events",
    "Leghe & Eventi": "Leagues & Events",
    "Leghe ed eventi": "Leagues and events",
    "Meta": "Meta",
    "Giocatori": "Players",
    "Social": "Social",
    "Profilo": "Profile",
    "Navigazione principale": "Main navigation",
    "Novità": "News",
    "Cerca": "Search",
    "Cerca…": "Search…",
    "Cerca nel sito": "Search the site",
    "Cerca giocatori, eventi, …": "Search players, events, …",
    "Chiudi ricerca": "Close search",
    "Cerca giocatori, eventi, leghe o comandanti.": "Search players, events, leagues or commanders.",
    "Nessun risultato trovato.": "No results found.",
    "Nessun risultato": "No results",
    "Accedi": "Sign in",
    "Esci": "Sign out",
    "Entra": "Sign in",
    "Cambia tema": "Change theme",
    "Passa al tema chiaro": "Switch to the light theme",
    "Passa al tema scuro": "Switch to the dark theme",
    "Tema": "Theme",
    "Chiaro": "Light",
    "Scuro": "Dark",
    "Sistema": "System",
    "Segui il sistema": "Follow the system",
    "segue il sistema": "follows the system",
    "chiaro": "light",
    "scuro": "dark",
    "Lingua": "Language",
    "Vibrazione": "Vibration",
    "Un tocco leggero a ogni scelta": "A light tap with every choice",
    "Torna all'inizio": "Back to top",
    "Created by Michele Ferri": "Created by Michele Ferri",
    "Instagram di Michele Ferri": "Michele Ferri's Instagram",
    "Caricamento...": "Loading...",
    "Caricamento…": "Loading…",
    "Caricamento": "Loading",
    "Il caricamento sta richiedendo più del solito.": "Loading is taking longer than usual.",
    "Qualcosa non è andato durante il caricamento.": "Something went wrong while loading.",
    "Ricarica la pagina": "Reload the page",
    "Riprova": "Try again",
    "Si è verificato un errore nel caricamento dei dati.": "There was an error loading the data.",
    "Dati aggiornati": "Data updated",
    "Aggiorna": "Refresh",
    "Offline · dati dell'ultimo accesso": "Offline · data from your last visit",
    "Nessuna novità al momento.": "No news right now.",
    "Nuovo": "New",
    "Vai all'evento": "Go to the event",
    "Vai alla lega": "Go to the league",
    "Annulla": "Cancel",
    "Chiudi": "Close",
    "Non ora": "Not now",
    "Installa": "Install",
    "Installa l'app": "Install the app",
    "Aggiungi alla schermata Home": "Add to Home screen",
    "Apri in Chrome": "Open in Chrome",

    // Common words and labels.
    "Oggi": "Today",
    "oggi": "today",
    "domani": "tomorrow",
    "in corso": "in progress",
    "In corso": "In progress",
    "Conclusa": "Finished",
    "Lega": "League",
    "Evento": "Event",
    "Giocatore": "Player",
    "Comandante": "Commander",
    "Comandanti": "Commanders",
    "Archetipi": "Archetypes",
    "Archetipo": "Archetype",
    "Matchups": "Matchups",
    "Classifica": "Standings",
    "Classifica completa": "Full standings",
    "Regolamento": "Rules",
    "Più giocati": "Most played",
    "Tutti gli eventi": "All events",
    "Tutte le leghe": "All leagues",
    "Tutti": "All",
    "Vedi tutti": "See all",
    "Liste": "Lists",
    "Recap": "Recap",
    "Partite": "Matches",
    "Partite giocate": "Matches played",
    "partite": "matches",
    "partita": "match",
    // player.html's rivals (js/player-rivals.js).
    "Rivali": "Rivals",
    "Bestia nera": "Nemesis",
    "Vittima preferita": "Favourite victim",
    "Vecchia conoscenza": "Old acquaintance",
    // commander.html's (js/commander-rivals.js).
    "Kryptonite": "Kryptonite",
    "Portabandiera": "Flag bearer",
    "Maestro": "Master",
    "Kryptonite, Portabandiera e Maestro": "Kryptonite, Flag bearer and Master",
    "sconfitte": "losses",
    "vittorie": "wins",
    "Turni": "Rounds",
    "Punti": "Points",
    "punti": "points",
    "PUNTI": "POINTS",
    "Media": "Average",
    "Totale": "Total",
    "Mazzi": "Decks",
    "mazzi": "decks",
    "mazzo": "deck",
    "Piloti": "Pilots",
    "Giocato": "Played",
    "Metashare": "Metashare",
    "Winrate": "Winrate",
    "Vittorie": "Wins",
    "Sconfitte": "Losses",
    "Pareggi": "Draws",
    "Vittoria": "Win",
    "Sconfitta": "Loss",
    "Pareggio": "Draw",
    "Bye": "Bye",
    "Drop": "Drop",
    "Ritirato": "Dropped",
    "V-S-P": "W-L-D",
    "Vittorie-Sconfitte-Pareggi": "Wins-Losses-Draws",
    "Utilizzo": "Usage",
    "Picco": "Peak",
    "Ultimo": "Latest",
    "Primo": "First",
    "Secondo": "Second",
    "Terzo": "Third",
    "Prossimo evento": "Next event",
    "Prossimo": "Next",
    "Ultimo evento": "Latest event",
    "Prossimamente": "Coming soon",
    "Partner": "Partner",
    "Da solo": "On its own",
    "Tutti i partner": "All partners",
    "Stesso comandante": "Same commander",
    "Nessun avversario": "No opponent",
    "Posizione finale": "Final position",
    "Attualmente": "Currently",
    "Turno": "Round",
    "Quarti": "Quarterfinals",
    "Semifinali": "Semifinals",
    "Finale": "Final",
    "Vittoria condivisa tra": "Win split between",
    "Vittoria condivisa": "Split win",
    "Vincitore": "Winner",
    "Finalista": "Finalist",
    "Semifinale": "Semifinal",
    "Svizzera": "Swiss",
    "SVIZZERA": "SWISS",
    "Classifica svizzera": "Swiss standings",
    "V-S": "W-L",
    "Badge": "Badges",
    "Video": "Videos",
    "Tornei": "Tournaments",
    "Seguici": "Follow us",
    "Decklist": "Decklists",
    "Primer": "Primers",
    "Altri": "Others",
    "Campione": "Champion",
    "Campione in carica": "Reigning champion",
    "Mese precedente": "Previous month",
    "Mese successivo": "Next month",
    "Cancella": "Clear",
    "Dal": "Since",
    "Ordina per": "Sort by",
    "Filtri": "Filters",
    "Filtri (attivi)": "Filters (active)",
    "Identità di colore": "Colour identity",
    "Identità esatta": "Exact identity",
    "Bianco": "White",
    "Blu": "Blue",
    "Nero": "Black",
    "Rosso": "Red",
    "Verde": "Green",
    "Incolore": "Colourless",

    // Days and months (the few still written out by hand).
    "Lunedì": "Monday", "Martedì": "Tuesday", "Mercoledì": "Wednesday", "Giovedì": "Thursday",
    "Venerdì": "Friday", "Sabato": "Saturday", "Domenica": "Sunday",
    "lunedì": "Monday", "martedì": "Tuesday", "mercoledì": "Wednesday", "giovedì": "Thursday",
    "venerdì": "Friday", "sabato": "Saturday", "domenica": "Sunday",

    // Bacheca.
    "Sezioni della bacheca": "Home sections",
    "Commander più giocati": "Most played commanders",
    "Archetipi più giocati": "Most played archetypes",
    "Comandanti più giocati": "Most played commanders",
    "Colori più giocati": "Most played colours",
    "Colori": "Colours",
    "Nessun dato per il grafico.": "No data for the chart.",
    "Nessun dato per la classifica.": "No data for the standings.",
    "Nessun evento ancora.": "No events yet.",
    "Nessuna lega ancora.": "No leagues yet.",
    "Evento esterno": "External event",
    "Nuovo · Recap": "New · Recap",
    "Nuovo · Recap della stagione": "New · Season recap",
    "Recap della stagione": "Season recap",
    "Stagione": "Season",
    "Nuovo video": "New video",
    "Nuovo primer": "New primer",
    "Il meta del mese": "This month's meta",
    "Grafico a bolle del metagame": "Metagame bubble chart",
    "Grafico a torta del metagame": "Metagame pie chart",
    "Grafico precedente": "Previous chart",
    "Grafico successivo": "Next chart",
    "Video precedente": "Previous video",
    "Video successivo": "Next video",

    // Leghe & Eventi.
    "Archivio": "Archive",
    "Serie Topdeck": "Topdeck series",
    "Lega online": "Online league",
    "Serie online": "Online series",
    "Dove": "Where",
    "Fatto": "Done",
    "Dal vivo": "Live",
    "Tutto": "All",
    "Online su endstep": "Online on endstep",
    "Eventi standalone": "Standalone events",
    "Standalone": "Standalone",
    "Nessuna lega o evento inserito ancora.": "No leagues or events yet.",
    "evento giocato": "event played",
    "eventi giocati": "events played",
    "Lega non trovata": "League not found",
    "Nessun evento associato a questa lega.": "No events in this league.",
    "Sezioni della lega": "League sections",
    "Eventi della lega": "League events",
    "Risultati in arrivo": "Results coming",
    "In calendario": "Scheduled",

    // League rules (js/league-rules.js).
    "Come si calcola la classifica della lega": "How the league standings are worked out",
    "Punti lega per posizione": "League points by position",
    "Il peggiore non conta": "Your worst doesn't count",
    "Il tuo risultato peggiore viene scartato: una giornata storta non ti toglie dalla corsa.": "Your worst result is dropped: one bad day doesn't knock you out of the race.",
    "Chiudi l’evento senza sconfitte.": "Finish the event without a loss.",
    "A chi gioca tutti gli eventi, a lega conclusa.": "To everyone who plays every event, once the league is over.",
    "Imbattuto": "Unbeaten",
    "Presenza completa": "Full attendance",

    // Event / league / commander / archetype / player pages.
    "Sezioni dell'evento": "Event sections",
    "Sezioni del comandante": "Commander sections",
    "Sezioni del profilo": "Profile sections",
    "Evento non trovato": "Event not found",
    "Nessun iscritto registrato.": "No entrants recorded.",
    "Nessuna partita registrata.": "No matches recorded.",
    "Commander non trovato": "Commander not found",
    "Nessun giocatore ha ancora usato questo commander.": "No player has used this commander yet.",
    "Mostra il lato frontale della carta": "Show the card's front",
    "Mostra l'altro lato della carta": "Show the card's other side",
    "Archetipo non trovato": "Archetype not found",
    "Contro gli altri archetipi": "Against the other archetypes",
    "Nessun mazzo registrato con questo archetipo.": "No decks recorded with this archetype.",
    "Nessuna partita": "No matches",
    "Vai all'archetipo": "Go to the archetype",
    "Non ci sono ancora dati sufficienti.": "There isn't enough data yet.",
    "Giocatore non trovato": "Player not found",
    "Storico partite": "Match history",
    "Commander precedente": "Previous commander",
    "Commander successivo": "Next commander",
    "Volte giocato": "Times played",
    "Prima partita": "First match",
    "Ultima partita": "Last match",
    "Eventi giocati": "Events played",
    "Presenza media": "Average attendance",
    "Tappe": "Legs",
    "Carte speciali": "Special cards",
    "Come si ottiene una carta speciale": "How to get a special card",
    "Effetti foil, per le partite vinte con quel comandante": "Foil effects, for the matches won with that commander",
    "Il bordo della carta, per gli eventi giocati con quel comandante": "The card's frame, for the events played with that commander",
    "Le carte dell’album si arricchiscono giocando con quel comandante": "The album's cards get richer as you play that commander",
    "Nessun dato registrato per questo giocatore.": "No data recorded for this player.",
    "Olografica con scintille": "Holographic with sparkles",
    "Pochi dati: troppe poche partite per un winrate affidabile": "Little data: too few matches for a reliable winrate",
    "Elo su tutti gli eventi dal vivo, non cambia con i filtri": "Elo over every live event, not changed by the filters",
    "(min. 12 partite)": "(min. 12 matches)",
    "Mostra tabella predefinita": "Show the default table",
    "Crea tabella personalizzata": "Create a custom table",
    "Come si legge la matrice": "How to read the matrix",
    "Limite di 10 comandanti raggiunto.": "Limit of 10 commanders reached.",
    "Nessun comandante corrisponde alla ricerca.": "No commander matches the search.",
    "Nessuna partita nei filtri selezionati.": "No matches with the selected filters.",
    "Seleziona almeno 2 comandanti per generare la matrice.": "Select at least 2 commanders to build the matrix.",
    "Cerca comandante": "Search commander",
    "Nome comandante...": "Commander name...",
    "Tabella personalizzata": "Custom table",

    // Evoluzione (evolution.html).
    "Evoluzione": "Evolution",
    "Archetipi nel tempo": "Archetypes over time",
    "La fetta di ogni archetipo, evento per evento": "Each archetype's share, event by event",
    "La fetta di ogni archetipo, mese per mese": "Each archetype's share, month by month",
    "I più giocati": "Most played",
    "Leader diversi": "Different leaders",
    "Eventi in vetta": "Events on top",
    "Mesi in vetta": "Months on top",
    "Chi sale, chi scende": "Who's rising, who's falling",
    "In ascesa": "Rising",
    "In calo": "Falling",
    "nuovo": "new",
    "Nessuno.": "None.",
    "Colori nel tempo": "Colours over time",
    "I mazzi che giocano ogni colore: all'ultimo evento, la tendenza e la curva": "The decks playing each colour: at the latest event, the trend and the curve",
    "I mazzi che giocano ogni colore: all'ultimo mese, la tendenza e la curva": "The decks playing each colour: in the latest month, the trend and the curve",
    "Ricambio del meta": "Meta turnover",
    "I mazzi di ogni evento: in rosso quelli con un comandante mai visto prima": "Each event's decks: in red, those with a commander never seen before",
    "I mazzi di ogni mese: in rosso quelli con un comandante mai visto prima": "Each month's decks: in red, those with a commander never seen before",
    "Nuovi all'ultimo": "New at the latest",
    "Nuovi nell'ultimo": "New in the latest",
    "Nuovi in media": "New on average",
    "Comandanti visti": "Commanders seen",
    "Totale comandanti": "Total commanders",
    "Totale mazzi": "Total decks",
    "Nuovi comandanti": "New commanders",
    "Comandanti nuovi": "New commanders",
    "Comandanti diversi": "Different commanders",
    "Servono almeno due eventi nel periodo scelto per vedere l'evoluzione.": "At least two events in the chosen period are needed to see the evolution.",
    "La matchup matrix mostra, per ogni coppia di comandanti, la percentuale di vittorie dell’uno contro l’altro nelle partite già giocate tra loro.": "The matchup matrix shows, for every pair of commanders, the percentage of wins of one against the other in the matches they've already played.",
    "Si legge per riga: la percentuale è la vittoria del comandante di riga contro quello di colonna. Sotto, il suo risultato in vittorie-sconfitte-pareggi (V-S-P).": "Read it by row: the percentage is the row commander's win rate against the column one. Below, its record in wins-losses-draws (W-L-D).",

    // Badges (the page's own text; the badges' names and descriptions
    // written by the admin stay as entered).
    "Nessun badge ancora.": "No badges yet.",
    "Nessuno, per ora — potresti essere tu!": "Nobody, for now — it could be you!",
    "Come si ottiene ›": "How to get it ›",
    "Bandito nel formato Duel Commander.": "Banned in the Duel Commander format.",
    "Giocato per la prima volta nell'ultimo mese.": "Played for the first time in the last month.",
    "Vinci una lega: il badge resta tuo fino alla conclusione della lega successiva.": "Win a league: the badge stays yours until the next league ends.",

    // The badges (written in the admin, but a fixed set: translated here —
    // a new one stays in Italian until it's added).
    "Fortunello": "Lucky",
    "Più bye presi": "Most byes received",
    "Imbattibile": "Unbeatable",
    "Winrate più alto (5+ eventi)": "Highest winrate (5+ events)",
    "Instancabile": "Tireless",
    "Duellante": "Duelist",
    "Più match giocati": "Most matches played",
    "Cenerentola": "Cinderella",
    "Lumaca": "Snail",
    "Più pareggi": "Most draws",
    "Muro": "The Wall",
    "Più partite di fila senza sconfitte": "Most matches in a row without a loss",
    "Il Re": "The King",
    "Elo più alto": "Highest Elo",
    "Ammazzagiganti": "Giant Slayer",
    "Più vittorie contro la top 5 Elo": "Most wins against the Elo top 5",
    "Hai l'Elo più alto tra tutti i giocatori.": "You have the highest Elo of all players.",
    "Mutaforma": "Shapeshifter",
    "Più comandanti giocati": "Most commanders played",
    "On Fire": "On Fire",
    "In una serie di top 8": "On a top 8 streak",
    "Primo nella lega in corso": "First in the current league",
    "Secondo nella lega in corso": "Second in the current league",
    "Terzo nella lega in corso": "Third in the current league",
    "Volpe": "Fox",
    "La Volpe": "The Fox",
    "Monogamo": "Monogamous",
    "Più eventi con lo stesso comandante": "Most events with the same commander",

    // Social.
    "Entra nel gruppo Telegram": "Join the Telegram group",
    "Tutti i mazzi su Moxfield": "All the decks on Moxfield",
    "Tutti i video su YouTube": "All the videos on YouTube",
    "IRL Gameplay": "IRL Gameplay",
    "Ultime inviate": "Latest submitted",
    "Nessun episodio di Commander Anatomy ancora.": "No Commander Anatomy episodes yet.",
    "Nessun mazzo ancora.": "No decks yet.",
    "Nessun primer ancora.": "No primers yet.",
    "Nessun video ancora.": "No videos yet.",
    "Nessun video di gameplay dal vivo ancora.": "No live gameplay videos yet.",
    "Nessuna lista da torneo ancora.": "No tournament lists yet.",

    // Stories (recaps, the month's meta, videos, primers).
    "Attiva la musica": "Turn the music on",
    "Disattiva la musica": "Turn the music off",
    "Condividi il recap": "Share the recap",
    "Condividi": "Share",
    "Link copiato!": "Link copied!",
    "Tocca per continuare ›": "Tap to continue ›",
    "Ci vediamo al prossimo evento!": "See you at the next event!",
    "Ci vediamo alla prossima stagione!": "See you next season!",
    "Gli archetipi": "The archetypes",
    "Gli archetipi della stagione": "The season's archetypes",
    "I record della stagione": "The season's records",
    "Il campione": "The champion",
    "Il comandante del giorno": "The commander of the day",
    "Il comandante della stagione": "The commander of the season",
    "Il recap": "The recap",
    "Il vincitore": "The winner",
    "La classifica finale": "The final standings",
    "La stagione": "The season",
    "La top 8": "The top 8",
    "Nessun archetipo": "No archetype",
    "Imbattuti": "Unbeaten",
    "Nessuno imbattuto": "Nobody unbeaten",
    "Ogni giocatore ha perso almeno una partita.": "Every player lost at least one match.",
    "Nessuno ha chiuso senza sconfitte con più vittorie che pareggi.": "Nobody finished without a loss and with more wins than draws.",
    "Più eventi vinti": "Most events won",
    "Più partite vinte": "Most matches won",
    "Recap dell'evento": "Event recap",
    "Recap non disponibile.": "Recap not available.",
    "eventi vinti": "events won",
    "evento vinto": "event won",
    "giocatore": "player",
    "giocatori": "players",
    "eventi": "events",
    "evento": "event",
    "turni": "rounds",
    "comandanti": "commanders",
    "su": "of",
    "Apri su Moxfield": "Open on Moxfield",
    "Guarda su YouTube": "Watch on YouTube",
    "Il comandante del mese": "The commander of the month",
    "La rivelazione": "The breakout",
    "La guida al mazzo: come si gioca, le scelte, i matchup.": "The deck guide: how it plays, the choices, the matchups.",

    // Profilo (account.html).
    "Il tuo profilo": "Your profile",
    "Impostazioni": "Settings",
    "Account": "Account",
    "Accedi con Google": "Sign in with Google",
    "Pulsante Accedi con Google": "Sign in with Google button",
    "Entra con il tuo account Google.": "Sign in with your Google account.",
    "Connesso con Google": "Signed in with Google",
    "Collegati al tuo giocatore e ritrova le tue statistiche": "Link to your player and find your stats",
    "Crea la tua carta giocatore personalizzata, con la carta che preferisci come sfondo e i tuoi colori preferiti": "Create your own player card, with your favourite card as the background and your favourite colours",
    "Il tuo giocatore": "Your player",
    "Sei già nelle classifiche? Scegli il tuo nome: dopo l'approvazione di un amministratore il tuo account sarà collegato al tuo giocatore e ai suoi risultati.": "Already in the standings? Pick your name: once an admin approves it, your account will be linked to your player and their results.",
    "Scegli il tuo nome…": "Pick your name…",
    "Invia richiesta": "Send request",
    "Annulla richiesta": "Cancel request",
    "Hai chiesto di collegare il tuo account a": "You asked to link your account to",
    ": in attesa dell'approvazione di un amministratore.": ": waiting for an admin's approval.",
    "La tua carta e il tuo profilo": "Your card and your profile",
    "Carta giocatore": "Player card",
    "Modifica la tua carta": "Edit your card",
    "Salva le modifiche": "Save changes",
    "Annulla le modifiche": "Discard changes",
    "Carta di sfondo": "Background card",
    "Nessuna carta di sfondo": "No background card",
    "Cerca una carta…": "Search a card…",
    "Versione": "Version",
    "Versione dell'illustrazione": "Artwork version",
    "Colori preferiti": "Favourite colours",
    "Descrizione": "Description",
    "Raccontaci qualcosa di te come giocatore…": "Tell us something about yourself as a player…",
    "Nessuna descrizione: premi ✎ per raccontare qualcosa di te.": "No description: press ✎ to tell us something about yourself.",
    "Link": "Links",
    "Mostra foto": "Show photo",
    "Mostra nella pagina giocatore": "Show on the player page",
    "Mostra la tua carta nella tua pagina giocatore": "Show your card on your player page",
    "Pagina giocatore": "Player page",
    "La carta giocatore e i suoi effetti": "The player card and its effects",
    "Instagram: nome utente o link": "Instagram: username or link",
    "Moxfield: nome utente o link": "Moxfield: username or link",
    "Archidekt: nome utente o link": "Archidekt: username or link",
    "endstep.cc: nome utente o link": "endstep.cc: username or link",
    "Nessuna carta trovata.": "No card found.",
    "Invia la tua decklist": "Send your decklist",
    "Invia decklist": "Send decklist",
    "Scegli un evento…": "Pick an event…",
    "Link alla decklist": "Link to the decklist",
    "Incolla la lista oppure un link (Moxfield, Archidekt, …)": "Paste the list or a link (Moxfield, Archidekt, …)",
    "Elimina account": "Delete account",
    "Cancella il tuo account e la tua carta. Il tuo giocatore e i suoi risultati restano; potrai sempre accedere di nuovo con Google.": "Delete your account and your card. Your player and their results stay; you can always sign in again with Google.",
    "Accesso con Google non riuscito o annullato: riprova.": "Google sign-in failed or was cancelled: try again.",
    "Accesso con Google non riuscito, riprova.": "Google sign-in failed, try again.",
    "Account eliminato. Puoi accedere di nuovo con Google quando vuoi.": "Account deleted. You can sign in again with Google whenever you like.",
    "Annullamento non riuscito, riprova.": "Cancelling failed, try again.",
    "Eliminazione non riuscita, riprova.": "Deleting failed, try again.",
    "Evento non trovato: ricarica la pagina.": "Event not found: reload the page.",
    "Giocatore non trovato: ricarica la pagina.": "Player not found: reload the page.",
    "Hai già inviato due decklist per questo evento.": "You've already sent two decklists for this event.",
    "Hai già inviato la decklist per tutti gli eventi disponibili.": "You've already sent a decklist for every event available.",
    "Hai già una richiesta in attesa.": "You already have a request pending.",
    "Il tuo account non è collegato a un giocatore.": "Your account isn't linked to a player.",
    "Il tuo account è bloccato.": "Your account is blocked.",
    "Il tuo account è già collegato a un giocatore.": "Your account is already linked to a player.",
    "Impossibile avviare l'accesso con Google, riprova.": "Couldn't start the Google sign-in, try again.",
    "Impossibile caricare il profilo, ricarica la pagina.": "Couldn't load the profile, reload the page.",
    "Impossibile caricare il tuo giocatore, ricarica la pagina.": "Couldn't load your player, reload the page.",
    "Incolla la decklist o un link.": "Paste the decklist or a link.",
    "Invio non riuscito. Puoi mandare la lista via email a": "Sending failed. You can email the list to",
    "La decklist è troppo lunga.": "The decklist is too long.",
    "Nessun evento disponibile: puoi inviare la decklist per il prossimo evento o per l'ultimo.": "No event available: you can send the decklist for the next event or for the last one.",
    "Per questo evento non puoi inviare la decklist.": "You can't send a decklist for this event.",
    "Qualcun altro ha già chiesto questo giocatore. Se sei tu, contatta un amministratore.": "Someone else has already asked for this player. If it's you, contact an admin.",
    "Questo giocatore è già collegato a un altro account.": "This player is already linked to another account.",
    "Richiesta non riuscita, riprova.": "Request failed, try again.",
    "Salva prima la tua carta almeno una volta.": "Save your card at least once first.",
    "Salvataggio non riuscito, riprova.": "Saving failed, try again.",
    "Scegli il tuo nome dalla lista.": "Pick your name from the list.",
    "Scegli l'evento e incolla la decklist.": "Pick the event and paste the decklist.",
    "Scegli l'evento.": "Pick the event.",
    "Sessione scaduta: accedi di nuovo e riprova.": "Session expired: sign in again and try again.",
    "Un account amministratore non può essere eliminato da qui.": "An admin account can't be deleted from here.",
    "Uscita non riuscita, riprova.": "Signing out failed, try again.",
    "Eliminare definitivamente il tuo account? La tua carta verrà cancellata e il collegamento al tuo giocatore rimosso. Il giocatore e i suoi risultati restano.": "Delete your account for good?\n\nYour card will be deleted and the link to your player removed. The player and their results stay.",
    "La cornice della carta": "The card's frame",
    "Un sigillo in fondo alla carta": "A seal at the bottom of the card",
    "Una stella dorata con il numero di leghe vinte": "A gold star with the number of leagues won",
    "Comandanti giocati": "Commanders played",
    "Poi si arricchisce giocando: ogni effetto qui sotto si sblocca con i tuoi risultati.": "Then it gets richer as you play: each effect below unlocks with your results.",
    "Il link non è valido.": "The link isn't valid.",

    // Confronto (compare.html — Giocatori's second tab).
    "Confronto": "Compare",
    "Confronto giocatori": "Compare players",
    "Scegli un giocatore": "Pick a player",
    "Scegli due giocatori da confrontare.": "Pick two players to compare.",
    "Scegli due giocatori.": "Pick two players.",
    "Tutti i giocatori": "All players",
    "Cerca giocatore…": "Search player…",
    "Cerca giocatore": "Search player",
    "Nessun giocatore trovato.": "No player found.",
    "Mai affrontati": "Never met",
    "Statistiche": "Stats",
    // player.html's Statistiche tab (js/player-stats.js).
    "Andamento Elo": "Elo over time",
    "Attuale": "Current",
    "Posizione": "Rank",
    "Partenza": "Start",
    "Serie di vittorie": "Winning streak",
    "Miglior piazzamento": "Best finish",
    "Lo scalpo più pesante": "Biggest scalp",
    "Il balzo più grande": "Biggest jump",
    "Presenze di fila": "Events in a row",
    "Avversari diversi": "Different opponents",
    "di fila": "in a row",
    "Primi posti": "First places",
    "Scontri diretti": "Head to head",
    "Partita": "Match",
    "Non si sono ancora affrontati.": "They haven't played each other yet.",
    "Eventi giocati insieme:": "Events played together:",
    "Nessun evento giocato insieme.": "No events played together.",
    "Mostra meno": "Show less",
    "Andamento": "Trend",
    "Grafico": "Chart",
    "Piazzamenti": "Placings",
    "Nessun evento nel periodo.": "No events in this period.",
    "Nessun evento giocato insieme nel periodo.": "No events played together in this period.",

    // Privacy (privacy.html — its headings and short lines; the page's
    // body is in its own English block, js/privacy-en.js).
    "Informativa privacy": "Privacy policy",
    "Accedendo, Google ci comunica il tuo nome, la tua email e la tua foto profilo per creare il tuo account.": "When you sign in, Google gives us your name, your email and your profile photo to create your account.",
    "Privacy": "Privacy",

    // Obiettivi (js/achievements.js — player.html's tab, the profile's, the
    // unlock bar, js/achievement-toast.js). "Leghe", "Vittorie", "Imbattuto",
    // "Campione", "Presenza completa", "Incolore" are above.
    "Obiettivi": "Achievements",
    "Obiettivi sbloccati": "Achievements unlocked",
    "completato": "complete",
    "Risultati": "Results",
    "Stile di gioco": "Play style",
    "Presenza": "Attendance",
    "Sul sito": "On the site",
    "L'ultimo obiettivo": "The last achievement",
    "Ancora da sbloccare": "Still locked",
    "Obiettivo sbloccato": "Achievement unlocked",
    "Prima vittoria": "First win",
    "Perfetto": "Flawless",
    "Primo posto": "First place",
    "Top 8": "Top 8",
    "Podio": "Podium",
    "Rimonta": "Comeback",
    "In cima alla lega": "League contender",
    "Veterano": "Veteran",
    "Collezione": "Collection",
    "Tuttofare": "Jack of all trades",
    "Specchio": "Mirror",
    "Arcobaleno": "Rainbow",
    "Fedele": "Faithful",
    "Coppia affiatata": "Perfect pair",
    "Pioniere": "Pioneer",
    "Debutto": "Debut",
    "Presenze": "Attendances",
    "Fedelissimo": "Regular",
    "Maratoneta": "Marathoner",
    "Collegato": "Linked",
    "Carta creata": "Card made",
    "Prima decklist": "First decklist",
    "Seriamente 1.0": "Seriamente 1.0",
    "Regicida": "Kingslayer",
    // (descriptions, shown once unlocked)
    "La tua prima partita vinta.": "Your first match won.",
    "Un evento chiuso senza sconfitte.": "An event finished without a loss.",
    "Un evento vinto vincendo tutte le partite.": "An event won by winning every match.",
    "In top 8 in un evento da almeno 20 giocatori.": "Top 8 in an event of at least 20 players.",
    "In top 8 dopo aver perso il primo turno.": "Top 8 after losing the first round.",
    "Una lega chiusa tra i primi 8 della classifica.": "A league finished in the top 8 of the standings.",
    "Hai battuto chi guidava la classifica della lega.": "You beat the league leader.",
    "Tutti gli eventi di una lega giocati.": "Every event of a league played.",
    "Tutti e 5 gli archetipi giocati.": "All 5 archetypes played.",
    "Hai battuto il tuo stesso comandante.": "You beat your own commander.",
    "Un evento giocato con un mazzo incolore.": "An event played with a colourless deck.",
    "Tutti e cinque i colori giocati.": "All five colours played.",
    "Un evento giocato con una coppia di comandanti.": "An event played with a pair of commanders.",
    "Il primo a portare un comandante agli eventi.": "The first to bring a commander to the events.",
    "Il tuo primo evento.": "Your first event.",
    "Account collegato al giocatore.": "Account linked to the player.",
    "Carta giocatore salvata.": "Player card saved.",
    "Una decklist inviata dal sito.": "A decklist sent from the site.",
    "Tutti gli altri obiettivi al livello massimo.": "Every other achievement at its top level.",
    "Una lega vinta.": "A league won.",
    // (hints, shown while locked — nudges, never the condition)
    "Tutto comincia con una vittoria.": "It all starts with a win.",
    "Vinci le tue partite.": "Win your matches.",
    "Un evento senza mai abbassare la guardia.": "An event without ever dropping your guard.",
    "Un evento da ricordare, dall'inizio alla fine.": "An event to remember, from start to finish.",
    "Punta al gradino più alto.": "Aim for the top step.",
    "Fatti valere in un evento affollato.": "Make your mark in a crowded event.",
    "Fatti strada negli eventi più affollati.": "Make your way through the most crowded events.",
    "Non arrenderti dopo un brutto inizio.": "Don't give up after a bad start.",
    "Porta a casa una lega intera.": "Bring home a whole league.",
    "Una lega da protagonista.": "A league in the spotlight.",
    "Anche chi guida la lega può cadere.": "Even the league leader can fall.",
    "Non perdere neanche una tappa.": "Don't miss a single leg.",
    "Una lega dopo l'altra.": "One league after another.",
    "Prova comandanti diversi.": "Try different commanders.",
    "Cambia stile di gioco.": "Change your play style.",
    "Affronta te stesso.": "Face yourself.",
    "Non serve un colore per vincere.": "You don't need a colour to win.",
    "Esplora tutti i colori.": "Explore every colour.",
    "Trova il tuo comandante e restagli fedele.": "Find your commander and stay faithful to it.",
    "In due è meglio.": "Two is better.",
    "Porta qualcosa di nuovo al tavolo.": "Bring something new to the table.",
    "Ogni storia comincia da un evento.": "Every story starts with an event.",
    "Partecipa agli eventi.": "Take part in the events.",
    "Fatti vedere con costanza.": "Show up regularly.",
    "Tante, tante partite.": "Lots and lots of matches.",
    "Il tuo account e il tuo giocatore, insieme.": "Your account and your player, together.",
    "La tua carta ti aspetta.": "Your card is waiting.",
    "Condividi la tua lista.": "Share your list.",
    "Tutto, ma proprio tutto.": "Everything, really everything.",
    // league.html's Statistiche (js/league-stats.js).
    "Miglior winrate": "Best winrate",
    "Il più costante": "Most consistent",
    "La scalata": "The climb",
    "La corsa al titolo": "The title race",
    "Albo d'oro": "Roll of honour",
    "I mazzi della lega": "The league's decks",
    "Il più giocato": "Most played",
    "Il più vincente": "Most winning",
    "posto medio": "average place",
    "posizione": "place",
    "posizioni": "places",
    "vittoria": "win",
    "Miglior": "Best",
    "Nessun evento giocato.": "No event played.",
    "Posizioni dopo ogni evento": "Places after each event",
    // Invia la tua decklist (js/decklist-form.js).
    "Per quale evento?": "For which event?",
    "La tua lista": "Your list",
    "Incolla la lista": "Paste the list",
    "dagli appunti: il testo o un link Moxfield, Archidekt…": "from the clipboard: the text or a Moxfield, Archidekt… link",
    "oppure": "or",
    "scrivila a mano": "type it in",
    "Svuota": "Clear",
    "Tieni premuto qui e scegli «Incolla»": "Press and hold here, then choose «Paste»",
    "Inviata ✓": "Sent ✓",
    "Per questo evento hai già inviato una lista: questa la sostituisce, ed è l'ultimo invio possibile.": "You already sent a list for this event: this one replaces it, and it's the last send you have.",
    "Link Moxfield": "Moxfield link",
    "Link Archidekt": "Archidekt link",
    "Link alla lista": "Link to the list",
    "100 carte ✓": "100 cards ✓",
    "Decklist inviata!": "Decklist sent!",
    "Puoi ancora inviarne una che la sostituisca.": "You can still send one to replace it.",
    "Invia un'altra lista": "Send another list",
    "Come funziona l'invio della decklist": "How sending the decklist works",
    "Come funziona": "How it works",
    "Scegli l'evento e incolla la lista": "Pick the event and paste the list",
    "Il prossimo evento o l'ultimo: il testo della lista oppure un link (Moxfield, Archidekt…).": "The next event or the last one: the list's text or a link (Moxfield, Archidekt…).",
    "Arriva agli organizzatori": "It reaches the organisers",
    "Per email, con l'evento e il tuo nome nell'oggetto. Se ti rispondono, scrivono al tuo indirizzo.": "By email, with the event and your name in the subject. If they reply, they write to your address.",
    "Non resta sul sito": "It isn't kept on the site",
    "La lista non viene salvata: il sito ricorda solo che l'hai inviata.": "The list isn't saved: the site only remembers that you sent it.",
    "Due invii per evento": "Two sends per event",
    "Hai sbagliato qualcosa? Inviane un'altra: sostituisce la prima. Dopo il secondo invio l'evento risulta «Inviata ✓».": "Got something wrong? Send another: it replaces the first. After the second send the event shows «Sent ✓».",
    "Se l'invio non riesce, ti diciamo come mandarla a mano via email.": "If sending fails, we tell you how to email it by hand.",
  };

  // ---------------------------------------------------------------------------
  // Patterns: texts with numbers or names in them. Each [regexp, replacement]
  // — a string with $1… or a function of the match (tr() for a part that is
  // itself a known text).
  // ---------------------------------------------------------------------------
  var plural = function (n, one, many) { return n === "1" ? one : many; };
  var ord = function (n) { return "#" + n; };
  var PATTERNS = [
    // A page's title: "<name> - Duel Commander Piacenza".
    [/^(.+) - Duel Commander Piacenza$/, function (_, a) { return tr(a) + " - Duel Commander Piacenza"; }],
    // Counts.
    [/^(\d+) mazz[io]$/, function (_, n) { return n + plural(n, " deck", " decks"); }],
    [/^\((\d+) di (\d+) mazzi\)$/, "($1 of $2 decks)"],
    [/^(\d+) di (\d+) mazzi$/, "$1 of $2 decks"],
    [/^(\d+) totali$/, "$1 total"],
    [/^(\d+) giocator[ei] senza sconfitte$/, function (_, n) { return n + plural(n, " player", " players") + " without a loss"; }],
    [/^(\d+) partit[ae]$/, function (_, n) { return n + plural(n, " match", " matches"); }],
    [/^(\d+) event[oi]$/, function (_, n) { return n + plural(n, " event", " events"); }],
    [/^(\d+) event[oi] ·$/, function (_, n) { return n + plural(n, " event", " events") + " ·"; }],
    [/^· (\d+) event[oi]$/, function (_, n) { return "· " + n + plural(n, " event", " events"); }],
    [/^(\d+) giocator[ei]$/, function (_, n) { return n + plural(n, " player", " players"); }],
    [/^(\d+) comandant[ei]$/, function (_, n) { return n + plural(n, " commander", " commanders"); }],
    [/^(\d+) vittori[ae]$/, function (_, n) { return n + plural(n, " win", " wins"); }],
    [/^(\d+) punti$/, "$1 points"],
    [/^(\d+) event[oi] giocat[oi] su (\d+)$/, "$1 of $2 events played"],
    [/^(\d+) di (\d+) eventi giocati$/, "$1 of $2 events played"],
    [/^(\d+) \/ (\d+) selezionati$/, "$1 / $2 selected"],
    [/^Media (.+)$/, "Average $1"],
    // Evoluzione's subtitles.
    [/^I (\d+) più giocati: la loro posizione tra i più giocati, (evento dopo evento|mese dopo mese)$/, function (_, n, per) {
      return "The " + n + " most played: their rank among the most played, " + (per === "mese dopo mese" ? "month after month" : "event after event");
    }],
    [/^La fetta di meta (dell'ultimo evento|dell'ultimo mese|degli ultimi (\d+) eventi|degli ultimi (\d+) mesi) contro quella di prima · in basso la sua curva nel tempo$/, function (_, span, ne, nm) {
      var when = span === "dell'ultimo evento" ? "of the latest event" : span === "dell'ultimo mese" ? "of the latest month" : ne ? "of the last " + ne + " events" : "of the last " + nm + " months";
      return "The meta share " + when + " against the one before · at the bottom, its curve over time";
    }],
    [/^Cerca tra (\d+) giocatori…$/, "Search $1 players…"],
    // Confronto (compare.html).
    [/^Affrontati più spesso da (.+)$/, "Most often faced by $1"],
    [/^Mostra tutte \((\d+)\)$/, "Show all ($1)"],
    [/^Top (\d+) · (\d+)\+ giocatori$/, "Top $1 · $2+ players"],
    [/^Top (\d+) · meno di (\d+) giocatori$/, "Top $1 · under $2 players"],
    [/^Cerca tra (\d+) comandanti…$/, "Search $1 commanders…"],
    [/^\(ultimi (\d+) mesi\)$/, "(last $1 months)"],
    [/^(\d+) eventi consecutivi giocati$/, "$1 events played in a row"],
    // Results.
    [/^(\d+-\d+-\d+) \((\d+) match totali\)$/, function (_, r, n) { return r + " (" + n + plural(n, " match", " matches") + " total)"; }],
    [/^(\d+-\d+-\d+) \(V-S-P\), (\d+) partite$/, "$1 (W-L-D), $2 matches"],
    [/^(\d+)° su (\d+)$/, function (_, a, b) { return ord(a) + " of " + b; }],
    [/^Tappa (\d+): (\d+)°, (\d+) punti$/, function (_, t, p, n) { return "Leg " + t + ": " + ord(p) + ", " + n + " points"; }],
    [/^Tappa (\d+): assente$/, "Leg $1: absent"],
    [/^Tappa (\d+): da giocare$/, "Leg $1: to be played"],
    [/^Sei (\d+)° nella classifica della lega in corso\.$/, function (_, n) { return "You're " + ord(n) + " in the current league's standings."; }],
    [/^Su di (\d+) posizion[ei] dall'ultimo evento$/, function (_, n) { return "Up " + n + plural(n, " place", " places") + " since the last event"; }],
    [/^Giù di (\d+) posizion[ei] dall'ultimo evento$/, function (_, n) { return "Down " + n + plural(n, " place", " places") + " since the last event"; }],
    [/^In crescita dall'ultimo evento$/, "Rising since the last event"],
    [/^In calo dall'ultimo evento$/, "Falling since the last event"],
    [/^Invariato dall'ultimo evento$/, "Unchanged since the last event"],
    [/^([+−]\d+) dall'ultimo evento$/, "$1 since the last event"],
    [/^Stessa posizione dell'ultimo evento$/, "Same position as the last event"],
    [/^Nuovo in classifica dall'ultimo evento$/, "New in the standings since the last event"],
    [/^Turno (\d+)$/, "Round $1"],
    [/^Dopo (\d+) turni$/, "After $1 rounds"],
    [/^Ultima partita: (.+)$/, "Last match: $1"],
    [/^Inizia il (.+)$/, "Starts on $1"],
    [/^Dal (.+)$/, "Since $1"],
    [/^con (.+)$/, "with $1"],
    [/^Vince (.+) con (.+)$/, "$1 wins with $2"],
    [/^Campione (.+) con (.+)$/, "Champion $1 with $2"],
    [/^Il più giocato: (.+)$/, "Most played: $1"],
    [/^I migliori · (\d+) punti o più$/, "The best · $1 points or more"],
    [/^Lega (\d+)$/, "League $1"],
    [/^(.+): (\d+) punti$/, "$1: $2 points"],
    [/^dal (\d+)°$/, function (_, n) { return "from " + ord(n); }],
    // Time.
    [/^tra (\d+) giorn[oi]$/, function (_, n) { return "in " + n + plural(n, " day", " days"); }],
    [/^tra (\d+) or[ae]$/, function (_, n) { return "in " + n + plural(n, " hour", " hours"); }],
    [/^tra (\d+) min$/, "in $1 min"],
    [/^(.+) · tra (\d+) giorn[oi]$/, function (_, d, n) { return tr(d) + " · in " + n + plural(n, " day", " days"); }],
    [/^(.+) · (oggi|domani)$/, function (_, d, w) { return tr(d) + " · " + tr(w); }],
    [/^Prossimo (.+),$/, "Next $1,"],
    [/^Prossimo (.+)$/, "Next $1"],
    // The news bell, the account button, the stories.
    [/^Novità \((\d+) da leggere\)$/, "News ($1 unread)"],
    [/^(\d+) annunc(?:io|i) · (\d+) da leggere$/, function (_, n, u) { return n + plural(n, " announcement", " announcements") + " · " + u + " unread"; }],
    [/^(\d+) annunc(?:io|i)$/, function (_, n) { return n + plural(n, " announcement", " announcements"); }],
    [/^Il tuo profilo \((.+)\)$/, "Your profile ($1)"],
    [/^Torna a (.+)$/, function (_, a) { return "Back to " + tr(a); }],
    [/^Gli archetipi di (.+)$/, "The archetypes of $1"],
    [/^I più giocati di (.+)$/, "The most played of $1"],
    [/^Il meta di (.+)$/, "The meta of $1"],
    [/^il meta di (.+)$/, "the meta of $1"],
    [/^il miglior winrate del mese \(almeno (\d+) partite\)$/, "the month's best winrate (at least $1 matches)"],
    [/^Decklist inviata per (.+)\.$/, "Decklist sent for $1."],
    // Automatic badges' descriptions (js/badges-page.js).
    [/^Entra in top 8 negli ultimi (\d+) eventi da almeno (\d+) iscritti a cui hai partecipato\.$/, "Make the top 8 in the last $1 events with at least $2 entrants you took part in."],
    [/^Hai fatto più drop di tutti \(minimo (\d+)\)\.$/, "You dropped more than anyone (at least $1)."],
    [/^Hai la percentuale di partite pareggiate più alta di tutti \(minimo (\d+) partite giocate\)\.$/, "You have the highest share of drawn matches of anyone (at least $1 matches played)."],
    [/^Hai la serie in corso più lunga di partite senza sconfitte \(minimo (\d+)\): i pareggi non la interrompono\.$/, "You have the longest current run of matches without a loss (at least $1): draws don't break it."],
    [/^Hai battuto più volte di tutti i giocatori della top (\d+) Elo negli ultimi (\d+) mesi\.$/, "You beat the Elo top $1 players more often than anyone in the last $2 months."],
    [/^Hai giocato lo stesso comandante in più eventi di tutti \(minimo (\d+)\)\.$/, "You played the same commander in more events than anyone (at least $1)."],
    [/^Hai giocato più comandanti diversi di tutti \(minimo (\d+)\)\.$/, "You played more different commanders than anyone (at least $1)."],
    [/^Hai giocato più partite di tutti \(minimo (\d+)\)\.$/, "You played more matches than anyone (at least $1)."],
    [/^Hai il winrate più alto tra tutti i giocatori \(minimo (\d+) eventi giocati, di cui almeno uno negli ultimi (\d+) mesi\)\.$/, "You have the highest winrate of all players (at least $1 events played, one of them in the last $2 months)."],
    [/^Hai la serie più lunga di eventi consecutivi giocati \(minimo (\d+)\)\.$/, "You have the longest run of events played in a row (at least $1)."],
    [/^Hai ricevuto più bye di tutti \(minimo (\d+)\)\.$/, "You've had more byes than anyone (at least $1)."],
    // Player card links (js/player-card.js parseCardLink).
    [/^Dal link (.+) non si capisce il nome utente\.$/, "The username can't be worked out from the $1 link."],
    [/^Il link (.+) deve essere un indirizzo di (.+)\.$/, "The $1 link must be a $2 address."],
    [/^Il link (.+) non è valido\.$/, "The $1 link isn't valid."],
    [/^Nome utente (.+) non valido\.$/, "Invalid $1 username."],
    // Card effects (js/card-cosmetics.js).
    // "<label>: <text>" (a badge's tooltip, a matrix cell's label): each part
    // translated if known — a badge from the database keeps its own.
    [/^([^:]+): (.+)$/, function (_, a, b) {
      var ta = lookup(a), tb = lookup(b);
      return ta === null && tb === null ? null : (ta === null ? a : ta) + ": " + (tb === null ? b : tb);
    }],
    [/^Una barra dietro il nome \(top 8 in eventi con (\d+) o più giocatori\)$/, "A bar behind the name (top 8 in events with $1 or more players)"],
    // Obiettivi (js/achievements.js): the tiered ones' descriptions, the
    // detail's date and progress, the unlock bar's group.
    [/^(\d+) partite vinte\.$/, "$1 matches won."],
    [/^(\d+) event[oi] vint[oi]\.$/, function (_, n) { return n + plural(n, " event", " events") + " won."; }],
    [/^In top 8 in (\d+) eventi da almeno (\d+) giocatori\.$/, "Top 8 in $1 events of at least $2 players."],
    [/^(\d+) leghe diverse giocate\.$/, "$1 different leagues played."],
    [/^(\d+) comandanti diversi giocati\.$/, "$1 different commanders played."],
    [/^Lo stesso comandante in (\d+) eventi\.$/, "The same commander in $1 events."],
    [/^(\d+) eventi giocati\.$/, "$1 events played."],
    [/^(\d+) partite giocate\.$/, "$1 matches played."],
    [/^Eventi giocati in (\d+) mesi di fila\.$/, "Events played in $1 months in a row."],
    [/^Sbloccato il (.+?)( · livello massimo)?$/, function (_, d, max) { return "Unlocked on " + d + (max ? " · top level" : ""); }],
    [/^Verso ([IV]+) · (\d+)\/(\d+)$/, "Toward $1 · $2/$3"],
    [/^(\d+) obiettivi sbloccati$/, "$1 achievements unlocked"],
    [/^e altri (\d+)$/, "and $1 more"],
    [/^e$/, "and"],
    // Profilo's decklist events: "Oggi · 25/11/2026 · <league> · 1 invio rimasto".
    [/^(Oggi|In arrivo|Passato)( · .*?)( · 1 invio rimasto)?$/, function (_, when, rest, left) {
      return { Oggi: "Today", "In arrivo": "Upcoming", Passato: "Past" }[when] + rest + (left ? " · 1 send left" : "");
    }],
    // league.html's Statistiche (js/league-stats.js).
    [/^su (\d+) eventi giocati$/, "over $1 events played"],
    [/^dal (\d+)° al (\d+)°$/, function (_, a, b) { return "from " + ord(a) + " to " + ord(b); }],
    [/^(\d+) pilot[ai]( · 🏆 \d+)?$/, function (_, n, w) { return n + plural(n, " pilot", " pilots") + (w || ""); }],
    [/^(\d+) pilot[ai] · (\d+)%$/, function (_, n, p) { return n + plural(n, " pilot", " pilots") + " · " + p + "%"; }],
    [/^(\d+-\d+-\d+) · min\. (\d+) partite$/, "$1 · min. $2 matches"],
    [/^(\d+) volte su (\d+)$/, "$1 times out of $2"],
    [/^(\d+) volte$/, "$1 times"],
    [/^su (\d+)$/, "of $1"],
    [/^in (\d+) partite$/, "in $1 matches"],
    [/^Più spesso in top (\d+)$/, "Most often in the top $1"],
    [/^in top (\d+)$/, "in top $1"],
    [/^Mostra tutti i (\d+) mazzi$/, "Show all $1 decks"],
    // Invia la tua decklist (js/decklist-form.js).
    [/^Per (.+): gli organizzatori la ricevono via email\.$/, function (_, ev) { return "For " + tr(ev) + ": the organisers get it by email."; }],
  ];

  // ---------------------------------------------------------------------------
  // The translation.
  // ---------------------------------------------------------------------------
  var has = Object.prototype.hasOwnProperty;
  var norm = function (s) { return s.replace(/\s+/g, " ").trim(); };

  // The English for a text, or null (not known: left as it is).
  function lookup(text) {
    var key = norm(text);
    if (!key || !/[A-Za-zÀ-ú]/.test(key)) return null;
    if (has.call(D, key)) return D[key];
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = key.match(PATTERNS[i][0]);
      if (m) {
        var rep = PATTERNS[i][1];
        var t = typeof rep === "function" ? rep.apply(null, m) : key.replace(PATTERNS[i][0], rep);
        if (t !== null) return t;
      }
    }
    // A league's leg in an event's name ("Tappa 3/7", "… (Tappa 5/7)"): the
    // one word of a name that is translated.
    if (/\bTappa \d/.test(key)) return key.replace(/\bTappa (\d+)/g, "Leg $1");
    return null;
  }

  // The English, or the text itself.
  function tr(text) {
    var t = lookup(text);
    return t === null ? text : t;
  }

  var ATTRS = ["placeholder", "aria-label", "title", "alt", "data-tooltip"];
  // Left alone: code, and what's marked data-no-i18n. A textarea's text is
  // what someone typed (its placeholder still is translated).
  var SKIP = "script,style,[data-no-i18n]";

  function skipped(el) {
    return !el || (el.closest && el.closest(SKIP) !== null);
  }

  function translateText(node) {
    if (node.parentElement && node.parentElement.tagName === "TEXTAREA") return;
    var value = node.data;
    var t = lookup(value);
    if (t === null || t === norm(value)) return;
    var lead = value.match(/^\s*/)[0];
    var trail = value.match(/\s*$/)[0];
    node.data = lead + t + trail;
  }

  function translateAttr(el, name) {
    var value = el.getAttribute(name);
    if (!value) return;
    var t = lookup(value);
    if (t !== null && t !== norm(value)) el.setAttribute(name, t);
  }

  function translateElement(el) {
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) translateAttr(el, ATTRS[i]);
  }

  function translateTree(root) {
    if (root.nodeType === 3) {
      if (!skipped(root.parentElement)) translateText(root);
      return;
    }
    if (root.nodeType !== 1 || skipped(root)) return;
    translateElement(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1 && n.matches(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) translateText(n);
      else translateElement(n);
    }
  }

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) translateTree(m.addedNodes[j]);
      } else if (m.type === "characterData") {
        if (!skipped(m.target.parentElement)) translateText(m.target);
      } else if (m.type === "attributes") {
        if (!skipped(m.target)) translateAttr(m.target, m.attributeName);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  // What was already there before this ran (the head), and a last pass once
  // the document is in.
  translateTree(document.documentElement);
  document.addEventListener("DOMContentLoaded", function () {
    translateTree(document.documentElement);
  });

  // For the few texts that never become page text (confirm(), the share
  // sheet's title): window.i18n("…").
  window.i18n = tr;
})();
