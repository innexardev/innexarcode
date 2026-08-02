import { describe, expect, test } from "bun:test"

describe("Project Resolution — Path Hashing", () => {
  test("different paths produce different IDs", () => {
    const Hash = { fast: (s: string) => {
      let hash = 0
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i)
        hash = ((hash << 5) - hash) + c
        hash |= 0
      }
      return Math.abs(hash).toString(36)
    }}
    const makeId = (path: string) => `local-path:${Hash.fast(`local-path:${path}`)}`
    const id1 = makeId("/srv/project-a")
    const id2 = makeId("/srv/project-b")
    const id3 = makeId("/srv/project-a")
    expect(id1).not.toBe(id2)
    expect(id1).toBe(id3)
  })
})

describe("IPC — JSON Format", () => {
  test("encodes directory and sessionID", () => {
    const payload = JSON.stringify({ directory: "/srv/proj", sessionID: "ses_abc123" })
    const parsed = JSON.parse(payload)
    expect(parsed.directory).toBe("/srv/proj")
    expect(parsed.sessionID).toBe("ses_abc123")
  })

  test("encodes directory only", () => {
    const payload = JSON.stringify({ directory: "/srv/proj" })
    const parsed = JSON.parse(payload)
    expect(parsed.directory).toBe("/srv/proj")
    expect(parsed.sessionID).toBeUndefined()
  })

  test("handles missing fields gracefully", () => {
    const payload = JSON.stringify({})
    const parsed = JSON.parse(payload)
    expect(parsed.directory).toBeUndefined()
    const dir = parsed.directory ?? ""
    expect(dir).toBe("")
  })
})

describe("Session Tree — Parent/Child", () => {
  test("builds tree from flat session list", () => {
    type Session = { id: string; title: string; parent_id: string | null }
    const sessions: Session[] = [
      { id: "ses_1", title: "Root 1", parent_id: null },
      { id: "ses_2", title: "Child 1", parent_id: "ses_1" },
      { id: "ses_3", title: "Child 2", parent_id: "ses_1" },
      { id: "ses_4", title: "Root 2", parent_id: null },
    ]

    const roots = sessions.filter((s) => !s.parent_id)
    const children = new Map<string, Session[]>()
    for (const s of sessions) {
      if (s.parent_id) {
        const arr = children.get(s.parent_id) ?? []
        arr.push(s)
        children.set(s.parent_id, arr)
      }
    }

    expect(roots).toHaveLength(2)
    expect(roots[0].id).toBe("ses_1")
    expect(children.get("ses_1")).toHaveLength(2)
    expect(children.get("ses_1")![0].id).toBe("ses_2")
    expect(children.get("ses_1")![1].id).toBe("ses_3")
    expect(children.get("ses_2")).toBeUndefined()
  })
})
