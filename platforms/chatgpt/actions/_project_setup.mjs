import {
  pathThreadId,
  setField,
  sleep,
  waitUntilStable,
} from "./_action-common.mjs";
import { run as newThread } from "./_new_thread.mjs";
const projectId = (url) =>
  String(url || "").match(/\/g\/(g-p-[A-Za-z0-9]{32})/)?.[1] || null;
const fire =
  `const fire=e=>{for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])e.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,button:0,buttons:type.includes('down')?1:0}));};`;
export async function run({ helpers: h, config: c = {} }) {
  const name = String(c.project_name || "").trim(),
    instructions = String(c.instructions || "").trim();
  if (!name) throw new Error("project_name is required");
  if (!instructions) throw new Error("Project Instructions are empty");
  // The Action already owns an auto-session tab. Reuse it rather than
  // opening a second tab or touching any unrelated owner Session.
  await h.goto_url("https://chatgpt.com/");
  await h.wait_for_load();
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  await waitUntilStable(
    () =>
      h.js(
        `(() => {const rows=document.querySelectorAll('[data-app-action-sidebar-project-row]');if(rows.length)return 'rows';const add=[...document.querySelectorAll('button,[role="button"]')].find(e=>(e.getAttribute('aria-label')||'').toLowerCase().includes('add new project'));if(add)return 'add';const show=[...document.querySelectorAll('button,[role="button"]')].find(e=>(e.getAttribute('aria-label')||'').toLowerCase()==='show sidebar');if(show){show.click();return 'opening'}return '';})()`,
      ),
    Boolean,
    { timeout: 20, phase: "ChatGPT Projects sidebar", sleep },
  );
  const readExisting = () =>
    h.js(
      `(() => {const wanted=${
        JSON.stringify(norm(name).toLowerCase())
      };const row=[...document.querySelectorAll('[data-app-action-sidebar-project-row]')].find(e=>(e.getAttribute('data-app-action-sidebar-project-label')||'').replace(/\\s+/g,' ').trim().toLowerCase()===wanted);return row?{projectId:row.getAttribute('data-app-action-sidebar-project-id')||'',label:row.getAttribute('data-app-action-sidebar-project-label')||''}:null;})()`,
    );
  let existing = null;
  const existingDeadline = Date.now() + 10000;
  while (Date.now() < existingDeadline) {
    existing = await readExisting();
    if (existing?.projectId) break;
    await sleep(200);
  }
  let project;
  if (existing?.projectId) {
    const url = `https://chatgpt.com/g/${existing.projectId}/project`;
    await h.goto_url(url);
    await h.wait_for_load();
    project = {
      project_id: existing.projectId,
      project_url: (await h.page_info()).url || url,
      reused: true,
    };
  } else {
    const legacy = await h.js(
      `(() => [...document.querySelectorAll('a[href]')].map(a=>({text:(a.innerText||a.textContent||'').replace(/\\s+/g,' ').trim(),href:new URL(a.getAttribute('href'),location.origin).href})).find(x=>x.text.toLowerCase()===${
        JSON.stringify(norm(name).toLowerCase())
      }&&x.href.includes('/g/g-p-'))||null)()`,
    );
    if (legacy) {
      const pid = new URL(legacy.href).pathname.split("/").find((part) =>
          part.startsWith("g-p-")
        ),
        url = pid ? `https://chatgpt.com/g/${pid}/project` : legacy.href;
      await h.goto_url(url);
      await h.wait_for_load();
      project = {
        project_id: pid,
        project_url: (await h.page_info()).url || url,
        reused: true,
      };
    } else {
      const clicked = await h.js(
        `(() => {const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').toLowerCase().includes('add new project'));if(b){b.click();return true;}const e=[...document.querySelectorAll('button,a,[role="button"]')].find(x=>/new project|create project/i.test((x.innerText||x.textContent||x.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim()));if(!e)return false;e.click();return true;})()`,
      );
      if (!clicked) {
        throw new Error(
          `ChatGPT New Project control was not found for ${name}`,
        );
      }
      const input = await waitUntilStable(
        () =>
          h.js(
            `(() => {const vis=e=>{const r=e.getBoundingClientRect();return r.width&&r.height};const xs=[...document.querySelectorAll('input[type="text"],input:not([type]),textarea')],e=xs.find(e=>vis(e)&&/project name|copenhagen trip/i.test((e.getAttribute('aria-label')||'')+' '+(e.getAttribute('placeholder')||'')))||xs.find(vis);if(!e)return null;e.setAttribute('data-neoy-project-name','1');return '[data-neoy-project-name="1"]';})()`,
          ),
        Boolean,
        { timeout: 15, phase: "ChatGPT project name field", sleep },
      );
      await h.fill_input(input, name, { clear_first: true });
      await h.js(
        `(() => {${fire}const b=[...document.querySelectorAll('button,[role="button"]')].find(e=>e.getBoundingClientRect().width&&/default memory/i.test(e.innerText||e.textContent||e.getAttribute('aria-label')||''));if(b)fire(b);return !!b;})()`,
      );
      await sleep(150);
      await h.js(
        `(() => {${fire}const e=[...document.querySelectorAll('[role="menuitem"],button,[role="button"],label')].find(e=>/project[- ]only/i.test((e.innerText||e.textContent||e.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim()));if(e)fire(e);return !!e;})()`,
      );
      if (
        !await h.js(
          `(() => {const es=[...document.querySelectorAll('button,[role="button"]')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height),b=es.find(e=>['create project','create','continue','done'].includes((e.innerText||e.textContent||e.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim().toLowerCase()));if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return false;b.click();return true;})()`,
        )
      ) throw new Error("ChatGPT Create Project button not found");
      const end = Date.now() + 30000;
      let pid = null;
      while (Date.now() < end) {
        pid = projectId((await h.page_info()).url);
        if (!pid) {
          pid = await h.js(
            `(() => {const n=${
              JSON.stringify(norm(name).toLowerCase())
            };const e=[...document.querySelectorAll('[data-app-action-sidebar-project-row]')].find(x=>(x.getAttribute('data-app-action-sidebar-project-label')||'').replace(/\\s+/g,' ').trim().toLowerCase()===n);return e?.getAttribute('data-app-action-sidebar-project-id')||null;})()`,
          );
        }
        if (pid) break;
        await sleep(250);
      }
      if (!pid) throw new Error(`ChatGPT Project ${name} was not created`);
      const url = `https://chatgpt.com/g/${pid}/project`;
      if (!new URL((await h.page_info()).url).pathname.includes("/project")) {
        await h.goto_url(url);
        await h.wait_for_load();
      }
      project = {
        project_id: pid,
        project_url: (await h.page_info()).url || url,
        reused: false,
      };
    }
  }
  const hasSettingsDialog = () =>
    h.js(`(() => {const d=document.querySelector('[role="dialog"]');return !!d&&/project settings/i.test(d.textContent||"");})()`);
  const openSettings = async () => {
    if (await hasSettingsDialog()) return;
    // Navigation load events precede React's Project header hydration.
    // Poll for a visible control WITHOUT interacting, then click once.
    await waitUntilStable(
      () => h.js(
        `(() => {const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Project actions');return !!b&&b.getBoundingClientRect().width>0;})()`,
      ),
      Boolean,
      { timeout: 20, stableSamples: 2, phase: "Project actions control ready", sleep },
    );
    // Menu triggers are TOGGLES. Never click them from within a readiness
    // poll: repeated samples would alternately open/close the same menu.
    const opened = await h.js(
      `(() => {${fire}const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Project actions');if(!b)return false;fire(b);return true;})()`,
    );
    if (!opened) throw new Error("ChatGPT Project actions control not found");
    await waitUntilStable(
      () => h.js(
        `(() => [...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')].some(x=>/project settings/i.test(x.textContent||'')))()`,
      ),
      Boolean,
      { timeout: 6, stableSamples: 1, phase: "Project settings menu", sleep },
    );
    const selected = await h.js(
      `(() => {${fire}const e=[...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')].find(x=>/project settings/i.test(x.textContent||''));if(!e)return false;fire(e);return true;})()`,
    );
    if (!selected) throw new Error("ChatGPT Project settings menu item missing");
    await waitUntilStable(
      hasSettingsDialog,
      Boolean,
      { timeout: 8, stableSamples: 1, phase: "Project settings dialog", sleep },
    );
  };
  const closeSettings = async ({ saveChanges = false } = {}) => {
    // React surfaces explicit Save/Cancel after editing Instructions; it
    // changes the former aria-label Close button into text-only "Close dialog".
    // Save MUST be clicked before reading persisted settings.
    const action = await h.js(
      `(() => {${fire}const d=document.querySelector('[role="dialog"]');if(!d)return 'already-closed';
        const buttons=[...d.querySelectorAll('button')];
        const save=buttons.find(x=>(x.textContent||'').trim()==='Save');
        if(save&&${saveChanges ? 'true' : 'false'}){
          if(save.disabled)return 'save-disabled';fire(save);return 'saved';
        }
        if(save)return 'dirty';
        const close=buttons.find(x=>x.getAttribute('aria-label')==='Close dialog'||(x.textContent||'').trim()==='Close dialog');
        if(!close)return 'missing-close';fire(close);return 'closed';
      })()`,
    );
    if (!['saved', 'closed', 'already-closed'].includes(action)) {
      throw new Error("ChatGPT Project settings could not be saved/closed: " + action);
    }
    await waitUntilStable(
      () => h.js(`(() => !document.querySelector('[role="dialog"]'))()`),
      Boolean, { timeout: 10, stableSamples: 1, phase: "Project settings save/close", sleep },
    );
    return action;
  };
  await openSettings();
  const field = await waitUntilStable(
    () =>
      h.js(
        `(() => {const d=document.querySelector('[role="dialog"]');if(!d||!/project settings/i.test(d.innerText||d.textContent||''))return null;const e=d.querySelector('textarea');if(!e)return null;e.setAttribute('data-neoy-project-instructions','1');return '[data-neoy-project-instructions="1"]';})()`,
      ),
    Boolean,
    { timeout: 15, phase: "ChatGPT Project Instructions field", sleep },
  );
  await setField(h, field, instructions);
  // Existing Projects may have Default or Project-only memory. Preserve the
  // owner's chosen policy. Do NOT mutate it while merely bootstrapping a thread.
  const memory = await h.js(
    `(() => {const d=document.querySelector('[role="dialog"]');if(!d)return 'unavailable';const b=[...d.querySelectorAll('button')].find(x=>x.hasAttribute('aria-haspopup')&&/default|project-only/i.test(x.textContent||''));return (b?.textContent||'unavailable').replace(/\\s+/g,' ').trim().toLowerCase();})()`,
  );
  await closeSettings({ saveChanges: true });
  // A successful DOM fill is NOT confirmation of persistence. Verify the
  // instructions really survived closing/reopening before creating a thread.
  await openSettings();
  const persisted = await h.js(
    `(() => {const d=document.querySelector('[role="dialog"]');return d?.querySelector('textarea[name="project-instructions"]')?.value??null;})()`,
  );
  if (persisted !== instructions) {
    throw new Error("ChatGPT Project Instructions did not persist after closing settings");
  }
  await closeSettings();
  const url = project.project_url;
  if (!(new URL((await h.page_info()).url).pathname.includes("/project"))) {
    await h.goto_url(url);
    await h.wait_for_load();
  }
  const initial = String(c.initial_prompt || "").trim() ||
    "Initialize the Neo Mobile orchestrator main thread and reply READY.";
  const threadTitleHint = String(c.thread_title_hint || "").trim().toLowerCase();
  const verifiedInitialTurn = () => h.js(
    `(() => {const expected=${JSON.stringify(initial.slice(0, 120))};const text=document.body?.innerText||'';return text.includes('You said:')&&text.includes(expected);})()`,
  );
  // Recover a thread that was submitted but whose receipt was lost. Only use
  // a matching title WITHIN this verified Project, never a global recent chat.
  let recoveredThread = null;
  if (threadTitleHint) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      recoveredThread = await h.js(
        `(() => {
          const id=${JSON.stringify(project.project_id)},hint=${JSON.stringify(threadTitleHint)};
          const link=[...document.querySelectorAll('a[href]')].find(a=>{
            const href=a.getAttribute('href')||'',title=(a.innerText||a.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
            return href.includes('/g/'+id+'/c/')&&title===hint;
          });
          return link?new URL(link.getAttribute('href'),location.origin).href:null;
        })()`,
      );
      if (recoveredThread) break;
      await sleep(250);
    }
  }
  if (recoveredThread) {
    await h.goto_url(recoveredThread);
    await h.wait_for_load();
    const threadUrl = (await h.page_info()).url || recoveredThread;
    const threadId = pathThreadId(threadUrl);
    if (!threadId || !threadUrl.includes(project.project_id)) {
      throw new Error("Existing main thread did not belong to the verified Project");
    }
    await waitUntilStable(verifiedInitialTurn, Boolean, {
      timeout: 15, stableSamples: 1, phase: "existing Project main thread user turn", sleep,
    });
    return {
      status: "completed", project_id: project.project_id,
      project_url: project.project_url, project_reused: project.reused,
      memory, thread_id: threadId, thread_url: threadUrl.split("?")[0],
      thread_reused: true, thread_submission_verified: true,
      target_id: h.target_id || h.targetId,
    };
  }
  // Reuse the normal new-thread ?prompt= submission flow; do not fork
  // composer filling, Send clicks, or thread receipt handling here.
  const receipt = await newThread({
    helpers: h,
    config: { project_id: project.project_id, message: initial },
  });
  const threadId = receipt.thread_id;
  const threadUrl = receipt.thread_url || "";
  if (!threadId || !threadUrl.includes(project.project_id) ||
      !threadUrl.includes('/c/' + threadId)) {
    throw new Error("ChatGPT new-thread did not verify a durable Project thread");
  }
  await waitUntilStable(
    verifiedInitialTurn,
    Boolean, { timeout: 20, stableSamples: 1, phase: "Project main user turn", sleep },
  );
  return {
    status: "completed",
    project_id: project.project_id,
    project_url: project.project_url,
    project_reused: project.reused,
    memory,
    thread_url: threadUrl.split("?")[0],
    thread_id: threadId,
    thread_submission_verified: true,
    target_id: h.target_id || h.targetId,
  };
}
