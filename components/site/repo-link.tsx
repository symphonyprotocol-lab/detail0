import { GitHubIcon } from '@/components/ui/icons';

/**
 * The open-source repository link, shared by the marketing and dashboard
 * headers so the two capsules stay identical. It renders at every width: the
 * repository is the one destination that should stay reachable from a phone
 * without opening the menu.
 */
export const REPO_URL = 'https://github.com/symphonyprotocol-lab/re0';

export function RepoLink({ label }: { label: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-full border border-line/70 text-muted transition-colors hover:text-ink"
    >
      <GitHubIcon size={16} />
    </a>
  );
}
