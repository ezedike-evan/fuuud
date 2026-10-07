import { issuer, mcpUrl } from "../app-url.ts";
import { SUPPORTED_SCOPES } from "./grants.ts";

/**
 * The two discovery documents.
 *
 * Protected resource (RFC 9728): tells a client which server to authorize with.
 * `resource` must equal the MCP URL the person typed, byte for byte, or Claude
 * fails the connection with "Couldn't reach the MCP server".
 *
 * Authorization server (RFC 8414): the endpoints, plus the capabilities clients
 * check before starting: S256 PKCE, public clients (`none`), and an
 * `iss` parameter on authorization responses, which ChatGPT needs in order to use
 * its stable redirect URI.
 */

export function protectedResourceMetadata() {
  return {
    resource: mcpUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Fuuud health memory",
  };
}

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SUPPORTED_SCOPES],
    authorization_response_iss_parameter_supported: true,
  };
}
