import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { run as newTurn } from "../actions/_new_turn.mjs";
import { targetUrl } from "../runtime/lifecycle-common.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("manifest maps every ChatGPT action to an existing native .mjs module", () => {
  const manifest = readFileSync(join(root, "manifest.yaml"), "utf8");
  const body = manifest.split("actions:\n")[1].split("\nverification:")[0];
  const entries = [...body.matchAll(/^\s{2}[\w-]+:\s+"([^"]+)"/gm)].map((m) =>
    m[1]
  );
  assert.equal(entries.length, 9);
  for (const file of entries) {
    assert.match(file, /\.mjs$/);
    assert.ok(existsSync(join(root, file)), file);
  }
  assert.doesNotMatch(body, /\.py/);
  assert.match(manifest, /^status: migrated_unverified$/m);
  assert.match(manifest, /^  status: migrated_unverified$/m);
});

test("all ChatGPT JavaScript modules pass node syntax validation", () => {
  for (const folder of ["actions", "runtime"]) {
    for (
      const name of readdirSync(join(root, folder)).filter((x) =>
        x.endsWith(".mjs")
      )
    ) {
      const file = join(root, folder, name),
        r = spawnSync(process.execPath, ["--check", file], {
          encoding: "utf8",
        });
      assert.equal(r.status, 0, `${file}: ${r.stderr}`);
    }
  }
});

test("target routing preserves project/thread/temporary URL mapping", () => {
  assert.equal(
    targetUrl({ prompt: "probe" }),
    "https://chatgpt.com/?prompt=probe",
  );
  assert.equal(
    targetUrl({ project_id: "p", prompt: "probe" }),
    "https://chatgpt.com/g/p/project?prompt=probe",
  );
  assert.equal(
    targetUrl({ thread_id: "t", prompt: "probe" }),
    "https://chatgpt.com/c/t?prompt=probe",
  );
  assert.equal(
    targetUrl({ project_id: "p", thread_id: "t", prompt: "probe" }),
    "https://chatgpt.com/g/p/c/t?prompt=probe",
  );
  assert.equal(
    targetUrl({ temporary: true, prompt: "probe" }),
    "https://chatgpt.com/?temporary-chat=true&prompt=probe",
  );
  assert.throws(
    () => targetUrl({ temporary: true, thread_id: "t" }),
    /cannot be combined/,
  );
});

test("new-turn async queues by default and validates exact mode strings", async () => {
  let request;
  const helpers = {
    enqueueChatGPTTurn: async (value) => (request = value, {
      ok: true,
      status: "queued",
      queue_id: "q1",
      thread_id: value.thread_id,
      state: "QUEUED",
    }),
  };
  const result = await newTurn({
    helpers,
    config: {
      project_id: "p",
      thread_id: "t",
      message: "hello",
      idempotency_key: "key",
      mergeable: true,
    },
  });
  assert.equal(result.queue_id, "q1");
  assert.deepEqual(request, {
    thread_id: "t",
    project_id: "p",
    message: "hello",
    idempotency_key: "key",
    mergeable: true,
  });
  for (const mode of [true, "ASYNC", "Sync", "", 1]) {
    await assert.rejects(
      () =>
        newTurn({ helpers, config: { mode, thread_id: "t", message: "x" } }),
      /mode must be exactly/,
    );
  }
  await assert.rejects(
    () =>
      newTurn({
        helpers,
        config: { sync: true, thread_id: "t", message: "x" },
      }),
    /mode must be exactly/,
  );
});

test("new-turn sync mode uses caller Session and returns verified receipt", async () => {
  const { SEND_ENABLED_JS, CLICK_SEND_JS } = await import(
    "../runtime/lifecycle-common.mjs"
  );
  let enabled = true, clicked = 0, nav = "";
  const url = targetUrl({ thread_id: "t", prompt: "hello" });
  const scopedUrl = "https://chatgpt.com/g/p-project/c/t";
  const helpers = {
    goto_url: async (value) => {
      nav = value;
    },
    wait_for_load: async () => {},
    page_info: async () => ({ url: scopedUrl }),
    js: async (source) => {
      if (source === SEND_ENABLED_JS) return enabled;
      if (source === CLICK_SEND_JS) {
        clicked++;
        enabled = false;
        return true;
      }
      if (source.includes("could not load this chatgpt conversation")) {
        return null;
      }
      return false;
    },
  };
  const result = await newTurn({
    helpers,
    config: { mode: "sync", project_id: "p", thread_id: "t", message: "hello" },
  });
  assert.equal(nav, url, "new-turn navigates by ordinary thread ID and ?prompt");
  assert.equal(clicked, 1);
  assert.equal(result.status, "submitted");
  assert.equal(result.thread_url, scopedUrl, "canonical Project redirect is returned");
  assert.equal(result.verified_by, "send-button-disabled");
});

test("delivery failures normalize to stable public error codes", async () => {
  const { classify } = await import("../runtime/chatgpt-delivery-errors.mjs");
  assert.deepEqual(
    classify("ChatGPT visible delivery error: conversation_too_long"),
    {
      ok: false,
      code: "conversation_too_long",
      message: "Conversation is too long to continue",
    },
  );
  assert.equal(
    classify("Log in to ChatGPT")["code"],
    "authentication_required",
  );
  assert.equal(
    classify("unclassified private failure")["code"],
    "delivery_failed",
  );
});

test("generic submission receipts require a matching user turn; Temporary Chat opts into cleared-composer evidence", async () => {
  const { submissionReceipt } = await import("../runtime/readiness.mjs");
  assert.equal(submissionReceipt([], 0, "sent", ""), null);
  assert.equal(
    submissionReceipt([], 0, "sent", "", { allowComposerCleared: true })
      .verified_by,
    "composer-cleared",
  );
  assert.equal(
    submissionReceipt([{ text: "sent", id: "u1" }], 0, "sent", "").turn.id,
    "u1",
  );
});

test('read-only ChatGPT validate waits for hydrated composer instead of early false', async () => {
  const { run } = await import('../actions/_validate.mjs');
  let stateCalls=0;
  const helpers={
    goto_url:async()=>{},wait_for_load:async()=>{},
    js:async code => {
      if(code.includes('log in to chatgpt') && !code.includes('BrowserWorkspaceValidateProbe20261020'))return false;
      if(code.includes('BrowserWorkspaceValidateProbe20261020'))return {ready:++stateCalls>=3,login:false};
      return null;
    },
  };
  assert.equal(await run({helpers}),true);
  assert.equal(stateCalls,3);
});

test("new-turn sync rejects a redirect to a different thread before sending", async () => {
  const { run } = await import("../actions/_new_turn.mjs");
  let submitted = false;
  const helpers = {
    goto_url: async () => {},
    wait_for_load: async () => {},
    page_info: async () => ({ url: "https://chatgpt.com/g/project/c/different-id" }),
    js: async () => null,
    click: async () => { submitted = true; },
  };
  await assert.rejects(() => run({ helpers, config: {
    mode: "sync", thread_id: "expected-id", message: "test", project_id: "project",
  }}), /thread redirect mismatch/);
  assert.equal(submitted, false, "never submit to a different thread");
});

test("new-turn shared submission recognizes the accepted You said user turn even if Send remains enabled", async () => {
  const { prefilledSubmit, SEND_ENABLED_JS } = await import("../runtime/lifecycle-common.mjs");
  const prompt = "WebHelm new-turn redirect verification for Neo Mobile Chat Gateway";
  let sent = 0;
  const helpers = {
    js: async source => {
      if (source === SEND_ENABLED_JS) return true; // composer can re-enable rapidly
      if (source.includes("const selectors=['button[aria-label=")) return 'button[aria-label="Send"]';
      if (source.includes("h4[data-conversation-role=")) {
        return sent ? ["You said: " + prompt] : [];
      }
      return null;
    },
    click: async selector => {
      assert.equal(selector, 'button[aria-label="Send"]');
      sent++;
    },
  };
  const receipt = await prefilledSubmit(helpers, prompt);
  assert.equal(sent, 1);
  assert.equal(receipt.verified_by, "user-turn");
});

test("prefilled submission verifies persisted turn after SPA fails to show receipt, without re-sending", async () => {
  const { prefilledSubmit, SEND_ENABLED_JS } = await import("../runtime/lifecycle-common.mjs");
  const prompt = "Unique persisted owner message example";
  let clicks = 0, reloads = 0, lastUrl;
  const helpers = {
    page_info: async () => ({url: "https://chatgpt.com/g/g-p-test/c/thread-test?prompt=abc"}),
    goto_url: async url => { reloads++; lastUrl=url; },
    wait_for_load: async () => {},
    js: async code => {
      if (code === SEND_ENABLED_JS) return true;
      if (code.includes("const selectors=['button[aria-label=")) return 'button[aria-label="Send"]';
      if (code.includes('const roles=')) return [];
      if (code.includes('h4[data-conversation-role=user]')) return reloads > 0;
      return null;
    },
    click: async () => { clicks++; },
  };
  const receipt = await prefilledSubmit(helpers, prompt, {postSubmitTimeout:0.3});
  assert.equal(clicks,1,"Never click Send again to recover a receipt");
  assert.equal(reloads,1);
  assert.equal(lastUrl,"https://chatgpt.com/g/g-p-test/c/thread-test");
  assert.equal(receipt.verified_by,"persisted-user-turn");
});


test("prefilled Send rechecks a React-replaced button without duplicate clicks", async () => {
  const {prefilledSubmit, SEND_ENABLED_JS} = await import("../runtime/lifecycle-common.mjs");
  let probes = 0, clicks = 0;
  let enabled = true;
  const helpers = {
    sleep: async () => {},
    js: async src => {
      if (src === SEND_ENABLED_JS) return enabled;
      if (src.includes("const selectors=['button[aria-label=")) {
        return ++probes < 3 ? null : 'button[aria-label="Send"]';
      }
      if (src.includes('const roles=')) return clicks ? ['You said: ' + 'smoke'] : [];
      return null;
    },
    click: async selector => {
      assert.equal(selector, 'button[aria-label="Send"]');
      clicks++;
      enabled = false;
    },
  };
  const receipt = await prefilledSubmit(helpers, 'smoke');
  assert.equal(clicks, 1);
  assert.equal(receipt.verified_by, 'user-turn');
  assert.ok(probes >= 3);
});
