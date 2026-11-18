import { Endstep, Players, Commanders } from "../../js/db.js";
import { escapeHtml } from "../../js/ui.js";
import { renderTable, setMessage, runBusy } from "./crud-ui.js";

/**
 * "Importa da endstep" (migration 038), on an online event's Giocatori
 * view: reads the tournament behind the event's link (events.endstep_url,
 * migration 036 — through the endstep-import Edge Function: endstep's API
 * can't be read from this site's pages) and, once the admin has checked a
 * preview, saves it as the event's entries and matches, replacing what's
 * there (replace_event_results: all or nothing; an archetype or a league
 * bonus already set for a player is kept).
 *
 * Entrants who played no match (no win, loss or draw: registered and
 * gone — user, 2026-11-16) are left out. The preview, one row per entrant
 * in endstep's order (its place): who they are here — the player whose
 * endstep username it is (players.endstep), else the account's
 * (profiles.endstep, through its linked player), else the one player with
 * that very name, else a new player (its name editable: endstep usernames
 * can be email addresses) — and their deck's commanders (by name; one we
 * don't have yet is created, its colours from Scryfall; no published deck:
 * picked here; a partner pair — endstep's second commander — put in the
 * order it's mostly stored in already). Saving remembers each player's
 * username for the next import. Matches: every reported pairing with its
 * game scores (a no-show as endstep scores it, 2-0), a bye as our bye;
 * anything else (unfinished) is left out and said; a player whose last
 * match comes before the last round dropped (user: played, then no more) —
 * our drop row in the round after it, "ritirato dopo il turno N" in the
 * preview. The places follow
 * endstep's (manual_rank) within equal points. Archetypes are left empty —
 * set them later in Iscritti. The event must be open (like any change to
 * its entries).
 */

const ERRORS = {
  not_signed_in: "Sessione scaduta: rientra.",
  not_admin: "Solo un amministratore può importare.",
  bad_request: "Il Link endstep dell'evento non è valido.",
  not_found: "Torneo non trovato su endstep.",
  endstep_failed: "endstep non risponde: riprova più tardi.",
  not_deployed: "La funzione endstep-import non risponde (è installata su Supabase?).",
};

const norm = (s) => (s ?? "").trim().toLowerCase();
// A commander as matched: its name lowercased, a double-faced card by its
// front face.
const commanderKey = (s) => norm(s).split(" // ")[0];
// A new player's name from an endstep username: an email's address part
// left out (it would be published).
const proposedName = (username) => username.split("@")[0];
const WUBRG = "WUBRG";

// A commander's colour identity from Scryfall ("" on any failure).
async function scryfallColors(name) {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
    if (!res.ok) return "";
    const card = await res.json();
    return WUBRG.split("")
      .filter((c) => (card.color_identity ?? []).includes(c))
      .join("");
  } catch {
    return "";
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function initEndstepImport({ onImported }) {
  const root = document.getElementById("endstep-import");
  const startBtn = document.getElementById("endstep-import-btn");
  const hintEl = document.getElementById("endstep-import-hint");
  const previewEl = document.getElementById("endstep-import-preview");
  const msgEl = document.getElementById("endstep-import-message");

  let currentEvent = null;
  let plan = null; // the tournament read and its rows, while a preview is shown

  function syncState() {
    const ev = currentEvent;
    root.hidden = !ev?.is_online;
    if (!ev?.is_online) return;
    startBtn.disabled = !ev.endstep_url || !ev.is_open;
    hintEl.textContent = !ev.endstep_url
      ? "Aggiungi prima il Link endstep all'evento."
      : !ev.is_open
        ? "Riapri l'evento per importare."
        : "Sostituisce iscritti e partite con quelli del torneo su endstep.";
  }

  function close() {
    plan = null;
    previewEl.innerHTML = "";
  }

  async function load() {
    setMessage(msgEl, "", false);
    close();
    let data, players, commanders, profiles;
    try {
      [data, players, commanders, profiles] = await Promise.all([
        Endstep.readTournament(currentEvent.endstep_url),
        Players.list(),
        Commanders.list(),
        Endstep.profileUsernames().catch(() => []),
      ]);
    } catch (err) {
      console.error(err);
      setMessage(msgEl, ERRORS[err?.message] ?? "Errore nella lettura del torneo.", true);
      return;
    }

    // Who's who: by the player's endstep username, by the linked account's,
    // by the very same name (when only one player has it).
    const byEndstep = new Map(players.filter((p) => p.endstep).map((p) => [norm(p.endstep), p]));
    const byUser = new Map(players.filter((p) => p.user_id).map((p) => [p.user_id, p]));
    const byProfile = new Map(
      profiles.map((pr) => [norm(pr.endstep), byUser.get(pr.user_id)]).filter(([, p]) => p)
    );
    const nameCount = new Map();
    for (const p of players) nameCount.set(norm(p.name), (nameCount.get(norm(p.name)) ?? 0) + 1);
    const byName = new Map(players.filter((p) => nameCount.get(norm(p.name)) === 1).map((p) => [norm(p.name), p]));
    const commanderByKey = new Map(commanders.map((c) => [commanderKey(c.name), c]));

    // Each entrant's last round with a pairing (a bye, a no-show included):
    // one before the last round dropped.
    const lastRound = Math.max(0, ...data.rounds.map((r) => r.round));
    const lastPlayed = new Map();
    for (const r of data.rounds) {
      for (const p of r.pairings) {
        for (const s of p.seats) lastPlayed.set(s.entrantId, Math.max(lastPlayed.get(s.entrantId) ?? 0, r.round));
      }
    }

    // Who never played a match (0-0-0) isn't imported: counted in the summary.
    const played = (e) => e.wins + e.losses + e.draws > 0;
    const absent = data.entrants.filter((e) => !played(e)).length;
    const rows = data.entrants
      .filter(played)
      .sort((a, b) => (a.place ?? 9999) - (b.place ?? 9999))
      .map((e, i) => {
        const key = norm(e.username);
        const [player, how] = byEndstep.has(key)
          ? [byEndstep.get(key), "username"]
          : byProfile.has(key)
            ? [byProfile.get(key), "profilo"]
            : byName.has(key)
              ? [byName.get(key), "nome"]
              : [null, null];
        const deck = (e.commanders ?? []).slice(0, 2).map((name) => ({ name, existing: commanderByKey.get(commanderKey(name)) ?? null }));
        const last = lastPlayed.get(e.entrantId) ?? 0;
        const dropAfter = last > 0 && last < lastRound ? last : null;
        return { id: i, entrant: e, player, how, deck, dropAfter };
      });
    plan = { data, rows, players, commanders, absent };
    renderPreview();
  }

  function renderPreview() {
    const { data, rows, players, commanders, absent } = plan;
    const playerOptions = players
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}${p.handle ? ` (${escapeHtml(p.handle)})` : ""}</option>`)
      .join("");
    const commanderOptions = commanders.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    const matchCount = data.rounds.reduce((n, r) => n + r.pairings.length, 0);
    const newPlayers = rows.filter((r) => !r.player).length;
    const newCommanders = new Set(rows.flatMap((r) => r.deck.filter((d) => !d.existing).map((d) => commanderKey(d.name)))).size;
    const noDeck = rows.filter((r) => r.deck.length === 0).length;
    const notComplete = data.tournament.status !== "complete";

    previewEl.innerHTML = `
      <div class="endstep-import-summary">
        <strong>${escapeHtml(data.tournament.name ?? "Torneo")}</strong>
        <span>${rows.length} giocatori · ${data.tournament.rounds} turni · ${matchCount} partite</span>
        <span>${newPlayers ? `${newPlayers} ${newPlayers === 1 ? "giocatore nuovo" : "giocatori nuovi"}` : "tutti i giocatori trovati"}${
          newCommanders ? ` · ${newCommanders} ${newCommanders === 1 ? "comandante nuovo" : "comandanti nuovi"}` : ""
        }${noDeck ? ` · ${noDeck} senza mazzo pubblicato (sceglilo qui)` : ""}</span>
        ${absent ? `<span>${absent} ${absent === 1 ? "iscritto senza partite non verrà importato" : "iscritti senza partite non verranno importati"}</span>` : ""}
        ${notComplete ? '<span class="endstep-import-warn">Il torneo non è concluso su endstep: verranno importate solo le partite già refertate.</span>' : ""}
      </div>
      <div id="endstep-import-rows"></div>
      <div class="form-actions endstep-import-actions">
        <button type="button" class="btn-primary" id="endstep-import-confirm">Importa</button>
        <button type="button" class="btn-secondary" id="endstep-import-cancel">Annulla</button>
      </div>`;

    renderTable(
      previewEl.querySelector("#endstep-import-rows"),
      rows,
      [
        {
          key: "who",
          label: "endstep",
          render: (r) =>
            `<span class="rank-chip">${Number.isFinite(Number(r.entrant.place)) ? Number(r.entrant.place) : "—"}</span> ${escapeHtml(r.entrant.username)}${
              r.dropAfter ? ` <span class="admin-card-muted">(ritirato dopo il turno ${r.dropAfter})</span>` : ""
            }`,
        },
        {
          key: "player",
          label: "Giocatore",
          render: (r) => `
            <select class="endstep-import-control" data-player="${r.id}">
              <option value="new"${r.player ? "" : " selected"}>+ Nuovo giocatore</option>
              ${playerOptions}
            </select>
            <input type="text" class="endstep-import-control" data-new-name="${r.id}" value="${escapeHtml(proposedName(r.entrant.username))}" aria-label="Nome del nuovo giocatore"${r.player ? " hidden" : ""}>
            ${r.how ? `<span class="admin-card-muted">trovato per ${r.how}</span>` : ""}`,
        },
        {
          key: "deck",
          label: "Comandante",
          render: (r) =>
            r.deck.length
              ? r.deck
                  .map((d) => `${escapeHtml(d.name)}${d.existing ? "" : ' <span class="admin-card-muted">(nuovo)</span>'}`)
                  .join(" / ")
              : `<select class="endstep-import-control" data-commander="${r.id}"><option value="">— scegli —</option>${commanderOptions}</select>`,
        },
        { key: "record", label: "V-S-P", render: (r) => [r.entrant.wins, r.entrant.losses, r.entrant.draws].map((n) => Number(n) || 0).join("-") },
      ],
      {}
    );

    for (const r of rows) {
      const select = previewEl.querySelector(`[data-player="${r.id}"]`);
      if (r.player) select.value = r.player.id;
      const nameInput = previewEl.querySelector(`[data-new-name="${r.id}"]`);
      select.addEventListener("change", () => (nameInput.hidden = select.value !== "new"));
    }
    const confirmBtn = previewEl.querySelector("#endstep-import-confirm");
    confirmBtn.addEventListener("click", () => runBusy(confirmBtn, save));
    previewEl.querySelector("#endstep-import-cancel").addEventListener("click", close);
  }

  async function save() {
    const { data, rows } = plan;
    // The admin's choices, checked before anything is written.
    const choices = rows.map((r) => ({
      row: r,
      playerId: previewEl.querySelector(`[data-player="${r.id}"]`).value,
      newName: previewEl.querySelector(`[data-new-name="${r.id}"]`).value.trim(),
      commanderId: previewEl.querySelector(`[data-commander="${r.id}"]`)?.value ?? null,
    }));
    if (choices.some((c) => c.playerId === "new" && !c.newName)) {
      setMessage(msgEl, "Scrivi il nome di ogni giocatore nuovo.", true);
      return;
    }
    if (choices.some((c) => c.row.deck.length === 0 && !c.commanderId)) {
      setMessage(msgEl, "Scegli il comandante di chi non ha pubblicato il mazzo.", true);
      return;
    }
    const picked = choices.filter((c) => c.playerId !== "new").map((c) => c.playerId);
    if (new Set(picked).size !== picked.length) {
      setMessage(msgEl, "Lo stesso giocatore è scelto per due utenti endstep.", true);
      return;
    }
    if (!confirm("Iscritti e partite dell'evento verranno sostituiti da quelli del torneo su endstep. Continuare?")) return;

    try {
      // 1. The new players (each with their endstep username), and the
      // username remembered on the ones found another way.
      const playerOf = new Map(); // entrantId -> player id
      for (const c of choices) {
        const username = c.row.entrant.username;
        if (c.playerId === "new") {
          const created = await Players.create({ name: c.newName, endstep: username }).catch(() =>
            // The username already someone else's: created without it.
            Players.create({ name: c.newName })
          );
          playerOf.set(c.row.entrant.entrantId, created.id);
        } else {
          playerOf.set(c.row.entrant.entrantId, c.playerId);
          const player = plan.players.find((p) => p.id === c.playerId);
          if (player && !player.endstep) await Players.update(player.id, { endstep: username }).catch(() => {});
        }
      }

      // 2. The commanders we don't have yet, their colours from Scryfall.
      const commanderOf = new Map(plan.commanders.map((c) => [commanderKey(c.name), c.id]));
      for (const c of choices) {
        for (const d of c.row.deck) {
          const key = commanderKey(d.name);
          if (commanderOf.has(key)) continue;
          const color_identity = await scryfallColors(d.name);
          const created = await Commanders.create({ name: d.name, color_identity });
          commanderOf.set(key, created.id);
          await pause(100); // Scryfall asks for 50-100ms between requests
        }
      }

      // 3. The entries, in endstep's order (manual_rank: its places within
      // equal points). A commander + partner pair put the way it's mostly
      // stored already ("A / B" and "B / A" would be two decks); never seen
      // before, endstep's order.
      const pairCount = new Map(); // "A_B" -> entries stored in that order
      for (const e of await Endstep.knownPairs()) {
        const key = `${e.commander_id}_${e.partner_commander_id}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
      const oriented = (first, second) =>
        (pairCount.get(`${second}_${first}`) ?? 0) > (pairCount.get(`${first}_${second}`) ?? 0) ? [second, first] : [first, second];
      const entries = choices.map((c, i) => {
        let [first, second] = c.row.deck.map((d) => commanderOf.get(commanderKey(d.name)));
        if (second === first) second = undefined;
        if (first && second) [first, second] = oriented(first, second);
        return {
          player_id: playerOf.get(c.row.entrant.entrantId),
          commander_id: first ?? c.commanderId,
          partner_commander_id: second ?? null,
          manual_rank: i,
        };
      });

      // 4. The matches: reported ones (no-shows included) with their game
      // scores, byes; the rest left out.
      const matches = [];
      let skipped = 0;
      for (const r of data.rounds) {
        for (const p of r.pairings) {
          const [a, b] = p.seats;
          const p1 = playerOf.get(a?.entrantId);
          if (p.status === "bye" && p.seats.length === 1 && p1) {
            matches.push({ round: r.round, player1_id: p1, player2_id: null, player1_wins: 2, draws: 0, player2_wins: 0 });
            continue;
          }
          const p2 = playerOf.get(b?.entrantId);
          const valid =
            ["reported", "no_show"].includes(p.status) &&
            p.seats.length === 2 &&
            p1 &&
            p2 &&
            p1 !== p2 &&
            a.gamesWon <= 2 &&
            a.gamesLost <= 2 &&
            a.gamesWon + a.gamesDrawn + a.gamesLost <= 3;
          if (!valid) {
            skipped += 1;
            continue;
          }
          matches.push({
            round: r.round,
            player1_id: p1,
            player2_id: p2,
            player1_wins: a.gamesWon,
            draws: a.gamesDrawn,
            player2_wins: a.gamesLost,
          });
        }
      }
      // The drops: in the round after each one's last match.
      let drops = 0;
      for (const c of choices) {
        if (!c.row.dropAfter) continue;
        matches.push({
          round: c.row.dropAfter + 1,
          player1_id: playerOf.get(c.row.entrant.entrantId),
          player2_id: null,
          player1_wins: 0,
          draws: 0,
          player2_wins: 0,
          is_drop: true,
        });
        drops += 1;
      }

      await Endstep.replaceResults(currentEvent.id, data.tournament.rounds, entries, matches);
      currentEvent.rounds = Math.max(1, data.tournament.rounds);
      close();
      setMessage(
        msgEl,
        `Importati ${entries.length} giocatori e ${matches.length - drops} partite${drops ? `, ${drops} drop` : ""}${
          skipped ? ` (${skipped} non concluse saltate)` : ""
        }. Ricorda gli archetipi.`,
        false
      );
      onImported?.();
    } catch (err) {
      console.error(err);
      setMessage(msgEl, `Errore nell'importazione${err?.message ? `: ${err.message}` : "."}`, true);
    }
  }

  startBtn.addEventListener("click", () => runBusy(startBtn, load));

  function openEvent(event) {
    currentEvent = event;
    close();
    setMessage(msgEl, "", false);
    syncState();
  }

  return { openEvent, refreshOpenState: syncState };
}
