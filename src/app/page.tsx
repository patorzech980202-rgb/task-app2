"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

// 🔥 Firebase Push
import { getToken } from "firebase/messaging"
import { messaging } from "@/lib/firebase"

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
}

type SectionKey = "otrzymane" | "wysłane" | "archiwum"

export default function Home() {
  const [selectedDepartment, setSelectedDepartment] = useState(1)
  const [showForm, setShowForm] = useState(false)

  const [openSections, setOpenSections] = useState({
    otrzymane: true,
    wysłane: false,
    archiwum: false
  })

  const toggleSection = (key: SectionKey) => {
    setOpenSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const departments = [
    { id: 1, name: "POKOJOWE" },
    { id: 2, name: "SZEFOWA" },
    { id: 3, name: "RECEPCJA" }
  ]

  const [profile, setProfile] = useState<Profile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState("")
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // 🔊 SOUND
  const playSound = () => {
    const audio = new Audio("/notify.mp3")
    audio.volume = 0.6
    audio.play().catch(() => {})
  }

  // 📳 VIBRATION
  const vibrate = () => {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200])
    }
  }

  // 🔥 INIT USER
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

      setProfile(prof?.[0] || null)

      const { data } = await supabase.from("tasks").select("*")
      setTasks(data || [])

      setLoading(false)
    }

    load()
  }, [])

  // 🔥 REALTIME
  useEffect(() => {
    let channel: any

    const connect = () => {
      channel = supabase
        .channel("tasks-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks" },
          (payload) => {
            const newRow = payload.new as Task
            const oldRow = payload.old as Task

            setTasks(prev => {
              if (payload.eventType === "INSERT") {
                if (newRow.assigneeId === profile?.id) {
                  playSound()
                  vibrate()
                }

                return [...prev, newRow]
              }

              if (payload.eventType === "UPDATE") {
                return prev.map(t => (t.id === newRow.id ? newRow : t))
              }

              if (payload.eventType === "DELETE") {
                return prev.filter(t => t.id !== oldRow.id)
              }

              return prev
            })
          }
        )
        .subscribe()
    }

    connect()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [profile])

  // 🔥 LOGIN
  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      alert("Błąd logowania")
      return
    }

    window.location.reload()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  // 🔥 ADD TASK
  const addTask = async () => {
    if (!newTask.trim() || !profile) return

    const { data: candidates } = await supabase
      .from("profiles")
      .select("*")
      .eq("department_id", selectedDepartment)

    const targets = (candidates || []).filter(
      (p: any) => p.status === "na stanowisku"
    )

    for (const target of targets) {
      await supabase.from("tasks").insert({
        title: newTask,
        authorId: profile.id,
        assigneeId: target.id,
        departmentId: selectedDepartment,
        done: false,
        archivedBy: [],
        createdAt: new Date().toISOString(),
        completedAt: null
      })
    }

    setNewTask("")
    setShowForm(false)
  }

  const markDone = async (id: number) => {
    await supabase
      .from("tasks")
      .update({
        done: true,
        completedAt: new Date().toISOString()
      })
      .eq("id", id)
  }

  const archiveTask = async (id: number) => {
    const task = tasks.find(t => t.id === id)
    if (!task || !profile) return

    await supabase
      .from("tasks")
      .update({
        archivedBy: [...(task.archivedBy || []), profile.id]
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

  // 🔥 PUSH ENABLE (NOWE)
  const enablePush = async () => {
    if (!profile) return

    const permission = await Notification.requestPermission()

    if (permission !== "granted") {
      alert("Brak zgody na powiadomienia")
      return
    }

    const token = await getToken(messaging!, {
      vapidKey:
        "BE_iL4OXDZD-eCyKkDEoXoHKPdXKdFy7u6Jfu3cGuYw72VL77wFtESiIxP-SSeFmwcWA5AVa6VqnkezAKMCDgeQ"
    })

    if (!token) {
      alert("Brak tokenu FCM")
      return
    }

    await supabase
      .from("profiles")
      .update({ push_token: token })
      .eq("id", profile.id)

    alert("Powiadomienia aktywne 🔔")
  }

  const received = tasks.filter(
    t => t.assigneeId === profile?.id && !t.archivedBy?.includes(profile.id)
  )

  const sent = tasks.filter(
    t => t.authorId === profile?.id && !t.archivedBy?.includes(profile.id)
  )

  const archivedReceived = tasks.filter(
    t => t.assigneeId === profile?.id && t.archivedBy?.includes(profile.id)
  )

  const archivedSent = tasks.filter(
    t => t.authorId === profile?.id && t.archivedBy?.includes(profile.id)
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
    list.map(t => (
      <div key={t.id} className="flex justify-between p-3 bg-white border rounded-xl mb-2">
        <span className="text-black">{t.title}</span>

        {mode === "archived" ? (
          <span>📦</span>
        ) : (
          <div className="flex gap-2 items-center">
            {!t.done ? (
              <button onClick={() => markDone(t.id)} className="text-xs border px-2 py-1 rounded text-black">
                Zrobione
              </button>
            ) : (
              <button onClick={() => archiveTask(t.id)} className="text-xs text-blue-600 border px-2 py-1 rounded">
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

          <input className="w-full border p-2 text-black"
            placeholder="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <input className="w-full border p-2 text-black"
            placeholder="hasło"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          <button onClick={signIn} className="w-full bg-black text-white py-2 rounded">
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

          <button onClick={toggleStatus} className="border px-3 py-1 bg-white text-black rounded mt-2">
            Zmień status
          </button>

          <button onClick={signOut} className="ml-2 border px-3 py-1 bg-white text-black rounded">
            Wyloguj
          </button>

          {/* 🔥 PUSH BUTTON */}
          <button onClick={enablePush} className="ml-2 border px-3 py-1 bg-green-500 text-white rounded">
            🔔 Push ON
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl mb-4">
          <button onClick={() => setShowForm(!showForm)} className="w-full bg-black text-white py-2 rounded">
            + Dodaj task
          </button>

          {showForm && (
            <div className="mt-3 space-y-2">
              <input className="w-full border p-2"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
              />

              <select className="w-full border p-2"
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(Number(e.target.value))}
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              <button onClick={addTask} className="w-full bg-black text-white py-2 rounded">
                Dodaj
              </button>
            </div>
          )}
        </div>

        <button onClick={() => toggleSection("otrzymane")} className="w-full bg-white border p-2 rounded mb-2 text-black">
          Otrzymane <Badge count={received.length} />
        </button>
        {openSections.otrzymane && renderTasks(received, "received")}

        <button onClick={() => toggleSection("wysłane")} className="w-full bg-white border p-2 rounded mb-2 text-black">
          Wysłane <Badge count={sent.length} />
        </button>
        {openSections.wysłane && renderTasks(sent, "sent")}

        <button onClick={() => toggleSection("archiwum")} className="w-full bg-white border p-2 rounded mb-2 text-black">
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