import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inRange, readPhotoExif, toDecimal, validDate } from "@/lib/exif";

const parse = vi.hoisted(() => vi.fn());
vi.mock("exifr", () => ({ default: { parse } }));

const EMPTY = { takenAt: null, latitude: null, longitude: null };
const file = {} as File;

describe("toDecimal", () => {
  it("returns plain numbers as-is", () => {
    expect(toDecimal(44.97, undefined)).toBe(44.97);
    expect(toDecimal(-93.26, "")).toBe(-93.26);
  });

  it("converts [d, m, s] arrays", () => {
    expect(toDecimal([40, 26, 46], "N")).toBeCloseTo(40.4461, 4);
  });

  it("keeps a negative degree in an array negative", () => {
    expect(toDecimal([-40, 26, 46], undefined)).toBeCloseTo(-40.4461, 4);
  });

  it("parses DMS strings", () => {
    expect(toDecimal("40 deg 26' 46\" N", undefined)).toBeCloseTo(40.4461, 4);
    expect(toDecimal("40 deg 26' 46\" S", undefined)).toBeCloseTo(-40.4461, 4);
    expect(toDecimal("93 deg 15' 36\" W", undefined)).toBeCloseTo(-93.26, 4);
  });

  it("parses a single-number string", () => {
    expect(toDecimal("12.5", undefined)).toBe(12.5);
    expect(toDecimal("-12.5", undefined)).toBe(-12.5);
  });

  it("makes the value negative for S and W refs", () => {
    expect(toDecimal(40.5, "S")).toBe(-40.5);
    expect(toDecimal([93, 15, 36], "W")).toBeCloseTo(-93.26, 4);
    expect(toDecimal(40.5, " s ")).toBe(-40.5);
    expect(toDecimal(93.26, "w")).toBe(-93.26);
    expect(toDecimal(-40.5, "S")).toBe(-40.5);
  });

  it("leaves the value positive for N and E refs", () => {
    expect(toDecimal(40.5, "N")).toBe(40.5);
    expect(toDecimal(93.26, "E")).toBe(93.26);
  });

  it("returns null for unparseable input", () => {
    expect(toDecimal("abc", "N")).toBeNull();
    expect(toDecimal("12 34", undefined)).toBeNull();
    expect(toDecimal(undefined, "S")).toBeNull();
    expect(toDecimal({}, undefined)).toBeNull();
    expect(toDecimal(Number.NaN, undefined)).toBeNull();
  });
});

describe("inRange", () => {
  it("returns values within the limit", () => {
    expect(inRange(45, 90)).toBe(45);
    expect(inRange(-90, 90)).toBe(-90);
    expect(inRange(180, 180)).toBe(180);
  });

  it("returns null above the limit", () => {
    expect(inRange(90.1, 90)).toBeNull();
    expect(inRange(-181, 180)).toBeNull();
  });

  it("returns null for null and non-finite values", () => {
    expect(inRange(null, 90)).toBeNull();
    expect(inRange(Number.NaN, 90)).toBeNull();
    expect(inRange(Number.POSITIVE_INFINITY, 90)).toBeNull();
  });
});

describe("validDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses EXIF-style dates as local time", () => {
    expect(validDate("2023:05:01 10:00:00")).toBe(new Date(2023, 4, 1, 10, 0, 0).toISOString());
  });

  it("accepts Date instances", () => {
    const d = new Date(2020, 6, 4, 8, 30, 0);
    expect(validDate(d)).toBe(d.toISOString());
  });

  it("returns null for falsy and garbage input", () => {
    expect(validDate(undefined)).toBeNull();
    expect(validDate(null)).toBeNull();
    expect(validDate("")).toBeNull();
    expect(validDate("not a date")).toBeNull();
  });

  it("returns null for years before 1990", () => {
    expect(validDate("1989:12:31 23:00:00")).toBeNull();
    expect(validDate(new Date(1970, 0, 1))).toBeNull();
  });

  it("allows up to a day in the future but not more", () => {
    expect(validDate(new Date(2024, 0, 16, 11, 0, 0))).not.toBeNull();
    expect(validDate(new Date(2024, 0, 17, 12, 0, 0))).toBeNull();
    expect(validDate("2030:01:01 00:00:00")).toBeNull();
  });
});

describe("readPhotoExif", () => {
  beforeEach(() => {
    parse.mockReset();
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses numeric latitude and longitude", async () => {
    parse.mockResolvedValue({ latitude: 44.97, longitude: -93.26 });
    expect(await readPhotoExif(file)).toEqual({
      takenAt: null,
      latitude: 44.97,
      longitude: -93.26,
    });
  });

  it("prefers numeric latitude/longitude over GPS fields", async () => {
    parse.mockResolvedValue({
      latitude: 44.97,
      longitude: -93.26,
      GPSLatitude: [10, 0, 0],
      GPSLatitudeRef: "N",
      GPSLongitude: [20, 0, 0],
      GPSLongitudeRef: "E",
    });
    expect(await readPhotoExif(file)).toMatchObject({ latitude: 44.97, longitude: -93.26 });
  });

  it("falls back to GPS fields with refs", async () => {
    parse.mockResolvedValue({
      GPSLatitude: [33, 52, 4.8],
      GPSLatitudeRef: "S",
      GPSLongitude: [151, 12, 36],
      GPSLongitudeRef: "E",
    });
    const south = await readPhotoExif(file);
    expect(south.latitude).toBeCloseTo(-33.868, 3);
    expect(south.longitude).toBeCloseTo(151.21, 3);

    parse.mockResolvedValue({
      GPSLatitude: [44, 58, 12],
      GPSLatitudeRef: "N",
      GPSLongitude: [93, 15, 36],
      GPSLongitudeRef: "W",
    });
    const west = await readPhotoExif(file);
    expect(west.latitude).toBeCloseTo(44.97, 3);
    expect(west.longitude).toBeCloseTo(-93.26, 3);
  });

  it("nulls coordinates at 0, 0", async () => {
    parse.mockResolvedValue({ latitude: 0, longitude: 0 });
    expect(await readPhotoExif(file)).toEqual(EMPTY);
  });

  it("nulls both coordinates when one is out of range", async () => {
    parse.mockResolvedValue({ latitude: 95, longitude: 10 });
    expect(await readPhotoExif(file)).toEqual(EMPTY);
    parse.mockResolvedValue({ latitude: 45, longitude: 190 });
    expect(await readPhotoExif(file)).toEqual(EMPTY);
  });

  it("nulls both coordinates when only one is present", async () => {
    parse.mockResolvedValue({ latitude: 44.97 });
    expect(await readPhotoExif(file)).toEqual(EMPTY);
    parse.mockResolvedValue({ GPSLongitude: [93, 15, 36], GPSLongitudeRef: "W" });
    expect(await readPhotoExif(file)).toEqual(EMPTY);
  });

  it("picks DateTimeOriginal, then CreateDate, then ModifyDate", async () => {
    const original = new Date(2023, 4, 1, 10, 0, 0);
    const created = new Date(2023, 4, 2, 10, 0, 0);
    const modified = new Date(2023, 4, 3, 10, 0, 0);

    parse.mockResolvedValue({
      DateTimeOriginal: original,
      CreateDate: created,
      ModifyDate: modified,
    });
    expect((await readPhotoExif(file)).takenAt).toBe(original.toISOString());

    parse.mockResolvedValue({ CreateDate: created, ModifyDate: modified });
    expect((await readPhotoExif(file)).takenAt).toBe(created.toISOString());

    parse.mockResolvedValue({ DateTimeOriginal: "garbage", ModifyDate: "2023:05:03 10:00:00" });
    expect((await readPhotoExif(file)).takenAt).toBe(modified.toISOString());
  });

  it("returns all nulls when exifr finds nothing", async () => {
    parse.mockResolvedValue(null);
    expect(await readPhotoExif(file)).toEqual(EMPTY);
  });

  it("returns all nulls when exifr throws", async () => {
    parse.mockRejectedValue(new Error("bad file"));
    expect(await readPhotoExif(file)).toEqual(EMPTY);
  });

  it("returns all nulls without calling exifr when window is undefined", async () => {
    vi.unstubAllGlobals();
    expect(typeof window).toBe("undefined");
    expect(await readPhotoExif(file)).toEqual(EMPTY);
    expect(parse).not.toHaveBeenCalled();
  });
});
