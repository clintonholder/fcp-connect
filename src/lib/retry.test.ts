import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns the result after one call when the first try succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds after transient failures", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rethrows the last error after exhausting attempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValueOnce(new Error("third"));
    await expect(withRetry(fn, { delayMs: 0 })).rejects.toThrow("third");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("honours a custom attempts count", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry(fn, { attempts: 5, delayMs: 0 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("waits an increasing delay between tries", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    const result = withRetry(fn, { attempts: 3, delayMs: 100 });
    const assertion = expect(result).rejects.toThrow("nope");
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);
    await assertion;
    vi.useRealTimers();
  });
});
