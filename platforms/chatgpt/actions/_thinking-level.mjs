// Best-effort only; never touch the prompt/composer or Send.
// Read the visible effort label, use the accessible Power slider, then verify.
const PICKER = 'button[aria-label="Select ChatGPT model"]';
const ROW = '[data-reasoning-slider][aria-label="Power"]';
const READ = `(() => {
  const b=document.querySelector('${PICKER}');
  const row=document.querySelector('${ROW}');
  const slider=row?.querySelector('[role="slider"]');
  const visible=e=>!!e&&e.getClientRects().length>0;
  return {ready:visible(b)&&!b.disabled, open:b?.getAttribute('aria-expanded')==='true',
    label:document.querySelector('[data-model-picker-view-toggle]')?.innerText?.trim()||'',
    caption:b?.innerText?.trim()||'', slider:visible(row)&&!!slider,
    value:slider?Number(slider.getAttribute('aria-valuenow')):null,
    min:slider?Number(slider.getAttribute('aria-valuemin')):null,
    max:slider?Number(slider.getAttribute('aria-valuemax')):null};
})()`;
function normalized(value) {
  return String(value||'').toLowerCase().replace(/[\s_-]+/g,'');
}
function matches(value, want) {
  const v=normalized(value);
  return v===want || v===('5.6'+want);
}
async function key(helpers, name) {
  const code={ArrowLeft:37,ArrowRight:39,Escape:27}[name];
  await helpers.cdp('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code});
  await helpers.cdp('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code});
}
export async function bestEffortThinkingLevel(helpers,requested='') {
  if(!requested)return {status:'not-requested'};
  const want=normalized(requested);
  let opened=false;
  const pause=helpers.sleep || (ms=>new Promise(r=>setTimeout(r,ms)));
  try {
    if(!['instant','low','medium','high','extrahigh'].includes(want))throw Error('unsupported effort');
    let state;
    for(let i=0;i<10;i++){state=await helpers.js(READ);if(state?.ready)break;await pause(200);}
    if(!state?.ready)throw Error('picker unavailable');
    if(matches(state.caption,want))return {status:'applied',requested};
    if(!state.open)await helpers.click(PICKER);
    opened=true;
    for(let i=0;i<10;i++){state=await helpers.js(READ);if(state?.open&&state.slider)break;await pause(200);}
    if(!state?.slider||!Number.isInteger(state.value)||!Number.isInteger(state.min)||!Number.isInteger(state.max)||state.max-state.min>6)throw Error('Power slider unavailable');
    // Discover labels by moving the keyboard-accessible control, never assume a numeric mapping.
    const original=state.value;
    if(!matches(state.label,want)) {
      const focus=await helpers.js(`(() => {const e=document.querySelector('${ROW}');if(!e)return false;e.focus();return document.activeElement===e})()`);
      if(!focus)throw Error('Power slider not focusable');
      const move=async direction=>{await key(helpers,direction);await pause(200);return await helpers.js(READ);};
      while(state.value>state.min&&!matches(state.label,want)){
        const old=state.value;state=await move('ArrowLeft');if(state.value>=old)break;
      }
      while(state.value<state.max&&!matches(state.label,want)){
        const old=state.value;state=await move('ArrowRight');if(state.value<=old)break;
      }
      if(!matches(state.label,want)){
        // Best effort restore original selection when requested level is not available.
        for(let i=0;i<6&&state.value!==original;i++){
          const old=state.value;state=await move(state.value>original?'ArrowLeft':'ArrowRight');if(state.value===old)break;
        }
        throw Error('requested effort not verified');
      }
    }
    return {status:'applied',requested};
  } catch(error) {
    return {status:'skipped',requested,warning:String(error?.message||error).slice(0,200)};
  } finally {
    if(opened)try{await key(helpers,'Escape');}catch{}
  }
}
