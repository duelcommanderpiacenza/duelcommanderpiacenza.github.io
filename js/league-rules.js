// The league's rules — how its standings are scored (LEAGUE_RULES.md,
// simplified for players) — in the site's shared pop-up
// (js/info-dialog.js). Opened by league.html's "Regolamento" (in its hero)
// and the Bacheca's (beside the league's standings).

import { openInfoDialog } from "./info-dialog.js";

// An open book, before the buttons' label.
export const RULES_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"></path><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"></path></svg>';

// Option A ("Scala e bonus", of a mockup, 2026-10-26; its match points'
// chips removed the same day): the league points by position as a ladder of red columns (as tall
// as their points); the three special rules as cards, each with its number
// big (+2, −1, +5). Styles: css/2 "The rules' pop-up".
const LADDER = [
  ["1°", 20],
  ["2°", 17],
  ["3°–4°", 14],
  ["5°–8°", 11],
  ["dal 9°", 5],
];
const BONUSES = [
  ["+2", "Imbattuto", "Chiudi l’evento senza sconfitte."],
  ["−1", "Il peggiore non conta", "Il tuo risultato peggiore viene scartato: una giornata storta non ti toglie dalla corsa."],
  ["+5", "Presenza completa", "A chi gioca tutti gli eventi, a lega conclusa."],
];

const RULES_HTML = `
  <p class="league-rules-label">Punti lega per posizione</p>
  <div class="league-rules-ladder" role="list">
    ${LADDER.map(
      ([place, points]) => `
    <div class="league-rules-step" role="listitem" aria-label="${place}: ${points} punti">
      <span class="league-rules-col"><span class="league-rules-bar" style="height:${Math.round((points / 20) * 100)}%"><b>${points}</b></span></span>
      <span class="league-rules-place">${place}</span>
    </div>`
    ).join("")}
  </div>
  <ul class="league-rules-bonuses">
    ${BONUSES.map(
      ([value, title, text]) => `
    <li><span class="league-rules-num${value.startsWith("−") ? " is-minus" : ""}">${value}</span><span><b>${title}</b>${text}</span></li>`
    ).join("")}
  </ul>`;

export function openLeagueRules() {
  openInfoDialog({
    id: "league-help-dialog",
    title: "Regolamento",
    subtitle: "Come si calcola la classifica della lega",
    bodyHtml: RULES_HTML,
  });
}
