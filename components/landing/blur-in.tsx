/**
 * A heading that resolves word by word. Words are separated by real spaces (not margins),
 * so the text reads and is indexed as a sentence, and each word is an inline-block so the
 * line still wraps normally. CSS only; see `.km-word` in globals.css.
 */
export default function BlurIn({
  text,
  className,
  as: Tag = "h2",
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag className={className}>
      {text.split(" ").map((word, i, all) => (
        <span key={`${word}-${i}`}>
          <span className="km-word" style={{ ["--i" as string]: i }}>{word}</span>
          {i < all.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
