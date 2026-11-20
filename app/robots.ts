import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { siteFromHost } from '@/lib/hosts';
import { robotsFor } from '@/lib/site/seo';

export default async function robots(): Promise<MetadataRoute.Robots> {
    return robotsFor(siteFromHost((await headers()).get('host')));
}
