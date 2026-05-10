export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-zinc-200/60 dark:bg-zinc-700/40 ${className}`} />;
}
