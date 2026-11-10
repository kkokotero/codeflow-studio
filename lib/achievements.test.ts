import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, createAchievementProfile, getLevelProgress, recordAchievementActivity } from './achievements'

describe('achievement catalog', () => {
  it('ships at least one hundred achievements with unique ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(100)
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(ACHIEVEMENTS.length)
  })

  it('does not unlock anything for a brand new profile', () => {
    const profile = createAchievementProfile('Ada', 'ada')
    expect(ACHIEVEMENTS.filter((achievement) => achievement.isComplete(profile.stats))).toEqual([])
  })
})

describe('achievement progression', () => {
  it('awards the first-line achievement once, even when more edits are recorded', () => {
    const profile = createAchievementProfile('Ada', 'ada')
    const firstEdit = recordAchievementActivity(profile, { type: 'edit', code: 'const answer = 42' })
    const secondEdit = recordAchievementActivity(firstEdit.profile, { type: 'edit', code: 'console.log(answer)' })

    expect(firstEdit.unlockedIds).toContain('first-line')
    expect(firstEdit.profile.xp).toBe(10)
    expect(secondEdit.unlockedIds).toEqual([])
    expect(secondEdit.profile.xp).toBe(10)
  })

  it('requires a code edit between a failed run and a successful fix', () => {
    const profile = createAchievementProfile('Ada', 'ada')
    const failed = recordAchievementActivity(profile, { type: 'run-failure' }).profile
    const successWithoutEdit = recordAchievementActivity(failed, {
      type: 'run-success', language: 'javascript', output: 'ok', nodeCount: 1, nodeKinds: [],
    })

    expect(successWithoutEdit.profile.stats.hasFixedError).toBe(false)
    const edited = recordAchievementActivity(successWithoutEdit.profile, { type: 'edit', code: 'console.log("ok")' }).profile
    const repaired = recordAchievementActivity(edited, {
      type: 'run-success', language: 'javascript', output: 'ok', nodeCount: 1, nodeKinds: [],
    })

    expect(repaired.unlockedIds).toContain('debugger')
  })

  it('does not award project and advanced achievements for untouched starter code', () => {
    const profile = createAchievementProfile('Ada', 'ada')
    const result = recordAchievementActivity(profile, {
      type: 'run-success', language: 'javascript', output: 'result: 15', nodeCount: 12, nodeKinds: ['loop', 'condition'],
    })

    expect(result.unlockedIds).not.toContain('builder')
    expect(result.unlockedIds).not.toContain('loop-maker')
    expect(result.unlockedIds).not.toContain('architect')
  })

  it('requires ten successful runs and an authored advanced program for the expert achievement', () => {
    let profile = recordAchievementActivity(createAchievementProfile('Ada', 'ada'), { type: 'edit', code: 'write a program' }).profile
    let unlockedIds: string[] = []
    for (let index = 0; index < 10; index += 1) {
      const result = recordAchievementActivity(profile, {
        type: 'run-success', language: 'javascript', output: 'done', nodeCount: 12, nodeKinds: ['loop'],
      })
      profile = result.profile
      unlockedIds = result.unlockedIds
    }

    expect(unlockedIds).toContain('specialist')
  })

  it('tracks consecutive successful runs and resets the streak on failure', () => {
    const profile = createAchievementProfile('Ada', 'ada')
    const run = (current: typeof profile, type: 'run-success' | 'run-failure') => recordAchievementActivity(current, type === 'run-success'
      ? { type, language: 'javascript', output: '', nodeCount: 1, nodeKinds: [] }
      : { type }).profile
    const one = run(profile, 'run-success')
    const two = run(one, 'run-success')
    expect(run(two, 'run-success').unlocked['steady']).toBeTruthy()
    expect(run(two, 'run-failure').stats.consecutiveSuccessfulRuns).toBe(0)
  })

  it('only awards the refactoring challenge after successfully running the edited program', () => {
    let profile = createAchievementProfile('Ada', 'ada')
    profile = recordAchievementActivity(profile, { type: 'run-success', language: 'javascript', output: '', nodeCount: 1, nodeKinds: [] }).profile
    profile = recordAchievementActivity(profile, { type: 'edit', code: 'console.log("updated")' }).profile
    expect(profile.unlocked['refactor']).toBeUndefined()
    const validated = recordAchievementActivity(profile, { type: 'run-success', language: 'javascript', output: '', nodeCount: 1, nodeKinds: [] })
    expect(validated.unlockedIds).toContain('refactor')
  })

  it('uses a gradually increasing XP threshold for each level', () => {
    expect(getLevelProgress(99)).toMatchObject({ level: 1, earnedAtLevel: 99, nextLevelXp: 100 })
    expect(getLevelProgress(100)).toMatchObject({ level: 2, earnedAtLevel: 0, nextLevelXp: 150 })
    expect(getLevelProgress(250)).toMatchObject({ level: 3, earnedAtLevel: 0, nextLevelXp: 200 })
  })
})