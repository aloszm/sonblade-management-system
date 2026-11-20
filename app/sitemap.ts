import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { siteFromHost } from '@/lib/hosts';
import { sitemapFor } from '@/lib/site/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    return sitemapFor(siteFromHost((await headers()).get('host')));
}
