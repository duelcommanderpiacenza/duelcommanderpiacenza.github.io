-- Undoes 002_player_claims.sql: drops the request functions, the pending
-- requests and every account ↔ player link.
drop function if exists cancel_player_claim();
drop function if exists request_player_claim(uuid);
drop table if exists player_claims;
alter table players drop column if exists user_id;
