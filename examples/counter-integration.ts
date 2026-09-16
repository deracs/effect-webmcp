/* oxlint-disable effecttsgo/async-function -- Native browser callbacks and DOM test boundaries use Promises. */
import type { WebMcpModelContext } from "effect-webmcp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type NativeTool = Parameters<WebMcpModelContext["registerTool"]>[0];

/** Exercises each UI through the browser tool callback, including scoped cleanup. */
export function testCounterIntegration(
  mount: (container: HTMLElement) => () => void,
): void {
  describe("counter WebMCP integration", () => {
    const tools = new Map<string, NativeTool>();
    let dispose = () => {};
    let container: HTMLDivElement;
    const modelContext: WebMcpModelContext = {
      registerTool: async (tool, options) => {
        if (options?.signal?.aborted) throw new Error("Registration aborted");
        if (tools.has(tool.name))
          throw new Error("Duplicate tool registration");
        tools.set(tool.name, tool);
        options?.signal?.addEventListener(
          "abort",
          () => tools.delete(tool.name),
          { once: true },
        );
      },
      getTools: async () =>
        [...tools.values()].map((tool) => ({
          ...tool,
          origin: "http://localhost",
        })),
      executeTool: async (tool, input = {}) => {
        const registered = tools.get(tool.name);
        if (registered === undefined) throw new Error("Tool is not registered");
        return JSON.stringify(
          await registered.execute(input, {
            signal: new AbortController().signal,
          }),
        );
      },
    };

    beforeEach(() => {
      tools.clear();
      container = document.createElement("div");
      container.id = "app";
      document.body.append(container);
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: modelContext,
      });
    });

    afterEach(async () => {
      dispose();
      await vi.waitFor(() => expect(tools.size).toBe(0));
      document.body.replaceChildren();
      Reflect.deleteProperty(document, "modelContext");
    });

    it("updates the rendered counter from buttons and tools, validates input, and unregisters", async () => {
      dispose = mount(container);
      await vi.waitFor(() =>
        expect(
          document.querySelector('[role="status"]')?.textContent,
        ).toContain("Ready:"),
      );
      expect(tools.size).toBe(1);
      const tool = tools.get("set-counter");
      if (tool === undefined)
        throw new Error("Counter tool was not registered");

      const increment = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "+1",
      );
      if (increment === undefined)
        throw new Error("Counter increment button is missing");
      increment.click();
      await vi.waitFor(() =>
        expect(document.querySelector("output")?.textContent).toBe("1"),
      );

      const options = { signal: new AbortController().signal };
      expect(await tool.execute({ value: 42 }, options)).toEqual({
        status: "accepted",
      });
      await vi.waitFor(() =>
        expect(document.querySelector("output")?.textContent).toBe("42"),
      );
      await expect(
        tool.execute({ value: "invalid" }, options),
      ).rejects.toBeDefined();
      await expect(
        tool.execute({ value: 9, extra: true }, options),
      ).rejects.toBeDefined();
      expect(document.querySelector("output")?.textContent).toBe("42");

      dispose();
      await vi.waitFor(() => expect(tools.size).toBe(0));
    });

    it("reports a browser refusal to register the tool", async () => {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          ...modelContext,
          registerTool: () =>
            Promise.reject(new Error("Host refused registration")),
        } satisfies WebMcpModelContext,
      });
      dispose = mount(container);
      await vi.waitFor(() =>
        expect(
          document.querySelector('[role="status"]')?.textContent,
        ).toContain("Tool registration failed:"),
      );
      expect(tools.size).toBe(0);
      expect(document.querySelector("output")?.textContent).toBe("0");
    });

    it("keeps the counter usable without a browser WebMCP context", async () => {
      Reflect.deleteProperty(document, "modelContext");
      dispose = mount(container);
      await vi.waitFor(() =>
        expect(document.querySelector("output")?.textContent).toBe("0"),
      );
      await vi.waitFor(
        () =>
          expect(
            document.querySelector('[role="status"]')?.textContent,
          ).toContain("WebMCP unavailable"),
        { timeout: 7_000 },
      );
      const increment = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "+1",
      );
      if (increment === undefined)
        throw new Error("Counter increment button is missing");
      increment.click();
      await vi.waitFor(() =>
        expect(document.querySelector("output")?.textContent).toBe("1"),
      );
    }, 10_000);
  });
}
