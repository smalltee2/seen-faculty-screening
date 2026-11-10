import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './emailLogin'

const okResponse = () => new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 })

describe('api retries', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('a read-only action is retried after a network error', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', f)
    await expect(api({ action: 'confList' }, [0, 0])).resolves.toMatchObject({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a read gives up after the last retry and reports the error', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', f)
    await expect(api({ action: 'list' }, [0, 0])).rejects.toThrow('Failed to fetch')
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('a write is never retried, because it may already have been saved', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', f)
    await expect(api({ action: 'confDecide', key: 'k', decision: 'count' }, [0, 0])).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(1)
  })
})
