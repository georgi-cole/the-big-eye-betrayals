import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportPagesIncident } from '../scripts/lib/betrayals-pages-incident.mjs'

const context = {
  repo: { owner: 'example', repo: 'betrayals' },
  serverUrl: 'https://github.com',
  runId: 123,
  sha: 'abc123',
}

function fakeGitHub({ openIssues = [], jobs = [], lookupFails = false } = {}) {
  const writes = []
  const warnings = []
  const issues = {
    listForRepo: () => openIssues,
    create: (args) => writes.push({ action: 'create', ...args }),
    update: (args) => writes.push({ action: 'update', ...args }),
  }
  const actions = {
    listJobsForWorkflowRunAttempt: () => {
      if (lookupFails) throw new Error('Jobs API unavailable')
      return jobs
    },
  }
  const github = { paginate: (method) => method(), rest: { issues, actions } }
  const core = { warning: (message) => warnings.push(message) }
  const report = (result) => reportPagesIncident({ github, context, result, core })
  return { writes, warnings, report }
}

test('a failed Pages run opens an issue with the failed step and run link', async () => {
  const github = fakeGitHub({
    openIssues: [{ number: 4, body: 'Unrelated discussion' }],
    jobs: [{ name: 'deploy', steps: [{ name: 'Build site', conclusion: 'failure' }] }],
  })
  await github.report('failure')
  assert.equal(github.writes.length, 1)
  assert.equal(github.writes[0].action, 'create')
  assert.match(github.writes[0].body, /Build site/)
  assert.match(github.writes[0].body, /actions\/runs\/123/)
  assert.match(github.writes[0].body, /abc123/)
})

test('a repeat failure updates the same issue even when job details are unavailable', async () => {
  const openIssues = [{ number: 5, body: '<!-- betrayals-pages-deployment-incident -->' }]
  const github = fakeGitHub({ openIssues, lookupFails: true })
  await github.report('failure')
  assert.equal(github.writes.length, 1)
  assert.equal(github.writes[0].action, 'update')
  assert.equal(github.writes[0].issue_number, 5)
  assert.match(github.writes[0].body, /Open the failed run/)
  assert.equal(github.warnings.length, 1)
})

test('a verified deployment closes an open incident and otherwise creates no issue', async () => {
  const openIssues = [{ number: 5, body: '<!-- betrayals-pages-deployment-incident -->' }]
  const github = fakeGitHub({ openIssues })
  await github.report('success')
  assert.equal(github.writes.length, 1)
  assert.equal(github.writes[0].issue_number, 5)
  assert.equal(github.writes[0].state, 'closed')
  assert.match(github.writes[0].body, /verified deployment/)

  const noIncident = fakeGitHub()
  await noIncident.report('success')
  assert.deepEqual(noIncident.writes, [])
})
