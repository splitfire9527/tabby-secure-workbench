import { TransferStore } from '../src/transfer-store/transfer-store'

describe('TransferStore Layer (§4.1 #2)', () => {
  let store: TransferStore

  beforeEach(() => {
    store = new TransferStore()
  })

  afterEach(() => {
    store.destroy()
  })

  it('should track transfer tasks and status updates correctly', () => {
    const task = store.addTask({
      id: 't-1',
      name: 'archive.tar.gz',
      sourcePath: '/local/archive.tar.gz',
      targetPath: '/remote/archive.tar.gz',
      direction: 'upload',
      totalBytes: 1000,
    })

    expect(task.status).toBe('queued')
    expect(task.transferredBytes).toBe(0)

    store.updateProgress('t-1', 500, 100)
    const runningTask = store.tasks.find(t => t.id === 't-1')
    expect(runningTask?.status).toBe('running')
    expect(runningTask?.transferredBytes).toBe(500)
    expect(runningTask?.speedBytesPerSec).toBe(100)

    store.updateTaskStatus('t-1', 'succeeded')
    const succeededTask = store.tasks.find(t => t.id === 't-1')
    expect(succeededTask?.status).toBe('succeeded')
    expect(succeededTask?.endTime).toBeDefined()
  })

  it('should calculate transfer summary accurately', async () => {
    store.addTask({
      id: 't-1',
      name: 'file1',
      sourcePath: '/s1',
      targetPath: '/t1',
      direction: 'upload',
      totalBytes: 100,
      status: 'succeeded',
    })

    store.addTask({
      id: 't-2',
      name: 'file2',
      sourcePath: '/s2',
      targetPath: '/t2',
      direction: 'upload',
      totalBytes: 200,
      status: 'running',
    })

    store.addTask({
      id: 't-3',
      name: 'file3',
      sourcePath: '/s3',
      targetPath: '/t3',
      direction: 'upload',
      totalBytes: 300,
      status: 'queued',
    })

    let capturedSummary: any
    const sub = store.summary$.subscribe(s => {
      capturedSummary = s
    })
    sub.unsubscribe()

    expect(capturedSummary.total).toBe(3)
    expect(capturedSummary.succeeded).toBe(1)
    expect(capturedSummary.running).toBe(1)
    expect(capturedSummary.queued).toBe(1)
  })

  it('should cancel running tasks and invoke handlers on destroy (tab close)', () => {
    let cancelCalled = false
    let cleanupCalled = false

    store.addTask({
      id: 't-cancel',
      name: 'long-job',
      sourcePath: '/s',
      targetPath: '/t',
      direction: 'download',
      totalBytes: 10000,
      status: 'running',
      cancelHandler: () => {
        cancelCalled = true
      },
      cleanupHandler: () => {
        cleanupCalled = true
      },
    })

    store.destroy()

    expect(cancelCalled).toBe(true)
    expect(cleanupCalled).toBe(true)
    const task = store.tasks.find(t => t.id === 't-cancel')
    expect(task?.status).toBe('cancelled')
  })
})
