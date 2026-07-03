import Head from 'expo-router/head';

const SITE_URL = 'https://bocaiuva-app.vercel.app';

export interface ToolSeoHeadProps {
  title: string;
  description: string;
  path: string;
}

export function ToolSeoHead({ title, description, path }: ToolSeoHeadProps) {
  const canonical = `${SITE_URL}${path === '/' ? '' : path}`;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <link rel="canonical" href={canonical} />
    </Head>
  );
}
