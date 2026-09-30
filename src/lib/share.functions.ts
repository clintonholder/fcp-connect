import { createServerFn } from "@tanstack/react-start";

type SharedPhoto = {
  id: string;
  area_id: string;
  storage_path: string | null;
  image_url: string;
  annotated_image_url: string | null;
  annotated_storage_path?: string | null;

  caption: string | null;
  tags: string[] | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string;
  media_type?: string | null;
};

type SharedData = {
  job: { id: string; name: string; address?: string | null; client?: string | null; notes?: string | null };
  areas: { id: string; name: string }[];
  photos: SharedPhoto[];
};

/**
 * Share links are deliberately public, but the photo bucket is private.
 * The token is validated in the database before any photo link is handed out.
 */
export const getSharedProject = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => {
    if (!d?.token?.trim()) throw new Error("Missing share link");
    return { token: d.token.trim() };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shared, error } = await supabaseAdmin.rpc("get_shared_job", { _token: data.token });
    if (error) throw new Error(error.message);
    if (!shared) return null;

    const result = shared as unknown as SharedData;
    const paths = Array.from(
      new Set(
        (result.photos ?? [])
          .flatMap((p) => [p.storage_path, p.annotated_storage_path])
          .filter((p): p is string => !!p),
      ),
    );
    if (paths.length) {
      const { data: signed } = await supabaseAdmin.storage
        .from("job-photos")
        .createSignedUrls(paths, 60 * 60);
      const byPath = new Map<string, string>();
      (signed ?? []).forEach((s, i) => {
        const path = s.path ?? paths[i];
        if (path && s.signedUrl) byPath.set(path, s.signedUrl);
      });
      result.photos = (result.photos ?? []).map((p) => {
        const url = p.storage_path ? byPath.get(p.storage_path) : undefined;
        const marked = p.annotated_storage_path ? byPath.get(p.annotated_storage_path) : undefined;
        return { ...p, image_url: url ?? p.image_url, annotated_image_url: marked ?? null };
      });
    }

    return result;
  });
