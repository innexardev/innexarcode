import { expect, test } from "bun:test"

test("LauncherView is exported", async () => {
  const mod = await import("../src/routes/launcher")
  expect(mod.LauncherView).toBeDefined()
  expect(typeof mod.LauncherView).toBe("function")
})

test("LauncherView is a component function", async () => {
  const mod = await import("../src/routes/launcher")
  expect(mod.LauncherView.name).toBe("LauncherView")
})
