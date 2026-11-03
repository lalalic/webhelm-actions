/**
 * Read-only official drama metadata fallback. The caller must choose the exact
 * CPS resource and official ReelShort title; we never read referral links.
 * No login details, cookies, or promotion URLs are included in results.
 */
const OFFICIAL_HOST = 'www.reelshort.com';
const PROVIDER_HOST = 'cps.reelshort.com';

export function validateSeriesPair(config = {}) {
  let resource, official;
  try { resource = new URL(config.provider_url); official = new URL(config.official_url); }
  catch { throw new Error('provider_url and official_url must be absolute HTTPS URLs'); }
  if (resource.protocol !== 'https:' || resource.hostname !== PROVIDER_HOST ||
      !/^\/resource-square\/detail\/[a-f0-9]{24}$/.test(resource.pathname)) {
    throw new Error('invalid_provider_series_url');
  }
  if (official.protocol !== 'https:' || official.hostname !== OFFICIAL_HOST ||
      !/^\/movie\/[a-z0-9-]+-[a-f0-9]{24}$/.test(official.pathname)) {
    throw new Error('invalid_official_series_url');
  }
  if (resource.pathname.slice(-24) !== official.pathname.slice(-24)) {
    throw new Error('provider_official_series_id_mismatch');
  }
  if (!config.expected_title || typeof config.expected_title !== 'string') throw new Error('expected_title_required');
  return { provider_url: resource.origin + resource.pathname, official_url: official.origin + official.pathname, series_id: resource.pathname.slice(-24) };
}

const READ_SERIES = `(()=>{
  const norm = s => (s||'').replace(/\\s+/g,' ').trim();
  const title = norm(document.querySelector('h1')?.textContent);
  const plotHead = [...document.querySelectorAll('h2,h3')].find(e=>norm(e.textContent).startsWith('Plot of '));
  const plotSection = plotHead?.nextElementSibling;
  const synopsis = norm(plotSection?.querySelector('[data-collapsible-text-content-body]')?.textContent || plotSection?.querySelector('[data-collapsible-text-content]')?.textContent || '');
  const countText = [...document.querySelectorAll('h1,h2,h3')].map(e=>norm(e.textContent)).find(t=>/Full Episodes\\s*[·:]\\s*\\d+/i.test(t)) || '';
  const episode_count = Number(countText.match(/Full Episodes\\s*[·:]\\s*(\\d+)/i)?.[1]) || null;
  const cast = [...new Set([...document.querySelectorAll('a')].filter(a=>/\\/tags\\/movie-(?:actors|actresses)\\//i.test(new URL(a.href).pathname)).map(a=>norm(a.textContent)).filter(Boolean))].slice(0,25);
  return {title,synopsis,episode_count,cast};
})()`;

export default async function metadata({ config = {}, helpers: h, log = () => {} }) {
  const urls = validateSeriesPair(config);
  await h.goto_url(urls.official_url);
  let series;
  // The page hydrates asynchronously; never take a partially loaded synopsis.
  for (let attempt = 0; attempt < 12; attempt++) {
    series = await h.js(READ_SERIES);
    if (series?.synopsis?.length >= 60 && series?.title) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!series?.title || !series?.synopsis || series.synopsis.length < 60) {
    return { ok: false, error: 'official_synopsis_unavailable', official_url: urls.official_url, series_id: urls.series_id };
  }
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalize(series.title) !== normalize(config.expected_title)) {
    return { ok: false, error: 'title_mismatch', expected_title: config.expected_title, observed_title: series.title, series_id: urls.series_id };
  }
  const result = {
    ok: true,
    series_id: urls.series_id,
    title: series.title,
    synopsis: series.synopsis,
    episode_count: series.episode_count,
    cast_actors_unmapped: series.cast,
    provenance: { kind: 'official_web', url: urls.official_url, observed_at: new Date().toISOString() },
    provider_series_url: urls.provider_url,
    provider_metadata_api: 'not_verified',
    speaker_identity: 'not_inferred',
  };
  log(`RS Boost series metadata verified from official ReelShort page: ${result.title}`);
  return result;
}
