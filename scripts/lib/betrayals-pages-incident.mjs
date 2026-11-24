const title = 'Betrayals Pages deployment needs attention'
const marker = '<!-- betrayals-pages-deployment-incident -->'

export async function reportPagesIncident({ github, context, result, core }) {
  const repo = context.repo
  const runUrl = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...repo,
    state: 'open',
    creator: 'github-actions[bot]',
    per_page: 100,
  })
  const incident = issues.find((issue) => !issue.pull_request && issue.body?.includes(marker))

  if (result === 'success') {
    if (incident) {
      await github.rest.issues.update({
        ...repo,
        issue_number: incident.number,
        body: `${incident.body}\n\nRecovered in [this verified deployment](${runUrl}).`,
        state: 'closed',
        state_reason: 'completed',
      })
    }
    return
  }

  let failure = 'See the deployment job for the failing step.'
  try {
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
      ...repo,
      run_id: context.runId,
      attempt_number: Number(process.env.GITHUB_RUN_ATTEMPT),
      per_page: 100,
    })
    const step = jobs
      .find((job) => job.name === 'deploy')
      ?.steps?.find((entry) => entry.conclusion === 'failure')
    if (step) failure = `Failed step: ${step.name}`
  } catch (error) {
    core.warning(`Could not look up the failed step: ${error.message}`)
  }

  const body = [
    marker,
    `GitHub Pages could not publish or verify commit \`${context.sha}\`.`,
    failure,
    `[Open the failed run](${runUrl}) to see the logs.`,
    'Fix the failing check and deploy again. This issue closes after a run verifies its commit on the public site.',
  ].join('\n\n')

  if (incident) {
    await github.rest.issues.update({ ...repo, issue_number: incident.number, body })
  } else {
    await github.rest.issues.create({ ...repo, title, body })
  }
}
