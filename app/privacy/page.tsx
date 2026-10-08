import Link from "next/link";
import type { Metadata } from "next";
import { ArticleHead, Body, Frame } from "@/components/guides/frame";
import { ContactLine } from "@/components/guides/legal";
import { PRIVACY, PRIVATE_MEMORY } from "@/lib/pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(PRIVACY, { image: "/opengraph-image" });

export default function Privacy() {
  return (
    <Frame>
      <ArticleHead
        entry={PRIVACY}
        trail={[["Privacy policy", PRIVACY.path]]}
        eyebrow="Legal"
        heading="Privacy policy"
        lede="What Fuuud collects, where it goes, who processes it, and how to take it back. Written to be read, in plain language."
        article={false}
      />
      <Body>
        <div className="km-prose">
          <h2>What we collect</h2>
          <ul>
            <li><strong>Your sign-in.</strong> You sign in with Google. We receive the identifier needed to create your Sui address through zkLogin; we do not receive your Google password.</li>
            <li><strong>What you tell the agent.</strong> Your messages are processed to answer you. Facts about your health and food (conditions, allergies, dislikes, goals) that you assert about yourself are saved to your memory record.</li>
            <li><strong>Reminder details,</strong> only if you turn on notifications: your Telegram chat id or browser push subscription, and the names and times of upcoming meals.</li>
            <li><strong>Technical data</strong> such as server logs with request times and errors, kept to run and fix the service.</li>
          </ul>

          <h2>Where your health record lives</h2>
          <p>
            Saved facts are encrypted and stored on Walrus through Walrus Memory, in a memory account owned by your Sui address. We do
            not keep a copy of the record in our own database. How this works, and how to revoke access, is explained in{" "}
            <Link href={PRIVATE_MEMORY.path}>how Fuuud keeps your health memory private</Link>.
          </p>

          <h2>Who else processes data</h2>
          <ul>
            <li><strong>Voice.</strong> If you dictate a message or send the Telegram bot a voice note, the recording is sent to Groq to be turned into text. We do not store the audio. On the website the text goes into your message box for you to check before you send it; on Telegram the bot replies with what it heard first.</li>
            <li><strong>An AI model provider</strong> receives your messages and the facts recalled for that turn to write a reply. By default this is a provider we configure; if you add your own key in Settings, that key and provider are used.</li>
            <li><strong>Walrus and Sui</strong> store the encrypted record and the account and key registry. Blockchain data is public by design; the health facts themselves are encrypted.</li>
            <li><strong>Enoki and Google</strong> provide sign-in and the wallet created for you.</li>
            <li><strong>Upstash</strong> stores short-lived sign-in and connection state, connection keys sealed at rest, reminder details if you enable them, and, for the Telegram chat only, your last reply for 15 minutes so the next message has context.</li>
            <li><strong>Telegram and browser push services</strong> deliver reminders and chat messages if you connect them.</li>
            <li><strong>Our host</strong> runs the website and receives standard request logs.</li>
            <li><strong>AI apps you connect</strong> (such as Claude or ChatGPT) receive what they recall, under their own terms.</li>
          </ul>

          <h2>Your choices</h2>
          <ul>
            <li>Say &ldquo;don&apos;t save that&rdquo; and nothing from that turn is stored.</li>
            <li>Retract any fact from Settings. It is no longer recalled. The encrypted entry remains on Walrus until its storage period ends.</li>
            <li>Disconnect an app or Telegram, or remove a device key, in Settings. Disconnecting deletes the connection key we held and your queued reminders.</li>
            <li>Ask us to delete reminder data and logs we hold about you using the contact below.</li>
          </ul>

          <h2>Children and health advice</h2>
          <p>
            Fuuud is not directed at children. It gives food guidance, not medical advice, and is not a substitute for a clinician.
          </p>

          <h2>Changes</h2>
          <p>If this policy changes in a way that matters, we will update the date above and say so in the app.</p>
          <ContactLine />
        </div>
      </Body>
    </Frame>
  );
}
