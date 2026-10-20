import { describe, expect, it, vi } from "vitest";
import { readAll } from "@/lib/national-paint-read";

describe("readAll", () => {
  it("stops on a short page", async () => {
    const page = vi.fn().mockResolvedValue({ data: [1, 2, 3], error: null });
    expect(await readAll<number>(page)).toEqual([1, 2, 3]);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 999);
  });

  it("concatenates 2,500 rows across three pages", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const page = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null }),
    );
    const out = await readAll<number>(page);
    expect(out).toHaveLength(2500);
    expect(out[2499]).toBe(2499);
    expect(page).toHaveBeenCalledTimes(3);
    expect(page).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("throws the error message", async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(readAll(page)).rejects.toThrow("boom");
  });
});
