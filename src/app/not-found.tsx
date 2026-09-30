import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="font-display font-semibold text-5xl text-fg">Nothing buried here</p>
        <p className="mt-2 text-fg-2">That page doesn&apos;t exist.</p>
        <Link href="/" className="btn btn-primary mt-6">Back to repositories</Link>
      </div>
    </div>
  );
}
