import { prisma } from "@/lib/db";
import { json, route, type Ctx } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const weekStart = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

/** Git history analytics: commits, weekly activity, contributors, churn hotspots. ?file= narrows to one file. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const file = sp.get("file");
  const take = Math.min(300, parseInt(sp.get("limit") || "120", 10) || 120);

  const where = file ? { repoId: id, files: { some: { path: file } } } : { repoId: id };
  const commits = await prisma.commit.findMany({
    where,
    orderBy: { committedAt: "desc" },
    take: 2000,
    select: { id: true, sha: true, message: true, committedAt: true, additions: true, deletions: true, filesChanged: true, developer: { select: { id: true, name: true, email: true } } },
  });

  const weeks = new Map<string, { week: string; commits: number; additions: number; deletions: number }>();
  const devs = new Map<string, { name: string; email: string; commits: number; additions: number; deletions: number; first: Date; last: Date }>();
  for (const c of commits) {
    const w = weekStart(c.committedAt);
    const cur = weeks.get(w) || { week: w, commits: 0, additions: 0, deletions: 0 };
    cur.commits++; cur.additions += c.additions; cur.deletions += c.deletions;
    weeks.set(w, cur);
    const dk = c.developer?.id ?? "unknown";
    const d = devs.get(dk) || { name: c.developer?.name ?? "unknown", email: c.developer?.email ?? "", commits: 0, additions: 0, deletions: 0, first: c.committedAt, last: c.committedAt };
    d.commits++; d.additions += c.additions; d.deletions += c.deletions;
    if (c.committedAt < d.first) d.first = c.committedAt;
    if (c.committedAt > d.last) d.last = c.committedAt;
    devs.set(dk, d);
  }
  // fill gaps between first and last week so the chart is continuous
  const sorted = [...weeks.keys()].sort();
  const activity: { week: string; commits: number; additions: number; deletions: number }[] = [];
  if (sorted.length) {
    const end = new Date(sorted[sorted.length - 1]);
    for (let d = new Date(sorted[0]); d <= end && activity.length < 520; d.setUTCDate(d.getUTCDate() + 7)) {
      const k = d.toISOString().slice(0, 10);
      activity.push(weeks.get(k) || { week: k, commits: 0, additions: 0, deletions: 0 });
    }
  }

  const [churn, totals] = await Promise.all([
    file ? Promise.resolve([]) : prisma.file.findMany({ where: { repoId: id, churn: { gt: 0 } }, orderBy: { churn: "desc" }, take: 15, select: { key: true, path: true, churn: true, commitCount: true, authors: true, loc: true } }),
    prisma.commit.aggregate({ where, _count: true, _sum: { additions: true, deletions: true } }),
  ]);

  let filesForCommits: Record<string, { path: string; changeType: string; additions: number; deletions: number }[]> = {};
  const recent = commits.slice(0, take);
  if (recent.length) {
    const cfs = await prisma.commitFile.findMany({ where: { commitId: { in: recent.slice(0, 60).map((c) => c.id) } }, select: { commitId: true, path: true, changeType: true, additions: true, deletions: true } });
    filesForCommits = {};
    for (const cf of cfs) (filesForCommits[cf.commitId] ||= []).push({ path: cf.path, changeType: cf.changeType, additions: cf.additions, deletions: cf.deletions });
  }

  return json({
    totals: { commits: totals._count, additions: totals._sum.additions ?? 0, deletions: totals._sum.deletions ?? 0, contributors: devs.size, firstCommit: commits[commits.length - 1]?.committedAt ?? null, lastCommit: commits[0]?.committedAt ?? null },
    activity,
    contributors: [...devs.values()].sort((a, b) => b.commits - a.commits).slice(0, 30),
    churn,
    commits: recent.map((c) => ({ sha: c.sha, message: c.message, date: c.committedAt, author: c.developer?.name ?? "unknown", additions: c.additions, deletions: c.deletions, filesChanged: c.filesChanged, files: filesForCommits[c.id] ?? null })),
  });
});
