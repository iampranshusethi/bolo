# Project rules

- **decisions.md** — after every code change, append any meaningful decision (library choice, design choice, trade-off) as a new numbered entry with *Decision / Why / Trade-off accepted*.
- **flow.md** — after every code change, update it so it describes the current entry point, the order of execution, and how control moves between files.
- **No Sarvam API calls unless the user explicitly asks.** Don't run scripts that hit the API, and don't route the user's questions to Sarvam; answer them directly.
- Keep it minimal: no dependencies or scaffolding the user didn't ask for. The API key comes from `.env` only; never hardcode or print it.
- **Never touch Gupta Sagar & Associate entities** (Supabase org, projects or anything else under that name). The connected Supabase MCP belongs to that org, so don't use it; the user's own Supabase account is set up by hand.
