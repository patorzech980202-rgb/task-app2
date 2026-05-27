"use client"


import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/")

  const rawData = window.atob(base64)

  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

type Task = {
  id: number
  title: string
  authorId: string
  assigneeId: string
  departmentId: number
  done: boolean
  completedAt: string | null
  createdAt: string
  archivedBy: string[]
}

type Status = "na stanowisku" | "poza stanowiskiem"

type Profile = {
  id: string
  name: string
  surname?: string
  department_id: number
  status: Status
  push_token?: string | null
}

type SectionKey = "otrzymane" | "wysłane" | "archiwum"

export default function Home() {
  const [selectedDepartment, setSelectedDepartment] = useState(1)
  const [showForm, setShowForm] = useState(false)

  const [openSections, setOpenSections] = useState({
    otrzymane: true,
    wysłane: false,
    archiwum: false,
  })

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const departments = [
    { id: 1, name: "POKOJOWE" },
    { id: 2, name: "SZEFOWA" },
    { id: 3, name: "RECEPCJA" },
  ]

  const [profile, setProfile] = useState<Profile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState("")
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const playSound = () => {
    const audio = new Audio("/notify.mp3")
    audio.volume = 0.6
    audio.play().catch(() => {})
  }

  const vibrate = () => {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200])
    }
  }

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser()

      if (!auth.user) {
        setLoading(false)
        return
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .single()

      setProfile(prof || null)

      const { data } = await supabase.from("tasks").select("*")
      setTasks(data || [])

      setLoading(false)
    }

    load()
  }, [])

  useEffect(() => {
    if (!profile) return

    const channel = supabase
      .channel("tasks-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          const newRow = payload.new as Task
          const oldRow = payload.old as Task

          setTasks((prev) => {
            if (payload.eventType === "INSERT") {
              if (newRow.assigneeId === profile.id) {
                playSound()
                vibrate()
              }

              return [...prev, newRow]
            }

            if (payload.eventType === "UPDATE") {
              return prev.map((t) => (t.id === newRow.id ? newRow : t))
            }

            if (payload.eventType === "DELETE") {
              return prev.filter((t) => t.id !== oldRow.id)
            }

            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert("Błąd logowania: " + error.message)
      return
    }

    window.location.reload()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const addTask = async () => {
    if (!newTask.trim() || !profile) return

    const { data: candidates, error: candidatesError } = await supabase
      .from("profiles")
      .select("*")
      .eq("department_id", selectedDepartment)

    console.log("candidates:", candidates)
    console.log("candidatesError:", candidatesError)

    if (candidatesError) {
      alert("Błąd pobierania pracowników: " + candidatesError.message)
      return
    }

    const targets = (candidates || []).filter(
      (p: Profile) => p.status === "na stanowisku"
    )

    console.log("targets:", targets)

    if (targets.length === 0) {
      alert("Brak pracowników na stanowisku w tym dziale.")
      return
    }

    const rows = targets.map((target: Profile) => ({
      title: newTask,
      authorId: profile.id,
      assigneeId: target.id,
      departmentId: selectedDepartment,
      done: false,
      archivedBy: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
    }))

    console.log("rows:", rows)

    const { data, error } = await supabase
      .from("tasks")
      .insert(rows)
      .select()

    console.log("insert data:", data)
    console.log("insert error:", error)

    if (error) {
      alert("Błąd zapisu taska: " + error.message)
      return
    }

    for (const target of targets) {
      const res = await fetch(
        "https://ueqbjgjmalktqwkbwzkm.functions.supabase.co/send-push",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: target.id,
            title: "Nowe zadanie",
            body: newTask,
          }),
        }
      )

      console.log("push response status:", res.status)

      const responseText = await res.text()

      console.log("push response body:", responseText)
    }

    setNewTask("")
    setShowForm(false)
  }

  const markDone = async (id: number) => {
    await supabase
      .from("tasks")
      .update({
        done: true,
        completedAt: new Date().toISOString(),
      })
      .eq("id", id)
  }

  const archiveTask = async (id: number) => {
    const task = tasks.find((t) => t.id === id)
    if (!task || !profile) return

    await supabase
      .from("tasks")
      .update({
        archivedBy: [...(task.archivedBy || []), profile.id],
      })
      .eq("id", id)
  }

  const toggleStatus = async () => {
    if (!profile) return

    const newStatus: Status =
      profile.status === "na stanowisku"
        ? "poza stanowiskiem"
        : "na stanowisku"

    await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", profile.id)

    setProfile({ ...profile, status: newStatus })
  }

 const enablePush = async () => {
  try {
    if (!("serviceWorker" in navigator)) {
      alert("Ta przeglądarka nie obsługuje Service Workera")
      return
    }

    if (!("PushManager" in window)) {
      alert("Ta przeglądarka nie obsługuje powiadomień push")
      return
    }

    const permission = await Notification.requestPermission()

    if (permission !== "granted") {
      alert("Brak zgody na powiadomienia")
      return
    }

    const registration = await navigator.serviceWorker.ready

    const oldSubscription = await registration.pushManager.getSubscription()

    if (oldSubscription) {
      await oldSubscription.unsubscribe()
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    console.log("FRONT vapid public length:", publicKey?.length)
    console.log("FRONT vapid public first chars:", publicKey?.slice(0, 12))

    if (!publicKey) {
      alert("Brak NEXT_PUBLIC_VAPID_PUBLIC_KEY")
      return
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    console.log("subscription:", subscription)

    const { data: auth } = await supabase.auth.getUser()

    if (!auth.user) {
      alert("Musisz być zalogowany")
      return
    }

    const { error } = await supabase.from("push_subscriptions").insert({
      user_id: auth.user.id,
      subscription: JSON.parse(JSON.stringify(subscription)),
    })

    if (error) {
      console.error("push subscription insert error:", error)
      alert("Nie udało się zapisać subskrypcji: " + error.message)
      return
    }

    alert("Powiadomienia aktywne 🔔")
  } catch (err) {
    console.error("enablePush error:", err)
    alert("Błąd Push ON: " + String(err))
  }
  }

  const received = tasks.filter(
    (t) =>
      t.assigneeId === profile?.id &&
      !t.archivedBy?.includes(profile.id)
  )

  const sent = tasks.filter(
    (t) =>
      t.authorId === profile?.id &&
      !t.archivedBy?.includes(profile.id)
  )

  const archivedReceived = tasks.filter(
    (t) =>
      t.assigneeId === profile?.id &&
      t.archivedBy?.includes(profile.id)
  )

  const archivedSent = tasks.filter(
    (t) =>
      t.authorId === profile?.id &&
      t.archivedBy?.includes(profile.id)
  )

  const Badge = ({ count }: { count: number }) => {
    if (!count) return null

    return (
      <span className="ml-2 w-5 h-5 bg-red-500 rounded-full text-black text-xs flex items-center justify-center">
        {count}
      </span>
    )
  }

  const renderTasks = (list: Task[], mode: string) =>
    list.map((t) => (
      <div
        key={t.id}
        className="flex justify-between p-3 bg-white border rounded-xl mb-2"
      >
        <span className="text-black">{t.title}</span>

        {mode === "archived" ? (
          <span>📦</span>
        ) : (
          <div className="flex gap-2 items-center">
            {!t.done ? (
              <button
                onClick={() => markDone(t.id)}
                className="text-xs border px-2 py-1 rounded text-black"
              >
                Zrobione
              </button>
            ) : (
              <button
                onClick={() => archiveTask(t.id)}
                className="text-xs text-blue-600 border px-2 py-1 rounded"
              >
                Archiwizuj
              </button>
            )}
          </div>
        )}
      </div>
    ))

  if (loading) return <div className="p-6">Ładowanie...</div>

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f0e6]">
        <div className="bg-white p-6 rounded-xl w-80 space-y-3">
          <h1 className="text-black font-bold text-xl">Logowanie</h1>

          <input
            className="w-full border p-2 text-black"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full border p-2 text-black"
            placeholder="hasło"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={signIn}
            className="w-full bg-black text-white py-2 rounded"
          >
            Zaloguj
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0e6] flex justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-black">
            Cześć, {profile.name}
          </h1>

          <p className="text-black">{profile.status}</p>

          <button
            onClick={toggleStatus}
            className="border px-3 py-1 bg-white text-black rounded mt-2"
          >
            Zmień status
          </button>

          <button
            onClick={signOut}
            className="ml-2 border px-3 py-1 bg-white text-black rounded"
          >
            Wyloguj
          </button>

          <button
            onClick={enablePush}
            className="ml-2 border px-3 py-1 bg-green-500 text-white rounded"
          >
            🔔 Push ON
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl mb-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-full bg-black text-white py-2 rounded"
          >
            + Dodaj task
          </button>

          {showForm && (
            <div className="mt-3 space-y-2">
              <input
                className="w-full border p-2 text-black"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />

              <select
                className="w-full border p-2 text-black"
                value={selectedDepartment}
                onChange={(e) =>
                  setSelectedDepartment(Number(e.target.value))
                }
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <button
                onClick={addTask}
                className="w-full bg-black text-white py-2 rounded"
              >
                Dodaj
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => toggleSection("otrzymane")}
          className="w-full bg-white border p-2 rounded mb-2 text-black"
        >
          Otrzymane <Badge count={received.length} />
        </button>
        {openSections.otrzymane && renderTasks(received, "received")}

        <button
          onClick={() => toggleSection("wysłane")}
          className="w-full bg-white border p-2 rounded mb-2 text-black"
        >
          Wysłane <Badge count={sent.length} />
        </button>
        {openSections.wysłane && renderTasks(sent, "sent")}

        <button
          onClick={() => toggleSection("archiwum")}
          className="w-full bg-white border p-2 rounded mb-2 text-black"
        >
          Archiwum
        </button>

        {openSections.archiwum && (
          <>
            {renderTasks(archivedReceived, "archived")}
            {renderTasks(archivedSent, "archived")}
          </>
        )}
      </div>
    </div>
  )
}