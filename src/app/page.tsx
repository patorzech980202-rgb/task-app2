"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "../../lib/supabase"

type Task = {
  id: number
  title: string
  authorId: string
  assigneeId: string
  departmentId: number
  done: boolean
  completedAt: string | null
  createdAt: string
  archived: boolean
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

  const formRef = useRef<HTMLDivElement>(null)

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

  // 🔊 SOUND + 📳 VIBRATION
  const playSound = () => {
    const audio = new Audio("/notification.mp3")
    audio.play().catch(() => {
      console.log("Sound blocked")
    })
  }

  const vibrate = () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      navigator.vibrate(200)
    }
  }

  // 🔐 INIT USER
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

      setProfile(prof)

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
            console.log("REALTIME EVENT:", payload)

            const newRow = payload.new as Task
            const oldRow = payload.old as Task

            setTasks(prev => {
              if (payload.eventType === "INSERT") {

                // 🔥 HERE IS THE MAGIC (MESSENGER FEEL)
                playSound()
                vibrate()

                return [...prev, newRow]
              }

              if (payload.eventType === "UPDATE") {
                return prev.map(t =>
                  t.id === newRow.id ? newRow : t
                )
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

    const handleFocus = () => {
      if (channel) supabase.removeChannel(channel)
      connect()
    }

    window.addEventListener("focus", handleFocus)

    return () => {
      if (channel) supabase.removeChannel(channel)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

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

  const addTask = async () => {
    if (!newTask.trim() || !profile) return

    const { data: candidates } = await supabase
      .from("profiles")
      .select("*")
      .eq("department_id", selectedDepartment)

    const target = candidates?.[0]

    if (!target) {
      alert("Brak pracownika w dziale")
      return
    }

    await supabase.from("tasks").insert({
      title: newTask,
      authorId: profile.id,
      assigneeId: target.id,
      departmentId: selectedDepartment,
      done: false,
      archived: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    })

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
    await supabase
      .from("tasks")
      .update({ archived: true })
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

  const received = tasks.filter(
    t => t.assigneeId === profile?.id && !t.archived
  )

  const sent = tasks.filter(
    t => t.authorId === profile?.id && !t.archived
  )

  const archivedReceived = tasks.filter(
    t => t.assigneeId === profile?.id && t.archived
  )

  const archivedSent = tasks.filter(
    t => t.authorId === profile?.id && t.archived
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

        <h1 className="text-xl font-bold text-black mb-4">
          Cześć, {profile.name}
        </h1>

        <div className="bg-white p-4 rounded-xl mb-4">
          <button onClick={() => setShowForm(!showForm)} className="w-full bg-black text-white py-2 rounded">
            + Dodaj task
          </button>

          {showForm && (
            <div className="mt-3 space-y-2">
              <input
                className="w-full border p-2"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
              />

              <button onClick={addTask} className="w-full bg-black text-white py-2 rounded">
                Dodaj
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}