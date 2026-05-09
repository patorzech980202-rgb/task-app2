import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

serve(async (req: Request) => {
  try {
    const { task, type, token, authorName } = await req.json()

    const title = "Task App"

    const body =
      type === "INSERT"
        ? `📥 Nowe zadanie: ${task.title}`
        : `✅ ${authorName} wykonał: ${task.title}`

    const fcmResponse = await fetch(
      "https://fcm.googleapis.com/fcm/send",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=TWÓJ_FIREBASE_SERVER_KEY`
        },
        body: JSON.stringify({
          to: token,
          notification: {
            title,
            body,
            sound: "default"
          },
          data: {
            taskId: String(task.id),
            type
          }
        })
      }
    )

    const data = await fcmResponse.json()

    return new Response(
      JSON.stringify({
        success: true,
        fcm: data
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200
      }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: (err as Error).message
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500
      }
    )
  }
})