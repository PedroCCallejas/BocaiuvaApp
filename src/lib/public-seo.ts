export const SITE_URL = 'https://bocaiuva-app.vercel.app';

export type PublicSeoMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  ogType?: 'website' | 'article';
  image?: string;
};

export function buildCanonicalUrl(path: string) {
  const cleanPath = path.split(/[?#]/, 1)[0] || '/';
  const normalizedPath = cleanPath === '/' ? '/' : `/${cleanPath.replace(/^\/+|\/+$/g, '')}`;
  return `${SITE_URL}${normalizedPath}`;
}
