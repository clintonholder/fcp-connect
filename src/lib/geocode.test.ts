import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/geocode";

function stubFetch(impl: (url: string) => Promise<unknown>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe("geocodeAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for blank addresses without calling fetch", async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    expect(await geocodeAddress("")).toBeNull();
    expect(await geocodeAddress("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests one JSON result for the trimmed, encoded address", async () => {
    const fetchMock = stubFetch(() => jsonResponse([]));
    await geocodeAddress("  123 Main St, Minneapolis & Co  ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain("format=json");
    expect(url).toContain("limit=1");
    expect(url).toContain(`q=${encodeURIComponent("123 Main St, Minneapolis & Co")}`);
  });

  it("parses lat/lon strings into numbers", async () => {
    stubFetch(() => jsonResponse([{ lat: "44.97", lon: "-93.26" }]));
    expect(await geocodeAddress("Minneapolis")).toEqual({ lat: 44.97, lon: -93.26 });
  });

  it("returns null for a non-OK response", async () => {
    stubFetch(() => jsonResponse([{ lat: "44.97", lon: "-93.26" }], false));
    expect(await geocodeAddress("Minneapolis")).toBeNull();
  });

  it("returns null for an empty result", async () => {
    stubFetch(() => jsonResponse([]));
    expect(await geocodeAddress("Nowhere")).toBeNull();
  });

  it("returns null for non-numeric coordinates", async () => {
    stubFetch(() => jsonResponse([{ lat: "abc", lon: "-93.26" }]));
    expect(await geocodeAddress("Minneapolis")).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    expect(await geocodeAddress("Minneapolis")).toBeNull();
  });
});
