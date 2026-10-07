import Link from "next/link";
import type { Metadata } from "next";
import { ArticleHead, Body, Callout, CtaCard, Frame, Related } from "@/components/guides/frame";
import { ALLERGY_HUB, CONNECT, GUIDES_HOME, PRIVATE_MEMORY } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(PRIVATE_MEMORY);

export default function PrivateHealthMemory() {
  return (
    <Frame>
      <ArticleHead
        entry={PRIVATE_MEMORY}
        trail={[["Guides", GUIDES_HOME.path], ["Private health memory", PRIVATE_MEMORY.path]]}
        eyebrow="Guide"
        heading="How Fuuud keeps your health memory private"
        lede="Fuuud remembers your allergies and conditions so you never repeat them. Here is exactly what it writes, where it lives, who can read it, and how you take it back."
      />
      <Body aside={<CtaCard body="Sign in with Google. A memory account is created for you, with no wallet to install." />}>
        <div className="km-prose">
          <h2>What it writes down</h2>
          <p>
            Only things you say about yourself that matter for food: a medical condition, an allergy or intolerance, an explicit
            &ldquo;I have no allergies&rdquo;, a religious or fasting rule, foods you dislike or like, a goal, who you cook for, practical
            limits such as budget and time, a meal you rejected, and a symptom after eating.
          </p>
          <p>
            It does not store cravings, small talk, hypotheticals or its own suggestions. Most turns store nothing at all. If you say
            &ldquo;don&apos;t save that&rdquo;, nothing from that turn is written, and that rule is enforced in code before the write, not left to
            the model.
          </p>
          <p>Each fact is one dated line, so a newer fact beats an older one:</p>
          <pre><code>2026-10-07 | allergy | groundnuts - hives</code></pre>

          <h2>Where it is stored</h2>
          <p>
            The record lives on Walrus, a decentralised storage network, through Walrus Memory. Each fact is encrypted before it leaves,
            and the record belongs to a memory account on the Sui blockchain that your Google sign-in creates for you through zkLogin.
            The account address is yours, not ours.
          </p>

          <h2>Who can read it</h2>
          <p>
            You, and anything you give a delegate key. A delegate key is a separate key that lets one device or app read and write your
            record on your behalf, and that can be removed on its own at any time. The web app uses one key per browser, kept in an
            encrypted cookie in that browser rather than in our database.
          </p>
          <p>
            When Fuuud answers, it reads the relevant facts and sends them with your message to the AI model that writes the reply.
            By default that is a model we run; if you add your own key in Settings, your key is used instead.
          </p>

          <h2>What our server does hold</h2>
          <ul>
            <li>
              <strong>Connected apps and Telegram.</strong> When you connect an AI app or the Telegram bot, it gets its own delegate key.
              Because those cannot act from your browser, the server keeps that key encrypted at rest so the connection can work. It is a
              different key from your browser&apos;s, and disconnecting it revokes it.
            </li>
            <li>
              <strong>Reminders.</strong> If you turn on notifications, the server keeps your Telegram chat id or push subscription and the
              names and times of upcoming meals, in plain form, only until you disconnect.
            </li>
            <li>
              <strong>Sign-in.</strong> A session cookie. The health record itself is not kept in our database.
            </li>
          </ul>
          <Callout title="Honest limit">
            <p>
              Retracting a fact writes a record that outranks it, so nothing recalls it again. It is not deletion: the encrypted entry stays on
              Walrus until its storage period expires.
            </p>
          </Callout>

          <h2>How to take it back</h2>
          <ol>
            <li><strong>Forget a fact.</strong> Retract it from Settings, or ask the agent. It will not be recalled again.</li>
            <li><strong>Remove a device.</strong> In Settings, the delegate keys list shows each one. Removing a key is signed by your wallet and takes effect on the account.</li>
            <li><strong>Disconnect an app.</strong> Settings lists connected apps and the Telegram chat. Disconnecting stops it at once and discards the key we held.</li>
            <li><strong>Stop saving.</strong> Say &ldquo;don&apos;t save that&rdquo; at any time.</li>
          </ol>

          <h2>Using it from other apps</h2>
          <p>
            The same record can be used from Claude, ChatGPT, Cursor and other apps through a connector you approve once. See{" "}
            <Link href={CONNECT.path}>how to connect Fuuud to your AI app</Link>.
          </p>
          <p>
            Fuuud gives food guidance and is not medical advice. See the <Link href="/privacy">privacy policy</Link> for the full list of
            services involved.
          </p>
        </div>
      </Body>
      <Related
        links={[
          { href: CONNECT.path, label: CONNECT.title, hint: CONNECT.description },
          { href: ALLERGY_HUB.path, label: ALLERGY_HUB.title, hint: ALLERGY_HUB.description },
        ]}
      />
    </Frame>
  );
}
