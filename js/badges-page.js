// badges.html (linked from the Giocatori page, not a nav tab): every
// *automatic* badge a player can earn, how to earn it, and who holds it
// right now. Manually assigned badges aren't listed.
//
// Each card shows the badge's name and a "how" text written from its
// auto_rule, built from the very same thresholds js/auto-badges.js assigns
// it with, so changing a threshold there updates this page too. (The
// badge's optional `description` isn't used here — it's the hover text of
// the badge icon next to player names, js/ui.js's badgeTooltipAttrs.)
import { Badges, Players, PlayerAutoBadges } from "./db.js";
import {
  TOP8_STREAK_COUNT,
  TOP8_STREAK_WINDOW_MONTHS,
  TOP8_STREAK_MIN_ENTRANTS,
  MIN_MATCHES_FOR_MOST_MATCHES_BADGE,
  MIN_EVENTS_FOR_WINRATE_BADGE,
  MIN_COMMANDERS_FOR_DIVERSITY_BADGE,
  COMPLETIST_EVENT_COUNT,
  MIN_BYES_FOR_MOST_BYES_BADGE,
} from "./auto-badges.js";
import { escapeHtml, showError } from "./ui.js";
import { hidePageLoading } from "./page-loading.js";

const RULE_TEXT = {
  league_winner: "Vinci una lega: il badge resta tuo fino alla conclusione della lega successiva.",
  league_rank_1: "Sei 1° nella classifica della lega in corso. Si aggiorna a ogni tappa.",
  league_rank_2: "Sei 2° nella classifica della lega in corso. Si aggiorna a ogni tappa.",
  league_rank_3: "Sei 3° nella classifica della lega in corso. Si aggiorna a ogni tappa.",
  top8_streak: `Entra in top 8 nei tuoi ultimi ${TOP8_STREAK_COUNT} eventi, tutti negli ultimi ${TOP8_STREAK_WINDOW_MONTHS} mesi e con almeno ${TOP8_STREAK_MIN_ENTRANTS} iscritti.`,
  highest_winrate: `Hai il winrate più alto tra tutti i giocatori (minimo ${MIN_EVENTS_FOR_WINRATE_BADGE} eventi giocati).`,
  most_matches_played: `Hai giocato più partite di tutti (minimo ${MIN_MATCHES_FOR_MOST_MATCHES_BADGE}).`,
  most_commanders_played: `Hai giocato più comandanti diversi di tutti (minimo ${MIN_COMMANDERS_FOR_DIVERSITY_BADGE}).`,
  completionist: `Hai partecipato a tutti gli ultimi ${COMPLETIST_EVENT_COUNT} eventi.`,
  league_champion: "Hai vinto almeno una lega. Una volta conquistato, resta tuo per sempre.",
  most_byes: `Hai ricevuto più bye di tutti (minimo ${MIN_BYES_FOR_MOST_BYES_BADGE}).`,
};

function badgeText(b) {
  return RULE_TEXT[b.auto_rule] ?? "";
}

function iconHtml(b) {
  return b.icon_url
    ? `<img src="${escapeHtml(b.icon_url)}" alt="" class="badge-card-icon-img">`
    : `<span class="badge-card-icon-emoji">${escapeHtml(b.icon ?? "")}</span>`;
}

function holdersHtml(holders) {
  if (holders.length === 0) {
    return '<p class="badge-card-holders-empty">Nessuno, per ora &mdash; potresti essere tu!</p>';
  }
  return `<div class="badge-card-holders">${holders
    .map((p) => `<a class="badge-holder" href="player.html?id=${p.id}">${escapeHtml(p.name)}</a>`)
    .join("")}</div>`;
}

function cardHtml(b, holders) {
  return `
    <article class="badge-card" id="badge-${b.id}">
      <div class="badge-card-head">
        <span class="badge-card-icon">${iconHtml(b)}</span>
        <h3 class="badge-card-name">${escapeHtml(b.name)}</h3>
      </div>
      <p class="badge-card-text">${escapeHtml(badgeText(b))}</p>
      <div class="badge-card-holders-label">Attualmente</div>
      ${holdersHtml(holders)}
    </article>`;
}

function gridHtml(badges, holdersByBadge) {
  return `<div class="badges-grid">${badges.map((b) => cardHtml(b, holdersByBadge.get(b.id) ?? [])).join("")}</div>`;
}

async function init() {
  const contentEl = document.getElementById("badges-content");
  try {
    const [badges, players, autoRows] = await Promise.all([Badges.list(), Players.list(), PlayerAutoBadges.list()]);

    // Holders: manual slots (badge1/badge2 on the player) plus the cached
    // automatic assignments — the full set, not the per-row display cap.
    const playerById = new Map(players.map((p) => [p.id, p]));
    const holderIds = new Map(); // badge id -> Set of player ids
    const addHolder = (badgeId, playerId) => {
      if (!badgeId || !playerById.has(playerId)) return;
      if (!holderIds.has(badgeId)) holderIds.set(badgeId, new Set());
      holderIds.get(badgeId).add(playerId);
    };
    for (const p of players) {
      addHolder(p.badge1_id, p.id);
      addHolder(p.badge2_id, p.id);
    }
    for (const row of autoRows) addHolder(row.badge?.id, row.player_id);
    const holdersByBadge = new Map(
      [...holderIds].map(([badgeId, ids]) => [
        badgeId,
        [...ids].map((id) => playerById.get(id)).sort((a, b) => a.name.localeCompare(b.name, "it")),
      ])
    );

    // Automatic badges only — manually assigned ones aren't listed here.
    const byName = (a, b) => a.name.localeCompare(b.name, "it");
    const auto = badges.filter((b) => b.auto_rule).sort((a, b) => b.priority - a.priority || byName(a, b));

    contentEl.innerHTML =
      auto.length === 0
        ? '<p class="page-empty">Nessun badge ancora.</p>'
        : gridHtml(auto, holdersByBadge);

    // Arriving from a badge on a player's page (badges.html#badge-<id>): the
    // cards didn't exist yet when the browser tried to jump to the anchor,
    // so scroll to (and briefly highlight) the right one now.
    const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    if (target) {
      target.classList.add("is-target");
      requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
    }
  } catch (err) {
    showError(contentEl, err);
  } finally {
    hidePageLoading();
  }
}

init();
