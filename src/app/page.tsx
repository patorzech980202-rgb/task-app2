"use client"

import { useEffect, useRef, useState } from "react"
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
  hotel_id: number | null
  done: boolean
  completedBy: string | null
  completedAt: string | null
  createdAt: string
  archivedBy: string[]
}

type TaskImage = {
  id: number
  task_id: number
  image_url: string
  file_path?: string | null
  file_type?: string | null
}

type Status = "na stanowisku" | "poza stanowiskiem"

type Profile = {
  id: string
  name: string
  surname?: string
  department_id: number
  hotel_id: number
  status: Status
  role: "pracownik" | "kierownik" | "administrator"
  push_token?: string | null
}

type SectionKey = "otrzymane" | "wysłane" | "archiwum"

export default function Home() {
  const [selectedDepartment, setSelectedDepartment] = useState(1)
  const [selectedHotel, setSelectedHotel] = useState(1)
  const [filterHotel, setFilterHotel] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const [openSections, setOpenSections] = useState({
    otrzymane: true,
    wysłane: false,
    archiwum: false,
  })

  const departments = [
    { id: 1, name: "POKOJOWE" },
    { id: 2, name: "KONSERWATORZY" },
    { id: 3, name: "RECEPCJA" },
  ]

  const hotels = [
    { id: 1, name: "Olimp 1" },
    { id: 2, name: "Olimp 2" },
    { id: 3, name: "Olimp 3" },
    { id: 4, name: "Olimp 4" },
  ]

  const [profile, setProfile] = useState<Profile | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskImages, setTaskImages] = useState<TaskImage[]>([])
  const [signedImageUrls, setSignedImageUrls] = useState<Record<number, string>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [newTask, setNewTask] = useState("")
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewImages, setPreviewImages] = useState<string[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const getHotelName = (hotelId: number | null) => {
    return hotels.find((h) => h.id === hotelId)?.name || "Brak hotelu"
  }

  const getProfileName = (profileId: string | null) => {
    if (!profileId) return "Nieznany pracownik"

    const user = profiles.find((p) => p.id === profileId)

    if (!user) return "Nieznany pracownik"

    return `${user.name}${user.surname ? " " + user.surname : ""}`
  }

  const getTaskImages = (taskId: number) => {
    return taskImages.filter((img) => img.task_id === taskId)
  }

  const loadSignedImageUrls = async (images: TaskImage[]) => {
    const urls: Record<number, string> = {}

    for (const img of images) {
      if (!img.file_path) {
        urls[img.id] = img.image_url
        continue
      }

      const { data, error } = await supabase.storage
        .from("task-images")
        .createSignedUrl(img.file_path, 3600)

      if (!error && data?.signedUrl) {
        urls[img.id] = data.signedUrl
      } else {
        urls[img.id] = img.image_url
      }
    }

    setSignedImageUrls(urls)
  }

  const refreshTaskImages = async () => {
    const { data: images } = await supabase.from("task_images").select("*")
    setTaskImages(images || [])
    await loadSignedImageUrls(images || [])
  }

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

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

      await refreshTaskImages()

      const { data: allProfiles } = await supabase.from("profiles").select("*")
      setProfiles(allProfiles || [])
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

              setTimeout(() => {
                refreshTaskImages()
              }, 1500)

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

  const isManager = profile?.role === "kierownik"
  const isAdmin = profile?.role === "administrator"

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
        hotel_id: isManager || isAdmin ? selectedHotel : profile.hotel_id,
        done: false,
        completedBy: null,
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

    const createdTask = data?.[0]

    if (createdTask && selectedAttachments.length > 0) {
      for (const file of selectedAttachments) {
        const fileExt = file.name.split(".").pop()
        const fileName = `${createdTask.id}-${Date.now()}-${Math.random()}.${fileExt}`
        const filePath = `tasks/${createdTask.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from("task-images")
          .upload(filePath, file, {
            contentType: file.type,
          })

        if (uploadError) {
          console.error("uploadError:", uploadError)
          alert("Nie udało się wysłać pliku: " + uploadError.message)
          continue
        }

        const { data: publicUrlData } = supabase.storage
          .from("task-images")
          .getPublicUrl(filePath)

        await supabase.from("task_images").insert({
          task_id: createdTask.id,
          image_url: publicUrlData.publicUrl,
          file_path: filePath,
          file_type: file.type,
        })
      }
    }

    await refreshTaskImages()

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
    setSelectedAttachments([])
    setShowForm(false)
  }

  const markDone = async (id: number) => {
    if (!profile) return

    await supabase
      .from("tasks")
      .update({
        done: true,
        completedBy: profile.id,
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

  const received = tasks.filter((t) => {
    if (!profile) return false

    const notArchived = !t.archivedBy?.includes(profile.id)
    const notAuthor = t.authorId !== profile.id

    if (isAdmin) {
      return (
        notAuthor &&
        notArchived &&
        profile.status === "na stanowisku" &&
        !t.done &&
        (filterHotel === 0 || t.hotel_id === filterHotel)
      )
    }

    if (isManager) {
      return (
        t.departmentId === profile.department_id &&
        (filterHotel === 0 || t.hotel_id === filterHotel) &&
        notAuthor &&
        notArchived &&
        !t.done
      )
    }

    return (
      t.hotel_id === profile.hotel_id &&
      t.departmentId === profile.department_id &&
      notAuthor &&
      profile.status === "na stanowisku" &&
      notArchived &&
      !t.done
    )
  })

  const sent = tasks.filter((t) => {
    if (!profile) return false

    const notArchived = !t.archivedBy?.includes(profile.id)

    if (isAdmin) {
      return notArchived
    }

    if (isManager) {
      return t.departmentId === profile.department_id && notArchived
    }

    return t.authorId === profile.id && notArchived
  })

  const archivedReceived = tasks.filter((t) => {
    if (!profile) return false

    if (isAdmin) {
      return t.done
    }

    if (isManager) {
      return t.departmentId === profile.department_id && t.done
    }

    return (
      t.hotel_id === profile.hotel_id &&
      t.departmentId === profile.department_id &&
      t.archivedBy?.includes(profile.id)
    )
  })

  const archivedSent = tasks.filter((t) => {
    if (!profile) return false

    if (isAdmin) {
      return t.done
    }

    if (isManager) {
      return t.departmentId === profile.department_id && t.done
    }

    return t.authorId === profile.id && t.archivedBy?.includes(profile.id)
  })

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

    return list.map((t) => {
      const attachments = getTaskImages(t.id)

      const imagesOnly = attachments.filter(
        (item) => !item.file_type || item.file_type.startsWith("image/")
      )

      const videosOnly = attachments.filter((item) =>
        item.file_type?.startsWith("video/")
      )

      const allImageUrls = imagesOnly.map(
        (item) => signedImageUrls[item.id] || item.image_url
      )

      return (
        <div
          key={t.id}
          className="mb-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-stone-900">
                {t.title}
              </p>

              <p className="mt-1 text-xs font-medium text-blue-700">
                🏨 {getHotelName(t.hotel_id)}
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

              {attachments.length > 0 && (
                <div className="mt-3 space-y-3">
                  {imagesOnly.length > 0 && (
                    <div className="flex gap-2 pb-1">
                      {imagesOnly.slice(0, 3).map((img, index) => {
                        const currentImage = signedImageUrls[img.id] || img.image_url
                        const remainingCount = imagesOnly.length - 3

                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => {
                              setPreviewImages(allImageUrls)
                              setPreviewIndex(index)
                              setPreviewImage(currentImage)
                            }}
                            className="relative shrink-0"
                          >
                            <img
                              src={currentImage}
                              alt="Zdjęcie do zadania"
                              className="h-24 w-24 rounded-2xl border border-stone-200 object-cover shadow-sm"
                            />

                            {index === 2 && remainingCount > 0 && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-lg font-bold text-white">
                                +{remainingCount}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {videosOnly.length > 0 && (
                    <div className="space-y-2">
                      {videosOnly.map((video) => {
                        const videoUrl = signedImageUrls[video.id] || video.image_url

                        return (
                          <video
                            key={video.id}
                            src={videoUrl}
                            controls
                            className="w-full rounded-2xl border border-stone-200 shadow-sm"
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {t.done && (
                <div className="mt-2 text-xs text-stone-500">
                  👤 Wykonał: {getProfileName(t.completedBy)}
                  {t.completedAt && (
                    <span>
                      {" "}•{" "}
                      {new Date(t.completedAt).toLocaleString("pl-PL", {
                        timeZone: "Europe/Warsaw",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              )}
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
          </div>
        </div>
      )
    })
  }

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
        {previewImage && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX
            }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return

              const touchEndX = e.changedTouches[0].clientX
              const diff = touchStartX.current - touchEndX

              if (Math.abs(diff) > 50 && previewImages.length > 1) {
                if (diff > 0) {
                  const newIndex =
                    previewIndex === previewImages.length - 1 ? 0 : previewIndex + 1

                  setPreviewIndex(newIndex)
                  setPreviewImage(previewImages[newIndex])
                } else {
                  const newIndex =
                    previewIndex === 0 ? previewImages.length - 1 : previewIndex - 1

                  setPreviewIndex(newIndex)
                  setPreviewImage(previewImages[newIndex])
                }
              }

              touchStartX.current = null
            }}
          >
            <button
              onClick={() => {
                setPreviewImage(null)
                setPreviewImages([])
                setPreviewIndex(0)
              }}
              className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-black"
            >
              Zamknij
            </button>

            <div className="mb-3 text-sm font-semibold text-white">
              Zdjęcie {previewIndex + 1} z {previewImages.length}
            </div>

            <div className="flex w-full items-center justify-center gap-3">
              <button
                onClick={() => {
                  const newIndex =
                    previewIndex === 0 ? previewImages.length - 1 : previewIndex - 1

                  setPreviewIndex(newIndex)
                  setPreviewImage(previewImages[newIndex])
                }}
                className="rounded-full bg-white/90 px-4 py-3 text-xl font-bold text-black"
              >
                ‹
              </button>

              <img
                src={previewImage}
                alt="Podgląd zdjęcia"
                className="max-h-[80vh] max-w-[75vw] rounded-2xl object-contain"
              />

              <button
                onClick={() => {
                  const newIndex =
                    previewIndex === previewImages.length - 1 ? 0 : previewIndex + 1

                  setPreviewIndex(newIndex)
                  setPreviewImage(previewImages[newIndex])
                }}
                className="rounded-full bg-white/90 px-4 py-3 text-xl font-bold text-black"
              >
                ›
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 rounded-3xl bg-stone-900 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-stone-300">
                Panel zadań
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                Cześć, {profile.name}
              </h1>
              <p className="text-sm text-stone-300 mt-1">
                Rola: {profile.role}
              </p>
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

        {(isManager || isAdmin) && (
          <div className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
              Filtr hotelu
            </label>

            <select
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
              value={filterHotel}
              onChange={(e) => setFilterHotel(Number(e.target.value))}
            >
              <option value={0}>Wszystkie hotele</option>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}

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

              {(isManager || isAdmin) && (
                <select
                  className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                  value={selectedHotel}
                  onChange={(e) => setSelectedHotel(Number(e.target.value))}
                >
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              )}

              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
                📎 Zdjęcia i filmy
              </label>

              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])

                  const images = files.filter((file) => file.type.startsWith("image/"))
                  const videos = files.filter((file) => file.type.startsWith("video/"))

                  if (images.length > 10) {
                    alert("Możesz dodać maksymalnie 10 zdjęć.")
                    e.target.value = ""
                    return
                  }

                  if (videos.length > 1) {
                    alert("Możesz dodać maksymalnie 1 film.")
                    e.target.value = ""
                    return
                  }

                  setSelectedAttachments(files)
                }}
              />

              {selectedAttachments.length > 0 && (
                <div className="rounded-xl bg-stone-50 p-3">
                  <p className="mb-2 text-xs font-bold text-stone-500">
                    Wybrane pliki ({selectedAttachments.length})
                  </p>

                  <div className="space-y-1">
                    {selectedAttachments.map((file, index) => (
                      <div key={index} className="truncate text-xs text-stone-700">
                        {file.type.startsWith("image/")
                          ? "🖼️ "
                          : file.type.startsWith("video/")
                          ? "🎥 "
                          : "📄 "}
                        {file.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
