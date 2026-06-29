"use client"
type Status = "na stanowisku" | "poza stanowiskiem"

type Profile = {
  id: string
  name: string
  department_id: number
  status: Status
  role: "pracownik" | "kierownik" | "administrator"
  current_area_ids: number[] | null
}

type AppHeaderProps = {
  profile: Profile
  toggleStatus: () => void
  enablePush: () => void
  signOut: () => void
  setShowAreaPicker: (value: boolean) => void
  getAreaName: (areaId: number | null) => string
}

export default function AppHeader({
  profile,
  toggleStatus,
  enablePush,
  signOut,
  setShowAreaPicker,
  getAreaName,
}: AppHeaderProps) {
  return (
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

      <div
        className={`mt-5 grid gap-2 ${
          profile.department_id === 1 ? "grid-cols-1" : "grid-cols-3"
        }`}
      >
        <button
          onClick={toggleStatus}
          className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-stone-900"
        >
          {profile.status === "na stanowisku"
            ? "🔴 Poza stanowiskiem"
            : "🟢 Na stanowisku"}
        </button>

        {profile.department_id === 1 &&
          profile.current_area_ids &&
          profile.current_area_ids.length > 0 && (
            <div className="rounded-2xl bg-white/10 p-3">
              <div className="flex flex-wrap gap-2">
                {profile.current_area_ids.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white"
                  >
                    📍 {getAreaName(id)}
                  </span>
                ))}
              </div>

              <button
                onClick={() => setShowAreaPicker(true)}
                className="mt-3 w-full rounded-2xl bg-white py-2 text-xs font-semibold text-stone-900"
              >
                Wybierz piętro
              </button>
            </div>
          )}

        <button
          onClick={enablePush}
          className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-stone-900"
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
  )
}