import { describe, expect, test } from "bun:test";

import type { FeedItem } from "../src/app/types";
import { buildChatRenderItems, summarizeActivityGroup } from "../src/ui/chat/activityGroups";

describe("desktop chat activity groups", () => {
  test("groups consecutive reasoning and tool items into one activity block", () => {
    const feed: FeedItem[] = [
      { id: "m1", kind: "message", role: "user", ts: "2024-01-01T00:00:00.000Z", text: "review it" },
      { id: "r1", kind: "reasoning", mode: "summary", ts: "2024-01-01T00:00:01.000Z", text: "Reviewing the model plan." },
      { id: "t1", kind: "tool", ts: "2024-01-01T00:00:02.000Z", name: "read", state: "output-available", args: { path: "a.ts" } },
      { id: "t2", kind: "tool", ts: "2024-01-01T00:00:03.000Z", name: "grep", state: "output-available", args: { pattern: "todo" } },
      { id: "m2", kind: "message", role: "assistant", ts: "2024-01-01T00:00:04.000Z", text: "Here is the review." },
    ];

    expect(buildChatRenderItems(feed)).toEqual([
      { kind: "feed-item", item: feed[0] },
      { kind: "activity-group", id: "activity-r1", items: [feed[1], feed[2], feed[3]] },
      { kind: "feed-item", item: feed[4] },
    ]);
  });

  test("summary prefers reasoning preview and counts tools", () => {
    const summary = summarizeActivityGroup([
      { id: "r1", kind: "reasoning", mode: "summary", ts: "2024-01-01T00:00:01.000Z", text: "Need to validate the tax assumptions before changing EBITDA." },
      { id: "t1", kind: "tool", ts: "2024-01-01T00:00:02.000Z", name: "read", state: "output-available", args: { path: "model.py" } },
    ]);

    expect(summary.title).toBe("Thinking");
    expect(summary.preview).toContain("Need to validate the tax assumptions");
    expect(summary.toolItems).toHaveLength(1);
    expect(summary.status).toBe("done");
    expect(summary.statusLabel).toBe("Done");
  });

  test("summary surfaces approval state ahead of completed tools", () => {
    const summary = summarizeActivityGroup([
      { id: "t1", kind: "tool", ts: "2024-01-01T00:00:02.000Z", name: "bash", state: "output-available", args: { cmd: "echo ok" } },
      { id: "t2", kind: "tool", ts: "2024-01-01T00:00:03.000Z", name: "bash", state: "approval-requested", args: { cmd: "rm -rf /tmp/x" } },
    ]);

    expect(summary.status).toBe("approval");
    expect(summary.statusLabel).toBe("Needs review");
  });

  test("summary collapses adjacent tool lifecycle updates into one trace row", () => {
    const summary = summarizeActivityGroup([
      { id: "t1", kind: "tool", ts: "2024-01-01T00:00:02.000Z", name: "read", state: "input-available", args: { path: "model.py" } },
      { id: "t2", kind: "tool", ts: "2024-01-01T00:00:03.000Z", name: "read", state: "output-available", result: { chars: 655 } },
    ]);

    expect(summary.toolItems).toHaveLength(1);
    expect(summary.toolItems[0]).toMatchObject({
      id: "t1",
      name: "read",
      state: "output-available",
      args: { path: "model.py" },
      result: { chars: 655 },
      sourceIds: ["t1", "t2"],
    });
  });

  test("summary keeps back-to-back completed tools as separate trace rows", () => {
    const summary = summarizeActivityGroup([
      { id: "t1", kind: "tool", ts: "2024-01-01T00:00:02.000Z", name: "read", state: "output-available", args: { path: "a.py" }, result: { chars: 20 } },
      { id: "t2", kind: "tool", ts: "2024-01-01T00:00:03.000Z", name: "read", state: "output-available", args: { path: "b.py" }, result: { chars: 30 } },
    ]);

    expect(summary.toolItems).toHaveLength(2);
    expect(summary.toolItems.map((item) => item.sourceIds)).toEqual([["t1"], ["t2"]]);
  });

  test("summary merges adjacent duplicate completed tool rows with identical args and result", () => {
    const summary = summarizeActivityGroup([
      {
        id: "t1",
        kind: "tool",
        ts: "2024-01-01T00:00:02.000Z",
        name: "bash",
        state: "output-available",
        args: { command: "python3 model.py" },
        result: { exitCode: 0 },
      },
      {
        id: "t2",
        kind: "tool",
        ts: "2024-01-01T00:00:03.000Z",
        name: "bash",
        state: "output-available",
        args: { command: "python3 model.py" },
        result: { exitCode: 0 },
      },
    ]);

    expect(summary.toolItems).toHaveLength(1);
    expect(summary.toolItems[0]?.sourceIds).toEqual(["t1", "t2"]);
  });

  test("summary merges a generic completed row with a richer adjacent completed row for the same tool", () => {
    const summary = summarizeActivityGroup([
      { id: "t1", kind: "tool", ts: "2024-01-01T00:00:02.000Z", name: "todoWrite", state: "output-available" },
      {
        id: "t2",
        kind: "tool",
        ts: "2024-01-01T00:00:03.000Z",
        name: "todoWrite",
        state: "output-available",
        args: { count: 4 },
        result: { count: 4 },
      },
    ]);

    expect(summary.toolItems).toHaveLength(1);
    expect(summary.toolItems[0]).toMatchObject({
      id: "t1",
      name: "todoWrite",
      state: "output-available",
      args: { count: 4 },
      result: { count: 4 },
      sourceIds: ["t1", "t2"],
    });
  });

  test("summary merges a verbose string result with a compact summary result for the same tool call", () => {
    const summary = summarizeActivityGroup([
      {
        id: "t1",
        kind: "tool",
        ts: "2024-01-01T00:00:02.000Z",
        name: "read",
        state: "output-available",
        args: { filePath: "model.py", offset: 1, limit: 20 },
        result: "line 1\nline 2\nline 3",
      },
      {
        id: "t2",
        kind: "tool",
        ts: "2024-01-01T00:00:03.000Z",
        name: "read",
        state: "output-available",
        args: { filePath: "model.py", offset: 1, limit: 20 },
        result: { chars: 18 },
      },
    ]);

    expect(summary.toolItems).toHaveLength(1);
    expect(summary.toolItems[0]).toMatchObject({
      id: "t1",
      name: "read",
      state: "output-available",
      args: { filePath: "model.py", offset: 1, limit: 20 },
      result: { chars: 18 },
      sourceIds: ["t1", "t2"],
    });
  });
});
