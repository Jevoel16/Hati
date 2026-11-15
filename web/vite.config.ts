import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = import.meta.dirname;
// The public address, used for canonical and Open Graph URLs and the sitemap.
const siteUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
// The same paths vercel.json rewrites to the app shell in production.
const APP_ROUTES = /^\/(sign-in|groups|join|account)(\/|$)/;
// Static pages linked from the landing page's footer, each built to <name>/index.html.
const PAGES = ['how-it-works', 'features', 'faq'];

// Dev: serve the app shell for app routes. Build: fill in the site URL and write the
// crawler files, so they never go stale against the real domain.
const site = (): Plugin => ({
  name: 'hati-site',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = (req.url ?? '').split('?')[0]!.replace(/\/$/, '');
      if (APP_ROUTES.test(req.url ?? '')) req.url = '/app.html';
      else if (PAGES.includes(path.slice(1))) req.url = `${path}/index.html`;
      next();
    });
  },
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
  generateBundle() {
    const emit = (fileName: string, source: string) =>
      this.emitFile({ type: 'asset', fileName, source });
    emit(
      'robots.txt',
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /groups\nDisallow: /join/\nDisallow: /account\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
    );
    emit(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc></url>\n${PAGES.map((page) => `  <url><loc>${siteUrl}/${page}</loc></url>\n`).join('')}</urlset>\n`,
    );
    emit(
      'llms.txt',
      `# Hati\n\n> A shared expense splitter with live balances for housemates, project groups and trips.\n\nHati records who paid for what in a group, works out each member's balance to the centavo, and shows the fewest payments needed to settle up. Balances update live for everyone viewing the group. It keeps records only and never moves money.\n\n- [Home](${siteUrl}/): what Hati does\n- [How it works](${siteUrl}/how-it-works): the four steps from a group to settling up\n- [Features](${siteUrl}/features): live balances, exact splits, payment QRs and the summary\n- [Questions](${siteUrl}/faq): money, the name and the cost\n- [Sign in](${siteUrl}/sign-in): Google, GitHub or password sign-in, plus a public demo account\n`,
    );
  },
});

export default defineConfig({
  root,
  plugins: [react(), site()],
  build: {
    outDir: resolve(root, '../public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        app: resolve(root, 'app.html'),
        ...Object.fromEntries(PAGES.map((page) => [page, resolve(root, page, 'index.html')])),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3000', ws: true } },
  },
});
