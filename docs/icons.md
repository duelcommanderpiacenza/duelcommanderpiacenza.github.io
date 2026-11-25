# Icons: what each one means

The register of every icon on the site — the public pages and the admin —
**one row per picture, one meaning per picture** (user, 2026-11-25). Before
adding an icon: find its picture here. Already listed with another meaning →
pick another icon; listed with the same meaning → reuse that exact drawing
(copy it from where it's used, so the key stays the same); not here → add a
row. Then run `python scripts/check-icons.py`.

**The check** (scripts/check-icons.py, run by `.githooks/pre-commit`): every
icon drawing in the code must have its key in this file, exactly once; a key
no longer used must go. A key is the first 8 hex digits of the MD5 of the
drawing's shapes (`--icons` lists every drawing with its key and uses), so
the same picture drawn two ways (a Lucide icon from two versions, paths
split differently) has two keys: they go in the same row. The script also
keeps one icon per title (`--list`). What it can't see — the meaning — is
this file's job: keep the "Means" column true.

Most icons are Lucide's (ISC licence), 24×24, `currentColor`, stroke 2.

⚠️ marks a picture that means two things — kept so by the user's choice (see
"Accepted clashes" at the end). Don't add a third meaning, nor a new clash.

## Navigation and page shell

| Picture | Keys | Means | Used in |
|---|---|---|---|
| Magnifier | `3ebc4f7f` | Search | header search (every page), Confronto's player picker |
| Bell | `e376ff87` | Novità (announcements) | header (js/header-news.js) |
| X (two lines) | `277515ba`, `39d47f0d` | Close / cancel | closing the search, Confronto's picker; account.html's card edit "Annulla" |
| Person | `56209419` | Account (sign in, the signed-in user) | header account button, admin account menu, admin "Utenti" tab |
| House | `be9cdb26` | Bacheca (home) | phone tab bar |
| Play in a circle | `b1089737` | Social | phone tab bar |
| Chevron left | `963be7ae` | Back / previous | detail pages' back pill, carousels' previous, the commander's previous partner, admin back |
| Chevron right | `e9542290`, `47f51158`, `86cd5dd7` | Go / open / next | rival and recap cards, Regolamento button, Novità "Vai all'evento", carousels' next, next partner, Leghe's league cards |
| Chevron up | `b76512e3` | Back to top | js/back-to-top.js |
| Circular arrow | `7affa622` | Pull to refresh | js/pull-refresh.js |
| Funnel | `4aae4a9f` | Filtri | Meta / Giocatori pages' filter button |
| Share (three nodes) | `bed0bd4c` | Condividi | event / league heroes |
| Share (box with arrow) | `08312551` | Share — Safari's own button, shown in the install instructions | js/pwa-install.js |
| Sun | `0f72c682` | Light theme | theme menu |
| Moon | `72b85761` | Dark theme | theme menu |
| Monitor | `10b76876` | Follow the system theme | theme menu |
| Phone | `843b21e6` | Vibration | settings, the vibration switch |
| Slash | `00209e8d` | Off (over the phone: vibration off) | js/haptics-toggle.js |
| Gear | `c36c0ced` | Impostazioni | account.html tab |
| Check | `fed4f34d`, `0b4f3ff2` | Done / selected / saved | card edit ✓, the decklist's "Decklist inviata!" tick, the theme menu's current choice, admin success toast |
| Exclamation | `2fd67a60` | Error | admin error toast |
| Pencil | `4b8d4b11`, `0789752a` | Modifica (edit) | account.html's card, admin lists' edit buttons |
| Lock | `a897dd4d` | Locked (not unlocked yet) | achievements still locked |
| Speaker | `4975eaa5` | Sound on | recap player |
| Speaker crossed | `42cf0df6` | Sound off | recap player |

## Sections and pages

| Picture | Keys | Means | Used in |
|---|---|---|---|
| Calendar | `28dd470b` | Eventi (events) | Eventi / In corso / Tutti gli eventi tabs and links, admin Eventi |
| Archive box | `bdb42f37` | Archivio (past leagues and events) | Leghe & Eventi's tab |
| Trophy | `504b6544`, `ee384e4c` | ⚠️ Classifica (standings) **and** Leghe (the nav tab) | Classifica tabs (event, league, Bacheca), the Bacheca's league heading; phone tab bar's and admin's "Leghe"; event.html's split note and top 8 winner |
| Pie | `ea72c9c3` | Meta / Più giocati (what's played most) | Meta tabs, phone tab bar's Meta, Bacheca's Più giocati, Statistiche's "Il più giocato" |
| Bar chart | `d420fd81` | Statistiche | league.html's tab |
| Two people | `1cdb5099` | Giocatori (players) | Giocatori tabs and nav, players per event on the timelines, admin Giocatori |
| Two people (admin's) | `4a6c1133` | Giocatori (an event's entries) | admin, an event's Giocatori / Partite switch |
| Two cards | `48ed3dda`, `ec663a64` | Comandanti (commanders) | Meta's Comandanti tab, admin Comandanti; the Collezione achievement (different commanders played) |
| Circle and square | `eb75bef0` | Archetipi | Meta's Archetipi tab |
| Rising line | `e48fc69f`, `4b0c19f3` | ⚠️ Evoluzione **and** Rimonta | Meta's Evoluzione tab; the Rimonta achievement |
| Crossed swords | `5bad4934`, `f30e6434` | Partite (matches) | Partite / Storico partite / Matchups tabs, the Vittorie achievement, Statistiche's "Più partite vinte", admin Partite |
| Two crossing circles | `0d6c10ff` | Confronto | Giocatori's Confronto tab |
| Laurel | `6348b877` | Obiettivi (achievements) | account.html and player.html tabs |
| Layers | `b7ba1ec8` | Album comandanti | player.html's tab |
| Stacked lists | `374bf891` | Mazzi / Liste (decklists) | Social's Mazzi, the events' "Liste" menu |
| Sheet with a corner | `dc077f69` | Decklist (send yours) | account.html's tab |
| Paper plane | `b24ad0dc` | Invia (send) | account.html's decklist send button |
| Clipboard | `77a675e0` | Incolla (paste from the clipboard) | account.html's "Incolla la lista" |
| Envelope | `1e92a78d` | Email (a list reaching the organisers) | the decklist's "?" pop-up |
| Eye crossed out | `d9c4fb35` | Not kept / not shown (a list isn't saved on the site) | the decklist's "?" pop-up |
| Open book | `008e8308` | Regolamento | league / Bacheca "Regolamento" button and pop-up |
| Bulleted list | `51f0b6a4` | Classifica completa (the whole standings) | the Bacheca's link to the league |
| Play triangle | `5a5fbefb` | Recap (stories) | Recap buttons, the stories' bubbles |
| Play in a screen | `50cb6ac5` | Video | social.html |
| Map pin | `dc08cdd9` | Località (an external event's place) | the timelines, admin |
| Flip arrows | `f6764283` | Gira la carta | commander.html's double-faced card |
| Megaphone | `dde1e62e` | Annunci | admin |
| Rosette (admin's) | `f70d6b28` | ⚠️ Badge in the admin — elsewhere the rosette is the top 8 | admin nav |
| Bin | `52e4cddc` | Elimina (delete) | admin lists' delete buttons |

## Results and records

| Picture | Keys | Means | Used in |
|---|---|---|---|
| Crown | `d7f0a9b6`, `db01f8b6` | ⚠️ Best winrate **and** Campione (a league won) | commander.html's Maestro, Statistiche's Miglior winrate and Il più vincente; the Campione achievement |
| Rosette | `0ec69a13` | Top 8 | the Top 8 achievement, Statistiche's "Più spesso in top 8" |
| Podium | `a9edd592` | Podio (top 8s in big events) | achievement |
| Cup with handles | `3d3ce166` | Primo posto (an event won) | achievement |
| Medal | `e6f8d070` | In cima alla lega (a league closed in the top 8) | achievement |
| Party popper | `16b720ef` | Prima vittoria | achievement |
| Shield with check | `d62cd330`, `1a6ee86d` | Imbattuto (no losses) | the Imbattuto achievement, the recap's Imbattuti chips |
| Gem | `da51d44b` | Perfetto (an event won winning every match) | achievement |
| Target | `3fd5de63` | Regicida (beat the league's leader) | achievement |
| Drumstick | `e21d2c5f` | Vittima preferita (the opponent beaten most) | player.html's rival card |
| Handshake | `4d408f8d` | Vecchia conoscenza (the opponent met most) | player.html's rival card |
| Skull | `d9ff2a98` | Nemesis: who beats you most | player.html's Bestia nera, commander.html's Kryptonite |
| Flag | `291367d2` | Portabandiera (who played a commander most) | commander.html's card |
| Compass | `41478c3b` | Pioniere (the first to play a commander) | achievement |
| Anchor | `131b930e` | Il più costante (best average place) | Statistiche |
| Mountain | `64cbf871` | La scalata (places climbed) | Statistiche |
| Arrow up-right | `205caa8a` | Up in the standings | position change badges |
| Arrow down-right | `8fc2f4ce` | Down in the standings | position change badges |
| Arrow right | `6a57e0dd` | Same place | position change badges |
| Plus | `8ed2da54` | New in the standings | position change badges |

## Achievements (the rest)

| Picture | Keys | Means | Used in |
|---|---|---|---|
| Circle with check | `3dab2eea` | Presenza completa | achievement |
| Double chevron up | `c945c059` | Veterano | achievement |
| Shapes | `9382d300` | Tuttofare (every archetype) | achievement |
| Mirror | `719d6b62` | Specchio | achievement |
| Diamond | `e4f43b2c` | Incolore | achievement |
| Rainbow | `2b461dca` | Arcobaleno | achievement |
| Heart | `ae1b1912` | Fedele | achievement |
| Chain link | `1769f5a1` | Coppia affiatata | achievement |
| Sparkles | `f6e2567f` | Debutto | achievement |
| Calendar with check | `d8306cf8` | Presenze (events played) | achievement |
| Flame | `7c1d2042` | Fedelissimo (months in a row) | achievement |
| Pulse | `a6f88026` | Maratoneta | achievement |
| Person with check | `ef2deee9` | Collegato (account linked) | achievement |
| ID card | `16ce2814` | Carta creata | achievement |
| Document | `b974e91f` | Prima decklist | achievement |
| Seal with check | `1b50d5df` | Seriamente 1.0 | achievement |

## Archetypes (js/archetype-icons.js)

| Picture | Keys | Means | Used in |
|---|---|---|---|
| Lightning bolt | `26cf8dd5` | Aggro | archetype badges |
| Shield | `c86d9ec0` | Control | archetype badges |
| Infinity | `9569f62c` | Combo | archetype badges |
| Stopwatch | `f2c05368` | Tempo | archetype badges |
| Scales | `d2819246` | Midrange | archetype badges |

## Logos

| Picture | Keys | Means | Used in |
|---|---|---|---|
| endstep's diamond | `7e02386c` | Online (endstep.cc) | the Dove bar, the card's endstep link, endstep marks |
| Google "G" | `a945f6aa` | Google sign-in | account.html |
| Instagram | `0648e8e3` | Instagram link | the player card |

## Accepted clashes

Pictures that mean two things, kept so by the user's choice (2026-11-25,
when this register was made and its other clashes were resolved). Not to be
extended: no third meaning for these, no new clash elsewhere.

- **Trophy**: Classifica and the Leghe nav tab (and an event's winner).
- **Rising line**: Evoluzione and the Rimonta achievement.
- **Crown**: the best winrate (Maestro, Statistiche) and the Campione achievement.
- **Rosette**: Top 8 and, in the admin, Badge.

Resolved the same day: Vecchia conoscenza (a handshake, not Giocatori's two
people), Aggro (a lightning bolt, not the matches' swords), the admin's
Comandanti (the public Comandanti icon, not a crown), Kryptonite (the
Bestia nera's skull, not the Perfetto gem), Vittima preferita (a drumstick,
not Regicida's target), Pioniere (a compass, not Portabandiera's flag), the
admin's Elimina (a bin, not the close X).
