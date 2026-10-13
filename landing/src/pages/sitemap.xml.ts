// sitemap.xml (STRUCTURE.md "SEO and metadata"): the landing page and the legal pages, English and
// Russian. Written by hand: one page and six static files do not need the sitemap integration.
import type { APIRoute } from 'astro';
import { SITE_URL } from '../site';

const PATHS = ['/', '/privacy', '/terms', '/refunds', '/ru/privacy', '/ru/terms', '/ru/refunds'];

export const GET: APIRoute = () => {
  const urls = PATHS.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
