import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../actions/_project_setup.mjs";

const PROJECT_ID = "g-p-6af0d638bb04819190be1b77ae7e648e";
const THREAD_ID = "6ae99a2e-aaaa-bbbb-cccc-ddddeeeeffff";

function fakeProjectBrowser({ instructions, initialPrompt, knownThread = false }) {
  const state = {
    url: "https://chatgpt.com/", settingsOpen: false, menuOpen: false,
    sendEnabled: true,
    settingsPersisted: "", draftInstructions: "", composerValue: "", sent: knownThread,
    knownThread,
    newProjectClicks: 0, projectSettingsClicks: 0, memoryMutations: 0,
    sendClicks: 0, newTabs: 0, projectNavigations: 0, visitedUrls: [],
  };
  const helper = {
    async new_tab(url) { state.newTabs++; state.url = url; },
    async goto_url(url) {
      state.url = url; state.projectNavigations++; state.visitedUrls.push(url);
    },
    async wait_for_load() {},
    async page_info() { return { url: state.url }; },
    async fill_input(selector, value) {
      if (selector !== "#prompt-textarea") {
        throw Error("reusing a Project must not request project-name input");
      }
      state.composerValue = value;
    },
    async click(selector) {
      assert.equal(selector, 'button[aria-label="Send"]');
      state.sendClicks++;
      state.url = `https://chatgpt.com/g/${PROJECT_ID}/c/${THREAD_ID}`;
      state.sent = true;
      state.sendEnabled = false;
    },
    async js(source) {
      if (source.includes("const b=[...document.querySelectorAll('button')],f=n=>b.find")) return "chat";
      if (source.includes("could not load this chatgpt conversation")) return null;
      if (source.includes("const buttons=[...document.querySelectorAll('button[data-testid=") &&
          source.includes("return !!b")) return state.sendEnabled;
      if (source.includes("const selectors=['button[aria-label=\"Send\"]'")) return 'button[aria-label="Send"]';
      if (source.includes("const turns=")) return state.sent ? [initialPrompt] : [];
      if (source.includes("data-message-author-role=\"user\"") && source.includes(".concat("))
        return state.sent ? [initialPrompt] : [];
      if (source.includes("const rows=document.querySelectorAll")) return "rows";
      if (source.includes("const row=[...document.querySelectorAll") &&
          source.includes("data-app-action-sidebar-project-row"))
        return { projectId: PROJECT_ID, label: "orchestrator" };
      if (source.includes("const d=document.querySelector('[role=\"dialog\"]')") &&
          source.includes("/project settings/i.test") && source.includes("return !!d"))
        return state.settingsOpen;
      if (source.includes("const b=[...document.querySelectorAll('button')]") &&
          source.includes("Project actions") && source.includes("return !!b&&b.getBoundingClientRect().width>0"))
        return true;
      if (source.includes("const b=[...document.querySelectorAll('button')]") &&
          source.includes("Project actions") && source.includes("fire(b)")) {
        state.menuOpen = !state.menuOpen;
        state.projectSettingsClicks++;
        return true;
      }
      if (source.includes("some(x=>/project settings/i.test")) return state.menuOpen;
      if (source.includes("const e=[...document.querySelectorAll('[role=\"menuitem\"]") &&
          source.includes("fire(e)")) {
        state.menuOpen = false; state.settingsOpen = true; return true;
      }
      if (source.includes("e.setAttribute('data-neoy-project-instructions'"))
        return '[data-neoy-project-instructions="1"]';
      if (source.includes("Object.getOwnPropertyDescriptor") &&
          source.includes("dispatchEvent")) {
        if (state.settingsOpen) state.draftInstructions = instructions;
        else state.composerValue = initialPrompt;
        return true;
      }
      if (source.includes("return (b?.textContent||'unavailable')")) return "default";
      if (source.includes("const save=buttons.find") &&
          source.includes("const close=buttons.find")) {
        if (state.draftInstructions !== state.settingsPersisted) {
          state.settingsPersisted = state.draftInstructions;
          state.settingsOpen = false;
          return "saved";
        }
        state.settingsOpen = false;
        return "closed";
      }
      if (source.includes("!document.querySelector('[role=\"dialog\"]')"))
        return !state.settingsOpen;
      if (source.includes("querySelector('textarea[name=\"project-instructions\"]')"))
        return state.settingsPersisted;
      if (source.includes("const link=[...document.querySelectorAll('a[href]')].find")) {
        return state.knownThread
          ? `https://chatgpt.com/g/${PROJECT_ID}/c/${THREAD_ID}`
          : null;
      }
      if (source.includes("document.body?.innerText") &&
          source.includes("You said:")) return state.sent;
      if (source.includes("const ss=")) return "#prompt-textarea";
      if (source.includes("const t=(e?.innerText")) return state.composerValue === initialPrompt;
      if (source.includes("for(const s of")) return 'button[aria-label="Send"]';
      throw Error("unexpected mocked browser JS: " + source.slice(0, 180));
    },
  };
  return { helper, state };
}

test("project-setup reuses existing orchestrator Project, preserves memory, verifies saved instructions and durable thread", async () => {
  const instructions = "Follow the Neo Mobile project bootstrap contract.";
  const initialPrompt = "Initialize Neo Mobile main orchestrator thread. Reply READY.";
  const { helper, state } = fakeProjectBrowser({ instructions, initialPrompt });
  const result = await run({ helpers: helper, config: {
    project_name: "orchestrator", instructions, initial_prompt: initialPrompt,
    thread_title_hint: "Initialize Neo Orchestrator",
  } });
  assert.equal(result.project_reused, true);
  assert.equal(result.project_id, PROJECT_ID);
  assert.equal(result.thread_id, THREAD_ID);
  assert.equal(result.status, "completed");
  assert.equal(result.thread_submission_verified, true);
  assert.equal(result.memory, "default");
  assert.equal(state.newTabs, 0, "auto-session should reuse its owned tab");
  assert.equal(state.newProjectClicks, 0);
  assert.equal(state.memoryMutations, 0);
  assert.equal(state.projectSettingsClicks, 2, "menu opens once per settings visit");
  assert.equal(state.settingsPersisted, instructions);
  assert.equal(state.sendClicks, 1, "no duplicate initial user turn");
  assert.ok(state.visitedUrls.some(url =>
    url.includes("/g/" + PROJECT_ID + "/project?prompt=")),
    "Project bootstrap must delegate ?prompt= submission to new-thread");
});

test("project-setup recovers a submitted main thread from the verified Project without a second send", async () => {
  const instructions = "Follow the Neo Mobile project bootstrap contract.";
  const initialPrompt = "Initialize Neo Mobile main orchestrator thread. Reply READY.";
  const { helper, state } = fakeProjectBrowser({ instructions, initialPrompt, knownThread: true });
  const result = await run({ helpers: helper, config: {
    project_name: "orchestrator", instructions, initial_prompt: initialPrompt,
    thread_title_hint: "Initialize Neo Orchestrator",
  } });
  assert.equal(result.project_id, PROJECT_ID);
  assert.equal(result.thread_id, THREAD_ID);
  assert.equal(result.thread_reused, true);
  assert.equal(result.status, "completed");
  assert.equal(state.sendClicks, 0, "recovery must not create a duplicate user turn");
});
