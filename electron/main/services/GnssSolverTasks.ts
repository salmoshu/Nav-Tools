/** Shared by both native adapters, including requests from different windows. */
export class GnssSolverTasks {
  private active?: {
    token: symbol
    mode: 'post' | 'realtime'
    senderId: number
    runId: string
    cancelled: boolean
    done: Promise<void>
    finish: () => void
  }

  public acquire(mode: 'post' | 'realtime', senderId: number, runId = ''): () => void {
    if (this.active) throw new Error('已有 GNSS 解算任务正在运行，请等待完成或停止后再切换模式。')
    const token = Symbol(mode)
    let finish!: () => void
    const done = new Promise<void>((resolve) => {
      finish = resolve
    })
    this.active = { token, mode, senderId, runId, cancelled: false, done, finish }
    return () => {
      if (this.active?.token === token) {
        this.active.finish()
        this.active = undefined
      }
    }
  }

  public cancel(
    mode: 'post' | 'realtime',
    senderId: number,
    runId?: string,
  ): Promise<void> | undefined {
    const task = this.active
    if (
      !task ||
      task.mode !== mode ||
      task.senderId !== senderId ||
      (runId !== undefined && task.runId !== runId)
    )
      return undefined
    task.cancelled = true
    return task.done
  }

  public isCancelled(mode: 'post' | 'realtime', senderId: number, runId: string): boolean {
    return (
      this.active?.mode === mode &&
      this.active.senderId === senderId &&
      this.active.runId === runId &&
      this.active.cancelled
    )
  }
  public status(senderId: number): { mode: 'post' | 'realtime'; runId: string } | null {
    const task = this.active
    return task?.senderId === senderId ? { mode: task.mode, runId: task.runId } : null
  }
}

export const gnssSolverTasks = new GnssSolverTasks()
