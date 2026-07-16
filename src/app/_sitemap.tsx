import { Redirect } from 'expo-router';

import { NoIndexHead } from '@/components/seo/NoIndexHead';

export default function InternalSitemapRoute() {
  return <><NoIndexHead /><Redirect href="/" /></>;
}
