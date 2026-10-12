import { splitCode } from './code-blocks'

describe('splitCode', () => {
  it('splits fenced code blocks out of the text', () => {
    expect(splitCode('Mình thêm index:\n\n```sql\nCREATE INDEX i ON t (c);\n```\nXong.')).toEqual([
      { type: 'text', value: 'Mình thêm index:' },
      { type: 'code', value: 'CREATE INDEX i ON t (c);' },
      { type: 'text', value: 'Xong.' },
    ])
  })

  it('treats an unclosed fence as code to the end', () => {
    expect(splitCode('Ví dụ:\n```\nfor x in y:\n    pass')).toEqual([
      { type: 'text', value: 'Ví dụ:' },
      { type: 'code', value: 'for x in y:\n    pass' },
    ])
  })

  it('keeps plain text as one part', () => {
    expect(splitCode('Không có code.')).toEqual([{ type: 'text', value: 'Không có code.' }])
  })
})
