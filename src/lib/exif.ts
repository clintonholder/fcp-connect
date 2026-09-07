/** Reads capture date/time and GPS from a photo file's own metadata (EXIF). */
export type PhotoExif = {
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY: PhotoExif = { takenAt: null, latitude: null, longitude: null };

function validDate(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1990 || d.getTime() > Date.now() + 24 * 3600 * 1000) return null;
  return d.toISOString();
}

/** Accepts decimals, [d, m, s] arrays, rationals and "40 deg 26' 46\" N" strings. */
function toDecimal(value: unknown, ref: unknown): number | null {
  let n: number | null = null;

  if (typeof value === "number") {
    n = value;
  } else if (Array.isArray(value)) {
    const [d = 0, m = 0, s = 0] = value.map((x) => Number(x) || 0);
    n = Math.abs(d) + m / 60 + s / 3600;
    if (Number(d) < 0) n = -n;
  } else if (typeof value === "string") {
    const nums = value.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    if (nums.length >= 3) n = Math.abs(nums[0]) + nums[1] / 60 + nums[2] / 3600;
    else if (nums.length === 1) n = nums[0];
    if (n != null && (/-/.test(value.trim()[0] ?? "") || /[SW]/i.test(value))) n = -Math.abs(n);
  }

  if (n == null || !Number.isFinite(n)) return null;

  const r = typeof ref === "string" ? ref.trim().toUpperCase() : "";
  if (r === "S" || r === "W") n = -Math.abs(n);
  return n;
}

function inRange(n: number | null, max: number): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (Math.abs(n) > max) return null;
  return n;
}

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  if (typeof window === "undefined") return EMPTY;
  try {
    const exifr = (await import("exifr")).default;
    const data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: [
        "DateTimeOriginal", "CreateDate", "ModifyDate",
        "latitude", "longitude",
        "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef",
      ],
    });
    if (!data) return EMPTY;

    let lat = inRange(
      typeof data.latitude === "number" ? data.latitude : toDecimal(data.GPSLatitude, data.GPSLatitudeRef),
      90,
    );
    let lng = inRange(
      typeof data.longitude === "number" ? data.longitude : toDecimal(data.GPSLongitude, data.GPSLongitudeRef),
      180,
    );
    // 0,0 (null island) means the camera wrote empty GPS fields.
    if (lat === 0 && lng === 0) { lat = null; lng = null; }
    if (lat == null || lng == null) { lat = null; lng = null; }

    return {
      takenAt: validDate(data.DateTimeOriginal) ?? validDate(data.CreateDate) ?? validDate(data.ModifyDate) ?? null,
      latitude: lat,
      longitude: lng,
    };
  } catch {
    return EMPTY;
  }
}
