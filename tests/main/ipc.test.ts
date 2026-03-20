import { describe, it, expect } from "vitest";
import { validateSender } from "../../src/main/ipc.js";
import type { IpcMainInvokeEvent } from "electron";

describe("validateSender", () => {
  it("accepts file:// origin within app bundle (.asar)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/src/renderer/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts http://localhost:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://localhost:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts http://127.0.0.1:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://127.0.0.1:5173/index.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects file:// origin outside app bundle", () => {
    const event = {
      senderFrame: { url: "file:///tmp/malicious.html" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects malicious origin", () => {
    const event = {
      senderFrame: { url: "https://evil.com/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects empty sender URL", () => {
    const event = {
      senderFrame: { url: "" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects undefined sender frame", () => {
    const event = {
      senderFrame: undefined,
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects non-allowlisted port", () => {
    const event = {
      senderFrame: { url: "http://localhost:3000/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects similar but different domain", () => {
    const event = {
      senderFrame: { url: "http://localhost.com:5173/" },
    } as IpcMainInvokeEvent;
    expect(validateSender(event)).toBe(false);
  });
});
