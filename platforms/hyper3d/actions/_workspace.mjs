/** Shared DOM-only guard for official Hyper3D Creator workspace Actions. */
export const ROOT = 'https://hyper3d.ai/workspace/rodin';
export function isWorkspace(url) {
  try {
    const u = new URL(url);
    return u.origin === 'https://hyper3d.ai' &&
      (u.pathname === '/workspace/rodin' || u.pathname.startsWith('/workspace/rodin/'));
  } catch { return false; }
}
export async function requireWorkspace(h) {
  const page = await h.page_info();
  if (!isWorkspace(page.url)) throw Error('Hyper3D Creator workspace not open or login required');
  return page;
}
export function parseDOM(v) {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}
