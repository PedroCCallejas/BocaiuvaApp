import { supabase, supabaseEnabled } from '@/config/supabase/client';

const TEAM_STORAGE_BUCKETS = [
  'team-logos',
  'team-banners',
  'team-videos',
  'player-photos',
  'player-videos',
] as const;

const STORAGE_LIST_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

interface StorageListItem {
  id?: string | null;
  name: string;
}

function splitIntoChunks<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isStorageFolder(item: StorageListItem) {
  return !item.id;
}

async function listStoragePathsRecursively(
  bucket: string,
  prefix: string,
): Promise<string[]> {
  if (!supabase) {
    return [];
  }

  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw error;
    }

    const page = (data ?? []) as StorageListItem[];

    for (const item of page) {
      const childPath = prefix ? `${prefix}/${item.name}` : item.name;

      if (isStorageFolder(item)) {
        paths.push(...(await listStoragePathsRecursively(bucket, childPath)));
        continue;
      }

      paths.push(childPath);
    }

    if (page.length < STORAGE_LIST_PAGE_SIZE) {
      break;
    }

    offset += page.length;
  }

  return paths;
}

async function removeStoragePaths(bucket: string, paths: string[]) {
  if (!supabase || paths.length === 0) {
    return;
  }

  const chunks = splitIntoChunks(paths, STORAGE_REMOVE_BATCH_SIZE);

  for (const chunk of chunks) {
    const { error } = await supabase.storage.from(bucket).remove(chunk);

    if (error) {
      throw error;
    }
  }
}

export async function deleteTeamStorageAssets(teamId: string) {
  if (!supabaseEnabled || !supabase) {
    return;
  }

  for (const bucket of TEAM_STORAGE_BUCKETS) {
    const paths = await listStoragePathsRecursively(bucket, teamId);
    await removeStoragePaths(bucket, paths);
  }
}
