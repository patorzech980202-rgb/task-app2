import { serve } from "https://deno.land/std/http/server.ts"

serve(async (req: Request) => {
  const { task, type, token, authorName } = await req.json()

  const title = "Task App"

  const body =
    type === "created"
      ? `📥 Nowe zadanie: ${task.title}`
      : `✅ ${authorName} wykonał: ${task.title}`

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=TWÓJ_FIREBASE_SERVER_KEY`
    },
    body: JSON.stringify({
      to: token,
      notification: {
        title,
        body
      },
      data: {
        taskId: String(task.id),
        type
      }
    })
  })

  const data = await res.json()

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  })
})