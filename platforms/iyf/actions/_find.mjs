// Backward-compatible alias for the verified IYF site search Action.
import search from './_search.mjs';
export default async function find(ctx) {
  const result=await search(ctx);
  return {query:result.query,matches:result.matches,source:result.source,ok:result.ok};
}
