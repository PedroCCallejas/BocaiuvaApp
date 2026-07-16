import Head from 'expo-router/head';

export const NO_INDEX_ROBOTS_CONTENT = 'noindex, nofollow';

export function NoIndexHead() {
  return (
    <Head>
      <meta name="robots" content={NO_INDEX_ROBOTS_CONTENT} />
      <meta name="googlebot" content={NO_INDEX_ROBOTS_CONTENT} />
    </Head>
  );
}
