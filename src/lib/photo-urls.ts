import { supabase } from "@/integrations/supabase/client";

const BUCKET = "job-photos";
const TTL_SECONDS = 60 * 60 * 4;

/**
 * Photos live in a private bucket, so a stored public URL no longer works.
 * Swap in short-lived signed links for the photos the signed-in person may see.
 */
export async function signPhotoUrls<
  T extends {
    storage_path?: string | null;
    image_url: string;
    annotated_image_url?: string | null;
    annotated_storage_path?: string | null;
  },
>(rows: T[]): Promise<T[]> {
  const paths = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.storage_path, r.annotated_storage_path])
        .filter((p): p is string => !!p),
    ),
  );
  if (!paths.length) return rows;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_SECONDS);
  if (error || !data) return rows;

  const byPath = new Map<string, string>();
  data.forEach((d, i) => {
    const path = d.path ?? paths[i];
    if (path && d.signedUrl) byPath.set(path, d.signedUrl);
  });

  return rows.map((r) => {
    const signed = r.storage_path ? byPath.get(r.storage_path) : undefined;
    const signedAnnotated = r.annotated_storage_path ? byPath.get(r.annotated_storage_path) : undefined;
    if (!signed && !signedAnnotated) return r;
    return {
      ...r,
      ...(signed ? { image_url: signed } : {}),
      ...(r.annotated_storage_path ? { annotated_image_url: signedAnnotated ?? null } : {}),
    };
  });
}

