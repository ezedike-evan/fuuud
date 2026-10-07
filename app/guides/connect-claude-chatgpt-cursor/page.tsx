import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/json-ld";
import { ArticleHead, Body, Callout, CtaCard, Frame, Related } from "@/components/guides/frame";
import { ALLERGY_HUB, CONNECT, GUIDES_HOME, PRIVATE_MEMORY } from "@/lib/pages";
import { absolute, pageMetadata, siteUrl } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(CONNECT);

const TOOLS = [
  ["recall_memory", "Look up what you have told it, newest facts first."],
  ["remember_fact", "Save a dated fact such as an allergy or a dislike."],
  ["forget_fact", "Retract a fact. It asks you to confirm first."],
  ["check_meal", "Check a meal against your allergies and conditions. If it cannot tell, it says unknown, not safe."],
  ["list_memory", "Show everything it has stored, including writes still saving."],
] as const;

export default function ConnectPage() {
  const url = `${siteUrl()}/api/mcp`;
  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: CONNECT.title,
    description: CONNECT.description,
    step: [
      { "@type": "HowToStep", name: "Copy the connector URL", text: `Use ${url} as the MCP server URL.` },
      { "@type": "HowToStep", name: "Add it in your AI app", text: "Add a custom connector or MCP server with that URL in Claude, ChatGPT, Cursor, VS Code or Gemini CLI." },
      { "@type": "HowToStep", name: "Sign in and approve", text: "Sign in with Google, choose read or read and write, and approve the connection." },
      { "@type": "HowToStep", name: "Ask about food", text: "Ask the app to check a meal or remember an allergy." },
    ],
    url: absolute(CONNECT.path),
  };

  return (
    <Frame>
      <ArticleHead
        entry={CONNECT}
        trail={[["Guides", GUIDES_HOME.path], ["Connect your AI app", CONNECT.path]]}
        eyebrow="Guide"
        heading="Connect Fuuud to Claude, ChatGPT and Cursor"
        lede="Your Fuuud memory can follow you into the AI apps you already use. Add one connector and any app that supports MCP can check meals against your allergies."
      />
      <JsonLd data={howTo} />
      <Body aside={<CtaCard title="Make your memory first" body="You need a Fuuud account before you connect an app. It takes a minute and needs no wallet." />}>
        <div className="km-prose">
          <h2>The connector URL</h2>
          <p>One address works for every app:</p>
          <pre><code>{url}</code></pre>
          <p>
            It is a hosted MCP server protected by OAuth, so you sign in once and each app gets its own key. Apps do not need your
            password and never see the health record unless you approve it.
          </p>

          <h2>Add it to your app</h2>
          <p>Menu names change between versions, so look for &ldquo;connectors&rdquo; or &ldquo;MCP&rdquo; in settings.</p>
          <h3>Claude (web, desktop and mobile)</h3>
          <p>
            In settings, open Connectors and add a custom connector, then paste the URL. Custom connectors are on paid plans. Add it on
            the web; it then shows up in the mobile app.
          </p>
          <h3>ChatGPT</h3>
          <p>In settings, enable developer mode under advanced connector settings, create a connector, and paste the URL.</p>
          <h3>Cursor</h3>
          <p>Add it to your MCP configuration:</p>
          <pre><code>{`{
  "mcpServers": {
    "fuuud": { "url": "${url}" }
  }
}`}</code></pre>
          <h3>VS Code</h3>
          <p>Add it to <code>.vscode/mcp.json</code>:</p>
          <pre><code>{`{
  "servers": {
    "fuuud": { "type": "http", "url": "${url}" }
  }
}`}</code></pre>
          <h3>Claude Code and Gemini CLI</h3>
          <pre><code>{`claude mcp add --transport http fuuud ${url}`}</code></pre>
          <p>For Gemini CLI, add the same URL as an HTTP server in its settings.</p>

          <h2>Approve it once</h2>
          <p>
            The first time, the app opens a Fuuud page. Sign in with Google, then choose whether the app may only read your memory or may
            also write to it. Writing is what lets it remember a new allergy. Approve, and you are sent back to the app.
          </p>

          <h2>What the app can do</h2>
          <ul>
            {TOOLS.map(([name, text]) => (
              <li key={name}>
                <code>{name}</code>: {text}
              </li>
            ))}
          </ul>
          <Callout title="Your data in a third-party chat">
            <p>
              Anything the app recalls becomes part of that conversation with its AI provider, under that provider&apos;s terms. Only connect
              apps you trust with your health information.
            </p>
          </Callout>

          <h2>Disconnect it</h2>
          <p>
            In Fuuud, open Settings and find connected apps. Disconnecting stops the app immediately and discards the key we held for it.
            You can also remove its key from your account. See{" "}
            <Link href={PRIVATE_MEMORY.path}>how Fuuud keeps your health memory private</Link>.
          </p>
        </div>
      </Body>
      <Related
        links={[
          { href: PRIVATE_MEMORY.path, label: PRIVATE_MEMORY.title, hint: PRIVATE_MEMORY.description },
          { href: ALLERGY_HUB.path, label: ALLERGY_HUB.title, hint: ALLERGY_HUB.description },
        ]}
      />
    </Frame>
  );
}
