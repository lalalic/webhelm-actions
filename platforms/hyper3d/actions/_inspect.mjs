/** Read-only Rodin workspace probe. Never expose account identity or authentication. */
export default async function inspect({ helpers: h }) {
  const page = await h.page_info();
  if (!page.url?.startsWith('https://hyper3d.ai/workspace/rodin'))
    return { status: 'blocked', reason: 'rodin_workspace_not_open', url: page.url };
  const data = await h.js(`(() => {
    const model = document.querySelector('.rodin-thinking-effort-pill')?.innerText || '';
    const statuses = [...document.querySelectorAll('[role="status"]')]
      .map(e=>e.textContent?.trim()).filter(Boolean);
    const hasImage = !!document.querySelector('.rodin-homepage-upload-strip img[alt="thumbnail"]');
    const generate = document.querySelector('button[aria-label="GENERATE"]');
    const card = document.querySelector('article[data-agentic-task-id], [data-card-id]');
    return { has_image: hasImage, selected_effort: model.replace(/\\s+/g,' ').trim(),
      statuses, generate_visible: !!generate && generate.getAttribute('aria-hidden') !== 'true',
      task_state: card?.getAttribute('aria-label') || card?.getAttribute('data-card-step') || null,
      task_id: card?.getAttribute('data-agentic-task-id') || card?.getAttribute('data-card-id') || null };
  })()`);
  if (!data || typeof data !== 'object')
    return {status:'blocked',reason:'unexpected_workspace'};
  return {status:'ready', url:page.url, ...data, source:'logged_in_website_dom'};
}
