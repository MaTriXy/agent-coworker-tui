import { describe, expect, test } from "bun:test";

import { buildCodexAuthorizeUrl } from "../../src/providers/codex-oauth-flows";

describe("providers/codex-oauth-flows", () => {
  test("buildCodexAuthorizeUrl matches the official Codex browser login contract", () => {
    const url = new URL(buildCodexAuthorizeUrl(
      "http://localhost:1455/auth/callback",
      "challenge_123",
      "state_123",
    ));

    expect(url.origin + url.pathname).toBe("https://auth.openai.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email offline_access api.connectors.read api.connectors.invoke",
    );
    expect(url.searchParams.get("code_challenge")).toBe("challenge_123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(url.searchParams.get("state")).toBe("state_123");
    expect(url.searchParams.get("originator")).toBe("codex_cli_rs");
  });
});
