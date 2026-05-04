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
    { id: 1, name: "IT" },
    { id: 2, name: "HR" },
    { id: 3, name: "Logistyka" }
  ]

  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState("")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // 🔐 SERVICE WORKER
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
    }
  }, [])

  // 🔐 STABILNE ŁADOWANIE SESJI + PROFILU (NAPRAWA)
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()

      const session = data.session
      setSession(session)

      if (!session) return

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single()

      if (error) {
        console.log("Brak profilu:", error.message)
        return
      }

      setProfile(prof)

      const { data: t } = await supabase.from("tasks").select("*")
      setTasks(t || [])
    }

    init()
  }, [])

  // 🔐 LOGIN (NAPRAWIONY)
  const login = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      alert(error.message)
      return
    }

    if (!data.session) return

    setSession(data.session)

    const { data: prof, error: profError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.session.user.id)
      .single()

    if (profError) {
      console.log(profError.message)
      return
    }

    setProfile(prof)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  const addTask = async () => {
    if (!newTask.trim() || !profile) return

    const { data: candidates } = await supabase
      .from("profiles")
      .select("*")
      .eq("department_id", selectedDepartment)
      .eq("status", "na stanowisku")

    const target = candidates?.[0]

    if (!target) return alert("Brak pracownika")

    const { data } = await supabase.from("tasks").insert({
      title: newTask,
      authorId: profile.id,
      assigneeId: target.id,
      departmentId: selectedDepartment,
      done: false,
      archived: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    }).select()

    if (data) setTasks(prev => [...prev, ...data])

    setNewTask("")
    setShowForm(false)
  }

  const markDone = async (id: number) => {
    await supabase.from("tasks").update({
      done: true,
      completedAt: new Date().toISOString()
    }).eq("id", id)

    setTasks(prev =>
      prev.map(t => t.id === id ? { ...t, done: true } : t)
    )
  }

  const archiveTask = async (id: number) => {
    await supabase.from("tasks")
      .update({ archived: true })
      .eq("id", id)

    setTasks(prev =>
      prev.map(t => t.id === id ? { ...t, archived: true } : t)
    )
  }

  const toggleStatus = async () => {
    if (!profile) return

    const newStatus: Status =
      profile.status === "na stanowisku"
        ? "poza stanowiskiem"
        : "na stanowisku"

    await supabase.from("profiles")
      .update({ status: newStatus })
      .eq("id", profile.id)

    setProfile({ ...profile, status: newStatus })
  }

  const received = profile
    ? tasks.filter(t => t.assigneeId === profile.id && !t.archived)
    : []

  const sent = profile
    ? tasks.filter(t => t.authorId === profile.id && !t.archived)
    : []

  const archivedReceived = profile
    ? tasks.filter(t => t.assigneeId === profile.id && t.archived)
    : []

  const archivedSent = profile
    ? tasks.filter(t => t.authorId === profile.id && t.archived)
    : []

  const Badge = ({ count }: { count: number }) =>
    count ? (
      <span className="ml-2 bg-red-500 text-black text-xs w-5 h-5 inline-flex items-center justify-center rounded-full">
        {count}
      </span>
    ) : null

  const renderTasks = (list: Task[], mode: string) =>
    list.map(t => (
      <div key={t.id} className="flex justify-between p-3 bg-white border rounded-xl mb-2">
        <span className="text-black">{t.title}</span>

        {mode === "otrzymane" && (
          !t.done ? (
            <button
              onClick={() => markDone(t.id)}
              className="text-xs border px-2 py-1 text-black"
            >
              Zrobione
            </button>
          ) : (
            <span className="text-green-600 text-xs font-bold">
              ✔ Wykonane
            </span>
          )
        )}

        {mode === "wysłane" && (
          !t.done ? (
            <span className="text-gray-500 text-xs">
              ⏳ W trakcie
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-xs font-bold">
                ✔ Wykonane
              </span>

              <button
                onClick={() => archiveTask(t.id)}
                className="text-xs text-blue-600 border px-2 py-1"
              >
                Archiwizuj
              </button>
            </div>
          )
        )}

        {mode === "archiwum" && (
          <span className="text-gray-500">📦</span>
        )}
      </div>
    ))

  // 🔐 LOGIN SCREEN
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f0e6] flex-col gap-2">
        <input
          className="border p-2 text-black"
          placeholder="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="border p-2 text-black"
          placeholder="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button
          onClick={login}
          className="bg-black text-white px-4 py-2"
        >
          Zaloguj
        </button>
      </div>
    )
  }

  // 🔐 LOADING PROFILU
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-black">
        Ładowanie profilu...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f0e6] flex justify-center p-6">
      <div className="w-full max-w-xl">

        <div className="flex justify-between mb-2">
          <h1 className="text-black font-bold">
            Cześć {profile.name}
          </h1>

          <button onClick={logout} className="border px-2 bg-white text-black">
            Wyloguj
          </button>
        </div>

        <p className="text-black">
          Status: <b>{profile.status}</b>
        </p>

        <button
          onClick={toggleStatus}
          className="mt-2 mb-3 text-xs border px-3 py-1 bg-white text-black"
        >
          Zmień status
        </button>

        <div className="bg-white border p-3 rounded mb-3">
          <button
            onClick={() => setShowForm(v => !v)}
            className="w-full bg-black text-white py-2"
          >
            {showForm ? "Zamknij" : "+ Dodaj task"}
          </button>

          {showForm && (
            <div className="mt-2">
              <input
                className="w-full border p-2 text-black"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
              />

              <select
                className="w-full border p-2 mt-2 text-black"
                value={selectedDepartment}
                onChange={e => setSelectedDepartment(Number(e.target.value))}
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <button
                onClick={addTask}
                className="w-full bg-black text-white py-2 mt-2"
              >
                Dodaj
              </button>
            </div>
          )}
        </div>

        <button onClick={() => toggleSection("otrzymane")} className="w-full bg-white border p-2 text-black">
          📥 Otrzymane <Badge count={received.length} />
        </button>
        {openSections.otrzymane && renderTasks(received, "otrzymane")}

        <button onClick={() => toggleSection("wysłane")} className="w-full bg-white border p-2 mt-2 text-black">
          📤 Wysłane <Badge count={sent.length} />
        </button>
        {openSections.wysłane && renderTasks(sent, "wysłane")}

        <button onClick={() => toggleSection("archiwum")} className="w-full bg-white border p-2 mt-2 text-black">
          📦 Archiwum
        </button>

        {openSections.archiwum && (
          <>
            <div className="text-black font-bold mt-2">Otrzymane</div>
            {renderTasks(archivedReceived, "archiwum")}

            <div className="text-black font-bold mt-2">Wysłane</div>
            {renderTasks(archivedSent, "archiwum")}
          </>
        )}

      </div>
    </div>
  )
}