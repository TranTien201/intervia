import { isRealApiPath, parseRealApi } from './real-api'

describe('parseRealApi', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseRealApi(' auth, cvs ,,jds ')).toEqual(['auth', 'cvs', 'jds'])
  })

  it('returns no groups when unset or empty', () => {
    expect(parseRealApi(undefined)).toEqual([])
    expect(parseRealApi('')).toEqual([])
  })
})

describe('isRealApiPath', () => {
  const groups = ['auth', 'roles', 'cvs', 'jds']

  it('matches the group root', () => {
    expect(isRealApiPath('/api/cvs', groups)).toBe(true)
    expect(isRealApiPath('/api/jds', groups)).toBe(true)
    expect(isRealApiPath('/api/roles', groups)).toBe(true)
  })

  it('matches paths under the group', () => {
    expect(isRealApiPath('/api/auth/me', groups)).toBe(true)
    expect(isRealApiPath('/api/cvs/:id/versions/:v', groups)).toBe(true)
  })

  it('does not match other groups or shared prefixes', () => {
    expect(isRealApiPath('/api/sessions', groups)).toBe(false)
    expect(isRealApiPath('/api/sessions/:id', groups)).toBe(false)
    expect(isRealApiPath('/api/cvsx', groups)).toBe(false)
    expect(isRealApiPath('/api', groups)).toBe(false)
  })

  it('matches nothing without groups', () => {
    expect(isRealApiPath('/api/cvs', [])).toBe(false)
  })
})
