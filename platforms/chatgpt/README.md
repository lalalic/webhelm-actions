# ChatGPT browser platform

Canonical reusable browser mechanics for ChatGPT.

This platform owns ChatGPT-specific page behavior. Callers own lifecycle:

- Agents Relay: disposable worker lifecycle and event/barrier ownership.
- NeoY Tutor Workspace: persistent learner/thread lifecycle.

Use Browser Workspace as the only browser-control engine. Do not duplicate ChatGPT
selectors or submit/result-completion logic in callers.

`temporary-submit` owns the reusable Temporary Chat page mechanics and verified submit receipt. Callers that need delayed cleanup should render the action source into a caller-owned Browser Workspace session and stop that session at their lifecycle barrier.

## Web ChatGPT MCP apps

Use the `mcp-app` action for repeatable inspection of an installed custom MCP app and for a safe tool refresh. It deliberately uses semantic text/role discovery rather than transient snapshot refs such as `e31`.

```bash
cat > /tmp/chatgpt-mcp-app.json <<'JSON'
{"app_name":"neo","operation":"status"}
JSON
bw platform run chatgpt mcp-app --session-id SESSION_ID --config /tmp/chatgpt-mcp-app.json
```

A connected app is verified by its detail page exposing `Permissions`, `Disconnect`, and `Refresh tools`. The action returns these as structured booleans.

### Configure a custom MCP app

The proven Web ChatGPT flow is:

1. Start/reuse a Browser Workspace session on `https://chatgpt.com` and take a fresh `snapshot()` before interacting. Never reuse `eNN` refs from an earlier snapshot.
2. Open the visible profile menu by semantic label `Open profile menu`, choose `Settings`, then choose `Plugins`. The durable settings route observed in October 2026 is `/settings/plugins-settings`, but prefer semantic navigation because routes can drift.
3. From Plugins, use the create/add-custom-app control. Enter the app display name and its public HTTPS MCP endpoint. Keep endpoint/client/OAuth values in caller configuration; never commit credentials to this platform.
4. Ask ChatGPT to scan/discover the MCP tools. If OAuth is advertised by the MCP server, continue the OAuth authorization flow and return to ChatGPT.
5. Finish creating/installing the app, then reopen Settings -> Plugins and select the app by exact display name.
6. Verify the detail page exposes `Permissions`, `Disconnect`, and `Refresh tools`. `Disconnect` is the positive signal that the account/OAuth connection is established. Run `mcp-app` with `operation=status` to capture this verification programmatically.
7. After an MCP server descriptor/tool change, use `operation=refresh-tools`, then inspect status again before testing tool calls.

### Snapshot-first fallback for UI drift

If a semantic selector no longer resolves, do not guess coordinates or hard-code old refs. In the same Browser Workspace session:

```python
print(snapshot(interactive_only=False))
```

Use the fresh accessibility/DOM output to rediscover the visible control by role, accessible label, or stable text. When a menu is lazy-loaded, trigger the visible semantic control, wait for hydration, then snapshot again. This is how the profile menu -> Settings -> Plugins path was recovered during the live MCP setup.

Destructive controls (`Disconnect`, `Uninstall`, `Delete app`) are intentionally not exposed as `mcp-app` operations.


## XChat lifecycle control transfer

Browser Workspace owns the ChatGPT UI mechanics for orchestrator lifecycle handoff.

- `new-turn`: given stable `project_id`, `thread_id` and `message` (or attachments), submit to the same conversation. **Without a caller Session**, `webhelm platform run chatgpt new-turn --config turn.json` enqueues through `queues/new-turn.mjs`, returning `{status:'queued',queue_id,...}` immediately. **With `--session-id`**, it directly calls the same `_new_turn.mjs` Action. The Action clicks Send once and returns `status:'submitted'` without waiting for the assistant response. `mode`/`sync` inputs and `--mode` are retired; the caller-owned Session decides direct versus queued execution.
- `new-thread`: given stable `project_id` and `message` (plus optional `source_thread_id` provenance), open the same Project, submit the continuation to create a fresh thread, and return the durable new `thread_id` once ChatGPT replaces any temporary local id.

**Long prompts (>2,000 characters):** `new-thread` and synchronous `new-turn`
write the complete message to a private temporary `prompt.md`, confirm its upload
in the current Browser Session, and submit the short text `Read prompt.md and
execute the task in that file.` The temporary file is deleted after the
attempt succeeds or fails. Queued `new-turn` invokes exactly the same Action, including its prompt.md threshold and
file-upload behavior in the Platform Action. Callers should send the
original full prompt, not create another input file or truncate it.

`new-thread` and `new-turn` also support optional `app` (a structured
ChatGPT App mention, not a plain text `@Name`) and `model_choice` (a visible
model picker option such as `GPT-5.6 Sol`). These do not change defaults for
other callers. Both actions accept optional `thinking_level` and use the shared internal `setThinkingLevel` helper (best effort; failure yields a warning receipt and continues Send). If omitted, leave the current setting unchanged. A caller-owned session may opt into `recover_thread_receipt: true` to receive a pending receipt after Send when the durable URL is not yet available; it must recover the same session without resending. On `new-turn`, queued calls invoke the same browser Action and support the same App/model/thinking options; merge is disabled for requests containing these options. New-thread and new-turn never compare composer content or inspect user-turn
text to verify delivery. Once the Send button is enabled, a single successful
click is recorded as submitted. The action never retries a click; new-thread
still extracts its durable thread ID from the resulting URL.

`new-thread` and `new-turn` accept optional `enforcement_context` in the
Action config. WebHelm wraps it in `<top-instructions>`, independently of the
caller's protocol. For short tasks it precedes the raw `message`; for long
tasks only the `message` is attached as `prompt.md` and the context remains
in the visible composer before the file-reading instruction. The option is optional; the WebHelm Queue Manager persists the field and invokes the normal Action after `validate_new_turn_ready` returns READY.

These actions are control-transfer primitives. The generic Browser Workspace runner owns session start/stop and cleanup. Product code should pass stable Project/Thread IDs rather than persist ChatGPT URLs or DOM identities.

```bash
# No Session means asynchronous Queue delivery; result status is queued.
bw platform run chatgpt new-turn --config turn.json

# Direct delivery inside an existing caller-owned session.
bw platform run chatgpt new-turn --session-id SESSION_ID --config turn.json
```

The CLI selects direct or queued delivery from Session ownership; no `mode` field is accepted.


### ChatGPT project-setup (existing Projects)

`project-setup` **reuses** a Project whose sidebar name matches `project_name`
instead of creating a duplicate. It updates Project Instructions, reopens
settings to verify they persisted, and preserves existing memory policy
(Default or Project-only). It then calls the existing `new-thread` Action with a Project-scoped
`?prompt=` URL (no custom composer implementation), verifies the resulting
durable Project thread URL and user turn, then returns a
`project_reused`, `project_id`, `thread_id` receipt. Project settings menu
triggers are clicked once (never inside polling loops), and browser readiness
timeouts are in seconds. A returned thread ID verifies submission, not the
assistant's final answer. Chat Gateway persists this receipt and avoids
re-running project-setup while its bound head remains valid.

For subsequent messages, `new-turn` reuses the ordinary
`https://chatgpt.com/c/<threadId>?prompt=<message>` URL: ChatGPT may
canonicalize this to a Project-scoped `/g/<projectId>[-slug]/c/<threadId>`
path. The Action verifies the thread ID and rejects a different Project
when its canonical scope is visible, rather than requiring literal pathname
equality. Queue Policy controls grouping, title, readiness validation and optional enqueue-time merge; the browser Action contains no queue dispatcher.

## Required 3-MVP verification after every Action change

Before merging/publishing any ChatGPT Action, helper, policy or delivery
contract change, run `WEBHELM_MVP_ALLOW_SEND=1 npm run test:e2e:chatgpt-mvps`
from the `webhelm` Runtime checkout against the **new live daemon**.
It must prove newThread, newTurn in the same Thread, and two different queued
newTurns (FIFO, both `SENT`) in that **same Thread**. Mock tests alone are not
release evidence. Record the sanitized result and clean up owned Sessions.
When an older daemon has cached a dependency, restart it safely after its
Sessions drain rather than treating a stale module import failure as a passing
MVP. Do not resend ambiguous previous messages.


Models recovery reuses the ordinary validate_new_turn_ready and new-turn Actions. No additional DOM inspection is needed for recovery.
