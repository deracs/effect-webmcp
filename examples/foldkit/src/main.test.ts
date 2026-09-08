import { click, expect, given, role, scene, text } from "foldkit/scene";
import { describe, test } from "vitest";

import { type Model, update, view } from "./main";

const initialModel: Model = { count: 0 };

describe("Foldkit counter", () => {
  test("increments, decrements, and resets through the rendered controls", () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text("0")).toExist(),
      click(role("button", { name: "+" })),
      expect(text("1")).toExist(),
      click(role("button", { name: "-" })),
      expect(text("0")).toExist(),
      click(role("button", { name: "-" })),
      expect(text("-1")).toExist(),
      click(role("button", { name: "Reset" })),
      expect(text("0")).toExist(),
    );
  });
});
