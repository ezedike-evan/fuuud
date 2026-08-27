/**
 * Two hairlines at the content gutters, running the full height of the page.
 * They sit above everything and catch nothing — a printed-page margin rule that
 * gives every section the same measure without any section knowing about it.
 */
export default function Rails() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 hidden md:block">
      <div className="mx-auto h-full max-w-[1280px]">
        <div className="relative h-full">
          <div className="absolute left-0 top-0 h-full w-px bg-line-soft" />
          <div className="absolute right-0 top-0 h-full w-px bg-line-soft" />
        </div>
      </div>
    </div>
  );
}
