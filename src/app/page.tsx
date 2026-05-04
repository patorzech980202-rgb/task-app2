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

  const [profile, setProfile] = useState<Profile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState("")

  // 🔐 SERVICE WORKER (PWA) — DODANE TUTAJ
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
    }
  }, [])

  // 🔐 GET CURRENT USER + PROFILE
  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser()

      if (!auth.user) {
  console.log("Brak zalogowanego użytkownika")
  return
}

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .single()

      setProfile(prof)
    }

    load()
  }, [])

  // 🔥 LOAD TASKS
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("tasks").select("*")
      setTasks(data || [])
    }
    load()
  }, [])

  const addTask = async () => {
    if (!newTask.trim() || !profile) return

    const { data: candidates } = await supabase
      .from("profiles")
      .select("*")
      .eq("department_id", selectedDepartment)
      .eq("status", "na stanowisku")

    const target = candidates?.[0]

    if (!target) {
      alert("Brak dostępnego pracownika w tym dziale")
      return
    }

    const { data, error } = await supabase.from("tasks").insert({
      title: newTask,
      authorId: profile.id,
      assigneeId: target.id,
      departmentId: selectedDepartment,
      done: false,
      archived: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    }).select()

    if (error) {
      console.error(error)
      alert("Błąd zapisu taska")
      return
    }

    if (data) {
      setTasks(prev => [...prev, ...data])
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

    setTasks(prev =>
      prev.map(t =>
        t.id === id ? { ...t, done: true } : t
      )
    )
  }

  const archiveTask = async (id: number) => {
    await supabase
      .from("tasks")
      .update({ archived: true })
      .eq("id", id)

    setTasks(prev =>
      prev.map(t =>
        t.id === id ? { ...t, archived: true } : t
      )
    )
  }

  const toggleStatus = async () => {
    if (!profile) return

    const newStatus: Status =
      profile.status === "na stanowisku"
        ? "poza stanowiskiem"
        : "na stanowisku"

    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", profile.id)

    if (!error) {
      setProfile({ ...profile, status: newStatus })
    }
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
      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-red-500 rounded-full text-black text-xs font-bold">
        {count}
      </span>
    )
  }

  const renderTasks = (list: Task[], mode: string) =>
    list.map(t => (
      <div
        key={t.id}
        className="flex justify-between p-3 bg-white border rounded-xl mb-2"
      >
        <span className="text-black">{t.title}</span>

        {mode === "archived" ? (
          <span className="text-gray-500 text-xs">📦</span>
        ) : (
          <>
            {!t.done ? (
              <button
                onClick={() => markDone(t.id)}
                className="text-xs border px-2 py-1 rounded text-black"
              >
                Zrobione
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-green-600 text-xs font-semibold">
                  ✔ Wykonane
                </span>

                <button
                  onClick={() => archiveTask(t.id)}
                  className="text-xs text-blue-600 border px-2 py-1 rounded"
                >
                  Archiwizuj
                </button>
              </div>
            )}
          </>
        )}
      </div>
    ))

 if (!profile) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f0e6] text-black">
      Ładowanie danych użytkownika...
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

          <p className="text-black mt-2">
            Status:{" "}
            <b>
              {profile.status === "na stanowisku"
                ? "🟢 Na stanowisku"
                : "🔴 Poza stanowiskiem"}
            </b>
          </p>

          <button
            onClick={toggleStatus}
            className="mt-2 text-xs border px-3 py-1 rounded bg-white text-black"
          >
            Zmień status
          </button>
        </div>

        <div ref={formRef} className="bg-white p-4 border rounded-xl mb-4">
          <button
            onClick={() => setShowForm(prev => !prev)}
            className="w-full bg-black text-white py-2 rounded-lg"
          >
            {showForm ? "Zamknij" : "+ Dodaj zadanie"}
          </button>

          {showForm && (
            <div className="mt-3 space-y-2">
              <input
                className="w-full border p-2 rounded-lg text-black"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
              />

              <select
                className="w-full border p-2 rounded-lg text-black"
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
                className="w-full bg-black text-white py-2 rounded-lg"
              >
                Dodaj
              </button>
            </div>
          )}
        </div>

        <button onClick={() => toggleSection("otrzymane")} className="w-full bg-white border rounded-lg p-2 mb-2 text-black">
          📥 Otrzymane <Badge count={received.length} />
        </button>
        {openSections.otrzymane && renderTasks(received, "received")}

        <button onClick={() => toggleSection("wysłane")} className="w-full bg-white border rounded-lg p-2 mb-2 mt-4 text-black">
          📤 Wysłane <Badge count={sent.length} />
        </button>
        {openSections.wysłane && renderTasks(sent, "sent")}

        <button onClick={() => toggleSection("archiwum")} className="w-full bg-white border rounded-lg p-2 mb-2 mt-4 text-black">
          📦 Archiwum
        </button>

        {openSections.archiwum && (
          <>
            <div className="text-black font-bold mb-2">📥 Otrzymane</div>
            {renderTasks(archivedReceived, "archived")}

            <div className="text-black font-bold mt-4 mb-2">📤 Wysłane</div>
            {renderTasks(archivedSent, "archived")}
          </>
        )}

      </div>
    </div>
  )
}