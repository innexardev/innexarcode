import type { APIRoute, GetStaticPaths } from "astro"
import { getCollection } from "astro:content"

export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await getCollection("docs")
  return docs.map((doc) => ({
    params: { slug: doc.id },
  }))
}

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = params.slug || "index"
  const docs = await getCollection("docs")
  const doc = docs.find((d) => d.id === slug)
  const notFound = "Not found"

  if (!doc) {
    return new Response(notFound, { status: 404, statusText: notFound })
  }

  return new Response(doc.body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
