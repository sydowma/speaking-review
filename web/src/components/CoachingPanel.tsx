import type { ReviewCoaching } from "@shared/types.ts";

interface Props {
  coaching: ReviewCoaching;
}

export function CoachingPanel({ coaching }: Props): React.ReactElement {
  return (
    <section className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 sm:px-5 py-4">
        <div className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          话术改写
        </div>

        {coaching.priorities.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              优先提升
            </div>
            <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
              {coaching.priorities.map((priority, index) => (
                <li key={priority} className="leading-relaxed">
                  {index + 1}. {priority}
                </li>
              ))}
            </ul>
          </div>
        )}

        {coaching.phraseRewrites.length > 0 && (
          <div className="mt-4 space-y-3">
            {coaching.phraseRewrites.map((rewrite) => (
              <article
                key={rewrite.id}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950 p-3"
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {rewrite.situation}
                </div>
                {rewrite.before && (
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    原表达：{rewrite.before}
                  </div>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">
                  {rewrite.after}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {rewrite.why}
                </p>
              </article>
            ))}
          </div>
        )}

        {coaching.practiceDrills.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              训练方案
            </div>
            <div className="space-y-3">
              {coaching.practiceDrills.map((drill) => (
                <article key={drill.id} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {drill.title}
                    </div>
                    <div className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                      {drill.minutes} min
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{drill.focus}</div>
                  <ul className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 space-y-0.5">
                    {drill.steps.map((step, index) => (
                      <li key={step}>
                        {index + 1}. {step}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
