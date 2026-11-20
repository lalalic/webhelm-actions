// The queue manager owns scheduling, persistence and Sessions. This policy
// only describes ChatGPT's FIFO partition, UI and merge compatibility.
export default {
  action: 'new-turn',
  validate: 'validate_new_turn_ready',
  group: config => {
    if (typeof config.thread_id!=='string' || !config.thread_id.trim()) throw TypeError('thread_id is required');
    return config.thread_id;
  },
  title: config => {
    const first=String(config.message||'').split(/\r?\n/,1)[0].replace(/\s+/g,' ').trim() || 'ChatGPT message';
    return first.length>52 ? first.slice(0,51)+'…' : first;
  },
  url: config => `https://chatgpt.com${config.project_id ? `/g/${encodeURIComponent(config.project_id)}` : ''}/c/${encodeURIComponent(config.thread_id)}`,
  concurrency: 4,
  intervalMs: 10000,
  success: value => value?.status==='submitted' && value?.verified_by==='send-clicked',
  merge: (previous,incoming) => {
    if (!previous.mergeable || !incoming.mergeable ||
        (previous.project_id||null)!==(incoming.project_id||null) ||
        (previous.enforcement_context||'')!==(incoming.enforcement_context||'') ||
        previous.file?.length || incoming.file?.length ||
        previous.app || incoming.app || previous.model_choice || incoming.model_choice) return null;
    return {...previous,message:previous.message+'\n'+incoming.message};
  },
};
