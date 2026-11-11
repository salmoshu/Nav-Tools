// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GnssSolverTasks } from '../../electron/main/services/GnssSolverTasks'

describe('native GNSS task lease', () => {
  it('excludes both modes and other windows until the actual owner releases the task', () => {
    const tasks = new GnssSolverTasks()
    const finishPost = tasks.acquire('post', 1)
    expect(() => tasks.acquire('realtime', 1)).toThrow('任务正在运行')
    expect(() => tasks.acquire('realtime', 2)).toThrow('任务正在运行')
    finishPost()
    const finishLive = tasks.acquire('realtime', 2)
    finishPost()
    expect(() => tasks.acquire('post', 1)).toThrow('任务正在运行')
    finishLive()
    expect(tasks.acquire('post', 1)).toBeTypeOf('function')
  })

  it('exposes task status only to its owner and waits for cancelled preparation to finish', async () => {
    const tasks = new GnssSolverTasks()
    const release = tasks.acquire('post', 7, 'preparing')
    expect(tasks.status(7)).toEqual({ mode: 'post', runId: 'preparing' })
    expect(tasks.status(8)).toBeNull()
    expect(tasks.cancel('post', 8, 'preparing')).toBeUndefined()
    expect(tasks.cancel('realtime', 7, 'preparing')).toBeUndefined()
    expect(tasks.cancel('post', 7, 'stale')).toBeUndefined()
    const done = tasks.cancel('post', 7, 'preparing')!
    expect(tasks.isCancelled('post', 7, 'preparing')).toBe(true)
    expect(() => tasks.acquire('realtime', 7, 'next')).toThrow('任务正在运行')
    release()
    await done
    expect(tasks.status(7)).toBeNull()
  })
})
