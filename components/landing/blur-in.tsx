"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * A heading that resolves word by word, the way a thought does. Each word is
 * its own inline-block so the line still wraps normally, and the whole thing
 * collapses to plain text under `prefers-reduced-motion`.
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
  const still = useReducedMotion();
  if (still) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className}>
      {text.split(" ").map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="mr-[0.26em] inline-block"
          initial={{ filter: "blur(10px)", opacity: 0 }}
          whileInView={{ filter: "blur(0px)", opacity: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.42, delay: i * 0.05 }}
        >
          {word}
        </motion.span>
      ))}
    </Tag>
  );
}
