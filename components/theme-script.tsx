/**
 * Runs before paint so a returning viewer never sees the wrong theme flash.
 * Kept tiny and dependency-free; the toggle writes the same key.
 */
const SCRIPT = `(function(){try{var t=localStorage.getItem("km-theme");if(!t){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
