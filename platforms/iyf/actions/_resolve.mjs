/** Read the signed HLS media URL actually requested by the authorised IYF player.
 * A WebHelm auto-session owns the browser lifecycle, so no tabs remain leased.
 */
export function validateMediaIds(showId, episodeId) {
  const valid = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(x);
  if (!valid(showId) || (episodeId != null && episodeId !== '' && !valid(episodeId))) {
    throw new TypeError('Invalid show_id or episode_id');
  }
  return {showId, episodeId: episodeId || ''};
}

export default async function resolve({config = {}, helpers: h, log = () => {}}) {
  const {showId, episodeId} = validateMediaIds(config.show_id, config.episode_id);
  const playUrl = 'https://www.iyf.tv/play/' + showId + (episodeId ? '?id=' + episodeId : '');
  await h.goto_url(playUrl);
  await h.wait_for_load();
  let links = [];
  for (let attempt = 0; attempt < 9; attempt++) {
    const data = await h.js(`(()=>performance.getEntriesByType('resource').map(x=>x.name).filter(x=>/^https:\\/\\//.test(x) && /\\.m3u8(?:\\?|$)/i.test(x)))()`);
    links = typeof data === 'string' ? JSON.parse(data) : data;
    if (Array.isArray(links) && links.length) break;
    if (h.wait && attempt < 8) await h.wait(1);
  }
  const media = (links || []).find(url => typeof url === 'string' && url.length < 4096 && /^https:\/\//.test(url) && /\.m3u8(?:\?|$)/i.test(url));
  if (!media) throw new Error('IYF player did not request a usable HLS playlist');
  log('Verified HLS request from IYF player (URL withheld from logs).');
  return {ok:true,source:'iyf.tv',show_id:showId,episode_id:episodeId,url:media,verified_from:'browser_resource'};
}
