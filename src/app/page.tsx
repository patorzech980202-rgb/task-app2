"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
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
  assigneeId: string | null
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
      console.log("Brak pracowników w tym dziale, ale task zostanie zapisany jako działowy.")
    }

    const rows = [
      {
        title: newTask,
        authorId: profile.id,
        assigneeId: null,
        departmentId: selectedDepartment,
        done: false,
        archivedBy: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      },
    ]

    console.log("rows:", rows)

    const { data, error } = await supabase.from("tasks").insert(rows).select()

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

      const registration = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

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

      let subscription

      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })

        alert("Subskrypcja utworzona")
      } catch (err) {
        alert("Błąd subscribe: " + String(err))
        console.error(err)
        return
      }

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
      t.departmentId === profile?.department_id &&
      t.authorId !== profile?.id &&
      profile?.status === "na stanowisku" &&
      !t.archivedBy?.includes(profile.id)
  )

  const sent = tasks.filter(
    (t) =>
      t.authorId === profile?.id &&
      !t.archivedBy?.includes(profile.id)
  )

  const archivedReceived = tasks.filter(
    (t) =>
      t.departmentId === profile?.department_id &&
      t.authorId !== profile?.id &&
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
      <span className="ml-2 inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white shadow-sm">
        {count}
      </span>
    )
  }

  const renderTasks = (list: Task[], mode: string) => {
    if (list.length === 0) {
      return (
        <div className="mb-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-4 text-center text-sm text-stone-500">
          Brak zadań w tej sekcji
        </div>
      )
    }

    return list.map((t) => (
      <div
        key={t.id}
        className="mb-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-stone-900">
              {t.title}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {t.done ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  ✔ Wykonane
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                  W trakcie
                </span>
              )}

              {mode === "archived" && (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                  📦 Archiwum
                </span>
              )}
            </div>
          </div>

          {mode === "received" && (
  <div className="shrink-0">
    {!t.done ? (
      <button
        onClick={() => markDone(t.id)}
        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900 shadow-sm"
      >
        Zrobione
      </button>
    ) : (
      <button
        onClick={() => archiveTask(t.id)}
        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm"
      >
        Archiwizuj
      </button>
    )}
  </div>
)}

{mode === "sent" && t.done && (
  <div className="shrink-0">
    <button
      onClick={() => archiveTask(t.id)}
      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm"
    >
      Archiwizuj
    </button>
  </div>
)}

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-200 flex items-center justify-center p-6">
        Ładowanie...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-blue-300 to-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-stone-200">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-xl text-white">
              ✓
            </div>
            <h1 className="text-2xl font-bold text-stone-900">Task Hotel</h1>
            <p className="mt-1 text-sm text-stone-500">
              Zaloguj się do panelu zadań
            </p>
          </div>

          <div className="space-y-3">
            <input
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
              placeholder="Hasło"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={signIn}
              className="w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white shadow-md"
            >
              Zaloguj
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-blue-300 to-white flex items-center justify-center p-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-4 rounded-3xl bg-stone-900 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-300">
                Panel zadań
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                Cześć, {profile.name}
              </h1>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                profile.status === "na stanowisku"
                  ? "bg-emerald-400 text-emerald-950"
                  : "bg-red-400 text-red-950"
              }`}
            >
              {profile.status === "na stanowisku"
                ? "Na stanowisku"
                : "Poza stanowiskiem"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              onClick={toggleStatus}
              className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white"
            >
              Status
            </button>

            <button
              onClick={enablePush}
              className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white"
            >
              🔔 Push
            </button>

            <button
              onClick={signOut}
              className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-stone-900"
            >
              Wyloguj
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white shadow-md"
          >
            {showForm ? "Zamknij formularz" : "+ Nowe zadanie"}
          </button>

          {showForm && (
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                placeholder="Treść zadania"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />

              <select
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(Number(e.target.value))}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <button
                onClick={addTask}
                className="w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white shadow-md"
              >
                Wyślij zadanie
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => toggleSection("otrzymane")}
          className="mb-2 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left font-bold text-stone-900 shadow-sm"
        >
          <span>📥 Otrzymane</span>
          <Badge count={received.length} />
        </button>
        {openSections.otrzymane && renderTasks(received, "received")}

        <button
          onClick={() => toggleSection("wysłane")}
          className="mb-2 mt-3 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left font-bold text-stone-900 shadow-sm"
        >
          <span>📤 Wysłane</span>
          <Badge count={sent.length} />
        </button>
        {openSections.wysłane && renderTasks(sent, "sent")}

        <button
          onClick={() => toggleSection("archiwum")}
          className="mb-2 mt-3 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left font-bold text-stone-900 shadow-sm"
        >
          <span>📦 Archiwum</span>
        </button>

        {openSections.archiwum && (
          <>
            <div className="mb-2 mt-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
              Otrzymane
            </div>
            {renderTasks(archivedReceived, "archived")}

            <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
              Wysłane
            </div>
            {renderTasks(archivedSent, "archived")}
          </>
        )}
      </div>
    </div>
  )
}