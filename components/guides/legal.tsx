/** Where people reach us. Set NEXT_PUBLIC_CONTACT_EMAIL to show an address; otherwise the repository's issue tracker. */
export function ContactLine() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  return email ? (
    <p>Contact: <a href={`mailto:${email}`}>{email}</a></p>
  ) : (
    <p>
      Contact: open an issue at <a href="https://github.com/ezedike-evan/fuuud/issues" rel="noopener">github.com/ezedike-evan/fuuud</a>.
    </p>
  );
}
