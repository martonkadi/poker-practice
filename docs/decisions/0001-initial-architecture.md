# 0001: Initial architecture (2026-09-28)

Build heads-up v1 as a static browser app that keeps its data on the device first. Keep the game rules behind an adapter around the upstream engine, and run bot decisions in a Web Worker. Host on Cloudflare as static files. Use Supabase Free only for accounts and sync. Keep the GitHub repository private for now. The v1 bots are readable, hand-written heuristics. Heavier solving is out of scope.

Update (2026-09-30): the first public version ships without accounts or sync. Everything is stored in the browser, and the Supabase part is parked.
