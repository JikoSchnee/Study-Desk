import { describe, expect, it } from "vitest";
import { insertAtHeading } from "./markdown";

describe("insertAtHeading", () => {
  it("inserts a proposal before the next sibling heading", () => {
    const content = "# Root\n\n## Target\nold\n\n## Next\nkeep";
    const updated = insertAtHeading(content, "Root → Target", ["<!-- card -->\n> note"]);
    expect(updated.indexOf("<!-- card -->")).toBeGreaterThan(updated.indexOf("old"));
    expect(updated.indexOf("<!-- card -->")).toBeLessThan(updated.indexOf("## Next"));
  });
});
