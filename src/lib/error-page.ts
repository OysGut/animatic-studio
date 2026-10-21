import { t } from '@/core/i18n/keyed';
import { getUiLanguage } from '@/core/i18n';
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
export function renderErrorPage(): string {
  const language = getUiLanguage();
  const heading = escapeHtml(t('routes-root.error-component.h1.e30fba673653', {}, language));
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
  <head>
    <meta charset="utf-8" />
    <title>${heading} · From Pen to Glass</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${heading}</h1>
      <p>${escapeHtml(t('routes-root.error-component.p.8ff66fea3622', {}, language))}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">${escapeHtml(t('routes-root.error-component.button.96f923db4f99', {}, language))}</button>
        <a class="secondary" href="/">${escapeHtml(t('routes-root.error-component.a.6fdb78437197', {}, language))}</a>
      </div>
    </div>
  </body>
</html>`;
}
