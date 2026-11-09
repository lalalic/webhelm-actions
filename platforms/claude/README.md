# Claude WebHelm Actions

WebHelm Chrome uses your existing signed-in Claude web account. The two Actions support **ordinary Claude chats**, not Claude Code, Projects, temporary chats or API calls.

- `new-thread`: navigate to `https://claude.ai/new?q=<encoded prompt>`, verify the exact prefilled composer text, press Send **once**, locate the newly persisted `/chat/<UUID>` thread and verify its user message.
- `new-turn`: navigate to `https://claude.ai/chat/<thread_id>`, verify the thread and empty composer, insert the new message, press Send **once**, then verify the persisted message on the same thread.

Both accept JSON config `{"message":"...","timeout_seconds":90,"wait":true,"response_format":"text"}`. `new-turn` additionally requires `thread_id` (UUID). Set `wait:false` to return after verified submission. When waiting, `status:completed` requires a non-streaming assistant response. `resume:true` plus `thread_id` and the exact `message` checks an existing thread read-only; it never sends again. Timeout or uncertain delivery returns `status:pending` rather than guessing success or retrying a possible duplicate.

The `q` URL is a **prefill**, not an automatic submission. The site may leave `/new` stale after processing a successful prompt; read-only navigation can reveal the saved conversation. Prompts are capped at 9000 characters to avoid URL truncation. The URL may appear in browser history; do not pass secrets. A caller-owned WebHelm Session is required, and the caller must stop it.

Web research: Anthropic's 2026 desktop deep-link documentation formally documents `q` prefill; GitHub issue anthropics/claude-code#8827 notes old auto-submit regression. Verified on Worknode using Claude web, not Claude Desktop. Actions must still be verified after copying to another node.
