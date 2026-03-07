import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  decodeDesktopLocalFileHref,
  encodeDesktopLocalFileHref,
  fileUrlToDesktopPath,
  MessageResponse,
  remarkRewriteDesktopFileLinks,
  rewriteDesktopFileLinksInTree,
} from "../src/components/ai-elements/message";

describe("desktop message local file links", () => {
  test("converts file URLs into desktop paths", () => {
    expect(fileUrlToDesktopPath("file:///Users/mweinbach/Desktop/Cowork%20Test/create_models.py")).toBe(
      "/Users/mweinbach/Desktop/Cowork Test/create_models.py",
    );
    expect(fileUrlToDesktopPath("file:///C:/Users/Test/Desktop/Cowork%20Test/create_models.py")).toBe(
      "C:\\Users\\Test\\Desktop\\Cowork Test\\create_models.py",
    );
    expect(fileUrlToDesktopPath("https://example.com")).toBeNull();
  });

  test("round-trips encoded desktop local file hrefs", () => {
    const encodedHref = encodeDesktopLocalFileHref("file:///Users/mweinbach/Desktop/Cowork%20Test/create_models.py");
    expect(encodedHref).toBe("cowork-file://open?path=%2FUsers%2Fmweinbach%2FDesktop%2FCowork%20Test%2Fcreate_models.py");
    expect(decodeDesktopLocalFileHref(encodedHref)).toBe("/Users/mweinbach/Desktop/Cowork Test/create_models.py");
    expect(decodeDesktopLocalFileHref("https://example.com")).toBeNull();
  });

  test("rewrites file links in markdown trees without touching normal links", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "file:///Users/mweinbach/Desktop/Cowork%20Test/create_models.py",
              children: [{ type: "text", value: "create_models.py" }],
            },
            {
              type: "link",
              url: "https://example.com/docs",
              children: [{ type: "text", value: "docs" }],
            },
          ],
        },
      ],
    };

    rewriteDesktopFileLinksInTree(tree);

    expect(tree.children[0]?.children[0]?.url).toBe(
      "cowork-file://open?path=%2FUsers%2Fmweinbach%2FDesktop%2FCowork%20Test%2Fcreate_models.py",
    );
    expect(tree.children[0]?.children[1]?.url).toBe("https://example.com/docs");
  });

  test("remark transformer also rewrites rendered anchor hrefs", () => {
    const transform = remarkRewriteDesktopFileLinks();
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "a",
          properties: {
            href: "file:///Users/mweinbach/Desktop/Cowork%20Test/output/AAPL_DCF_Model.xlsx",
          },
          children: [{ type: "text", value: "AAPL_DCF_Model.xlsx" }],
        },
      ],
    };

    transform(tree);

    expect(tree.children[0]?.properties?.href).toBe(
      "cowork-file://open?path=%2FUsers%2Fmweinbach%2FDesktop%2FCowork%20Test%2Foutput%2FAAPL_DCF_Model.xlsx",
    );
  });

  test("renders local file citations without blocked markers", () => {
    const html = renderToStaticMarkup(
      createElement(
        MessageResponse,
        null,
        "- [create_models.py](file:///Users/mweinbach/Desktop/Cowork%20Test/create_models.py)",
      ),
    );

    expect(html).toContain("create_models.py");
    expect(html).toContain("<button");
    expect(html).not.toContain("[blocked]");
  });
});
