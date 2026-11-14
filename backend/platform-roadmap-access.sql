-- Explicit deny policies document that browser roles have no table access.
-- Authorized reads and changes use the private-schema owner-checked RPCs.
create policy platform_roadmap_features_no_direct_access on wishlist_private.platform_roadmap_features
for all to anon,authenticated using (false) with check (false);
create policy platform_roadmap_history_no_direct_access on wishlist_private.platform_roadmap_history
for all to anon,authenticated using (false) with check (false);
