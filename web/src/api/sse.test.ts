import { parseEvent } from './sse'

describe('parseEvent', () => {
  it('parses event name and JSON data', () => {
    expect(parseEvent('event: token\ndata: {"text":"Xin chào"}')).toEqual({
      event: 'token',
      data: { text: 'Xin chào' },
    })
  })

  it('ignores comments and events without data', () => {
    expect(parseEvent(': keep-alive')).toBeNull()
  })
})
