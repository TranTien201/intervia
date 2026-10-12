import { loginPath, safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it('keeps paths inside the app', () => {
    expect(safeNextPath('/library?tab=jd')).toBe('/library?tab=jd')
    expect(safeNextPath('/sessions/s1/review#cau-2')).toBe('/sessions/s1/review#cau-2')
  })

  it('sends anything else home', () => {
    for (const bad of [
      null,
      '',
      'library',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
      '/login',
      '/signup?next=/library',
    ])
      expect(safeNextPath(bad)).toBe('/')
  })
})

describe('loginPath', () => {
  it('remembers the page the user tried to open', () => {
    expect(loginPath({ pathname: '/library', search: '?tab=jd', hash: '' })).toBe(
      '/login?next=%2Flibrary%3Ftab%3Djd',
    )
    expect(loginPath({ pathname: '/', search: '', hash: '' })).toBe('/login')
  })
})
