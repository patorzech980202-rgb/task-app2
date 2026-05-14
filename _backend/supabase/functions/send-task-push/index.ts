import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

serve(async (req: Request): Promise<Response> => {
  try {
    const { task, token } = await req.json()

    const projectId = Deno.env.get("FIREBASE_PROJECT_ID")
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL")
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY")

    if (!projectId || !clientEmail || !privateKey) {
      return new Response(
        JSON.stringify({
          error: "Brak Firebase secrets"
        }),
        { status: 500 }
      )
    }

    // 🔥 JWT HEADER
    const header = {
      alg: "RS256",
      typ: "JWT"
    }

    // 🔥 JWT PAYLOAD
    const payload = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: getNumericDate(60 * 60),
      iat: getNumericDate(0)
    }

    // 🔥 IMPORT PRIVATE KEY
    const pem = privateKey
      .replace(/\\n/g, "\n")
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "")

    const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    )

    // 🔥 CREATE JWT
    const jwt = await create(header, payload, cryptoKey)

    // 🔥 EXCHANGE JWT FOR ACCESS TOKEN
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    })

    const tokenData = await tokenRes.json()

    const accessToken = tokenData.access_token

    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: tokenData
        }),
        { status: 500 }
      )
    }

    // 🔥 SEND PUSH
    const pushRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: "Task App",
              body: `📥 ${task.title}`
            },
            android: {
              notification: {
                sound: "default"
              }
            },
            webpush: {
              notification: {
                sound: "default"
              }
            }
          }
        })
      }
    )

    const pushData = await pushRes.text()

    return new Response(pushData, {
      status: 200
    })

  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error"

    return new Response(
      JSON.stringify({
        error: message
      }),
      { status: 500 }
    )
  }
})