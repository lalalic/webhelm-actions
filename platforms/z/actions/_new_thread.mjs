// WebHelm's long-running daemon caches ESM dependencies. Resolve the site
// lifecycle module by its current mtime on each Action invocation so a newly
// published Action takes effect without restarting or disrupting other tabs.
import {statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const lifecycleUrl=new URL('./_lifecycle_common.mjs',import.meta.url);
async function latestRun(){
  const mtime=statSync(fileURLToPath(lifecycleUrl)).mtimeMs;
  return (await import(lifecycleUrl.href+'?mtime='+mtime)).run;
}
export default async function newThread(
  { config, helpers, log = console.log },
) {
  const run=await latestRun();
  const result = await run(config, "new-thread", helpers);
  log(JSON.stringify(result));
  return result;
}
