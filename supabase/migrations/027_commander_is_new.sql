-- 027 — The "Nuovo" badge for commanders: is_new marks a commander whose
-- first appearance in a closed event falls within the month before the
-- latest closed event. A derived cache like player_badges_auto: recomputed
-- by the admin's syncAutoBadges (admin/js/badges-sync.js) whenever an event
-- is opened, closed or deleted — never set by hand. Read by the public
-- site with the rest of the commander's row (js/ui.js commanderBadgesHtml).
--
-- Run once in the SQL editor (dev first). Undo: 027_commander_is_new_rollback.sql.

alter table commanders add column is_new boolean not null default false;
