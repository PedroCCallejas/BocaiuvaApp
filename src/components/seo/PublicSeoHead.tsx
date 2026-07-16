import Head from 'expo-router/head';

import { APP_NAME } from '@/constants/branding';
import { buildCanonicalUrl, type PublicSeoMetadata } from '@/lib/public-seo';

export function PublicSeoHead({
  title,
  description,
  canonicalPath,
  ogType = 'website',
  image,
}: PublicSeoMetadata) {
  const canonical = buildCanonicalUrl(canonicalPath);

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={APP_NAME} />
      <meta property="og:locale" content="pt_BR" />
      {image ? <meta property="og:image" content={image} /> : null}
      {image ? <meta property="og:image:alt" content={APP_NAME} /> : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image ? <meta name="twitter:image" content={image} /> : null}
    </Head>
  );
}
